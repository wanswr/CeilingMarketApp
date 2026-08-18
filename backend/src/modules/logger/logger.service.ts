import { Injectable, Scope } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export const loggerStore = new AsyncLocalStorage<Map<string, any>>();

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Developer Guidelines for Log Sanitization:
 * When adding new sensitive/PII data fields to DTOs or entities
 * (e.g. payment_token, provider_secret, external_api_key),
 * YOU MUST ADD THEM TO SENSITIVE_EXCLUDE_FIELDS OR SENSITIVE_MASK_FIELDS.
 *
 * Examples:
 * - 'payment_token', 'provider_secret', 'external_api_key'
 */
export const SENSITIVE_EXCLUDE_FIELDS = [
  'password',
  'passwordhash',
  'hash',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'jwt',
  'authorization',
  'cookie',
  'pushtoken',
  'push_token',
  'sessionversion',
  'session_version',
  'secret',
  'apikey',
  'api_key',
  'payment_token',
  'paymenttoken',
  'provider_secret',
  'providersecret',
  'external_api_key',
  'code',
  'otp',
] as const;

export const SENSITIVE_MASK_FIELDS = [
  'phone',
  'telephone',
  'instagram',
  'telegram',
] as const;

export const SENSITIVE_LOG_FIELDS = [
  ...SENSITIVE_EXCLUDE_FIELDS,
  ...SENSITIVE_MASK_FIELDS,
] as const;

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
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeForLog(item));
    }

    const clone: Record<string, any> = {};

    for (const key of Object.keys(data)) {
      const lowerKey = key.toLowerCase();

      if ((SENSITIVE_EXCLUDE_FIELDS as readonly string[]).includes(lowerKey)) {
        continue;
      }

      if ((SENSITIVE_MASK_FIELDS as readonly string[]).includes(lowerKey)) {
        const val = data[key];
        if (typeof val === 'string') {
          if (lowerKey === 'phone' || lowerKey === 'telephone') {
            clone[key] = val.length > 4 ? '*'.repeat(val.length - 4) + val.slice(-4) : '****';
          } else {
            clone[key] = '********';
          }
        }
        continue;
      }

      const val = data[key];
      if (typeof val === 'object' && val !== null) {
        clone[key] = this.sanitizeForLog(val);
      } else {
        clone[key] = val;
      }
    }

    return clone;
  }

  private formatLog(level: string, action: string, message: string, data: any = {}) {
    const store = loggerStore.getStore();
    const requestId = store?.get('requestId') || data?.requestId;
    const userId = store?.get('userId') || data?.userId;

    const { orderId, metadata, ...rest } = data;
    const targetData = metadata !== undefined ? metadata : rest;
    const sanitizedData = this.sanitizeForLog(targetData);

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
