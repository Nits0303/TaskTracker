import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';
import { Redis } from 'ioredis';
import { AppController } from './app.controller';

class FailOpenThrottlerStorage extends ThrottlerStorageRedisService {
  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string) {
    try {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Throttler Redis timeout')), 1000));
      return await Promise.race([
        super.increment(key, ttl, limit, blockDuration, throttlerName),
        timeout
      ]);
    } catch (e) {
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
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
import { WorkloadModule } from './workload/workload.module';
import { NotificationModule } from './notification/notification.module';
import { UserModule } from './user/user.module';
import { PresenceModule } from './presence/presence.module';
import { ChatModule } from './chat/chat.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SearchModule } from './search/search.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { SamlModule } from './saml/saml.module';

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
        storage: new FailOpenThrottlerStorage(redis as any),
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
    WorkloadModule,
    NotificationModule,
    UserModule,
    PresenceModule,
    ChatModule,
    SearchModule,
    AuditModule,
    HealthModule,
    SamlModule,
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
