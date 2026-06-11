import { Order } from '../types';
import { apiService } from './ApiService';

type OrderCallback = (orders: Order[]) => void;

/**
 * OrderOrchestrator: Data Engine Version.
 * Manages a persistent memory cache, handles smart merging, and deduplication.
 */
class OrderOrchestrator {
  private orderCache: Map<string, Order> = new Map();
  private subscribers: Set<OrderCallback> = new Set();
  private isLoading: boolean = false;
  private inFlightRequest: Promise<void> | null = null;

  /**
   * Subscribe to the Data Engine.
   */
  subscribe(callback: OrderCallback) {
    this.subscribers.add(callback);
    callback(Array.from(this.orderCache.values()));
    return () => { this.subscribers.delete(callback); };
  }

  private notifySubscribers() {
    const ordersArray = Array.from(this.orderCache.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    this.subscribers.forEach(cb => cb(ordersArray));
  }

  /**
   * SMART MERGE: Fetch and integrate new data without flushing the cache.
   */
  async loadMapData(force: boolean = false) {
    if (this.isLoading && !force) return this.inFlightRequest;

    console.log('[OrderOrchestrator] Data Engine Syncing...');
    this.isLoading = true;

    this.inFlightRequest = (async () => {
      try {
        const response = await apiService.getMapOrders();
        const freshOrders: Order[] = response.data;

        // Smart Merge Logic
        let hasChanges = false;
        freshOrders.forEach(order => {
          const existing = this.orderCache.get(order.id);
          // Only update if data has actually changed (simple timestamp check)
          if (!existing || existing.updatedAt !== order.updatedAt) {
            this.orderCache.set(order.id, order);
            hasChanges = true;
          }
        });

        if (hasChanges) {
          console.log(`[OrderOrchestrator] Cache updated. Total: ${this.orderCache.size}`);
          this.notifySubscribers();
        }
      } catch (error) {
        console.error("[OrderOrchestrator] Sync failed:", error);
      } finally {
        this.isLoading = false;
        this.inFlightRequest = null;
      }
    })();

    return this.inFlightRequest;
  }

  /**
   * Manual refresh - flushes and reloads.
   */
  async forceRefresh() {
    this.orderCache.clear();
    return this.loadMapData(true);
  }

  /**
   * Spatial Indexing placeholder - currently returns all for Single Load strategy
   */
  getOrders() {
    return Array.from(this.orderCache.values());
  }

  getLoadingState() {
    return this.isLoading;
  }
}

export const orderOrchestrator = new OrderOrchestrator();
