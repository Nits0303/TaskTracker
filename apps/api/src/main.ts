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

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Task Tracker API')
      .setDescription('The Task Tracker API documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, documentFactory);
  }

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
