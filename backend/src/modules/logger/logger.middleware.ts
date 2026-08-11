import { Injectable, NestMiddleware } from '@nestjs/common';
import { loggerStore } from './logger.service';
import { randomUUID } from 'crypto';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    const requestId = req.headers['x-request-id'] || req.requestId || randomUUID();
    req.requestId = requestId;

    const store = new Map<string, any>();
    store.set('requestId', requestId);
    if (req.user) {
      store.set('userId', req.user.id);
    }

    loggerStore.run(store, () => {
      next();
    });
  }
}
