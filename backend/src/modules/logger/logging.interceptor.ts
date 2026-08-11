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

    // Read the requestId already set by LoggerMiddleware, or fallback safely
    const requestId = request.requestId || request.headers['x-request-id'] || Math.random().toString(36).substring(7);
    request.requestId = requestId;

    const startTime = Date.now();

    // Use safeBody for logging in error states safely
    const safeBody = this.logger.sanitizeForLog(body);

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = Date.now() - startTime;
          const logData = {
              requestId,
              userId: request.user?.id,
              metadata: { duration }
          };

          const isGet = method === 'GET';
          const isSlow = duration > 500;

          // Log only if it's NOT a successful GET OR if it's slow
          if (!isGet || isSlow) {
              const action = isSlow ? 'API_SLOW_RESPONSE' : 'API_RESPONSE';
              this.logger.debug(action, `${method} ${url} [${duration}ms]`, logData);
          }
        },
        error: (err) => {
          const duration = Date.now() - startTime;
          // Errors are always logged, now including sanitized safeBody for better diagnostics
          this.logger.error('API_ERROR', `${method} ${url} failed [${duration}ms]`, {
              requestId,
              userId: request.user?.id,
              metadata: {
                  duration,
                  error: err.message,
                  status: err.status,
                  body: safeBody
              }
          });
        },
      }),
    );
  }
}
