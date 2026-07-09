import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { LoggingInterceptor } from './modules/logger/logging.interceptor';
import { LoggerService } from './modules/logger/logger.service';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: false,
  }));

  app.setGlobalPrefix('api');
  app.enableCors();
  const logger = await app.resolve(LoggerService);
  app.useGlobalInterceptors(new LoggingInterceptor(logger));

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: http://0.0.0.0:${port}/api`);
}
bootstrap();
