import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import * as Minio from 'minio';

@Injectable()
export class MinioHealthIndicator extends HealthIndicator {
  private minioClient: Minio.Client;

  constructor(private readonly config: ConfigService) {
    super();
    this.minioClient = new Minio.Client({
      endPoint: this.config.get('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.config.get('MINIO_PORT', '9000')),
      useSSL: this.config.get('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.config.get('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.config.get('MINIO_SECRET_KEY', 'minioadmin'),
    });
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('MinIO health check timed out')), 5000),
    );

    try {
      const start = Date.now();
      await Promise.race([this.minioClient.listBuckets(), timeout]);
      const responseTime = `${Date.now() - start}ms`;
      return this.getStatus(key, true, { responseTime });
    } catch (error: any) {
      return this.getStatus(key, false, { message: error.message });
    }
  }
}
