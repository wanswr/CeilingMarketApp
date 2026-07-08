import { LogContext } from './LogContext';

class TraceManager {
  private currentActionId: string | null = null;
  private currentTraceId: string | null = null;
  private timers: Map<string, number> = new Map();

  startAction(name: string, context: LogContext = {}): string {
    const actionId = Math.random().toString(36).substring(7);
    this.currentActionId = actionId;
    this.startTimer(actionId);
    return actionId;
  }

  getActionId(): string | null {
    return this.currentActionId;
  }

  getTraceId(): string | null {
    return this.currentTraceId;
  }

  startTimer(key: string) {
    this.timers.set(key, Date.now());
  }

  getDuration(key: string, type: 'action' | 'request' = 'request'): number {
    const start = this.timers.get(key);
    if (!start) return 0;
    const duration = Date.now() - start;
    if (type === 'action') this.timers.delete(key);
    return duration;
  }

  clear() {
    this.currentActionId = null;
    this.timers.clear();
  }
}

export const traceManager = new TraceManager();
