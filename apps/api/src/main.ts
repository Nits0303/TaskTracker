import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { RedisIoAdapter } from './realtime/redis-io.adapter';
import { REDIS_CLIENT } from './realtime/redis.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ThrottlerExceptionFilter } from './common/filters/throttler-exception.filter';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new GlobalExceptionFilter(), new ThrottlerExceptionFilter());
  app.use(cookieParser());
  
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  const pubClient = app.get(REDIS_CLIENT);
  const subClient = pubClient.duplicate();
  const redisIoAdapter = new RedisIoAdapter(app, pubClient, subClient);
  app.useWebSocketAdapter(redisIoAdapter);

  const config = new DocumentBuilder()
    .setTitle('Task Tracker API')
    .setDescription('Complete API reference for the Task Tracker platform — a production-grade project management system built with NestJS, PostgreSQL, Redis, MinIO, and Socket.IO.')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token'
    )
    .addTag('Auth', 'Authentication, registration, token refresh, Google OAuth, invites')
    .addTag('Workspaces', 'Workspace CRUD, member management, role management')
    .addTag('Projects', 'Project CRUD, project member management')
    .addTag('Tasks', 'Task CRUD, sub-tasks, comments, attachments')
    .addTag('Chat', 'Channels, messages, threads, read receipts')
    .addTag('Conversations', 'Direct messages between workspace members')
    .addTag('Dashboard', 'Project and workspace statistics')
    .addTag('Workload', 'Member workload and capacity data')
    .addTag('Search', 'Full-text and trigram search across tasks, projects, members')
    .addTag('Notifications', 'In-app notifications, push subscriptions, preferences')
    .addTag('Audit Logs', 'Workspace and project audit trail')
    .addTag('Presence', 'Online status and real-time presence')
    .addTag('Health', 'System health check and dependency status')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customCss: `
      .swagger-ui { background-color: #0a0a0a; color: #e5e5e5; }
      .swagger-ui .topbar { background-color: #111111; }
      .swagger-ui .info .title { color: #ffffff; }
      .swagger-ui .scheme-container { background-color: #1a1a1a; }
      .swagger-ui .opblock-tag { color: #e5e5e5; border-color: #333; }
      .swagger-ui .opblock.opblock-post .opblock-summary { background: rgba(73,204,144,.1); }
      .swagger-ui .opblock.opblock-get .opblock-summary { background: rgba(97,175,254,.1); }
      .swagger-ui .opblock.opblock-patch .opblock-summary { background: rgba(252,161,48,.1); }
      .swagger-ui .opblock.opblock-delete .opblock-summary { background: rgba(249,62,62,.1); }
    `,
    customSiteTitle: 'Task Tracker API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
