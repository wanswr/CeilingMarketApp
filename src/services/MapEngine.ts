import { Order } from '../types'
import { apiService } from './ApiService'
import { requestRouter } from './RequestRouter'
import { entityStore } from './EntityStore'
import { GeoClusterService } from './GeoClusterService'
import { spatialManager } from '../map/SpatialManager'
import { mapViewportStore } from './MapViewportStore'
import { logger } from './logger/LoggerService'

type OrderCallback = (orders: Order[]) => void;

class MapEngine {
  private subscribers: Map<string, OrderCallback> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private syncLock: boolean = false;
  private currentAbortController: AbortController | null = null;
  private requestCounter: number = 0;
  private lastSyncRegion: { latitude: number, longitude: number, latitudeDelta: number } | null = null;
  private searchRadius: number = 100;
  private lastGeoJoinKey: string | null = null;

  setSearchRadius = (radius: number) => {
    this.searchRadius = radius;
  }
  public spatialManager = spatialManager;
  public entityStore = entityStore;
  public apiService = apiService;
  public requestRouter = requestRouter;
  public geoClusterService = GeoClusterService;

  private isHydrated = false;
  private lastClusteredOrders: any[] = [];

  constructor() {
      this.initPersistence();

      // V11: Defer subscription to avoid require cycles during module definition
      setTimeout(() => {
          // V9: Reactive architecture - Engine listens to Camera
          mapViewportStore.subscribe((region) => {
              this.triggerMapUpdate(region);
              this.updateSocketRoom(region);
          }, 'MapEngine_Core');
      }, 0);
  }

  private updateSocketRoom(region: any) {
      const key = `${Math.floor(region.latitude * 10)}:${Math.floor(region.longitude * 10)}`;
      if (key !== this.lastGeoJoinKey) {
          // Break circular dependency by dynamic require
          const { socketService } = require('./SocketService');
          const socket = socketService.getSocket();
          if (socket?.connected) {
              socket.emit('geo.join', { lat: region.latitude, lng: region.longitude });
              this.lastGeoJoinKey = key;
              logger.debug('MAP_GEO_ROOM_JOIN', { source: 'system', key });
          }
      }
  }

  private initPersistence = () => {
    if (this.isHydrated) return;
    // V11: Synchronous hydration via StorageService
    this.entityStore.hydrate();
    this.spatialManager.hydrate();
    this.isHydrated = true;

    const count = this.entityStore.getAllOrders().length;
    if (count > 0) {
        logger.debug('STORE_HYDRATE', { count, source: 'store' });
        this.triggerNotify();
    }
  }

  subscribe = (callback: OrderCallback, source: string) => {
    if (!source) {
        logger.warn('[MapEngine] Subscribe called without source');
        source = 'unknown_' + Math.random().toString(36).substr(2, 5);
    }
    this.subscribers.set(source, callback);
    logger.debug('MAP_SUBSCRIBE', { source, total: this.subscribers.size });

    // V9: Immediate snapshot with source-aware clustering and fresh reference
    const isMap = source === 'MapScreen';
    const snapshot = this.getOrders(!isMap);
    callback([...snapshot]);

    return () => {
        this.subscribers.delete(source);
        logger.debug('MAP_UNSUBSCRIBE', { source, remaining: this.subscribers.size });
    };
  }

  private notifyTimer: NodeJS.Timeout | null = null;

  private notifySubscribers = (clusteredOrders?: any[]) => {
    const orders = this.getOrdersArray();

    let mapOrders = clusteredOrders;
    if (!mapOrders) {
        const currentRegion = mapViewportStore.getRegion();
        mapOrders = this.recalculateClusteredOrders(currentRegion);
    }

    logger.debug('MAP_NOTIFY', {
        visible: mapOrders.length,
        total: orders.length,
        subscribers: Array.from(this.subscribers.keys())
    });

    this.subscribers.forEach((cb, source) => {
        if (source === 'MapScreen') {
            cb([...mapOrders!]); // Always fresh reference
        } else {
            cb([...orders]);
        }
    });
  }

  triggerNotify = () => {
      if (this.notifyTimer) clearTimeout(this.notifyTimer);

      // Debounce notify to group multiple rapid updates (e.g. from websocket)
      this.notifyTimer = setTimeout(() => {
          // Re-run clustering with current region
          const region = mapViewportStore.getRegion();
          const safeItems = this.recalculateClusteredOrders(region);
          this.notifySubscribers(safeItems);
          this.notifyTimer = null;
      }, 50);
  };

  getOrdersArray = (myOnly: boolean = false): Order[] => {
    if (!this.entityStore) return [];
    const orders = myOnly ? this.entityStore.getMyOrders() : this.entityStore.getAllOrders();
    return orders.sort((a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a =
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
  }

  isSyncRequired = (viewRegion: any, force: boolean = false): boolean => {
    if (!this.entityStore || !viewRegion) return false;

    // 1. BOUNDS-BASED CACHE CHECK (V9)
    const viewport = {
        north: viewRegion.latitude + viewRegion.latitudeDelta / 2,
        south: viewRegion.latitude - viewRegion.latitudeDelta / 2,
        east: viewRegion.longitude + viewRegion.longitudeDelta / 2,
        west: viewRegion.longitude - viewRegion.longitudeDelta / 2 };

    const isInside = this.entityStore.loadedBounds &&
        viewport.north <= this.entityStore.loadedBounds.north &&
        viewport.south >= this.entityStore.loadedBounds.south &&
        viewport.east <= this.entityStore.loadedBounds.east &&
        viewport.west >= this.entityStore.loadedBounds.west;

    const shouldFetch = force || !isInside || this.entityStore.getAllOrders().length === 0;

    if (!shouldFetch) return false;
    if (this.syncLock) return false;

    // 1.5. MOVEMENT THRESHOLD CHECK
    if (!force && this.lastSyncRegion) {
        const dist = this.calculateDistance(viewRegion.latitude, viewRegion.longitude, this.lastSyncRegion.latitude, this.lastSyncRegion.longitude);
        const scaleChange = Math.abs(viewRegion.latitudeDelta - this.lastSyncRegion.latitudeDelta) / this.lastSyncRegion.latitudeDelta;

        if (dist < 10 && scaleChange < 0.2) return false;
    }

    return true;
  }

  syncMap = async (force: boolean = false, viewRegion?: { latitude: number, longitude: number, latitudeDelta: number, longitudeDelta: number }) => {
    if (!this.entityStore || !viewRegion) return;

    if (!this.isSyncRequired(viewRegion, force)) {
        // Even if sync not required, notify once to ensure UI is fresh (e.g. after hydrate)
        this.triggerNotify();
        return;
    }

    if (this.currentAbortController) this.currentAbortController.abort();
    this.currentAbortController = new AbortController();
    this.syncLock = true;
    const requestId = ++this.requestCounter;

    try {
      logger.debug('MAP_FETCH_START', { lat: viewRegion.latitude, lng: viewRegion.longitude, requestId });
      const startTime = Date.now();

      // V11: Enforce 100km radius for server sync as per technical audit requirement
      const SYNC_RADIUS = 100;
      const response = await this.apiService.getSpatialOrders({
          lat: viewRegion.latitude,
          lng: viewRegion.longitude,
          radius: SYNC_RADIUS
      }, { signal: this.currentAbortController?.signal });

      if (requestId !== this.requestCounter) {
          logger.debug('MAP_FETCH_IGNORED_STALE_RESPONSE', { requestId, latest: this.requestCounter });
          return;
      }

      if (response.data) {
        const returnedOrders = response.data.created || response.data.orders || [];
        logger.debug('MAP_FETCH_END', { returnedOrders: returnedOrders.length, requestId, durationMs: Date.now() - startTime });

        // V9: PRUNING STALE SPATIAL DATA
        // Before applying the new patch, find orders that should be in this region but weren't returned
        const radiusKm = 100;
        const existingInRegion = this.getOrdersInBounds(
            viewRegion.latitude - 1.0,
            viewRegion.latitude + 1.0,
            viewRegion.longitude - 1.5,
            viewRegion.longitude + 1.5
        );

        const newOrderIds = new Set(returnedOrders.map((o: any) => o.id));
        const myId = this.entityStore.currentUserId;

        let prunedCount = 0;
        existingInRegion.forEach((order: Order) => {
            const isMine = order.employerId === myId || order.executorId === myId || order.applications?.some((a: any) => a.executorId === myId);
            if (!isMine && !newOrderIds.has(order.id)) {
                this.entityStore.removeOrder(order.id, 'stale_spatial');
                prunedCount++;
            }
        });

        if (prunedCount > 0) {
            logger.debug('STORE_STALE_REMOVED', { count: prunedCount });
        }

        this.entityStore.applyPatch(response.data, 'spatial_fetch');

        // V9: Expanded Bounds (approx 120km to ensure buffer)
        this.entityStore.loadedBounds = {
            north: viewRegion.latitude + 0.9,
            south: viewRegion.latitude - 0.9,
            east: viewRegion.longitude + 1.3,
            west: viewRegion.longitude - 1.3 };
        this.entityStore.isInitialLoaded = true;
        this.lastSyncRegion = {
            latitude: viewRegion.latitude,
            longitude: viewRegion.longitude,
            latitudeDelta: viewRegion.latitudeDelta
        };
        logger.debug('MAP_DATA_SOURCE: API', { count: this.entityStore.getAllOrders().length });
        this.triggerNotify();
        this.entityStore.persist();
      }
    } catch (error: any) {
        if (error.name !== 'AbortError') logger.error('Map Sync Fail:', { error: error.message });
    } finally {
        this.syncLock = false;
        this.currentAbortController = null;
    }
  }

  initialLoad = async (lat: number, lng: number) => {
      logger.info('[MapEngine] Performing initial server sync...');
      // Mark as NOT initial loaded to ensure the syncMap(true) actually runs and clears storage ghost orders
      this.entityStore.isInitialLoaded = false;
      return this.syncMap(true, { latitude: lat, longitude: lng, latitudeDelta: 0.5, longitudeDelta: 0.5 });
  }

  private recalculateClusteredOrders = (region: any): any[] => {
    const totalOrders = this.entityStore.getAllOrders();

    if (!region) {
        logger.debug('MAP_VISIBLE_RECALC_SKIP: No region');
        return [];
    }

    const startTime = Date.now();
    const latPadding = region.latitudeDelta * 0.7; // Wider padding for smoother panning
    const lngPadding = region.longitudeDelta * 0.7;

    const rawCandidates = this.getOrdersInBounds(
        region.latitude - latPadding,
        region.latitude + latPadding,
        region.longitude - lngPadding,
        region.longitude + lngPadding
    );

    // V9: Filter map candidates by status
    const myId = this.entityStore.currentUserId;

    logger.debug('MAP_VISIBLE_RECALC_START', {
        totalInStore: totalOrders.length,
        inBounds: rawCandidates.length,
        region: `${region.latitude.toFixed(3)},${region.longitude.toFixed(3)}`,
        delta: region.latitudeDelta.toFixed(3)
    });

    const candidates = rawCandidates.filter((order: Order) => {
        const isPublic = order.status === 'PUBLISHED' || order.status === 'HAS_RESPONSES';
        const isMine = !!myId && (
            order.employerId === myId ||
            order.executorId === myId ||
            order.applications?.some((a: any) => a.executorId === myId)
        );

        // Rules:
        // 1. Published/Responses are visible to everyone.
        // 2. Claimed/In Progress are visible ONLY to participants.
        const shouldShow = isPublic || (isMine && (order.status === 'CLAIMED' || order.status === 'IN_PROGRESS'));

        if (!shouldShow && (order.status === 'PUBLISHED' || order.status === 'HAS_RESPONSES')) {
            logger.debug('MAP_FILTER_DEBUG', { id: order.id, status: order.status, isMine, myId });
        }

        return shouldShow;
    });

    // V9: Perform clustering but NEVER hide single orders unless they are actually in a cluster
    const result = this.clusterOrders(candidates, region.latitudeDelta);

    const safeItems = result.filter((item: any) => {
        const coords = this.getOrderCoords(item);
        const isValid = coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude);
        if (!isValid) logger.debug('MAP_INVALID_COORDS', { id: item.id });
        return isValid;
    });

    this.lastClusteredOrders = safeItems;
    logger.debug('MAP_VISIBLE_RECALC_END', {
        candidates: candidates.length,
        visible: safeItems.length,
        duration: Date.now() - startTime,
        radius: this.searchRadius
    });
    return safeItems;
  }

  triggerMapUpdate = (region: any) => {
    if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
    }
    // V11: Debounce 300ms to ensure we don't recalculate mid-flight
    this.debounceTimer = setTimeout(() => {
        // Recalculate will notify subscribers automatically
        this.triggerNotify();
        this.syncMap(false, region);
    }, 300);
  }

  // --- Selectors ---
  getOrders = (myOnly: boolean = false) => {
      if (myOnly) return this.getOrdersArray(true);
      if (this.lastClusteredOrders.length > 0) return this.lastClusteredOrders;
      // Fallback for first render before any region change
      return this.recalculateClusteredOrders(mapViewportStore.getRegion());
  };
  getOrder = (id: string) => this.entityStore?.getOrder(id);
  getUser = (id: string) => this.entityStore?.getUser(id);
  getCurrentUser = () => {
      const user = this.entityStore?.getCurrentUser();
      if (!user) {
          logger.warn("[MapEngine] currentUser unavailable");
      }
      return user;
  };
  getOrdersInBounds = (minLat: number, maxLat: number, minLng: number, maxLng: number) => this.entityStore?.getOrdersInBounds(minLat, maxLat, minLng, maxLng) || [];
  clusterOrders = (orders: Order[], latDelta: number) => this.geoClusterService?.clusterOrders(orders, latDelta) || [];
  getOrderCoords = (order: Order) => this.geoClusterService?.getOrderCoords(order);

  // --- Actions ---
  syncUser = async (force: boolean = false) => {
    const res = await this.requestRouter.request('user:profile', () => this.apiService.getProfile(), force ? 0 : 30000);
    if (res && res.data) {
        this.entityStore.setUser({ ...res.data, isMe: true });
        return res.data;
    }
    return this.entityStore.getCurrentUser();
  }

  getExternalUser = async (userId: string) => {
    const res = await this.requestRouter.request(`user:${userId}`, () => this.apiService.getUserProfile(userId), 60000);
    if (res && res.data) {
        this.entityStore.setUser(res.data);
        return res.data;
    }
    return this.entityStore.getUser(userId);
  }

  syncOrder = async (orderId: string, force: boolean = false) => {
    const res = await this.requestRouter.request(`order:${orderId}`, () => this.apiService.getOrderDetails(orderId), force ? 0 : 10000);
    if (res && res.data) {
        this.entityStore.setOrder(res.data, 'api_sync');
        return res.data;
    }
    return this.entityStore.getOrder(orderId);
  }

  getApiBaseUrl = () => this.apiService.getBaseUrl();
  syncMyOrders = async () => {
    try {
      const res = await this.requestRouter.request('orders:my', () => this.apiService.getMyOrders(), 10000);
      if (res && res.data) {
          this.entityStore.setOrders(res.data);
          this.notifySubscribers();
          return res.data;
      }
      return this.entityStore.getMyOrders();
    } catch (e) { return []; }
  }

  updateProfile = async (data: any) => {
    const res = await this.apiService.updateProfile(data);
    this.requestRouter.invalidate('user:profile');
    this.entityStore?.setUser({ ...res.data, isMe: true });
    return res.data;
  }

  createOrder = async (data: any) => {
    const res = await this.apiService.createOrder(data);
    this.requestRouter.invalidate('orders:my');
    this.entityStore?.setOrder(res.data, 'api_create');
    // Ensure new order is visible immediately without a full sync
    this.triggerNotify();
    return res.data;
  }

  updateOrder = async (id: string, data: any) => {
    const res = await this.apiService.updateOrder(id, data);
    this.requestRouter.invalidate(`order:${id}`);
    this.entityStore?.setOrder(res.data, 'api_update');
    this.notifySubscribers();
    return res.data;
  }

  applyForOrder = async (id: string, price?: number) => {
    const res = await this.apiService.applyForOrder(id, price);
    if (res.data?.order) {
        this.requestRouter.invalidate(`order:${id}`);
        this.entityStore.setOrder(res.data.order, 'api_apply');
        this.notifySubscribers();
    }
    return res.data;
  }

  cancelApplication = async (id: string) => {
    const res = await this.apiService.cancelApplication(id);
    this.requestRouter.invalidate(`order:${id}`);
    await this.syncOrder(id, true);
    return res;
  };
  acceptApplication = async (applicationId: string) => {
    const res = await this.apiService.acceptApplication(applicationId);
    const orderId = res.data?.orderId || res.data?.order?.id;
    if (orderId) {
        this.requestRouter.invalidate(`order:${orderId}`);
        await this.syncOrder(orderId, true);
    }
    return res;
  };
  startOrder = async (id: string) => {
    const res = await this.apiService.startOrder(id);
    this.requestRouter.invalidate(`order:${id}`);
    // V11: Update store immediately if data is returned
    if (res.data) {
        this.entityStore.setOrder(res.data, 'api_start');
    }
    await this.syncOrder(id, true);
    return res;
  };
  completeOrder = async (id: string) => {
    const res = await this.apiService.completeOrder(id);
    this.requestRouter.invalidate(`order:${id}`);
    if (res.data) {
        this.entityStore.setOrder(res.data, 'api_complete');
    }
    await this.syncOrder(id, true);
    return res;
  };
  deleteOrder = async (id: string) => {
    const res = await this.apiService.deleteOrder(id);
    this.requestRouter.invalidate(`order:${id}`);
    this.requestRouter.invalidate('orders:my');
    this.entityStore.removeOrder(id, 'api_delete');
    this.triggerNotify();
    return res.data;
  };
  activateSubscription = async (days: number) => {
    const res = await this.apiService.activateSubscription(days);
    this.requestRouter.invalidate('user:profile');
    const profile = await this.syncUser(true);
    return { ...res.data, user: profile };
  }
  login = async (phone: string) => {
    const res = await this.apiService.login(phone);
    if (res.data.user) this.entityStore?.setUser({ ...res.data.user, isMe: true });
    return res.data;
  }
  parseOrderText = async (text: string) => (await this.apiService.parseOrderText(text)).data;
  forceRefresh = async () => {
    this.entityStore?.clear();
    return this.syncMap(true, mapViewportStore.getRegion());
  }
}

export const mapEngine = new MapEngine();
export const orderOrchestrator = mapEngine;
