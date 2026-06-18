import { Injectable, OnModuleInit, Inject, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '../realtime/redis.module';
import Redis from 'ioredis';
import { Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { ActivityEventPayload } from './activity.service';

@Injectable()
export class ActivityWorker implements OnModuleInit {
  private readonly logger = new Logger(ActivityWorker.name);
  private worker: Worker;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
    private readonly prisma: PrismaService,
    private readonly gateway: RealtimeGateway,
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      'activity-feed',
      async (job: Job<ActivityEventPayload>) => {
        const payload = job.data;
        this.logger.debug(`Processing activity event: ${payload.eventType}`);

        const activity = await this.prisma.activityEvent.create({
          data: {
            eventType: payload.eventType,
            actorId: payload.actorId,
            projectId: payload.projectId,
            taskId: payload.taskId,
            metadata: payload.metadata ? JSON.parse(JSON.stringify(payload.metadata)) : undefined,
          },
          include: {
            task: { select: { title: true } },
            project: { select: { name: true } }
          }
        });

        const actor = await this.prisma.user.findUnique({
          where: { id: payload.actorId },
          select: { fullName: true, avatarUrl: true }
        });

        const fullEvent = {
          ...activity,
          actorName: actor?.fullName || 'Unknown User',
          actorAvatarUrl: actor?.avatarUrl || null,
        };

        this.gateway.server.to(`project_${payload.projectId}`).emit('activity:created', fullEvent);
        
        return { success: true, id: activity.id };
      },
      {
        connection: this.redisClient as any,
        concurrency: 5,
      }
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed with error: ${err.message}`);
    });
  }
}
