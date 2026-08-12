import NetInfo from '@react-native-community/netinfo';
import { logger } from './logger/LoggerService';

class NetworkService {
  private online: boolean = true; // Assume true initially
  private listeners: Set<(online: boolean) => void> = new Set();
  private unsubscribeNetInfo: (() => void) | null = null;

  constructor() {
    this.startWatching();
  }

  private startWatching() {
    // Get initial state
    NetInfo.fetch().then(state => {
      const isConnected = state.isConnected !== null ? !!state.isConnected : true;
      this.updateStatus(isConnected);
    }).catch(err => {
      logger.error('[NetworkService] Failed to fetch initial NetInfo status:', { error: err.message });
    });

    // Subscribe to updates
    this.unsubscribeNetInfo = NetInfo.addEventListener(state => {
      const isConnected = state.isConnected !== null ? !!state.isConnected : true;
      this.updateStatus(isConnected);
    });
  }

  private updateStatus(newStatus: boolean) {
    if (this.online !== newStatus) {
      logger.info('NETWORK_STATUS_CHANGED', { old: this.online, new: newStatus });
      const wasOffline = !this.online;
      this.online = newStatus;

      // Notify all subscribers
      this.listeners.forEach(cb => {
        try {
          cb(newStatus);
        } catch (e: any) {
          logger.error('[NetworkService] Subscriber callback failed:', { error: e.message });
        }
      });

      // Trigger automatic queue processing when connection transitions from offline to online
      if (wasOffline && newStatus) {
        logger.info('[NetworkService] Connection restored. Triggering mutation queue sync.');
        try {
          const { mutationQueueService } = require('./MutationQueueService');
          mutationQueueService.processQueue();
        } catch (e: any) {
          logger.error('[NetworkService] Failed to lazy-trigger mutationQueueService.processQueue:', { error: e.message });
        }
      }
    }
  }

  isOnline(): boolean {
    return this.online;
  }

  subscribe(callback: (online: boolean) => void): () => void {
    this.listeners.add(callback);
    // Instantly notify subscriber of current state
    callback(this.online);

    return () => {
      this.listeners.delete(callback);
    };
  }

  destroy() {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
      this.unsubscribeNetInfo = null;
    }
    this.listeners.clear();
  }
}

export const networkService = new NetworkService();
