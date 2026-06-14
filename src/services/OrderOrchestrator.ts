import { Order } from '../types';
import { apiService } from './ApiService';
import { requestRouter } from './RequestRouter';
import { entityStore } from './EntityStore';

type OrderCallback = (orders: Order[]) => void;

/**
 * OrderOrchestrator V2.1: Logic & Sync Layer.
 * Delegates data fetching to RequestRouter.
 * Persists data into EntityStore (Single Source of Truth).
 * Notifies UI subscribers of store changes.
 */
class OrderOrchestrator {
  private subscribers: Set<OrderCallback> = new Set();
  private debounceTimer: NodeJS.Timeout | null = null;

  /**
   * Subscribe to global order updates.
   */
  subscribe(callback: OrderCallback) {
    this.subscribers.add(callback);
    callback(this.getOrdersArray());
    return () => { this.subscribers.delete(callback); };
  }

  private notifySubscribers() {
    const orders = this.getOrdersArray();
    this.subscribers.forEach(cb => cb(orders));
  }

  private getOrdersArray(): Order[] {
    return entityStore.getAllOrders()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * SYNC MAP V3: Real Tile-based synchronization.
   * Fetches only missing tiles and caches them individually.
   */
  async syncMap(force: boolean = false, region?: { latitude: number, longitude: number, latitudeDelta: number }) {
    const { GeoGridService } = require('./GeoGridService');
    const zoom = 12; // Standard zoom for tile synchronization

    // Fallback if no region provided
    if (!region) {
      await this.syncTile('tile:default', 0, 0, 0, force);
      return;
    }

    // Calculate tiles for the visible viewport (Simplified: central tile + neighbors)
    const centerTileKey = GeoGridService.getTileKey(region.latitude, region.longitude, zoom);

    // Stage 3: RequestRouter individual tile caching
    const tilesToFetch = [centerTileKey]; // For now, just the center tile

    for (const tileKey of tilesToFetch) {
       const parts = tileKey.split(':');
       const z = parseInt(parts[1]);
       const x = parseInt(parts[2]);
       const y = parseInt(parts[3]);
       await this.syncTile(tileKey, z, x, y, force);
    }
  }

  private async syncTile(tileKey: string, z: number, x: number, y: number, force: boolean) {
    // Stage 3: Cache Hit Check
    if (!force && entityStore.isTileLoaded(tileKey)) {
        (entityStore.meta as any).tileCacheHits++;
        return;
    }
    (entityStore.meta as any).tileCacheMisses++;

    if (force) requestRouter.invalidate(tileKey);

    try {
      const lastSyncTime = entityStore.getMeta(`timestamp:${tileKey}`) || '0';

      const response = await requestRouter.request<{ created: Order[], updated: Order[], deleted: string[] }>(
        tileKey,
        async () => {
          const res = await apiService.getMapOrders({
            updatedAfter: lastSyncTime,
            zoom: z,
            tileX: x,
            tileY: y
          });
          return res.data;
        },
        600000 // 10 min TTL for tile data
      );

      let changed = false;
      if (response.created) {
        response.created.forEach(o => {
            entityStore.setOrder(o);
            entityStore.addOrderToTile(tileKey, o.id);
        });
        if (response.created.length > 0) changed = true;
      }

      if (changed || force) {
        this.notifySubscribers();
      }

      entityStore.markTileLoaded(tileKey);
      entityStore.setMeta(`timestamp:${tileKey}`, Date.now().toString());
      entityStore.logDiagnostics();
    } catch (error) {
      console.error(`[OrderOrchestrator] Sync failed for ${tileKey}`, error);
    }
  }

  /**
   * SYNC USER: Profile fetching with Store persistence.
   */
  async syncUser(force: boolean = false) {
    const key = 'user:profile';

    if (!force) {
      const lastUpdate = entityStore.getMeta('user_last_sync');
      if (lastUpdate && (Date.now() - Number(lastUpdate)) < 60000) {
        return entityStore.getCurrentUser();
      }
    }

    if (force) requestRouter.invalidate(key);

    const userData = await requestRouter.request(
      key,
      async () => {
        const res = await apiService.getProfile();
        return res.data;
      },
      60000 // 60s TTL
    );

    // Mark as current user for the selector
    entityStore.setUser({ ...userData, isMe: true });
    entityStore.setMeta('user_last_sync', Date.now().toString());
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

  /**
   * Trigger debounced map update (e.g. on region change).
   * Task #2: Debounce viewport changes
   */
  triggerMapUpdate(region?: { latitude: number, longitude: number, latitudeDelta: number }) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.syncMap(false, region);
    }, 1200); // 1.2s debounce for stability
  }

  getOrders() {
    return this.getOrdersArray();
  }

  // Task #3: Selectors
  getOrder(id: string) {
    return entityStore.getOrder(id);
  }

  getUser(id: string) {
    return entityStore.getUser(id);
  }

  getCurrentUser() {
    return entityStore.getCurrentUser();
  }

  /**
   * Full cache clear and re-fetch.
   */
  async forceRefresh() {
    entityStore.clear();
    requestRouter.clear();
    return this.syncMap(true);
  }

  // Task #4: Move API calls to Orchestrator

  async updateProfile(profileData: any) {
    const res = await apiService.updateProfile(profileData);
    entityStore.setUser({ ...res.data, isMe: true });
    requestRouter.invalidate('user:profile');
    return res.data;
  }

  async createOrder(orderData: any) {
    const res = await apiService.createOrder(orderData);
    entityStore.setOrder(res.data);
    requestRouter.invalidate('map:orders');
    this.notifySubscribers();
    return res.data;
  }

  async updateOrder(orderId: string, orderData: any) {
    const res = await apiService.updateOrder(orderId, orderData);
    entityStore.setOrder(res.data);
    requestRouter.invalidate(`order:${orderId}`);
    requestRouter.invalidate('map:orders');
    this.notifySubscribers();
    return res.data;
  }

  async applyForOrder(orderId: string) {
    const res = await apiService.applyForOrder(orderId);
    // Refresh order details to show updated candidates/status
    await this.syncOrder(orderId, true);
    return res.data;
  }

  async activateSubscription(days: number) {
    const res = await apiService.activateSubscription(days);
    await this.syncUser(true);
    return res.data;
  }

  // Auth Operations (Task #4)
  async login(phone: string) {
    const res = await apiService.login(phone);
    if (res.data.user) {
      entityStore.setUser({ ...res.data.user, isMe: true });
    }
    return res.data;
  }
}

export const orderOrchestrator = new OrderOrchestrator();
