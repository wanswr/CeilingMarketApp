import { LogLevel } from './LogLevel';
import { LogContext, LogEntry } from './LogContext';
import { traceManager } from './TraceManager';
import { Platform } from 'react-native';

const SENSITIVE_EXCLUDE_KEYS = [
  'password',
  'passwordhash',
  'hash',
  'token',
  'usertoken',
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
  'code',
  'otp',
  'message',
  'messagecontent',
  'message_content',
  'content',
];

const SENSITIVE_MASK_KEYS = [
  'phone',
  'telephone',
  'address',
  'fulladdress',
  'full_address',
  'instagram',
  'telegram',
];

class LoggerService {
  private level: LogLevel = typeof __DEV__ !== 'undefined' && __DEV__ ? LogLevel.INFO : LogLevel.INFO;
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 1000;
  private readonly PERSISTENT_LOG_KEY = 'app_logs_persistent';

  setLevel(level: LogLevel) {
    this.level = level;
  }

  trace(message: string, context: LogContext = {}) {
    this.log(LogLevel.TRACE, message, context);
  }

  debug(message: string, context: LogContext = {}) {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context: LogContext = {}) {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context: LogContext = {}) {
    this.log(LogLevel.WARN, message, context);
  }

  error(message: string, context: LogContext = {}) {
    this.log(LogLevel.ERROR, message, context);
  }

  public maskSensitiveData(data: any): any {
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.maskSensitiveData(item));
    }

    const clone: Record<string, any> = {};

    for (const key of Object.keys(data)) {
      const lowerKey = key.toLowerCase();

      if (SENSITIVE_EXCLUDE_KEYS.includes(lowerKey)) {
        continue;
      }

      if (SENSITIVE_MASK_KEYS.includes(lowerKey)) {
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
        clone[key] = this.maskSensitiveData(val);
      } else {
        clone[key] = val;
      }
    }

    return clone;
  }

  private log(level: LogLevel, message: string, context: LogContext) {
    if (level < this.level) return;

    const sanitizedContext = this.maskSensitiveData(context);

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...sanitizedContext,
        actionId: context.actionId || traceManager.getActionId() || undefined,
        traceId: context.traceId || traceManager.getTraceId() || undefined,
        platform: Platform.OS,
      },
    };

    this.logs.push(entry);
    if (this.logs.length > this.MAX_LOGS) this.logs.shift();

    if (level >= LogLevel.WARN || context.important) {
      this.persistLog(entry);
    }

    this.printToConsole(entry);
  }

  private persistLog(entry: LogEntry) {
    try {
      const { storageService } = require('../StorageService');
      const adapter = storageService;
      if (!adapter) return;

      const stored = adapter.get(this.PERSISTENT_LOG_KEY) || [];
      stored.push(entry);
      if (stored.length > 5000) stored.shift();
      adapter.set(this.PERSISTENT_LOG_KEY, stored);
    } catch (e) {}
  }

  private printToConsole(entry: LogEntry) {
    const { timestamp, level, message, context } = entry;
    const levelStr = LogLevel[level];
    const actionTag = context.actionId ? ` [AID:${context.actionId}]` : '';
    const durationTag = context.duration ? ` (${context.duration}ms)` : '';

    const color = this.getLevelColor(level);
    const consoleMsg = `%c[${timestamp}] ${levelStr}${actionTag}: ${message}${durationTag}`;

    if (level === LogLevel.ERROR) {
      console.error(consoleMsg, 'color: ' + color, context);
    } else if (level === LogLevel.WARN) {
      console.warn(consoleMsg, 'color: ' + color, context);
    } else {
      console.log(consoleMsg, 'color: ' + color, context);
    }
  }

  logStateTransition(action: string, from: any, to: any, extra: LogContext = {}) {
    this.info(`STATE_TRANSITION: ${action}`, {
      source: 'state',
      from: this.maskSensitiveData(from),
      to: this.maskSensitiveData(to),
      ...extra
    });
  }

  private getLevelColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.TRACE: return '#aaa';
      case LogLevel.DEBUG: return '#888';
      case LogLevel.INFO: return '#2D5BFF';
      case LogLevel.WARN: return '#FFA502';
      case LogLevel.ERROR: return '#FF4757';
      default: return '#000';
    }
  }

  startAction(name: string, context: LogContext = {}): string {
    const actionId = traceManager.startAction(name, context);
    this.info(`ACTION_START: ${name}`, { ...context, actionId });
    return actionId;
  }

  endAction(name: string, context: LogContext = {}) {
    const actionId = traceManager.getActionId();
    if (actionId) {
      const duration = traceManager.getDuration(actionId, 'action');
      this.info(`ACTION_END: ${name}`, { ...context, actionId, duration });
    }
  }

  logRequest(method: string, url: string, requestId: string, payload?: any) {
    traceManager.startTimer(requestId);

    if (typeof __DEV__ !== 'undefined' && !__DEV__) {
      // In staging/production, do not log request payload bodies
      this.debug(`NETWORK_START: ${method} ${url}`, {
        source: 'api',
        requestId,
      });
      return;
    }

    const safePayload = this.maskSensitiveData(payload);
    this.debug(`NETWORK_START: ${method} ${url}`, {
      source: 'api',
      requestId,
      payload: this.truncateObject(safePayload)
    });
  }

  logResponse(requestId: string, status: number, data?: any) {
    const duration = traceManager.getDuration(requestId, 'request');
    const message = `NETWORK_END: ${status}`;

    if (typeof __DEV__ !== 'undefined' && !__DEV__) {
      // In staging/production, do not log full response data
      const metadataOnly = {
        source: 'api',
        requestId,
        status,
        duration,
      };
      if (duration > 1000) {
        this.warn(`SLOW_REQUEST: ${message}`, metadataOnly);
      } else {
        this.debug(message, metadataOnly);
      }
      return;
    }

    const safeData = this.maskSensitiveData(data);
    const context = {
      source: 'api',
      requestId,
      status,
      duration,
      response: this.truncateObject(safeData)
    };

    if (duration > 1000) {
      this.warn(`SLOW_REQUEST: ${message}`, context);
    } else {
      this.debug(message, context);
    }
  }

  logNetworkError(requestId: string, error: any, extra: LogContext = {}) {
    const duration = traceManager.getDuration(requestId, 'request');
    this.error(`NETWORK_ERROR`, {
      source: 'api',
      requestId,
      duration,
      error: error.message,
      status: error.response?.status,
      response: this.truncateObject(this.maskSensitiveData(error.response?.data)),
      ...extra
    });
  }

  private truncateObject(obj: any, limit: number = 1000): any {
    if (!obj) return obj;
    const str = JSON.stringify(obj);
    if (str.length > limit) {
      return { _truncated: true, length: str.length, original: str.substring(0, limit) + '...' };
    }
    return obj;
  }

  action(name: string, category: 'UI' | 'API' | 'STORE' | 'MAP' | 'WEBSOCKET', context: LogContext = {}) {
    this.info(`ACTION: ${name}`, { ...context, source: category.toLowerCase() });
  }

  logClick(button: string, screen?: string, extra: LogContext = {}) {
    this.info(`BUTTON_PRESS: ${button}`, { source: 'ui', component: button, screen, ...extra });
  }

  getTrace(actionId: string): LogEntry[] {
    return this.logs.filter(l => l.context.actionId === actionId);
  }

  getPersistentLogs(): LogEntry[] {
    try {
      const { storageService } = require('../StorageService');
      return storageService.get(this.PERSISTENT_LOG_KEY) || [];
    } catch (e) {
      return [];
    }
  }

  exportLogs(): string {
    const logs = this.getPersistentLogs();
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '_');
    const filename = `logs_${date}.json`;
    return JSON.stringify({ filename, logs }, null, 2);
  }

  clearPersistentLogs() {
    try {
      const { storageService } = require('../StorageService');
      storageService.delete(this.PERSISTENT_LOG_KEY);
    } catch (e) {}
  }
}

export const logger = new LoggerService();
