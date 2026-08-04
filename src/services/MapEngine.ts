import { Order } from '../types'
import { apiService } from './ApiService'
import { requestRouter } from './RequestRouter'
import { entityStore } from './EntityStore'
import { GeoClusterService } from './GeoClusterService'
import { spatialManager } from '../map/SpatialManager'
import { mapViewportStore } from './MapViewportStore'
import { logger } from './logger/LoggerService'
import { CONFIG } from '../constants/config'

type OrderCallback = (orders: Order[]) => void;

class MapEngine {
  private subscribers: Map<string, OrderCallback> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private syncLock: boolean = false;
  private currentAbortController: AbortController | null = null;
  private requestCounter: number = 0;
  private lastSyncRegion: { latitude: number, longitude: number, latitudeDelta: number } | null = null;
  private searchRadius: number = CONFIG.INITIAL_SEARCH_RADIUS_KM;
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

  updateSocketRoom(region: any, force: boolean = false) {
      if (!region) return;

      // Grid is 0.1 degree (approx 10km)
      const lat = Math.floor(region.latitude * 10) / 10;
      const lng = Math.floor(region.longitude * 10) / 10;
      const key = `${lat}:${lng}`;

      if (force || key !== this.lastGeoJoinKey) {
          const { socketService } = require('./SocketService');
          const socket = socketService.getSocket();
          if (socket?.connected) {
              // Join a 3x3 grid around current center
              // The first join in the batch has 'clear: true' to wipe previous geo rooms
              let first = true;
              for (let i = -1; i <= 1; i++) {
                  for (let j = -1; j <= 1; j++) {
                      socket.emit('geo.join', {
                          lat: lat + (i * 0.1),
                          lng: lng + (j * 0.1),
                          clear: first
                      });
                      first = false;
                  }
              }
              this.lastGeoJoinKey = key;
              logger.debug('MAP_GEO_ROOM_JOIN_GRID', { source: 'system', center: key, forced: force });
          }
      }
  }

  private initPersistence = () => {
    if (this.isHydrated) return;
    const hasData = this.entityStore.hydrate();
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

    const isMap = source === 'MapScreen';
    const snapshot = this.getOrders(!isMap);
    callback([...snapshot]);

    return () => {
        this.subscribers.delete(source);
        logger.debug('MAP_UNSUBSCRIBE', { source, remaining: this.subscribers.size });
    };
  }

  triggerNotify = () => {
    const isMap = this.subscribers.has('MapScreen');
    const orders = this.getOrdersArray(!isMap);

    this.subscribers.forEach((callback, source) => {
        if (source === 'MapScreen') {
            const region = mapViewportStore.getRegion();
            const clustered = this.recalculateClusteredOrders(region);
            callback([...clustered]);
        } else {
            callback([...orders]);
        }
    });
  }

  getOrdersArray = (all: boolean = true) => {
      return all ? this.entityStore.getAllOrders() : this.lastClusteredOrders;
  }

  syncMap = async (force: boolean = false, region?: any) => {
    if (this.syncLock && !force) return;
    this.syncLock = true;

    try {
      const viewRegion = region || mapViewportStore.getRegion();
      const limit = 250;
      let cursorId: string | undefined = undefined;
      let allCreated: any[] = [];
      let pagesFetched = 0;
      const maxPages = 4; // Max 1000 orders total

      while (pagesFetched < maxPages) {
        const params: any = {
          lat: viewRegion.latitude,
          lng: viewRegion.longitude,
          radius: this.searchRadius,
          limit,
        };
        if (cursorId) {
          params.cursorId = cursorId;
        }

        const res = cursorId
          ? await this.apiService.getOrdersSpatial(params)
          : await this.requestRouter.request('map:spatial', () => this.apiService.getOrdersSpatial(params), force ? 0 : 30000);

        if (res && res.data) {
          const { created } = res.data;
          if (created && created.length > 0) {
            allCreated = [...allCreated, ...created];
            if (created.length === limit) {
              cursorId = created[created.length - 1].id;
              pagesFetched++;
              continue;
            }
          }
        }
        break;
      }

      if (allCreated.length > 0) {
        this.entityStore.setOrders(allCreated, 'spatial');
      }

      this.lastSyncRegion = {
          latitude: viewRegion.latitude,
          longitude: viewRegion.longitude,
          latitudeDelta: viewRegion.latitudeDelta
      };
      this.triggerNotify();
      this.entityStore.persist();
    } catch (error: any) {
        if (error.name !== 'AbortError') logger.error('Map Sync Fail:', { error: error.message });
    } finally {
        this.syncLock = false;
    }
  }

  initialLoad = async (lat: number, lng: number) => {
      logger.info('[MapEngine] Performing initial server sync...');
      this.entityStore.isInitialLoaded = false;
      return this.syncMap(true, { latitude: lat, longitude: lng, latitudeDelta: 0.9, longitudeDelta: 0.9 });
  }

  private recalculateClusteredOrders = (region: any): any[] => {
    const totalOrders = this.entityStore.getAllOrders();
    if (!region) return [];

    const startTime = Date.now();
    const latPadding = region.latitudeDelta * 0.7;
    const lngPadding = region.longitudeDelta * 0.7;

    const rawCandidates = this.getOrdersInBounds(
        region.latitude - latPadding,
        region.latitude + latPadding,
        region.longitude - lngPadding,
        region.longitude + lngPadding
    );

    const myId = this.entityStore.currentUserId;
    const candidates = rawCandidates.filter((order: Order) => {
        const isPublic = order.status === 'PUBLISHED' || order.status === 'HAS_RESPONSES';
        const isMine = !!myId && (
            order.employerId === myId ||
            order.executorId === myId ||
            order.applications?.some((a: any) => a.executorId === myId)
        );
        return isPublic || (isMine && (order.status === 'CLAIMED' || order.status === 'IN_PROGRESS'));
    });

    const result = this.clusterOrders(candidates, region.latitudeDelta);
    const safeItems = result.filter((item: any) => {
        const coords = this.getOrderCoords(item);
        return coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude);
    });

    this.lastClusteredOrders = safeItems;
    return safeItems;
  }

  triggerMapUpdate = (region: any) => {
    if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
        this.triggerNotify();
        this.syncMap(false, region);
    }, 300);
  }

  getOrders = (myOnly: boolean = false) => {
      if (myOnly) return this.getOrdersArray(true);
      if (this.lastClusteredOrders.length > 0) return this.lastClusteredOrders;
      return this.recalculateClusteredOrders(mapViewportStore.getRegion());
  };
  getOrder = (id: string) => this.entityStore?.getOrder(id);
  getUser = (id: string) => this.entityStore?.getUser(id);
  getCurrentUser = () => this.entityStore?.getCurrentUser();
  getOrdersInBounds = (minLat: number, maxLat: number, minLng: number, maxLng: number) => this.entityStore?.getOrdersInBounds(minLat, maxLat, minLng, maxLng) || [];
  clusterOrders = (orders: Order[], latDelta: number) => this.geoClusterService?.clusterOrders(orders, latDelta) || [];
  getOrderCoords = (order: Order) => this.geoClusterService?.getOrderCoords(order);

  syncUser = async (force: boolean = false) => {
    const res = await this.requestRouter.request('user:profile', () => this.apiService.getProfile(), force ? 0 : 30000);
    if (res && res.data) {
        this.entityStore.setUser({ ...res.data, isMe: true });
        return res.data;
    }
    return this.entityStore.getCurrentUser();
  }

  syncOrder = async (orderId: string, force: boolean = false) => {
    const res = await this.requestRouter.request(`order:${orderId}`, () => this.apiService.getOrderDetails(orderId), force ? 0 : 10000);
    if (res && res.data) {
        this.entityStore.setOrder(res.data, 'api_sync');
        this.triggerNotify();
        return res.data;
    }
    return this.entityStore.getOrder(orderId);
  }

  getApiBaseUrl = () => this.apiService.getBaseUrl();
  syncMyOrders = async (params?: { skip?: number; take?: number }) => {
    try {
      const key = params ? `orders:my:${JSON.stringify(params)}` : 'orders:my';
      const res = await this.requestRouter.request(key, () => this.apiService.getMyOrders(params), 10000);
      if (res && res.data) {
          this.entityStore.setOrders(res.data, 'my');
          this.triggerNotify();
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

  setRole = async (role: 'WORKER' | 'EMPLOYER') => {
    const res = await this.apiService.setRole(role);
    this.requestRouter.invalidate('user:profile');
    this.entityStore?.setUser({ ...res.data, isMe: true });
    return res.data;
  }

  createOrder = async (data: any) => {
    const res = await this.apiService.createOrder(data);
    this.requestRouter.invalidate('orders:my');
    try {
        const { socketService } = require('./SocketService');
        socketService.registerLocalMutation('order.created', res.data.id, 'none', res.data.status);
    } catch (e) {}
    this.entityStore?.setOrder(res.data, 'api_create');
    this.triggerNotify();
    return res.data;
  }

  updateOrder = async (id: string, data: any) => {
    const res = await this.apiService.updateOrder(id, data);
    this.requestRouter.invalidate(`order:${id}`);
    try {
        const { socketService } = require('./SocketService');
        socketService.registerLocalMutation('order.status.changed', id, 'none', res.data.status);
    } catch (e) {}
    this.entityStore?.setOrder(res.data, 'api_update');
    this.triggerNotify();
    return res.data;
  }

  applyForOrder = async (id: string, price?: number, idempotencyKey?: string) => {
    const res = await this.apiService.applyForOrder(id, price, idempotencyKey);
    if (res.data?.order) {
        this.requestRouter.invalidate(`order:${id}`);
        try {
            const { socketService } = require('./SocketService');
            const app = res.data.app || res.data;
            const appId = app?.id || 'any';
            socketService.registerLocalMutation('application.new', id, appId, 'PENDING');
            socketService.registerLocalMutation('order.status.changed', id, 'none', res.data.order.status);
        } catch (e) {}
        this.entityStore.setOrder(res.data.order, 'api_apply');
        this.triggerNotify();
    }
    return res.data;
  }

  cancelApplication = async (id: string) => {
    const res = await this.apiService.cancelApplication(id);
    this.requestRouter.invalidate(`order:${id}`);
    try {
        const { socketService } = require('./SocketService');
        socketService.registerLocalMutation('order.status.changed', id, 'none', 'PUBLISHED');
        socketService.registerLocalMutation('order.status.changed', id, 'none', 'HAS_RESPONSES');
    } catch (e) {}
    await this.syncOrder(id, true);
    this.triggerNotify();
    return res;
  };
  acceptApplication = async (applicationId: string) => {
    const res = await this.apiService.acceptApplication(applicationId);
    const orderId = res.data?.orderId || res.data?.order?.id;
    if (orderId) {
        this.requestRouter.invalidate(`order:${orderId}`);
        try {
            const { socketService } = require('./SocketService');
            const orderStatus = res.data?.order?.status || res.data?.status || 'CLAIMED';
            socketService.registerLocalMutation('order.status.changed', orderId, 'none', orderStatus);
        } catch (e) {}
        await this.syncOrder(orderId, true);
        this.triggerNotify();
    }
    return res;
  };
  startOrder = async (id: string) => {
    const res = await this.apiService.startOrder(id);
    this.requestRouter.invalidate(`order:${id}`);
    try {
        const { socketService } = require('./SocketService');
        socketService.registerLocalMutation('order.status.changed', id, 'none', 'IN_PROGRESS');
    } catch (e) {}
    if (res.data) this.entityStore.setOrder(res.data, 'api_start');
    await this.syncOrder(id, true);
    this.triggerNotify();
    return res;
  };
  completeOrder = async (id: string) => {
    const res = await this.apiService.completeOrder(id);
    this.requestRouter.invalidate(`order:${id}`);
    try {
        const { socketService } = require('./SocketService');
        socketService.registerLocalMutation('order.status.changed', id, 'none', 'COMPLETED');
    } catch (e) {}
    if (res.data) this.entityStore.setOrder(res.data, 'api_complete');
    await this.syncOrder(id, true);
    this.triggerNotify();
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
    this.triggerNotify();
    return res.data;
  };
  login = async (phone: string) => {
    const res = await this.apiService.login(phone);
    if (res.data.user) this.entityStore?.setUser({ ...res.data.user, isMe: true });
    return res.data;
  }
  getExternalUser = async (id: string) => {
    const res = await this.apiService.getUserProfile(id);
    if (res && res.data) {
        this.entityStore.setUser(res.data);
        return res.data;
    }
    return this.entityStore.getUser(id);
  }
  forceRefresh = () => {
    this.syncMap(true);
  }
  parseOrderText = async (text: string) => (await this.apiService.parseOrderText(text)).data;
}

export const mapEngine = new MapEngine();
export const orderOrchestrator = mapEngine;
