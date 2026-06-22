import { Injectable, Inject, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '../../realtime/redis.module';
import Redis from 'ioredis';

@Injectable()
export class SocketRateLimiterService {
  private readonly logger = new Logger(SocketRateLimiterService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async isAllowed(userId: string, event: string, limit: number, windowSeconds: number): Promise<boolean> {
    try {
      const key = `socket:ratelimit:${userId}:${event}`;
      
      const current = await this.redis.incr(key);
      if (current === 1) {
        await this.redis.expire(key, windowSeconds);
      }

      return current <= limit;
    } catch (error) {
      this.logger.warn(`Failed to check socket rate limit for ${userId} on ${event}, failing open. Error: ${(error as Error).message}`);
      // Fail open so we don't block legitimate traffic if Redis is down
      return true;
    }
  }
}
