import { Injectable, Logger, Inject } from '@nestjs/common';
import { Queue } from 'bullmq';
import { REDIS_CLIENT } from '../realtime/redis.module';
import { Redis } from 'ioredis';

export interface DispatchPayload {
  recipientId: string;
  type: string;
  message: string;
  referenceId?: string;
  persistent?: boolean;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private queue: Queue;

  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {
    this.queue = new Queue('notifications', {
      connection: this.redisClient as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      }
    });
  }

  /**
   * Fire-and-forget dispatch of notifications across all 3 channels.
   */
  async dispatch(payload: DispatchPayload) {
    try {
      await this.queue.add('inApp', payload);
      await this.queue.add('email', payload);
      await this.queue.add('push', payload);
    } catch (error) {
      this.logger.error('Failed to dispatch notifications', error);
    }
  }
}
