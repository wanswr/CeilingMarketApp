import { Order } from '../types';
import { apiService } from './ApiService';

type OrderCallback = (orders: Order[]) => void;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * OrderOrchestrator: Data Engine Version 2.0.
 * Focus: Stability, Deduplication, Cache, and Request Locking.
 */
class OrderOrchestrator {
  private orderCache: Map<string, Order> = new Map();
  private subscribers: Set<OrderCallback> = new Set();

  // Cache Layer
  private mapCache: CacheEntry<Order[]> | null = null;
  private userCache: CacheEntry<any> | null = null;
  private readonly MAP_TTL = 30000; // 30 seconds
  private readonly USER_TTL = 60000; // 60 seconds

  // Request Locking & Deduplication
  private inFlightRequests: Map<string, Promise<any>> = new Map();
  private isMapSyncing: boolean = false;
  private debounceTimer: NodeJS.Timeout | null = null;

  /**
   * Subscribe to the Data Engine.
   */
  subscribe(callback: OrderCallback) {
    this.subscribers.add(callback);
    callback(this.getOrdersArray());
    return () => { this.subscribers.delete(callback); };
  }

  private notifySubscribers() {
    const ordersArray = this.getOrdersArray();
    this.subscribers.forEach(cb => cb(ordersArray));
  }

  private getOrdersArray(): Order[] {
    return Array.from(this.orderCache.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * SYNC MAP: Single-Load Map strategy with Cache and In-Flight Lock.
   */
  async syncMap(force: boolean = false) {
    const now = Date.now();
    const lockKey = 'syncMap';

    // 1. In-flight Deduplication
    if (this.inFlightRequests.has(lockKey)) {
      return this.inFlightRequests.get(lockKey);
    }

    // 2. Cache Validation
    if (!force && this.mapCache && (now - this.mapCache.timestamp) < this.MAP_TTL) {
      console.log('[OrderOrchestrator] Map Cache Hit. Skipping API.');
      return;
    }

    // 3. Request Lock
    if (this.isMapSyncing) return;
    this.isMapSyncing = true;

    console.log('[OrderOrchestrator] >>> SYNC MAP STARTING...');
    const syncPromise = (async () => {
      try {
        const response = await apiService.getMapOrders();
        const freshOrders: Order[] = response.data;

        let hasChanges = false;
        freshOrders.forEach(order => {
          const existing = this.orderCache.get(order.id);
          if (!existing || existing.updatedAt !== order.updatedAt) {
            this.orderCache.set(order.id, order);
            hasChanges = true;
          }
        });

        this.mapCache = { data: freshOrders, timestamp: Date.now() };

        if (hasChanges) {
          console.log(`[OrderOrchestrator] Map updated. Total items: ${this.orderCache.size}`);
          this.notifySubscribers();
        }
      } catch (error) {
        console.error("[OrderOrchestrator] Map Sync failed:", error);
      } finally {
        this.isMapSyncing = false;
        this.inFlightRequests.delete(lockKey);
        console.log('[OrderOrchestrator] >>> SYNC MAP FINISHED.');
      }
    })();

    this.inFlightRequests.set(lockKey, syncPromise);
    return syncPromise;
  }

  /**
   * SYNC USER: Profile fetching with Cache and Lock.
   */
  async syncUser(force: boolean = false) {
    const now = Date.now();
    const lockKey = 'syncUser';

    if (this.inFlightRequests.has(lockKey)) return this.inFlightRequests.get(lockKey);

    if (!force && this.userCache && (now - this.userCache.timestamp) < this.USER_TTL) {
      return this.userCache.data;
    }

    const syncPromise = (async () => {
      try {
        const response = await apiService.getProfile();
        this.userCache = { data: response.data, timestamp: Date.now() };
        return response.data;
      } catch (error) {
        console.error("[OrderOrchestrator] User Sync failed:", error);
        throw error;
      } finally {
        this.inFlightRequests.delete(lockKey);
      }
    })();

    this.inFlightRequests.set(lockKey, syncPromise);
    return syncPromise;
  }

  /**
   * SYNC ORDER: Detail fetching with Lock.
   */
  async syncOrder(orderId: string) {
    const lockKey = `syncOrder_${orderId}`;
    if (this.inFlightRequests.has(lockKey)) return this.inFlightRequests.get(lockKey);

    const syncPromise = (async () => {
      try {
        const data = await apiService.getOrderDetails(orderId);
        // Update cache with latest details
        this.orderCache.set(orderId, data.data);
        this.notifySubscribers();
        return data.data;
      } catch (error) {
        console.error(`[OrderOrchestrator] Order ${orderId} Sync failed:`, error);
        throw error;
      } finally {
        this.inFlightRequests.delete(lockKey);
      }
    })();

    this.inFlightRequests.set(lockKey, syncPromise);
    return syncPromise;
  }

  /**
   * DEBOUNCED VIEWPORT TRIGGER: To prevent spam during fast panning.
   */
  triggerMapUpdate() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.syncMap();
    }, 500);
  }

  getOrders() {
    return this.getOrdersArray();
  }

  async forceRefresh() {
    this.orderCache.clear();
    this.mapCache = null;
    return this.syncMap(true);
  }

  getLoadingState() {
    return this.isMapSyncing;
  }
}

export const orderOrchestrator = new OrderOrchestrator();
