import { Order } from '../types';
import { apiService } from './ApiService';
import { requestRouter } from './RequestRouter';
import { entityStore } from './EntityStore';
import { GeoClusterService } from './GeoClusterService';
import { spatialManager } from '../map/SpatialManager';

type OrderCallback = (orders: Order[]) => void;

/**
 * MapEngine V4: Logic & Sync Layer.
 * Delegates data fetching to RequestRouter.
 * Persists data into EntityStore (Single Source of Truth).
 * Notifies UI subscribers of store changes.
 */
interface BBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

class MapEngine {
  private subscribers: Set<OrderCallback> = new Set();
  private debounceTimer: NodeJS.Timeout | null = null;
  private loadedBounds: BBox[] = [];
  private syncLock: boolean = false;
  private currentAbortController: AbortController | null = null;
  public spatialManager = spatialManager;

  constructor(
      public apiService: any,
      public entityStore: any,
      public requestRouter: any,
      public geoClusterService: any
  ) {
      if (__DEV__) {
          console.log('[MapEngine] EntityStore injected:', !!this.entityStore);
          console.log('[MapEngine] GeoClusterService injected:', !!this.geoClusterService);
      }
  }

  /**
   * Subscribe to global order updates.
   */
  subscribe = (callback: OrderCallback) => {
    this.subscribers.add(callback);
    // V6 Hardening: Ensure initial state is pushed correctly
    const currentOrders = this.getOrdersArray();
    callback(currentOrders);
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
    if (!this.entityStore) {
        if (__DEV__) console.warn('[MapEngine] Accessing entityStore before injection');
        return [];
    }
    return this.entityStore.getAllOrders()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * SYNC MAP V6: Universal Spatial Synchronization.
   * Uses geocell chunking (SpatialManager) and universal /spatial endpoint.
   * Hardened with AbortController and request locking.
   */
  syncMap = async (force: boolean = false, viewRegion?: { latitude: number, longitude: number, latitudeDelta: number, longitudeDelta: number }) => {
    if (!this.entityStore || !viewRegion) return;

    if (this.syncLock) {
        if (__DEV__) console.log('[MapEngine] Sync already in progress - skipping');
        return;
    }

    // 0. Area Limit: Don't load spatial data if zoomed out too far (country level)
    if (viewRegion.latitudeDelta > 10) {
        if (__DEV__) console.log('[MapEngine] Viewport too large - skipping spatial sync');
        return;
    }

    // 1. Calculate Aligned Spatial Bounds (3-decimal normalized geocells)
    const rawBounds = {
      minLat: viewRegion.latitude - viewRegion.latitudeDelta,
      maxLat: viewRegion.latitude + viewRegion.latitudeDelta,
      minLng: viewRegion.longitude - viewRegion.longitudeDelta,
      maxLng: viewRegion.longitude + viewRegion.longitudeDelta
    };

    const aligned = this.spatialManager.getAlignedBounds(rawBounds.minLat, rawBounds.maxLat, rawBounds.minLng, rawBounds.maxLng);

    // 2. CHECK SPATIAL CACHE
    if (!force && this.spatialManager.isAreaLoaded(aligned.minLat, aligned.maxLat, aligned.minLng, aligned.maxLng)) {
        if (__DEV__) console.log('[MapEngine] SPATIAL CACHE HIT - Skipping network');
        this.requestRouter.metrics.spatialCacheHits++;
        return;
    }

    this.requestRouter.metrics.spatialCacheMisses++;

    // 3. UNIVERSAL SPATIAL FETCH (V6)
    const spatialKey = `spatial:${aligned.minLat}:${aligned.maxLat}:${aligned.minLng}:${aligned.maxLng}`;
    if (force) this.requestRouter.invalidate(spatialKey);

    // ABORT PREVIOUS: Cancel any existing fetch
    if (this.currentAbortController) this.currentAbortController.abort();
    this.currentAbortController = new AbortController();
    this.syncLock = true;

    try {
      this.requestRouter.metrics.spatialRequests++;
      const lastSyncTime = this.entityStore.getMeta('map_last_sync') || '0';

      const response = await this.requestRouter.request<{ created: Order[], updated: Order[], deleted: string[] }>(
        spatialKey,
        async () => {
          const res = await this.apiService.getSpatialOrders({
              minLat: aligned.minLat,
              maxLat: aligned.maxLat,
              minLng: aligned.minLng,
              maxLng: aligned.maxLng,
              updatedAfter: force ? '0' : lastSyncTime
          }, { signal: this.currentAbortController?.signal });
          return res.data;
        },
        300000
      );

      if (response) {
        this.entityStore.applyPatch(response);
        this.spatialManager.markAreaLoaded(aligned.minLat, aligned.maxLat, aligned.minLng, aligned.maxLng);
        this.requestRouter.metrics.spatialChunksLoaded = this.spatialManager.getLoadedChunksCount();
        this.notifySubscribers();
      }

      this.entityStore.meta.spatialSyncs++;
      this.entityStore.setMeta('map_last_sync', Date.now().toString());
      this.logMemoryUsage();
      this.entityStore.logDiagnostics();
    } catch (error: any) {
        if (error.name === 'AbortError' || error.message === 'canceled') {
            if (__DEV__) console.log('[MapEngine] Sync aborted');
        } else {
            console.error(`[MapEngine CRASH] Spatial sync failed:`, error.message);
            if (__DEV__) console.log(error.stack);
        }
    } finally {
        this.syncLock = false;
        this.currentAbortController = null;
    }
  }

  /**
   * Initial Load V6: Load 100km radius around user.
   */
  initialLoad = async (lat: number, lng: number) => {
      try {
          const response = await this.apiService.getSpatialOrders({ lat, lng, radius: 100 });
          this.entityStore?.applyPatch(response.data);
          this.spatialManager.markAreaLoaded(lat - 1, lat + 1, lng - 1, lng + 1); // Approx 100km area
          this.notifySubscribers();
      } catch (e) {
          console.error('[MapEngine] Initial spatial load failed', e);
      }
  }


  /**
   * SYNC USER: Profile fetching with Store persistence.
   */
  syncUser = async (force: boolean = false) => {
    if (!this.entityStore) return;
    const key = 'user:profile';

    if (!force) {
      const lastUpdate = this.entityStore.getMeta('user_last_sync');
      if (lastUpdate && (Date.now() - Number(lastUpdate)) < 60000) {
        return this.entityStore.getCurrentUser();
      }
    }

    if (force) this.requestRouter.invalidate(key);

    const userData = await this.requestRouter.request(
      key,
      async () => {
        const res = await this.apiService.getProfile();
        return res.data;
      },
      60000 // 60s TTL
    );

    // Mark as current user for the selector
    this.entityStore.setUser({ ...userData, isMe: true });
    this.entityStore.setMeta('user_last_sync', Date.now().toString());
    return userData;
  }

  /**
   * SYNC EXTERNAL USER: Cache-first lookup.
   */
  getExternalUser = async (userId: string, force: boolean = false) => {
    if (!this.entityStore) return;
    if (!force) {
      const cached = this.entityStore.getUser(userId);
      if (cached) return cached;
    }

    const key = `user:${userId}`;
    const userData = await this.requestRouter.request(
      key,
      async () => {
        const res = await this.apiService.getUserProfile(userId);
        return res.data;
      },
      60000
    );

    this.entityStore.setUser(userData);
    return userData;
  }

  /**
   * SYNC ORDER: Detail fetching with Store persistence.
   */
  syncOrder = async (orderId: string, force: boolean = false) => {
    if (!this.entityStore) return;
    const key = `order:${orderId}`;
    if (force) this.requestRouter.invalidate(key);

    try {
      const orderData = await this.requestRouter.request(
        key,
        async () => {
          const res = await this.apiService.getOrderDetails(orderId);
          return res.data;
        },
        30000
      );

      this.entityStore.setOrder(orderData);
      this.notifySubscribers();
      return orderData;
    } catch (error) {
      console.error(`[MapEngine] Order ${orderId} sync failed`, error);
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

  getOrdersInBounds = (minLat: number, maxLat: number, minLng: number, maxLng: number) => {
      return this.entityStore?.getOrdersInBounds(minLat, maxLat, minLng, maxLng) || [];
  }

  // Task #3: Selectors
  getOrder = (id: string) => {
    return this.entityStore?.getOrder(id);
  }

  getUser = (id: string) => {
    return this.entityStore?.getUser(id);
  }

  getCurrentUser = () => {
    return this.entityStore?.getCurrentUser();
  }

  // --- GeoCluster Accessors ---
  clusterOrders = (orders: Order[], latDelta: number) => {
    return this.geoClusterService?.clusterOrders(orders, latDelta) || [];
  }

  getOrderCoords = (order: Order) => {
    return this.geoClusterService?.getOrderCoords(order);
  }

  /**
   * Full cache clear and re-fetch.
   */
  forceRefresh = async () => {
    this.loadedBounds = [];
    this.entityStore?.clear();
    this.requestRouter?.clear();
    return this.syncMap(true);
  }

  // Task #4: Move API calls to Orchestrator

  updateProfile = async (profileData: any) => {
    const res = await this.apiService.updateProfile(profileData);
    this.entityStore?.setUser({ ...res.data, isMe: true });
    this.requestRouter.invalidate('user:profile');
    return res.data;
  }

  createOrder = async (orderData: any) => {
    const res = await this.apiService.createOrder(orderData);
    this.entityStore?.setOrder(res.data);
    this.requestRouter.invalidate('map:orders');
    this.notifySubscribers();
    return res.data;
  }

  updateOrder = async (orderId: string, orderData: any) => {
    const res = await this.apiService.updateOrder(orderId, orderData);
    this.entityStore?.setOrder(res.data);
    this.requestRouter.invalidate(`order:${orderId}`);
    this.requestRouter.invalidate('map:orders');
    this.notifySubscribers();
    return res.data;
  }

  applyForOrder = async (orderId: string) => {
    const res = await this.apiService.applyForOrder(orderId);
    // Refresh order details to show updated candidates/status
    await this.syncOrder(orderId, true);
    return res.data;
  }

  activateSubscription = async (days: number) => {
    const res = await this.apiService.activateSubscription(days);
    await this.syncUser(true);
    return res.data;
  }

  // Auth Operations (Task #4)
  login = async (phone: string) => {
    const res = await this.apiService.login(phone);
    if (res.data.user) {
      this.entityStore?.setUser({ ...res.data.user, isMe: true });
    }
    return res.data;
  }

  parseOrderText = async (text: string) => {
    const res = await this.apiService.parseOrderText(text);
    return res.data;
  }

  getApiBaseUrl = () => {
    return this.apiService.getBaseUrl();
  }

  logMemoryUsage = () => {
      if (__DEV__) {
          const ordersCount = this.entityStore.getAllOrders().length;
          const chunksCount = this.spatialManager.getLoadedChunksCount();
          // Heuristic: ~2KB per order record
          const cacheSizeMb = ((ordersCount * 2) / 1024).toFixed(2);

          console.log('[MapEngine] Memory:', {
              loadedChunks: chunksCount,
              ordersInMemory: ordersCount,
              cacheSizeMb: `${cacheSizeMb} MB`
          });
      }
  }
}

export const mapEngine = new MapEngine(apiService, entityStore, requestRouter, GeoClusterService);
export const orderOrchestrator = mapEngine; // Backward compatibility
