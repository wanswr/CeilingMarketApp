import { Injectable, Scope } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export const loggerStore = new AsyncLocalStorage<Map<string, any>>();

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService {
  private serviceName: string = 'App';

  setService(name: string) {
    this.serviceName = name;
  }

  private get currentLevel(): LogLevel {
    const logLevelEnv = process.env.LOG_LEVEL?.toLowerCase();

    if (logLevelEnv === 'debug') return LogLevel.DEBUG;
    if (logLevelEnv === 'info') return LogLevel.INFO;
    if (logLevelEnv === 'warn') return LogLevel.WARN;
    if (logLevelEnv === 'error') return LogLevel.ERROR;

    const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
    const debugEnabled = process.env.DEBUG === 'true';

    // Production defaults to INFO
    if (nodeEnv === 'production') {
      return debugEnabled ? LogLevel.DEBUG : LogLevel.INFO;
    }

    // Development/Test defaults to DEBUG
    return LogLevel.DEBUG;
  }

  public sanitizeForLog(data: any): any {
    if (!data) return data;
    if (typeof data !== 'object') return data;

    const clone = Array.isArray(data) ? [...data] : { ...data };

    const keysToExclude = ['password', 'token', 'code', 'otp', 'jwt', 'pushtoken', 'accesstoken', 'access_token'];
    const keysToMask = ['phone', 'telephone', 'instagram', 'telegram'];

    for (const key of Object.keys(clone)) {
      const lowerKey = key.toLowerCase();
      if (keysToExclude.includes(lowerKey)) {
        delete clone[key];
      } else if (keysToMask.includes(lowerKey)) {
        if (typeof clone[key] === 'string') {
          const val = clone[key];
          if (lowerKey === 'phone' || lowerKey === 'telephone') {
            clone[key] = val.length > 4 ? '*'.repeat(val.length - 4) + val.slice(-4) : '****';
          } else {
            clone[key] = '********';
          }
        } else {
          delete clone[key];
        }
      } else if (typeof clone[key] === 'object' && clone[key] !== null) {
        clone[key] = this.sanitizeForLog(clone[key]);
      }
    }

    return clone;
  }

  private formatLog(level: string, action: string, message: string, data: any = {}) {
    const store = loggerStore.getStore();
    const requestId = store?.get('requestId') || data?.requestId;
    const userId = store?.get('userId') || data?.userId;

    const { orderId, metadata, ...rest } = data;
    const sanitizedData = this.sanitizeForLog(metadata || rest);

    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      action,
      requestId,
      userId,
      orderId,
      message,
      metadata: sanitizedData,
    });
  }

  debug(action: string, message: string, data?: any) {
    if (this.currentLevel <= LogLevel.DEBUG) {
      console.log(this.formatLog('DEBUG', action, message, data));
    }
  }

  info(action: string, message: string, data?: any) {
    if (this.currentLevel <= LogLevel.INFO) {
      console.info(this.formatLog('INFO', action, message, data));
    }
  }

  warn(action: string, message: string, data?: any) {
    if (this.currentLevel <= LogLevel.WARN) {
      console.warn(this.formatLog('WARN', action, message, data));
    }
  }

  error(action: string, message: string, data?: any) {
    if (this.currentLevel <= LogLevel.ERROR) {
      console.error(this.formatLog('ERROR', action, message, data));
    }
  }
}
