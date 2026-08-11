import { LogLevel } from './LogLevel';

export interface LogContext {
  actionId?: string;
  traceId?: string;
  screen?: string;
  component?: string;
  duration?: number;
  status?: number;
  userId?: string;
  orderId?: string;
  chatId?: string;
  source?: 'api' | 'websocket' | 'store' | 'ui' | 'system';
  payload?: any;
  error?: any;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
}
