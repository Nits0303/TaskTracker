import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../realtime/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
