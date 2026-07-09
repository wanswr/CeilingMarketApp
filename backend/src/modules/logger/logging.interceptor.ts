import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LoggerService } from './logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private logger: LoggerService) {
    this.logger.setService('API');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body } = request;
    const requestId = Math.random().toString(36).substring(7);
    request.requestId = requestId;

    const startTime = Date.now();

    const safeBody = { ...body };
    const sensitiveKeys = ['password', 'token', 'code', 'otp'];
    sensitiveKeys.forEach(key => {
        if (safeBody[key]) safeBody[key] = '********';
    });

    // All normal request logs are DEBUG level
    this.logger.debug('API_REQUEST', `${method} ${url}`, {
        requestId,
        metadata: { body: safeBody }
    });

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          const logData = {
              requestId,
              userId: request.user?.id,
              metadata: { duration }
          };

          // All normal response logs are DEBUG level
          this.logger.debug('API_RESPONSE', `${method} ${url} [${duration}ms]`, logData);
        },
        error: (err) => {
          const duration = Date.now() - startTime;
          // Errors remain at ERROR level
          this.logger.error('API_ERROR', `${method} ${url} failed [${duration}ms]`, {
              requestId,
              userId: request.user?.id,
              metadata: {
                  duration,
                  error: err.message,
                  status: err.status
              }
          });
        },
      }),
    );
  }
}
