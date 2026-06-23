const { NestFactory } = require('@nestjs/core');
const { Module } = require('@nestjs/common');
const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
const fs = require('fs');
const path = require('path');

const apiDistDir = path.join(__dirname, 'dist');

function getAllControllers(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllControllers(filePath, fileList);
    } else if (file.endsWith('.controller.js')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

async function bootstrap() {
  const controllerFiles = getAllControllers(apiDistDir);
  const controllers = [];
  
  for (const file of controllerFiles) {
    const exported = require(file);
    for (const key in exported) {
      if (typeof exported[key] === 'function' && key.endsWith('Controller')) {
        controllers.push(exported[key]);
      }
    }
  }

  const FakeModule = function() {};
  Module({ controllers })(FakeModule);

  try {
    const app = await NestFactory.create(FakeModule, { logger: false });
    const config = new DocumentBuilder()
      .setTitle('Task Tracker API')
      .setDescription('Complete API reference for the Task Tracker platform.')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build();
      
    const document = SwaggerModule.createDocument(app, config, {
      deepScanRoutes: true,
    });
    
    fs.writeFileSync('swagger.json', JSON.stringify(document, null, 2));
    console.log('Successfully generated swagger.json');
    await app.close();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

bootstrap();
