import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database health check timed out')), 3000),
    );

    try {
      const start = Date.now();
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
      const responseTime = `${Date.now() - start}ms`;
      return this.getStatus(key, true, { responseTime });
    } catch (error: any) {
      return this.getStatus(key, false, { message: error.message });
    }
  }
}
