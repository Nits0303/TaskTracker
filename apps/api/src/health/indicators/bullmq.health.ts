import { Injectable, Inject } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { REDIS_CLIENT } from '../../realtime/redis.module';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';

@Injectable()
export class BullMQHealthIndicator extends HealthIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    super();
  }

  async isHealthy(key: string, queueName: string): Promise<HealthIndicatorResult> {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`BullMQ ${queueName} health check timed out`)), 3000),
    );

    const queue = new Queue(queueName, { connection: this.redis as any });

    try {
      await Promise.race([queue.getWaitingCount(), timeout]);
      return this.getStatus(key, true);
    } catch (error: any) {
      return this.getStatus(key, false, { message: error.message });
    } finally {
      await queue.close();
    }
  }
}
