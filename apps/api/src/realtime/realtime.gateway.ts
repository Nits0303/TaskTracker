import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from './redis.module';
import Redis from 'ioredis';

/**
 * Redis Cache Keys:
 * - `project:${projectId}:members`: TTL 30s
 */

import { ConfigService } from '@nestjs/config';
import { PresenceService } from '../presence/presence.service';
import { SocketRateLimiterService } from '../common/services/socket-rate-limiter.service';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    private readonly presenceService: PresenceService,
    private readonly socketRateLimiterService: SocketRateLimiterService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) {
        throw new Error('No token provided');
      }
      const payload = this.jwtService.verify(token, {
        secret: this.config.get('JWT_SECRET'),
      });
      client.data.user = payload; // Attach user to socket
      client.join(`user:${payload.sub}`);
      
      const userId = payload.sub;
      const status = await this.presenceService.connectUser(userId);
      const workspaces = await this.presenceService.getUserWorkspaces(userId);
      workspaces.forEach(wsId => {
        client.join(`workspace:${wsId}`);
        this.server.to(`workspace:${wsId}`).emit('presence:status_changed', { userId, status });
      });
      
    } catch (err) {
      this.logger.warn(`Client disconnected due to invalid token: ${client.id}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    // Rooms are automatically cleaned up by Socket.IO on disconnect.
    const userId = client.data.user?.sub;
    if (userId) {
      if (client.data.boardIds) {
        for (const projectId of client.data.boardIds) {
          const viewers = await this.presenceService.leaveBoard(userId, projectId);
          this.server.to(`project:${projectId}`).emit('board:presence_viewers', { projectId, viewers });
        }
      }
      if (client.data.taskIds) {
        for (const [taskId, projectId] of client.data.taskIds.entries()) {
          const viewers = await this.presenceService.leaveTask(userId, taskId);
          this.server.to(`project:${projectId}`).emit('task:presence_viewers', { taskId, viewers });
        }
      }
      if (client.data.typingTasks) {
        for (const [taskId, projectId] of client.data.typingTasks.entries()) {
          const typers = await this.presenceService.stopTyping(userId, taskId);
          this.server.to(`project:${projectId}`).emit('comment:typing_viewers', { taskId, typers });
        }
      }

      const isFullyDisconnected = await this.presenceService.disconnectUser(userId);
      if (isFullyDisconnected) {
        const workspaces = await this.presenceService.getUserWorkspaces(userId);
        workspaces.forEach(wsId => {
          this.server.to(`workspace:${wsId}`).emit('presence:status_changed', { userId, status: 'Offline' });
        });
      }
    }
  }

  @SubscribeMessage('project:join')
  async handleJoinProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() projectId: string,
  ) {
    const userId = client.data.user?.sub;
    if (!userId || !projectId) return;

    if (!(await this.socketRateLimiterService.isAllowed(userId, 'project:join', 10, 60))) {
      this.logger.warn(`[RateLimit] SOCKET VIOLATION | userId: ${userId} | event: project:join | timestamp: ${new Date().toISOString()}`);
      return;
    }

    // Validate project membership
    const cacheKey = `project:members:${projectId}`;
    let memberIds = await this.redis.smembers(cacheKey);

    if (!memberIds || memberIds.length === 0) {
      // Not cached or empty, query DB
      // Find users who are either project members OR workspace Admins/Owners
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        include: { 
          members: true,
          workspace: {
            include: {
              members: {
                where: { role: { in: ['Admin', 'Owner'] } }
              }
            }
          }
        },
      });
      if (project) {
        const projectMemberIds = project.members.map((m) => m.userId);
        const adminIds = project.workspace.members.map((m) => m.userId);
        memberIds = Array.from(new Set([...projectMemberIds, ...adminIds]));
        if (memberIds.length > 0) {
          // Cache members
          await this.redis.sadd(cacheKey, ...memberIds);
          await this.redis.expire(cacheKey, 30);
        }
      }
    }

    if (!memberIds.includes(userId)) {
      client.emit('error', { message: 'You are not a member of this project' });
      return;
    }

    client.join(`project:${projectId}`);
  }

  @SubscribeMessage('project:leave')
  async handleLeaveProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() projectId: string,
  ) {
    const userId = client.data.user?.sub;
    if (userId && !(await this.socketRateLimiterService.isAllowed(userId, 'project:leave', 10, 60))) {
      this.logger.warn(`[RateLimit] SOCKET VIOLATION | userId: ${userId} | event: project:leave | timestamp: ${new Date().toISOString()}`);
      return;
    }
    if (projectId) {
      client.leave(`project:${projectId}`);
    }
  }

  // --- Presence ---

  @SubscribeMessage('presence:heartbeat')
  async handlePresenceHeartbeat(@ConnectedSocket() client: Socket) {
    const userId = client.data.user?.sub;
    if (userId && !(await this.socketRateLimiterService.isAllowed(userId, 'presence:heartbeat', 3, 60))) {
      this.logger.warn(`[RateLimit] SOCKET VIOLATION | userId: ${userId} | event: presence:heartbeat | timestamp: ${new Date().toISOString()}`);
      return;
    }
    if (userId) await this.presenceService.heartbeat(userId);
  }

  @SubscribeMessage('presence:set_away')
  async handlePresenceSetAway(@ConnectedSocket() client: Socket) {
    const userId = client.data.user?.sub;
    if (!userId) return;
    if (!(await this.socketRateLimiterService.isAllowed(userId, 'presence:set_away', 5, 60))) {
      this.logger.warn(`[RateLimit] SOCKET VIOLATION | userId: ${userId} | event: presence:set_away | timestamp: ${new Date().toISOString()}`);
      return;
    }
    await this.presenceService.setStatus(userId, 'Away');
    const workspaces = await this.presenceService.getUserWorkspaces(userId);
    workspaces.forEach(wsId => this.server.to(`workspace:${wsId}`).emit('presence:status_changed', { userId, status: 'Away' }));
  }

  @SubscribeMessage('presence:set_active')
  async handlePresenceSetActive(@ConnectedSocket() client: Socket) {
    const userId = client.data.user?.sub;
    if (!userId) return;
    if (!(await this.socketRateLimiterService.isAllowed(userId, 'presence:set_active', 5, 60))) {
      this.logger.warn(`[RateLimit] SOCKET VIOLATION | userId: ${userId} | event: presence:set_active | timestamp: ${new Date().toISOString()}`);
      return;
    }
    await this.presenceService.setStatus(userId, 'Active');
    const workspaces = await this.presenceService.getUserWorkspaces(userId);
    workspaces.forEach(wsId => this.server.to(`workspace:${wsId}`).emit('presence:status_changed', { userId, status: 'Active' }));
  }

  @SubscribeMessage('board:presence_join')
  async handleBoardPresenceJoin(@ConnectedSocket() client: Socket, @MessageBody() projectId: string) {
    const userId = client.data.user?.sub;
    if (!userId || !projectId) return;
    if (!(await this.socketRateLimiterService.isAllowed(userId, 'board:presence_join', 10, 60))) {
      this.logger.warn(`[RateLimit] SOCKET VIOLATION | userId: ${userId} | event: board:presence_join | timestamp: ${new Date().toISOString()}`);
      return;
    }
    client.data.boardIds = client.data.boardIds || new Set();
    client.data.boardIds.add(projectId);
    const viewers = await this.presenceService.joinBoard(userId, projectId);
    this.server.to(`project:${projectId}`).emit('board:presence_viewers', { projectId, viewers });
  }

  @SubscribeMessage('board:presence_leave')
  async handleBoardPresenceLeave(@ConnectedSocket() client: Socket, @MessageBody() projectId: string) {
    const userId = client.data.user?.sub;
    if (!userId || !projectId) return;
    if (!(await this.socketRateLimiterService.isAllowed(userId, 'board:presence_leave', 10, 60))) {
      this.logger.warn(`[RateLimit] SOCKET VIOLATION | userId: ${userId} | event: board:presence_leave | timestamp: ${new Date().toISOString()}`);
      return;
    }
    if (client.data.boardIds) {
      client.data.boardIds.delete(projectId);
    }
    const viewers = await this.presenceService.leaveBoard(userId, projectId);
    this.server.to(`project:${projectId}`).emit('board:presence_viewers', { projectId, viewers });
  }

  @SubscribeMessage('task:presence_join')
  async handleTaskPresenceJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: { taskId: string, projectId: string }) {
    const userId = client.data.user?.sub;
    if (!userId || !payload?.taskId || !payload?.projectId) return;
    if (!(await this.socketRateLimiterService.isAllowed(userId, 'task:presence_join', 10, 60))) {
      this.logger.warn(`[RateLimit] SOCKET VIOLATION | userId: ${userId} | event: task:presence_join | timestamp: ${new Date().toISOString()}`);
      return;
    }
    client.data.taskIds = client.data.taskIds || new Map();
    client.data.taskIds.set(payload.taskId, payload.projectId);
    const viewers = await this.presenceService.joinTask(userId, payload.taskId);
    this.server.to(`project:${payload.projectId}`).emit('task:presence_viewers', { taskId: payload.taskId, viewers });
  }

  @SubscribeMessage('task:presence_leave')
  async handleTaskPresenceLeave(@ConnectedSocket() client: Socket, @MessageBody() payload: { taskId: string, projectId: string }) {
    const userId = client.data.user?.sub;
    if (!userId || !payload?.taskId || !payload?.projectId) return;
    if (!(await this.socketRateLimiterService.isAllowed(userId, 'task:presence_leave', 10, 60))) {
      this.logger.warn(`[RateLimit] SOCKET VIOLATION | userId: ${userId} | event: task:presence_leave | timestamp: ${new Date().toISOString()}`);
      return;
    }
    if (client.data.taskIds) {
      client.data.taskIds.delete(payload.taskId);
    }
    const viewers = await this.presenceService.leaveTask(userId, payload.taskId);
    this.server.to(`project:${payload.projectId}`).emit('task:presence_viewers', { taskId: payload.taskId, viewers });
  }

  @SubscribeMessage('comment:typing_start')
  async handleTypingStart(@ConnectedSocket() client: Socket, @MessageBody() payload: { taskId: string, projectId: string }) {
    const userId = client.data.user?.sub;
    if (!userId || !payload?.taskId || !payload?.projectId) return;
    if (!(await this.socketRateLimiterService.isAllowed(userId, 'comment:typing_start', 20, 60))) {
      this.logger.warn(`[RateLimit] SOCKET VIOLATION | userId: ${userId} | event: comment:typing_start | timestamp: ${new Date().toISOString()}`);
      return;
    }
    client.data.typingTasks = client.data.typingTasks || new Map();
    client.data.typingTasks.set(payload.taskId, payload.projectId);
    const typers = await this.presenceService.startTyping(userId, payload.taskId);
    this.server.to(`project:${payload.projectId}`).except(client.id).emit('comment:typing_viewers', { taskId: payload.taskId, typers });
  }

  @SubscribeMessage('comment:typing_stop')
  async handleTypingStop(@ConnectedSocket() client: Socket, @MessageBody() payload: { taskId: string, projectId: string }) {
    const userId = client.data.user?.sub;
    if (!userId || !payload?.taskId || !payload?.projectId) return;
    if (!(await this.socketRateLimiterService.isAllowed(userId, 'comment:typing_stop', 20, 60))) {
      this.logger.warn(`[RateLimit] SOCKET VIOLATION | userId: ${userId} | event: comment:typing_stop | timestamp: ${new Date().toISOString()}`);
      return;
    }
    if (client.data.typingTasks) {
      client.data.typingTasks.delete(payload.taskId);
    }
    const typers = await this.presenceService.stopTyping(userId, payload.taskId);
    this.server.to(`project:${payload.projectId}`).except(client.id).emit('comment:typing_viewers', { taskId: payload.taskId, typers });
  }

  @SubscribeMessage('chat:typing_start')
  async handleChatTypingStart(@ConnectedSocket() client: Socket, @MessageBody() payload: { channelId: string, projectId?: string, targetUserId?: string }) {
    const userId = client.data.user?.sub;
    if (!userId || !payload?.channelId || (!payload?.projectId && !payload?.targetUserId)) return;
    if (!(await this.socketRateLimiterService.isAllowed(userId, 'chat:typing_start', 30, 60))) {
      this.logger.warn(`[RateLimit] SOCKET VIOLATION | userId: ${userId} | event: chat:typing_start | timestamp: ${new Date().toISOString()}`);
      return;
    }
    client.data.typingTasks = client.data.typingTasks || new Map();
    client.data.typingTasks.set(payload.channelId, payload.projectId || payload.targetUserId);
    const typers = await this.presenceService.startTyping(userId, payload.channelId);
    if (payload.projectId) {
      this.server.to(`project:${payload.projectId}`).except(client.id).emit('chat:typing_viewers', { channelId: payload.channelId, typers });
    } else if (payload.targetUserId) {
      this.server.to(`user:${payload.targetUserId}`).emit('chat:typing_viewers', { channelId: payload.channelId, typers });
    }
  }

  @SubscribeMessage('chat:typing_stop')
  async handleChatTypingStop(@ConnectedSocket() client: Socket, @MessageBody() payload: { channelId: string, projectId?: string, targetUserId?: string }) {
    const userId = client.data.user?.sub;
    if (!userId || !payload?.channelId || (!payload?.projectId && !payload?.targetUserId)) return;
    if (!(await this.socketRateLimiterService.isAllowed(userId, 'chat:typing_stop', 30, 60))) {
      this.logger.warn(`[RateLimit] SOCKET VIOLATION | userId: ${userId} | event: chat:typing_stop | timestamp: ${new Date().toISOString()}`);
      return;
    }
    if (client.data.typingTasks) {
      client.data.typingTasks.delete(payload.channelId);
    }
    const typers = await this.presenceService.stopTyping(userId, payload.channelId);
    if (payload.projectId) {
      this.server.to(`project:${payload.projectId}`).except(client.id).emit('chat:typing_viewers', { channelId: payload.channelId, typers });
    } else if (payload.targetUserId) {
      this.server.to(`user:${payload.targetUserId}`).emit('chat:typing_viewers', { channelId: payload.channelId, typers });
    }
  }

  // Helper function to emit events from REST controllers
  emitToProject(projectId: string, event: string, data: any, excludeSocketId?: string) {
    const room = `project:${projectId}`;
    if (excludeSocketId) {
      // Exclude specific socket id
      this.server.to(room).except(excludeSocketId).emit(event, data);
    } else {
      this.server.to(room).emit(event, data);
    }
  }

  // Helper function to emit events to a specific user
  emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  // Helper function to emit events to multiple specific users
  emitToUsers(userIds: string[], event: string, data: any) {
    for (const userId of userIds) {
      this.server.to(`user:${userId}`).emit(event, data);
    }
  }
}
