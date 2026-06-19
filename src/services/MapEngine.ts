import { Order } from '../types';
import { apiService } from './ApiService';
import { requestRouter } from './RequestRouter';
import { entityStore } from './EntityStore';
import { GeoClusterService } from './GeoClusterService';
import { spatialManager } from '../map/SpatialManager';
import { getDistance } from '../utils/geo';

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
  private isHydrated = false;

  constructor(
      public apiService: any,
      public entityStore: any,
      public requestRouter: any,
      public geoClusterService: any
  ) {
      this.initPersistence();
      if (__DEV__) {
          console.log('[MapEngine] EntityStore injected:', !!this.entityStore);
          console.log('[MapEngine] GeoClusterService injected:', !!this.geoClusterService);
      }
  }

  private initPersistence = async () => {
    if (this.isHydrated) return;
    const start = Date.now();
    await Promise.all([
      this.entityStore.hydrate(),
      this.spatialManager.hydrate()
    ]);
    this.isHydrated = true;
    console.log('MAP_DATA_SOURCE: STORAGE', { count: this.entityStore.getAllOrders().length });
    if (__DEV__) console.log(`[MapEngine] MAP INIT COMPLETE: ${this.entityStore.getAllOrders().length} orders in ${Date.now() - start}ms`);
    this.notifySubscribers();
  }

  /**
   * Subscribe to global order updates.
   */
  subscribe = (callback: OrderCallback, source: string = 'unknown') => {
    this.subscribers.add(callback);
    console.log('MAP_SUBSCRIBE', { source, total: this.subscribers.size });

    // V6 Hardening: Ensure initial state is pushed correctly
    if (this.isHydrated) {
        const currentOrders = this.getOrdersArray();
        callback([...currentOrders]);
    }

    return () => {
        this.subscribers.delete(callback);
        console.log('MAP_UNSUBSCRIBE', { source, remaining: this.subscribers.size });
    };
  }

  private notifySubscribers = () => {
    const orders = this.getOrdersArray();
    this.subscribers.forEach(cb => cb(orders));
  }

  triggerNotify = () => {
    this.notifySubscribers();
  }

  getOrdersArray = (myOnly: boolean = false): Order[] => {
    if (!this.entityStore) {
        if (__DEV__) console.warn('[MapEngine] Accessing entityStore before injection');
        return [];
    }
    const orders = myOnly ? this.entityStore.getMyOrders() : this.entityStore.getAllOrders();
    return orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * SYNC MAP V6: Universal Spatial Synchronization.
   * Uses geocell chunking (SpatialManager) and universal /spatial endpoint.
   * Hardened with AbortController and request locking.
   */
  syncMap = async (force: boolean = false, viewRegion?: { latitude: number, longitude: number, latitudeDelta: number, longitudeDelta: number }) => {
    if (!this.entityStore || !viewRegion) return;

    console.log('MAP_ENGINE_STATE', {
        subscribers: this.subscribers.size,
        ordersInMemory: this.entityStore.getAllOrders().length,
        cacheSize: this.getHeuristicMemoryUsage(),
        loadedChunks: this.spatialManager.getLoadedChunksCount()
    });

    // 1. DISTANCE-BASED SYNC (V8)
    // Only fetch from API if we moved > threshold from the last loaded center
    const loadedArea = this.entityStore.loadedArea;
    const distance = loadedArea
        ? getDistance(viewRegion.latitude, viewRegion.longitude, loadedArea.lat, loadedArea.lng)
        : 999;

    // V8 Hardening: Cache radius threshold adjusted based on viewport.
    // We fetch 100km radius, but we should refresh much sooner (e.g. 20km)
    // if the user is zooming in/out to ensure fresh data in their viewport.
    const threshold = viewRegion.latitudeDelta > 1 ? 50 : 20;
    const shouldFetch = force || distance > threshold || this.entityStore.getAllOrders().length === 0;

    console.log('[MapEngine] Cache logic:', {
        distance: distance.toFixed(1) + 'km',
        threshold: threshold + 'km',
        isInitial: !loadedArea,
        storeEmpty: this.entityStore.getAllOrders().length === 0,
        shouldFetch
    });

    if (!shouldFetch) {
        console.log('MAP_DATA_SOURCE: CACHE', {
            count: this.entityStore.getAllOrders().length,
            distance: distance.toFixed(1) + 'km',
            loadedArea: this.entityStore.loadedArea
        });
        this.notifySubscribers();
        return;
    }

    if (this.syncLock) {
        console.log('[MapEngine] Sync locked');
        return;
    }

    // ABORT PREVIOUS: Cancel any existing fetch
    if (this.currentAbortController) this.currentAbortController.abort();
    this.currentAbortController = new AbortController();
    this.syncLock = true;

    try {
      this.requestRouter.metrics.spatialRequests++;

      console.log('[SPATIAL_FETCH_START]', {
          lat: viewRegion.latitude,
          lng: viewRegion.longitude,
          radius: 100,
          mode: 'radius'
      });
      const startTime = Date.now();

      const response = await this.apiService.getSpatialOrders({
          lat: viewRegion.latitude,
          lng: viewRegion.longitude,
          radius: 100
      }, { signal: this.currentAbortController?.signal });

      if (response.data) {
        console.log('[SPATIAL_FETCH_END]', {
            returnedOrders: response.data.created?.length || 0,
            durationMs: Date.now() - startTime
        });

        this.entityStore.applyPatch(response.data);
        this.entityStore.loadedArea = { lat: viewRegion.latitude, lng: viewRegion.longitude, radius: 100 };
        this.entityStore.isInitialLoaded = true;

        console.log('MAP_DATA_SOURCE: API', {
            count: this.entityStore.getAllOrders().length
        });

        this.notifySubscribers();

        // Persist after merge
        this.entityStore.persist();
        if (__DEV__) console.log('[MapEngine] MAP MERGE COMPLETE & PERSISTED');
      }

      this.entityStore.meta.spatialSyncs++;
      this.logMemoryUsage();
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
   * Initial Load V8: Load 100km radius around user.
   */
  initialLoad = async (lat: number, lng: number) => {
      if (this.entityStore.isInitialLoaded) return;
      return this.syncMap(true, { latitude: lat, longitude: lng, latitudeDelta: 0.1, longitudeDelta: 0.1 });
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
      // V8: syncMap now checks distance internally.
      // If within 70km, it just calls notifySubscribers() for local cluster refresh.
      this.syncMap(false, region);
      }, 300);
  }

  getOrders = (myOnly: boolean = false) => {
    return this.getOrdersArray(myOnly);
  }

  syncMyOrders = async () => {
    if (!this.entityStore) return [];
    try {
      const res = await this.apiService.getMyOrders();
      this.entityStore.setOrders(res.data);
      this.notifySubscribers();
      return res.data;
    } catch (e) {
      console.error('[MapEngine] syncMyOrders failed', e);
      return [];
    }
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

  applyForOrder = async (orderId: string, price?: number) => {
    const res = await this.apiService.applyForOrder(orderId, price);
    // Immediately update store with the applied state to ensure instant UI feedback
    if (res.data?.order) {
        const order = res.data.order;
        // If the backend didn't include applications, we inject the current user's app
        // to ensure EntityStore classifies this as "My Order" immediately
        const applications = order.applications || [];
        const myId = this.entityStore.getCurrentUser()?.uid || this.entityStore.getCurrentUser()?.id;

        if (res.data.application && !applications.find((a: any) => a.executorId === myId)) {
            applications.push(res.data.application);
        }

        this.entityStore.setOrder({ ...order, applications });
        this.notifySubscribers();
    }
    return res.data;
  }

  cancelApplication = async (orderId: string) => {
    const res = await this.apiService.cancelApplication(orderId);
    // Rely on WebSocket for real-time updates
    return res.data;
  }

  acceptApplication = async (applicationId: string, orderId: string) => {
    const res = await this.apiService.acceptApplication(applicationId);
    // Rely on WebSocket for real-time updates
    return res.data;
  }

  startOrder = async (orderId: string) => {
    const res = await this.apiService.startOrder(orderId);
    // Rely on WebSocket for real-time updates
    return res.data;
  }

  completeOrder = async (orderId: string) => {
    const res = await this.apiService.completeOrder(orderId);
    // Rely on WebSocket for real-time updates
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

  getHeuristicMemoryUsage = () => {
      const ordersCount = this.entityStore?.getAllOrders().length || 0;
      const cacheSizeMb = ((ordersCount * 2) / 1024).toFixed(2);
      return `${cacheSizeMb} MB`;
  }

  logMemoryUsage = () => {
      if (__DEV__) {
          const chunksCount = this.spatialManager.getLoadedChunksCount();
          console.log('[MapEngine] Memory:', {
              loadedChunks: chunksCount,
              ordersInMemory: this.entityStore.getAllOrders().length,
              cacheSizeMb: this.getHeuristicMemoryUsage()
          });
      }
  }
}

export const mapEngine = new MapEngine(apiService, entityStore, requestRouter, GeoClusterService);
export const orderOrchestrator = mapEngine; // Backward compatibility
