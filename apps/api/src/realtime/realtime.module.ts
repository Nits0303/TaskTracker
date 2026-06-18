import { Module, Global } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RedisModule } from './redis.module';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';

@Global()
@Module({
  imports: [RedisModule, PrismaModule, JwtModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway, RedisModule],
})
export class RealtimeModule {}
