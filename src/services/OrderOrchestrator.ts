import { Order } from '../types';
import { apiService } from './ApiService';
import { requestRouter } from './RequestRouter';
import { entityStore } from './EntityStore';

type OrderCallback = (orders: Order[]) => void;

/**
 * OrderOrchestrator: Logic Layer.
 * Delegates data fetching, deduplication and caching to RequestRouter.
 * Persists data into EntityStore for Single Source of Truth.
 */
class OrderOrchestrator {
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
    return entityStore.getAllOrders()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * SYNC MAP: Single-Load Map strategy.
   * Results are written directly to EntityStore.
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

      // Write to Store (Smart Merge)
      let changed = false;
      freshOrders.forEach(order => {
        const existing = entityStore.getOrder(order.id);
        if (!existing || existing.updatedAt !== order.updatedAt) {
          entityStore.setOrder(order);
          changed = true;
        }
      });

      if (changed) {
        this.notifySubscribers();
      }
    } catch (error) {
      console.error("[OrderOrchestrator] Map Sync failed", error);
    }
  }

  /**
   * SYNC USER: Profile fetching with Store persistence.
   */
  async syncUser(force: boolean = false) {
    const key = 'user:profile';
    if (force) requestRouter.invalidate(key);

    const userData = await requestRouter.request(
      key,
      async () => {
        const res = await apiService.getProfile();
        return res.data;
      },
      60000 // 60s TTL
    );

    entityStore.setUser(userData);
    return userData;
  }

  /**
   * SYNC EXTERNAL USER: Cache-first lookup.
   */
  async getExternalUser(userId: string, force: boolean = false) {
    if (!force) {
      const cached = entityStore.getUser(userId);
      if (cached) return cached;
    }

    const key = `user:${userId}`;
    const userData = await requestRouter.request(
      key,
      async () => {
        const res = await apiService.getUserProfile(userId);
        return res.data;
      },
      60000
    );

    entityStore.setUser(userData);
    return userData;
  }

  /**
   * SYNC ORDER: Detail fetching with Store persistence.
   */
  async syncOrder(orderId: string, force: boolean = false) {
    if (!force) {
      const cached = entityStore.getOrder(orderId);
      // If we have full details (e.g. applications/worker present in cache), reuse it
      if (cached && (cached as any).applications) return cached;
    }

    const key = `order:${orderId}`;
    if (force) requestRouter.invalidate(key);

    try {
      const orderData = await requestRouter.request(
        key,
        async () => {
          const res = await apiService.getOrderDetails(orderId);
          return res.data;
        },
        30000
      );

      entityStore.setOrder(orderData);
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
    entityStore.clear();
    requestRouter.clear();
    return this.syncMap(true);
  }
}

export const orderOrchestrator = new OrderOrchestrator();
