import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { Redis } from 'ioredis';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { ProjectModule } from './project/project.module';
import { TaskModule } from './task/task.module';
import { RealtimeModule } from './realtime/realtime.module';
import { REDIS_CLIENT, RedisModule } from './realtime/redis.module';
import { ActivityModule } from './activity/activity.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CalendarModule } from './calendar/calendar.module';
import { WorkloadModule } from './workload/workload.module';
import { NotificationModule } from './notification/notification.module';
import { UserModule } from './user/user.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [
          { name: 'default', ttl: 60000, limit: 100 },
        ],
        storage: new ThrottlerStorageRedisService(redis as any),
      }),
    }),
    PrismaModule,
    AuthModule,
    WorkspaceModule,
    ProjectModule,
    TaskModule,
    RealtimeModule,
    ActivityModule,
    DashboardModule,
    CalendarModule,
    WorkloadModule,
    NotificationModule,
    UserModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
