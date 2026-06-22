import { Injectable, Inject } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { REDIS_CLIENT } from '../../realtime/redis.module';
import { Redis } from 'ioredis';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis health check timed out')), 3000),
    );

    try {
      const start = Date.now();
      await Promise.race([this.redis.ping(), timeout]);
      const responseTime = `${Date.now() - start}ms`;
      return this.getStatus(key, true, { responseTime });
    } catch (error: any) {
      return this.getStatus(key, false, { message: error.message });
    }
  }
}
