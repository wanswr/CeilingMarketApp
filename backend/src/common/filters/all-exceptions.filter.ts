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

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_SERVER_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resBody = exception.getResponse();
      if (typeof resBody === 'string') {
        message = resBody;
      } else if (resBody && typeof resBody === 'object') {
        const anyRes = resBody as any;
        message = Array.isArray(anyRes.message) ? anyRes.message.join(', ') : (anyRes.message || exception.message);
        code = anyRes.error || exception.name || 'HTTP_ERROR';
      } else {
        message = exception.message;
      }
    } else {
      message = (exception as any)?.message || 'Internal server error';
      code = (exception as any)?.code || 'UNEXPECTED_ERROR';

      // Log unexpected raw error with stack trace for backend observability
      this.logger.error('UNEXPECTED_SERVER_ERROR', message, {
          error: exception,
          stack: (exception as any)?.stack
      });
    }

    response.status(status).json({
      success: false,
      message,
      code,
      timestamp: new Date().toISOString()
    });
  }
}
