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
  orderingKey?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processingAt?: number;
  nextAttemptAt?: number;
  error?: string;
}

const STORAGE_KEY = 'mutation_queue';
export const MAX_RETRY_COUNT = 5;
export const BASE_BACKOFF_MS = 1000;
export const MAX_BACKOFF_MS = 30000;
export const PROCESSING_TIMEOUT_MS = 60000; // 1 minute stale lease timeout

export function getOrderingKey(mutation: QueuedMutation): string {
  if (mutation.orderingKey) return mutation.orderingKey;
  const { type, payload } = mutation;
  if (type === 'createOrder') {
    return 'order_' + (payload.tempId || 'new');
  }
  if (type === 'applyForOrder') {
    return 'order_' + (payload.id || 'new');
  }
  if (type === 'sendMessage') {
    return 'chat_' + (payload.chatId || 'msg');
  }
  if (type === 'updateProfile') {
    return 'profile';
  }
  return 'default';
}

export function calculateBackoff(retryCount: number, retryAfterHeader?: string): number {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }
  const backoff = BASE_BACKOFF_MS * Math.pow(2, retryCount);
  const jitter = Math.random() * 200; // 0..200ms jitter
  return Math.min(backoff + jitter, MAX_BACKOFF_MS);
}

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
        const now = Date.now();
        // Recover processing/stale mutations upon app restart
        this.queue = persisted.map(m => {
          if (m.status === 'processing') {
            const isStale = !m.processingAt || (now - m.processingAt > PROCESSING_TIMEOUT_MS);
            if (isStale) {
              if (m.retryCount >= MAX_RETRY_COUNT) {
                return { ...m, status: 'failed', error: 'Exceeded retry limit during app restart' };
              }
              return { ...m, status: 'pending', processingAt: undefined };
            }
          }
          return m;
        });
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

  add(type: QueuedMutation['type'], payload: any, idempotencyKey?: string, orderingKey?: string) {
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
        existing.createdAt = now;
        existing.status = 'pending';
        existing.retryCount = 0;
        existing.error = undefined;
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
      orderingKey,
      status: 'pending'
    };

    this.queue.push(newMutation);
    this.persistQueue();
    logger.info('[MutationQueueService] Mutation added to queue:', { id, type });

    const { networkService } = require('./NetworkService');
    if (networkService.isOnline()) {
      this.processQueue();
    }
  }

  manualRetry(mutationId: string) {
    const item = this.queue.find(m => m.id === mutationId);
    if (!item) {
      logger.warn('[MutationQueueService] Manual retry requested for unknown mutation:', { mutationId });
      return false;
    }

    item.status = 'pending';
    item.retryCount = 0;
    item.error = undefined;
    item.nextAttemptAt = undefined;
    item.processingAt = undefined;
    this.persistQueue();
    logger.info('[MutationQueueService] Manual retry initiated for mutation:', { mutationId });

    const { networkService } = require('./NetworkService');
    if (networkService.isOnline()) {
      this.processQueue();
    }
    return true;
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

    const now = Date.now();

    // Check for stale processing leases
    this.queue.forEach(m => {
      if (m.status === 'processing' && m.processingAt && (now - m.processingAt > PROCESSING_TIMEOUT_MS)) {
        logger.warn('[MutationQueueService] Lease expired for stale processing mutation. Resetting to pending:', { id: m.id });
        m.status = 'pending';
        m.processingAt = undefined;
      }
    });

    const activeMutations = this.queue.filter(
      m => (m.status === 'pending' || m.status === 'failed') &&
           (!m.nextAttemptAt || m.nextAttemptAt <= now) &&
           (m.retryCount < MAX_RETRY_COUNT)
    );

    if (activeMutations.length === 0) {
      logger.debug('[MutationQueueService] No pending mutations ready for processing.');
      return;
    }

    this.isProcessing = true;
    logger.info('[MutationQueueService] Starting processing of active mutations:', { count: activeMutations.length });

    // Sort FIFO
    activeMutations.sort((a, b) => a.createdAt - b.createdAt);

    const pausedKeys = new Set<string>();

    for (const mutation of activeMutations) {
      if (!networkService.isOnline()) {
        logger.warn('[MutationQueueService] Network disconnected during execution. Pausing queue.');
        break;
      }

      const key = getOrderingKey(mutation);
      if (pausedKeys.has(key)) {
        logger.info('[MutationQueueService] Skipping mutation due to active pause on orderingKey:', { id: mutation.id, type: mutation.type, orderingKey: key });
        continue;
      }

      logger.info('[MutationQueueService] Processing mutation:', { id: mutation.id, type: mutation.type, attempt: mutation.retryCount + 1, orderingKey: key });
      mutation.status = 'processing';
      mutation.processingAt = Date.now();
      this.persistQueue();

      try {
        await this.executeMutation(mutation);

        this.queue = this.queue.filter(m => m.id !== mutation.id);
        this.persistQueue();
        logger.info('[MutationQueueService] Mutation executed successfully and removed:', { id: mutation.id });

      } catch (error: any) {
        const status = error?.response?.status;
        const errorMessage = error?.message || 'Unknown network error';
        const retryAfterHeader = error?.response?.headers?.['retry-after'];
        logger.warn('[MutationQueueService] Mutation execution error details:', { id: mutation.id, status, error: errorMessage });

        const isPermanentError = status && (status >= 400 && status < 500 && status !== 429);

        if (isPermanentError) {
          mutation.status = 'failed';
          mutation.error = 'Permanent error (' + status + '): ' + errorMessage;
          mutation.processingAt = undefined;
          this.persistQueue();
          logger.error('[MutationQueueService] Permanent mutation failure. Moved to dead-letter state:', { id: mutation.id, error: mutation.error });
          continue;
        } else {
          mutation.retryCount++;
          mutation.processingAt = undefined;

          if (mutation.retryCount >= MAX_RETRY_COUNT) {
            mutation.status = 'failed';
            mutation.error = 'Exceeded retry limit of ' + MAX_RETRY_COUNT + '. Error: ' + errorMessage;
            this.persistQueue();
            logger.error('[MutationQueueService] Temporary mutation retry limit reached. Marking as failed:', { id: mutation.id });
            continue;
          } else {
            const delay = calculateBackoff(mutation.retryCount, retryAfterHeader);
            mutation.status = 'pending';
            mutation.nextAttemptAt = Date.now() + delay;
            pausedKeys.add(key);
            this.persistQueue();
            logger.warn('[MutationQueueService] Temporary outage on orderingKey. Pausing execution for this key:', { orderingKey: key, delayMs: delay });
            continue;
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
        const orderData = { ...payload.data, idempotencyKey: mutation.idempotencyKey || payload.data?.idempotencyKey };
        const res = await apiService.createOrder(orderData);
        if (res && res.data) {
          const newOrder = res.data;
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
        const key = mutation.idempotencyKey || payload.idempotencyKey;
        const res = await apiService.applyForOrder(payload.id, payload.price, key);
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
