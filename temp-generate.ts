
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './apps/api/src/app.module';
import { PrismaService } from './apps/api/src/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  // Mock onModuleInit to prevent DB connection
  PrismaService.prototype.onModuleInit = async () => { console.log('Mocked Prisma init'); };

  const app = await NestFactory.create(AppModule, { logger: false });
  const config = new DocumentBuilder()
    .setTitle('Task Tracker API')
    .setDescription('Task Tracker API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
    
  const document = SwaggerModule.createDocument(app, config);
  fs.writeFileSync('./swagger.json', JSON.stringify(document, null, 2));
  await app.close();
  process.exit(0);
}
bootstrap();
