import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { LoggerService } from '../modules/logger/logger.service';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Внутренняя ошибка сервера';
    let errorCode = 'DATABASE_ERROR';

    switch (exception.code) {
      case 'P2002':
        status = HttpStatus.CONFLICT;
        message = 'Запись с такими данными уже существует';
        errorCode = 'UNIQUE_CONSTRAINT_VIOLATION';
        break;
      case 'P2025':
        status = HttpStatus.NOT_FOUND;
        message = 'Запрашиваемая запись не найдена';
        errorCode = 'RECORD_NOT_FOUND';
        break;
      case 'P2003':
        status = HttpStatus.BAD_REQUEST;
        message = 'Нарушена целостность связей данных';
        errorCode = 'FOREIGN_KEY_VIOLATION';
        break;
      default:
        this.logger.error('PRISMA_UNHANDLED_ERROR', exception.message, {
            metadata: { code: exception.code, meta: exception.meta }
        });
        break;
    }

    this.logger.warn('PRISMA_EXCEPTION', `Prisma exception caught: ${exception.code}`, {
        metadata: {
            code: exception.code,
            status,
            path: request.url,
            meta: exception.meta,
        }
    });

    response.status(status).json({
      statusCode: status,
      message,
      error: errorCode,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
