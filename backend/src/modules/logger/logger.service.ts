import { Injectable, Scope } from '@nestjs/common';

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

    const nodeEnv = process.env.NODE_ENV || 'development';
    const debugEnabled = process.env.DEBUG === 'true';

    if (debugEnabled || nodeEnv === 'development') return LogLevel.DEBUG;
    return LogLevel.INFO;
  }

  private formatLog(level: string, action: string, message: string, data: any = {}) {
    const { userId, orderId, requestId, metadata, ...rest } = data;
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      action,
      requestId,
      userId,
      orderId,
      message,
      metadata: metadata || rest,
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
