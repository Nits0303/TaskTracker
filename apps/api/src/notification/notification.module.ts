import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationWorker } from './notification.worker';
import { NotificationScheduler } from './notification.scheduler';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    PrismaModule,
    RealtimeModule,
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationWorker, NotificationScheduler],
  exports: [NotificationService],
})
export class NotificationModule {}
