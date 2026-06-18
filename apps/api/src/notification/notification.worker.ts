import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { REDIS_CLIENT } from '../realtime/redis.module';
import { Redis } from 'ioredis';
import * as nodemailer from 'nodemailer';
import * as webpush from 'web-push';
import { DispatchPayload } from './notification.service';

@Injectable()
export class NotificationWorker implements OnModuleInit {
  private readonly logger = new Logger(NotificationWorker.name);
  private worker: Worker;
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
  ) {
    this.initMailTransport();
    this.initWebPush();
  }

  async onModuleInit() {
    this.worker = new Worker(
      'notifications',
      async (job: Job<DispatchPayload, any, string>) => {
        const { name, data } = job;
        switch (name) {
          case 'inApp':
            return this.handleInApp(data);
          case 'email':
            return this.handleEmail(data);
          case 'push':
            return this.handlePush(data);
          default:
            this.logger.warn(`Unknown job name: ${name}`);
        }
      },
      {
        connection: this.redisClient as any,
        concurrency: 10,
      }
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed with error:`, err);
    });
  }

  private async initMailTransport() {
    try {
      if (!process.env.SMTP_HOST) {
        this.logger.warn('SMTP_HOST not set. Email notifications will be disabled.');
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: false,
        requireTLS: true,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      this.logger.log(`Mail transport initialized with host: ${process.env.SMTP_HOST}`);
    } catch (err) {
      this.logger.error('Failed to init mail transport', err);
    }
  }

  private initWebPush() {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        'mailto:admin@tasktracker.local',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
    } else {
      this.logger.warn('VAPID keys not set for web-push');
    }
  }

  private async handleInApp(data: DispatchPayload) {
    const record = await this.prisma.notification.create({
      data: {
        recipientId: data.recipientId,
        type: data.type,
        message: data.message,
        referenceId: data.referenceId,
      }
    });

    this.realtime.emitToUser(data.recipientId, 'notification:new', {
      ...record,
      persistent: data.persistent
    });
  }

  private async handleEmail(data: DispatchPayload) {
    if (!this.transporter) return;

    const prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId: data.recipientId }
    });

    if (prefs && !prefs.emailEnabled) {
      return; // Opted out
    }

    const user = await this.prisma.user.findUnique({ where: { id: data.recipientId } });
    if (!user || !user.email) return;

    try {
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: user.email,
        subject: `Task Tracker: ${data.type}`,
        text: data.message,
      });

      this.logger.log(`Email sent successfully to ${user.email} (Message ID: ${info.messageId})`);
    } catch (err) {
      this.logger.error('Failed to send email', err);
    }
  }

  private async handlePush(data: DispatchPayload) {
    const prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId: data.recipientId }
    });

    if (prefs && !prefs.pushEnabled) {
      return; // Opted out
    }

    const sub = await this.prisma.pushSubscription.findUnique({
      where: { userId: data.recipientId }
    });

    if (!sub) return;

    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            auth: sub.auth,
            p256dh: sub.p256dh
          }
        },
        JSON.stringify({
          title: 'Task Tracker',
          body: data.message,
        })
      );
    } catch (error: any) {
      if (error.statusCode === 410) {
        await this.prisma.pushSubscription.delete({ where: { id: sub.id } });
        this.logger.log(`Removed expired push subscription for user ${data.recipientId}`);
      } else {
        this.logger.error('Failed to send push notification', error);
      }
    }
  }
}
