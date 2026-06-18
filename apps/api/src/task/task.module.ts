import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectModule } from '../project/project.module';
import { ActivityModule } from '../activity/activity.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    PrismaModule,
    ProjectModule,
    ActivityModule,
    NotificationModule,
    MulterModule.register({ limits: { fileSize: 50 * 1024 * 1024 } }) // 50MB limit
  ],
  providers: [TaskService],
  controllers: [TaskController],
  exports: [TaskService],
})
export class TaskModule {}
