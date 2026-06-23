import { Controller, Get, VERSION_NEUTRAL, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './indicators/prisma.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { MinioHealthIndicator } from './indicators/minio.health';
import { BullMQHealthIndicator } from './indicators/bullmq.health';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Health Check')
@Controller({
  path: 'health',
  version: VERSION_NEUTRAL,
})
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private memory: MemoryHealthIndicator,
    private prismaIndicator: PrismaHealthIndicator,
    private redisIndicator: RedisHealthIndicator,
    private minioIndicator: MinioHealthIndicator,
    private bullmqIndicator: BullMQHealthIndicator,
  ) {}

  @ApiOperation({ summary: 'Get application health status' })
  @ApiResponse({ status: 200, description: 'Service is healthy.' })
  @ApiResponse({ status: 503, description: 'Service is unhealthy.' })
  @Get()
  async check(@Res() res: Response) {
    const indicators = [
      () => this.prismaIndicator.isHealthy('database'),
      () => this.redisIndicator.isHealthy('redis'),
      () => this.minioIndicator.isHealthy('minio'),
      () => this.bullmqIndicator.isHealthy('bullmq:activity-feed', 'activity-feed'),
      () => this.bullmqIndicator.isHealthy('bullmq:notifications', 'notifications'),
      async () => {
        const result = await this.memory.checkHeap('memory', 300 * 1024 * 1024);
        const usedMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        const totalMB = Math.round(process.memoryUsage().heapTotal / 1024 / 1024);
        if (result.memory) {
          result.memory.heapUsed = `${usedMB}MB`;
          result.memory.heapTotal = `${totalMB}MB`;
        }
        return result;
      },
    ];

    try {
      const result = await this.health.check(indicators);
      return res.status(200).json({
        status: result.status,
        timestamp: new Date().toISOString(),
        services: result.details,
      });
    } catch (error: any) {
      return res.status(503).json({
        status: error.response?.status ?? 'error',
        timestamp: new Date().toISOString(),
        services: error.response?.details ?? {},
      });
    }
  }
}
