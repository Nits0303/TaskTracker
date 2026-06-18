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
    } catch (err) {
      this.logger.warn(`Client disconnected due to invalid token: ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // Rooms are automatically cleaned up by Socket.IO on disconnect.
  }

  @SubscribeMessage('project:join')
  async handleJoinProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() projectId: string,
  ) {
    const userId = client.data.user?.sub;
    if (!userId || !projectId) return;

    // Validate project membership
    const cacheKey = `project:members:${projectId}`;
    let memberIds = await this.redis.smembers(cacheKey);

    if (!memberIds || memberIds.length === 0) {
      // Not cached or empty, query DB
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        include: { members: true },
      });
      if (project) {
        memberIds = project.members.map((m) => m.userId);
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
    if (projectId) {
      client.leave(`project:${projectId}`);
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
}
