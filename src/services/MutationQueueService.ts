import { storageService } from './StorageService';
import { logger } from './logger/LoggerService';
import { apiService } from './ApiService';
import { entityStore } from './EntityStore';
import { mapEngine } from './MapEngine';

export interface QueuedMutation {
  id: string;
  type: 'createOrder' | 'applyForOrder' | 'updateProfile' | 'sendMessage';
  payload: any;
  createdAt: number;
  retryCount: number;
  idempotencyKey?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

const STORAGE_KEY = 'mutation_queue';
const MAX_RETRY_COUNT = 3;

class MutationQueueService {
  private queue: QueuedMutation[] = [];
  private isProcessing: boolean = false;

  constructor() {
    this.loadQueue();
  }

  private loadQueue() {
    try {
      const persisted = storageService.get<QueuedMutation[]>(STORAGE_KEY);
      if (persisted && Array.isArray(persisted)) {
        this.queue = persisted;
        logger.info('[MutationQueueService] Loaded persisted queue:', { count: this.queue.length });
      } else {
        this.queue = [];
      }
    } catch (e: any) {
      logger.error('[MutationQueueService] Failed to load queue:', { error: e.message });
      this.queue = [];
    }
  }

  private persistQueue() {
    try {
      storageService.set(STORAGE_KEY, this.queue);
    } catch (e: any) {
      logger.error('[MutationQueueService] Failed to persist queue:', { error: e.message });
    }
  }

  getQueue(): QueuedMutation[] {
    return [...this.queue];
  }

  clearQueue() {
    this.queue = [];
    this.persistQueue();
    logger.info('[MutationQueueService] Queue cleared.');
  }

  add(type: QueuedMutation['type'], payload: any, idempotencyKey?: string) {
    const now = Date.now();

    // 1. Handle updateProfile merging to prevent endless duplicates of identical field edits
    if (type === 'updateProfile') {
      const existingIdx = this.queue.findIndex(
        m => m.type === 'updateProfile' && (m.status === 'pending' || m.status === 'failed')
      );
      if (existingIdx !== -1) {
        const existing = this.queue[existingIdx];
        existing.payload = {
          ...existing.payload,
          ...payload
        };
        existing.createdAt = now; // update priority timestamp
        existing.status = 'pending'; // Reset status if it was failed
        existing.retryCount = 0; // Reset retries
        this.persistQueue();
        logger.info('[MutationQueueService] Merged updateProfile mutation payload:', { payload: existing.payload });
        return;
      }
    }

    // 2. Standard FIFO append
    const id = 'mut_' + Math.random().toString(36).substring(2, 11) + '_' + now;
    const newMutation: QueuedMutation = {
      id,
      type,
      payload,
      createdAt: now,
      retryCount: 0,
      idempotencyKey,
      status: 'pending'
    };

    this.queue.push(newMutation);
    this.persistQueue();
    logger.info('[MutationQueueService] Mutation added to queue:', { id, type });

    // Try processing if we are online
    const { networkService } = require('./NetworkService');
    if (networkService.isOnline()) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.isProcessing) {
      logger.info('[MutationQueueService] Queue processing is already in progress, skipping duplicate invocation.');
      return;
    }

    const { networkService } = require('./NetworkService');
    if (!networkService.isOnline()) {
      logger.info('[MutationQueueService] Network is offline, skipping queue processing.');
      return;
    }

    const activeMutations = this.queue.filter(m => m.status === 'pending' || m.status === 'failed');
    if (activeMutations.length === 0) {
      logger.debug('[MutationQueueService] No pending mutations to process.');
      return;
    }

    this.isProcessing = true;
    logger.info('[MutationQueueService] Starting sequential processing of active mutations:', { count: activeMutations.length });

    // Always sort by creation time to guarantee strict order (FIFO)
    activeMutations.sort((a, b) => a.createdAt - b.createdAt);

    for (const mutation of activeMutations) {
      // Re-verify network status before executing each item
      if (!networkService.isOnline()) {
        logger.warn('[MutationQueueService] Network disconnected during execution. Pausing queue.');
        break;
      }

      logger.info('[MutationQueueService] Processing mutation:', { id: mutation.id, type: mutation.type, attempt: mutation.retryCount + 1 });
      mutation.status = 'processing';
      this.persistQueue();

      try {
        await this.executeMutation(mutation);

        // Success! Remove from active queue
        this.queue = this.queue.filter(m => m.id !== mutation.id);
        this.persistQueue();
        logger.info('[MutationQueueService] Mutation executed successfully and removed:', { id: mutation.id });

      } catch (error: any) {
        const status = error?.response?.status;
        const errorMessage = error?.message || 'Unknown network error';
        logger.warn('[MutationQueueService] Mutation execution error details:', { id: mutation.id, status, error: errorMessage });

        const isPermanentError = status && (status >= 400 && status < 500 && status !== 429);

        if (isPermanentError) {
          // Permanent failure: invalid data, validation error, auth error, etc.
          // Save error details, mark as failed, and move on.
          mutation.status = 'failed';
          mutation.error = 'Permanent error (' + status + '): ' + errorMessage;
          this.persistQueue();
          logger.error('[MutationQueueService] Permanent mutation failure. Extracted from active flow:', { id: mutation.id, error: mutation.error });
          continue; // Proceed with subsequent mutations
        } else {
          // Temporary network failure: server 5xx, request timeout, 429 throttling
          mutation.retryCount++;
          if (mutation.retryCount >= MAX_RETRY_COUNT) {
            mutation.status = 'failed';
            mutation.error = 'Exceeded retry limit of ' + MAX_RETRY_COUNT + '. Error: ' + errorMessage;
            this.persistQueue();
            logger.error('[MutationQueueService] Temporary mutation retry limit reached. Marking as failed:', { id: mutation.id });
            continue; // Move to next item
          } else {
            // Under limit: leave status as failed (or revert to pending) but STOP entire queue to avoid execution order violations.
            mutation.status = 'pending';
            this.persistQueue();
            logger.warn('[MutationQueueService] Temporary network outage. Pausing queue processing to preserve order.');
            break; // Pause the processing loop entirely
          }
        }
      }
    }

    this.isProcessing = false;
    logger.info('[MutationQueueService] Finished processing queue cycle.');
  }

  private async executeMutation(mutation: QueuedMutation): Promise<any> {
    const { type, payload } = mutation;

    switch (type) {
      case 'createOrder': {
        const res = await apiService.createOrder(payload.data);
        if (res && res.data) {
          const newOrder = res.data;
          // Synchronize local EntityStore
          if (payload.tempId) {
            entityStore.removeOrder(payload.tempId, 'offline_sync_upgrade');
          }
          entityStore.setOrder(newOrder, 'offline_sync');
          entityStore.persist();
          mapEngine.triggerNotify();
        }
        return res;
      }

      case 'applyForOrder': {
        const res = await apiService.applyForOrder(payload.id, payload.price, payload.idempotencyKey);
        if (res && res.data && res.data.order) {
          entityStore.setOrder(res.data.order, 'offline_sync');
          entityStore.persist();
          mapEngine.triggerNotify();
        }
        return res;
      }

      case 'updateProfile': {
        const res = await apiService.updateProfile(payload.data);
        if (res && res.data) {
          entityStore.setUser({ ...res.data, isMe: true });
          entityStore.persist();
          mapEngine.triggerNotify();
        }
        return res;
      }

      case 'sendMessage': {
        const res = await apiService.sendMessage(payload.chatId, payload.text);
        return res;
      }

      default:
        throw new Error('Unsupported mutation type: ' + type);
    }
  }
}

export const mutationQueueService = new MutationQueueService();
