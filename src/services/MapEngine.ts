import { Order } from '../types';
import { apiService } from './ApiService';
import { requestRouter } from './RequestRouter';
import { entityStore } from './EntityStore';
import { GeoClusterService } from './GeoClusterService';

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
    if (!this.entityStore) {
        if (__DEV__) console.warn('[MapEngine] Accessing entityStore before injection');
        return [];
    }
    return this.entityStore.getAllOrders()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * SYNC MAP V4: Spatial Bounding Box Synchronization.
   * Optimizes map performance by fetching a large viewport area at once.
   */
  syncMap = async (force: boolean = false, region?: { latitude: number, longitude: number, latitudeDelta: number, longitudeDelta: number }) => {
    if (!this.entityStore) return;
    if (!region) {
      return;
    }

    // 1. Calculate BBOX from region
    // We expand the bbox significantly (buffer) to reduce network requests on pan
    const latBuffer = region.latitudeDelta * 1.0;
    const lngBuffer = region.longitudeDelta * 1.0;

    const bounds: BBox = {
      minLat: region.latitude - region.latitudeDelta - latBuffer,
      maxLat: region.latitude + region.latitudeDelta + latBuffer,
      minLng: region.longitude - region.longitudeDelta - lngBuffer,
      maxLng: region.longitude + region.longitudeDelta + lngBuffer
    };

    // 2. CHECK LOCAL CACHE: Does any loaded region fully cover this new request?
    if (!force) {
      const isLoaded = this.loadedBounds.some(b =>
        bounds.minLat >= b.minLat && bounds.maxLat <= b.maxLat &&
        bounds.minLng >= b.minLng && bounds.maxLng <= b.maxLng
      );

      if (isLoaded) {
        if (__DEV__) console.log('[MapEngine] BBOX CACHE HIT - Skipping network');
        this.requestRouter.metrics.bboxHits++;
        this.requestRouter.metrics.cacheHits++;
        return;
      }
    }

    // 3. Normalize key for RequestRouter
    const precision = 2;
    const normBounds = {
      minLat: Number(bounds.minLat.toFixed(precision)),
      maxLat: Number(bounds.maxLat.toFixed(precision)),
      minLng: Number(bounds.minLng.toFixed(precision)),
      maxLng: Number(bounds.maxLng.toFixed(precision)),
    };

    if (isNaN(normBounds.minLat) || isNaN(normBounds.minLng)) return;

    const spatialKey = `bbox:${normBounds.minLat}:${normBounds.maxLat}:${normBounds.minLng}:${normBounds.maxLng}`;
    if (force) this.requestRouter.invalidate(spatialKey);

    try {
      const lastSyncTime = this.entityStore.getMeta('map_last_sync') || '0';

      const response = await this.requestRouter.request<{ created: Order[], updated: Order[], deleted: string[] }>(
        spatialKey,
        async () => {
          this.requestRouter.metrics.bboxMisses++;
          const res = await this.apiService.getMapOrdersInBounds(normBounds, force ? '0' : lastSyncTime);
          return res.data;
        },
        300000 // 5 min TTL for spatial buckets
      );

      if (response) {
        this.entityStore.applyPatch(response);

        // Add to loaded bounds tracker
        this.loadedBounds.push(normBounds);
        // Keep tracker small (last 10 regions)
        if (this.loadedBounds.length > 10) this.loadedBounds.shift();

        this.notifySubscribers();
      }

      this.entityStore.meta.spatialSyncs++;
      this.entityStore.setMeta('map_last_sync', Date.now().toString());
      this.entityStore.logDiagnostics();
    } catch (error) {
      console.error(`[MapEngine] Spatial sync failed`, error);
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
}

export const mapEngine = new MapEngine(apiService, entityStore, requestRouter, GeoClusterService);
export const orderOrchestrator = mapEngine; // Backward compatibility
