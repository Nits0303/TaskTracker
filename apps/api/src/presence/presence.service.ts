import { Injectable, Inject, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '../realtime/redis.module';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);
  private readonly STATUS_TTL = 90; // 90 seconds
  private readonly TYPING_TTL = 5000; // 5 seconds in ms

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  async connectUser(userId: string) {
    const multi = this.redis.multi();
    multi.incr(`presence:connections:${userId}`);
    multi.setex(`presence:status:${userId}`, this.STATUS_TTL, 'Active');
    await multi.exec();
    return 'Active';
  }

  async disconnectUser(userId: string): Promise<boolean> {
    const connKey = `presence:connections:${userId}`;
    const countStr = await this.redis.get(connKey);
    let count = parseInt(countStr || '0', 10);
    
    if (count > 0) {
      count -= 1;
      await this.redis.set(connKey, count);
    }

    if (count <= 0) {
      await this.redis.del(connKey);
      await this.redis.del(`presence:status:${userId}`);
      
      // Update DB
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { lastSeenAt: new Date() } as any, // as any to bypass types if generation failed
        });
      } catch (err) {
        this.logger.error(`Failed to update lastSeenAt for ${userId}`, err);
      }
      return true; // Fully disconnected
    }
    return false; // Still has connections
  }

  async heartbeat(userId: string) {
    const status = await this.redis.get(`presence:status:${userId}`);
    if (status) {
      await this.redis.expire(`presence:status:${userId}`, this.STATUS_TTL);
    } else {
      // If no status but heartbeat is received, assume Active
      await this.redis.setex(`presence:status:${userId}`, this.STATUS_TTL, 'Active');
    }
  }

  async setStatus(userId: string, status: 'Active' | 'Away') {
    await this.redis.setex(`presence:status:${userId}`, this.STATUS_TTL, status);
  }

  private async filterActiveMembers(key: string): Promise<string[]> {
    const members = await this.redis.smembers(key);
    const activeMembers = [];
    for (const uid of members) {
      const status = await this.redis.get(`presence:status:${uid}`);
      if (status) {
        activeMembers.push(uid);
      } else {
        await this.redis.srem(key, uid); // Cleanup stale member
      }
    }
    return activeMembers;
  }

  async joinBoard(userId: string, projectId: string) {
    const key = `presence:board:${projectId}`;
    await this.redis.sadd(key, userId);
    return this.filterActiveMembers(key);
  }

  async leaveBoard(userId: string, projectId: string) {
    const key = `presence:board:${projectId}`;
    await this.redis.srem(key, userId);
    return this.filterActiveMembers(key);
  }

  async joinTask(userId: string, taskId: string) {
    const key = `presence:task:${taskId}`;
    await this.redis.sadd(key, userId);
    return this.filterActiveMembers(key);
  }

  async leaveTask(userId: string, taskId: string) {
    const key = `presence:task:${taskId}`;
    await this.redis.srem(key, userId);
    return this.filterActiveMembers(key);
  }

  async startTyping(userId: string, taskId: string) {
    const key = `presence:typing:${taskId}`;
    const expiresAt = Date.now() + this.TYPING_TTL;
    await this.redis.zadd(key, expiresAt, userId);
    return this.getActiveTypers(taskId);
  }

  async stopTyping(userId: string, taskId: string) {
    const key = `presence:typing:${taskId}`;
    await this.redis.zrem(key, userId);
    return this.getActiveTypers(taskId);
  }

  async getActiveTypers(taskId: string): Promise<string[]> {
    const key = `presence:typing:${taskId}`;
    const now = Date.now();
    // Remove expired typers
    await this.redis.zremrangebyscore(key, '-inf', now);
    // Get remaining active typers
    return this.redis.zrange(key, 0, -1);
  }

  async getUserWorkspaces(userId: string): Promise<string[]> {
    const cacheKey = `presence:user_workspaces:${userId}`;
    let workspaceIds = await this.redis.smembers(cacheKey);
    
    if (!workspaceIds || workspaceIds.length === 0) {
      const members = await this.prisma.workspaceMember.findMany({
        where: { userId },
        select: { workspaceId: true },
      });
      workspaceIds = members.map(m => m.workspaceId);
      if (workspaceIds.length > 0) {
        await this.redis.sadd(cacheKey, ...workspaceIds);
        await this.redis.expire(cacheKey, 3600); // 1 hour cache
      }
    }
    return workspaceIds;
  }
}
