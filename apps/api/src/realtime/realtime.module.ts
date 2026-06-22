import { Module, Global } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RedisModule } from './redis.module';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { PresenceModule } from '../presence/presence.module';
import { SocketRateLimiterService } from '../common/services/socket-rate-limiter.service';

@Global()
@Module({
  imports: [RedisModule, PrismaModule, JwtModule, PresenceModule],
  providers: [RealtimeGateway, SocketRateLimiterService],
  exports: [RealtimeGateway, RedisModule, SocketRateLimiterService],
})
export class RealtimeModule {}
