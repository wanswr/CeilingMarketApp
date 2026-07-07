import { LogContext } from './LogContext';

class TraceManager {
  private currentActionId: string | null = null;
  private currentTraceId: string | null = null;
  private startTimes: Map<string, number> = new Map();

  generateId() {
    return Math.random().toString(36).substring(2, 9);
  }

  startAction(name: string, context?: LogContext): string {
    const actionId = this.generateId();
    this.currentActionId = actionId;
    this.startTimes.set(`action_${actionId}`, Date.now());
    return actionId;
  }

  getActionId() {
    return this.currentActionId;
  }

  startTrace(name: string): string {
    const traceId = this.generateId();
    this.currentTraceId = traceId;
    this.startTimes.set(`trace_${traceId}`, Date.now());
    return traceId;
  }

  getTraceId() {
    return this.currentTraceId;
  }

  getDuration(id: string, type: 'action' | 'trace' | 'request'): number {
    const startTime = this.startTimes.get(`${type}_${id}`);
    return startTime ? Date.now() - startTime : 0;
  }

  startTimer(id: string) {
    this.startTimes.set(`request_${id}`, Date.now());
  }

  clear() {
    this.currentActionId = null;
    this.currentTraceId = null;
  }
}

export const traceManager = new TraceManager();
