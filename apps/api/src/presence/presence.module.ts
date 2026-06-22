import { Module } from '@nestjs/common';
import { PresenceService } from './presence.service';
import { RedisModule } from '../realtime/redis.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [RedisModule, PrismaModule],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
