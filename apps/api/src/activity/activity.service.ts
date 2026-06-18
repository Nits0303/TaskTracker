import { Injectable, Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../realtime/redis.module';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { ActivityEventType } from '@prisma/client';

export interface ActivityEventPayload {
  eventType: ActivityEventType;
  actorId: string;
  projectId: string;
  taskId?: string;
  metadata?: any;
}

@Injectable()
export class ActivityService {
  private queue: Queue;

  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {
    this.queue = new Queue('activity-feed', {
      connection: this.redisClient as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      }
    });
  }

  async logEvent(payload: ActivityEventPayload) {
    this.queue.add('log-activity', payload).catch(err => {
      console.error('Failed to add job to activity-feed queue', err);
    });
  }
}
