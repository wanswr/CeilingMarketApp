import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { LoggerService } from '../../modules/logger/logger.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {
    this.logger.setService('AllExceptionsFilter');
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response.status(status).json(body);
      return;
    }

    // Log unexpected raw error with stack trace for backend observability
    this.logger.error('UNEXPECTED_SERVER_ERROR', (exception as any)?.message || 'No message', {
        error: exception,
        stack: (exception as any)?.stack
    });

    // Strip internal implementation details before replying to client
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
