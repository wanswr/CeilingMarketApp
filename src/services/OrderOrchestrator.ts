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
  subscribe = (callback: OrderCallback) => {
    this.subscribers.add(callback);
    callback(this.getOrdersArray());
    return () => { this.subscribers.delete(callback); };
  }

  private notifySubscribers = () => {
    const orders = this.getOrdersArray();
    this.subscribers.forEach(cb => cb(orders));
  }

  triggerNotify = () => {
    this.notifySubscribers();
  }

  private getOrdersArray = (): Order[] => {
    return entityStore.getAllOrders()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * SYNC MAP V4: Spatial Bounding Box Synchronization.
   * Optimizes map performance by fetching a large viewport area at once.
   */
  private spatialFailureCount = 0;

  syncMap = async (force: boolean = false, region?: { latitude: number, longitude: number, latitudeDelta: number, longitudeDelta: number }) => {
    if (!region) {
      // Background sync for global updates
      await this.syncDelta(force);
      return;
    }

    // CIRCUIT BREAKER: If spatial API failed too many times, use syncDelta as fallback
    if (this.spatialFailureCount > 3 && !force) {
        if (__DEV__) console.warn('[OrderOrchestrator] Spatial Circuit Breaker Active - Falling back to Delta');
        await this.syncDelta(force);
        return;
    }

    // 1. Calculate BBOX from region
    // We expand the bbox slightly (buffer) to avoid frequent re-fetches on small pans
    const latBuffer = region.latitudeDelta * 0.5;
    const lngBuffer = region.longitudeDelta * 0.5;

    const bounds = {
      minLat: region.latitude - region.latitudeDelta - latBuffer,
      maxLat: region.latitude + region.latitudeDelta + latBuffer,
      minLng: region.longitude - region.longitudeDelta - lngBuffer,
      maxLng: region.longitude + region.longitudeDelta + lngBuffer
    };

    // 2. Normalize key for RequestRouter to increase BBOX hits
    // Round to ~1km precision to avoid jitter-induced cache misses
    const precision = 2;
    const normBounds = {
      minLat: Number(bounds.minLat.toFixed(precision)),
      maxLat: Number(bounds.maxLat.toFixed(precision)),
      minLng: Number(bounds.minLng.toFixed(precision)),
      maxLng: Number(bounds.maxLng.toFixed(precision)),
    };

    // SAFETY CHECK: Prevent NaN and ensure API exists
    if (isNaN(normBounds.minLat) || isNaN(normBounds.minLng)) {
        console.warn('[OrderOrchestrator] Invalid spatial bounds detected');
        return;
    }

    const spatialKey = `bbox:${normBounds.minLat}:${normBounds.maxLat}:${normBounds.minLng}:${normBounds.maxLng}`;

    if (force) requestRouter.invalidate(spatialKey);

    try {
      const lastSyncTime = entityStore.getMeta('map_last_sync') || '0';

      const response = await requestRouter.request<{ created: Order[], updated: Order[], deleted: string[] }>(
        spatialKey,
        async () => {
          // ADAPTER LAYER: Intelligent fallback to legacy map fetch
          try {
            const res = await apiService.getMapOrdersInBounds(normBounds, force ? '0' : lastSyncTime);
            this.spatialFailureCount = 0; // Success: reset failure count
            return res.data;
          } catch (e) {
            this.spatialFailureCount++;
            console.warn('[OrderOrchestrator] Spatial API failed, falling back to legacy:', (e as any).message);
            const legacyRes = await apiService.getMapOrders({ updatedAfter: lastSyncTime });
            return legacyRes.data;
          }
        },
        60000 // 60s TTL for specific viewport
      );

      if (response && response.created && response.created.length > 0) {
        response.created.forEach(o => entityStore.setOrder(o));
        this.notifySubscribers();
      }

      entityStore.setMeta('map_last_sync', Date.now().toString());
      entityStore.logDiagnostics();
    } catch (error) {
      console.error(`[OrderOrchestrator] Spatial sync failed for ${spatialKey}`, error);
    }
  }

  /**
   * SYNC DELTA: Fallback background synchronization.
   */
  private syncDelta = async (force: boolean) => {
    const key = 'map:delta';
    if (force) requestRouter.invalidate(key);

    const lastSyncTime = entityStore.getMeta('map_last_sync') || '0';
    try {
        const response = await requestRouter.request<{ created: Order[] }>(
            key,
            async () => {
                const res = await apiService.getMapOrders({ updatedAfter: lastSyncTime });
                return res.data;
            },
            30000
        );

        if (response.created && response.created.length > 0) {
            response.created.forEach(o => entityStore.setOrder(o));
            this.notifySubscribers();
        }
        entityStore.setMeta('map_last_sync', Date.now().toString());
    } catch (e) {}
  }

  /**
   * SYNC USER: Profile fetching with Store persistence.
   */
  syncUser = async (force: boolean = false) => {
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
  getExternalUser = async (userId: string, force: boolean = false) => {
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
  syncOrder = async (orderId: string, force: boolean = false) => {
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
  triggerMapUpdate = (region?: { latitude: number, longitude: number, latitudeDelta: number, longitudeDelta: number }) => {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.syncMap(false, region);
    }, 1200); // 1.2s debounce for stability
  }

  getOrders = () => {
    return this.getOrdersArray();
  }

  // Task #3: Selectors
  getOrder = (id: string) => {
    return entityStore.getOrder(id);
  }

  getUser = (id: string) => {
    return entityStore.getUser(id);
  }

  getCurrentUser = () => {
    return entityStore.getCurrentUser();
  }

  /**
   * Full cache clear and re-fetch.
   */
  forceRefresh = async () => {
    entityStore.clear();
    requestRouter.clear();
    return this.syncMap(true);
  }

  // Task #4: Move API calls to Orchestrator

  updateProfile = async (profileData: any) => {
    const res = await apiService.updateProfile(profileData);
    entityStore.setUser({ ...res.data, isMe: true });
    requestRouter.invalidate('user:profile');
    return res.data;
  }

  createOrder = async (orderData: any) => {
    const res = await apiService.createOrder(orderData);
    entityStore.setOrder(res.data);
    requestRouter.invalidate('map:orders');
    this.notifySubscribers();
    return res.data;
  }

  updateOrder = async (orderId: string, orderData: any) => {
    const res = await apiService.updateOrder(orderId, orderData);
    entityStore.setOrder(res.data);
    requestRouter.invalidate(`order:${orderId}`);
    requestRouter.invalidate('map:orders');
    this.notifySubscribers();
    return res.data;
  }

  applyForOrder = async (orderId: string) => {
    const res = await apiService.applyForOrder(orderId);
    // Refresh order details to show updated candidates/status
    await this.syncOrder(orderId, true);
    return res.data;
  }

  activateSubscription = async (days: number) => {
    const res = await apiService.activateSubscription(days);
    await this.syncUser(true);
    return res.data;
  }

  // Auth Operations (Task #4)
  login = async (phone: string) => {
    const res = await apiService.login(phone);
    if (res.data.user) {
      entityStore.setUser({ ...res.data.user, isMe: true });
    }
    return res.data;
  }

  parseOrderText = async (text: string) => {
    const res = await apiService.parseOrderText(text);
    return res.data;
  }
}

export const orderOrchestrator = new OrderOrchestrator();
