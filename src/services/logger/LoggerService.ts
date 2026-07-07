import { LogLevel } from './LogLevel';
import { LogContext, LogEntry } from './LogContext';
import { traceManager } from './TraceManager';
import { Platform } from 'react-native';

class LoggerService {
  private level: LogLevel = __DEV__ ? LogLevel.DEBUG : LogLevel.INFO;
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 1000;

  setLevel(level: LogLevel) {
    this.level = level;
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

  private log(level: LogLevel, message: string, context: LogContext) {
    if (level < this.level) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...context,
        actionId: context.actionId || traceManager.getActionId() || undefined,
        traceId: context.traceId || traceManager.getTraceId() || undefined,
        platform: Platform.OS,
      },
    };

    // Store log for debugging
    this.logs.push(entry);
    if (this.logs.length > this.MAX_LOGS) this.logs.shift();

    // Output to console
    this.printToConsole(entry);
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

  private getLevelColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return '#888';
      case LogLevel.INFO: return '#2D5BFF';
      case LogLevel.WARN: return '#FFA502';
      case LogLevel.ERROR: return '#FF4757';
      default: return '#000';
    }
  }

  // Action Helpers
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

  // Network Logging
  logRequest(method: string, url: string, requestId: string, payload?: any) {
    traceManager.startTimer(requestId);
    this.debug(`NETWORK_START: ${method} ${url}`, { source: 'api', requestId, payload });
  }

  logResponse(requestId: string, status: number, data?: any) {
    const duration = traceManager.getDuration(requestId, 'request');
    const message = `NETWORK_END: ${status}`;
    const context = { source: 'api', requestId, status, duration, response: data };

    if (duration > 1000) {
        this.warn(`SLOW_REQUEST: ${message}`, context);
    } else {
        this.debug(message, context);
    }
  }

  logNetworkError(requestId: string, error: any) {
    const duration = traceManager.getDuration(requestId, 'request');
    this.error(`NETWORK_ERROR`, { source: 'api', requestId, duration, error: error.message, stack: error.stack });
  }

  // UI Interaction Logging
  logClick(button: string, screen?: string, extra: LogContext = {}) {
      this.info(`BUTTON_PRESS: ${button}`, { source: 'ui', component: button, screen, ...extra });
  }

  // Trace helper for complex flows
  getTrace(actionId: string): LogEntry[] {
    return this.logs.filter(l => l.context.actionId === actionId);
  }
}

export const logger = new LoggerService();
