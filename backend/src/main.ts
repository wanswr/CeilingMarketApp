import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { LoggingInterceptor } from './modules/logger/logging.interceptor';
import { LoggerService } from './modules/logger/logger.service';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: false,
  }));

  app.setGlobalPrefix('api');
  const configService = app.get(ConfigService);
  const allowedOriginsStr = configService.get<string>('ALLOWED_ORIGINS');
  let allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'http://localhost:19000',
    'http://127.0.0.1:19000',
  ];
  if (allowedOriginsStr) {
    allowedOrigins = allowedOriginsStr.split(',').map(o => o.trim());
  }
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  const logger = await app.resolve(LoggerService);
  app.useGlobalInterceptors(new LoggingInterceptor(logger));

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  logger.setService('Bootstrap');
  logger.info('SERVER_STARTED', `Application is running on: http://0.0.0.0:${port}/api`, {
      metadata: { port, nodeEnv: process.env.NODE_ENV }
  });
}
bootstrap();
