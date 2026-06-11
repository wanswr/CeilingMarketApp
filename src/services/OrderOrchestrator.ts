import { Order } from '../types';
import { apiService } from './ApiService';
import { requestRouter } from './RequestRouter';

type OrderCallback = (orders: Order[]) => void;

/**
 * OrderOrchestrator: Logic Layer.
 * Delegates data fetching, deduplication and caching to RequestRouter.
 * Manages UI subscriptions and local smart merge.
 */
class OrderOrchestrator {
  private orderCache: Map<string, Order> = new Map();
  private subscribers: Set<OrderCallback> = new Set();
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
    this.subscribers.forEach(cb => cb(this.getOrdersArray()));
  }

  private getOrdersArray(): Order[] {
    return Array.from(this.orderCache.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * SYNC MAP: Single-Load Map strategy using RequestRouter.
   */
  async syncMap(force: boolean = false) {
    const key = 'map:orders';
    if (force) requestRouter.invalidate(key);

    try {
      const freshOrders = await requestRouter.request<Order[]>(
        key,
        async () => {
          const res = await apiService.getMapOrders();
          return res.data;
        },
        30000 // 30s TTL
      );

      let hasChanges = false;
      freshOrders.forEach(order => {
        const existing = this.orderCache.get(order.id);
        if (!existing || existing.updatedAt !== order.updatedAt) {
          this.orderCache.set(order.id, order);
          hasChanges = true;
        }
      });

      if (hasChanges) {
        this.notifySubscribers();
      }
    } catch (error) {
      console.error("[OrderOrchestrator] Map Sync failed", error);
    }
  }

  /**
   * SYNC USER: Global Profile singleton.
   */
  async syncUser(force: boolean = false) {
    const key = 'user:profile';
    if (force) requestRouter.invalidate(key);

    return requestRouter.request(
      key,
      async () => {
        const res = await apiService.getProfile();
        return res.data;
      },
      60000 // 60s TTL
    );
  }

  /**
   * SYNC ORDER: Detail fetching with individual caching.
   */
  async syncOrder(orderId: string, force: boolean = false) {
    const key = `order:${orderId}`;
    if (force) requestRouter.invalidate(key);

    try {
      const orderData = await requestRouter.request(
        key,
        async () => {
          const res = await apiService.getOrderDetails(orderId);
          return res.data;
        },
        30000 // 30s TTL
      );

      this.orderCache.set(orderId, orderData);
      this.notifySubscribers();
      return orderData;
    } catch (error) {
      console.error(`[OrderOrchestrator] Order ${orderId} sync failed`, error);
      throw error;
    }
  }

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
    requestRouter.clear();
    return this.syncMap(true);
  }
}

export const orderOrchestrator = new OrderOrchestrator();
