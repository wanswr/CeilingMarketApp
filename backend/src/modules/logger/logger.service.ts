import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService {
  private serviceName: string = 'App';
  private requestId: string;

  constructor(@Inject(REQUEST) private request: Request) {
    this.requestId = (request as any).requestId || Math.random().toString(36).substring(7);
  }

  setService(name: string) {
    this.serviceName = name;
  }

  private get currentLevel(): LogLevel {
    const env = process.env.NODE_ENV || 'development';
    const debugEnabled = process.env.DEBUG === 'true';
    if (debugEnabled || env === 'development') return LogLevel.DEBUG;
    return LogLevel.INFO;
  }

  private formatLog(level: string, action: string, message: string, data: any = {}) {
    const { userId, orderId, metadata, ...rest } = data;
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      action,
      requestId: this.requestId,
      userId: userId || (this.request as any).user?.id,
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
