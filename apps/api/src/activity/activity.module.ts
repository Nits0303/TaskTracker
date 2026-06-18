import { Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityWorker } from './activity.worker';
import { ActivityController } from './activity.controller';
import { RealtimeModule } from '../realtime/realtime.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [RealtimeModule, PrismaModule],
  providers: [ActivityService, ActivityWorker],
  controllers: [ActivityController],
  exports: [ActivityService],
})
export class ActivityModule {}
