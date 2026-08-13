import { Order } from '../types'
import { apiService } from './ApiService'
import { requestRouter } from './RequestRouter'
import { entityStore } from './EntityStore'
import { GeoClusterService } from './GeoClusterService'
import { GeoGridService } from './GeoGridService'
import { spatialManager } from '../map/SpatialManager'
import { mapViewportStore } from './MapViewportStore'
import { logger } from './logger/LoggerService'
import { CONFIG } from '../constants/config'
import { useClientStore } from '../store/client.store'

type OrderCallback = (orders: Order[]) => void;


function simpleHash(str: string): string {
  if (!str) return 'none';
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).substring(0, 8);
}

class MapEngine {
  private cachedToken: string | null = null;
  private isTokenLoaded: boolean = false;

  setCachedToken = (token: string | null) => {
    this.cachedToken = token;
    this.isTokenLoaded = true;
  }

  getCachedToken = async (): Promise<string | null> => {
    if (!this.isTokenLoaded) {
      const SecureStore = require('expo-secure-store');
      this.cachedToken = await SecureStore.getItemAsync('userToken');
      this.isTokenLoaded = true;
    }
    return this.cachedToken;
  }

  private subscribers: Map<string, OrderCallback> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private syncLock: boolean = false;
  private queuedSync: { force: boolean, region: any } | null = null;
  private currentAbortController: AbortController | null = null;
  private requestCounter: number = 0;
  private lastSyncRegion: { latitude: number, longitude: number, latitudeDelta: number } | null = null;
  private searchRadius: number = CONFIG.INITIAL_SEARCH_RADIUS_KM;
  private dateFilter: string = 'all';

  setDateFilter = (filter: string) => {
    this.dateFilter = filter;
  }

  getDateFilter = () => {
    return this.dateFilter;
  }
  private lastGeoJoinKey: string | null = null;

  setSearchRadius = (radius: number) => {
    this.searchRadius = radius;
  }

  onDirectionChanged = (newCategoryId: string) => {
    logger.info('[MapEngine] Direction/category changed, performing full invalidation...', { newCategoryId });
    this.entityStore.clearSpatialOrders();
    this.requestRouter.clear();
    try {
      const { queryClient } = require('./QueryClient');
      queryClient.clear();
      logger.info('[MapEngine] React Query cache cleared successfully.');
    } catch (e: any) {
      logger.warn('[MapEngine] Failed to clear React Query cache:', e.message);
    }
    this.lastSyncRegion = null;
    this.forceRefresh();
    const region = mapViewportStore.getRegion();
    if (region) {
      this.updateSocketRoom(region, true);
    }
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
              this.updateSocketRoom(region);
              this.triggerMapUpdate(region);
          }, 'MapEngine_Core');
      }, 0);
  }

  updateSocketRoom(region: any, force: boolean = false) {
      if (!region) return;
      const activeRole = useClientStore.getState().activeRole;
      if (!activeRole) {
          logger.info('[MapEngine] updateSocketRoom bypassed - no active role');
          return;
      }

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
    const currentUser = this.getCurrentUser();
    const token = await this.getCachedToken();
    const tokenHash = token ? simpleHash(token) : 'none';
    const activeRole = useClientStore.getState().activeRole;
    const activeRoleReady = !!(currentUser && activeRole && token);

    const requestId = Math.random().toString(36).substring(7);
    const viewRegion = region || mapViewportStore.getRegion();
    const viewportHash = viewRegion ? `${viewRegion.latitude.toFixed(4)}_${viewRegion.longitude.toFixed(4)}_${viewRegion.latitudeDelta.toFixed(4)}` : 'none';
    const previousViewportHash = this.lastSyncRegion ? `${this.lastSyncRegion.latitude.toFixed(4)}_${this.lastSyncRegion.longitude.toFixed(4)}_${this.lastSyncRegion.latitudeDelta.toFixed(4)}` : 'none';

    logger.info('SYNC_START', {
        requestId,
        reason: force ? 'force_initial_load' : 'camera_movement_viewport_sync',
        viewportHash,
        previousViewportHash,
        force
    });

    if (!activeRoleReady) {
      logger.info('SYNC_BYPASS', { requestId, reason: 'active_role_not_ready' });
      return;
    }

    if (this.syncLock) {
      this.queuedSync = { force: force || (this.queuedSync?.force || false), region };
      logger.info('SYNC_QUEUED', { requestId, reason: 'sync_in_progress' });
      return;
    }
    this.syncLock = true;
    const syncStartTs = Date.now();

    try {
      const latDelta = viewRegion.latitudeDelta;
      const zoom = GeoGridService.getZoomLevel(latDelta);
      const activeCategoryId = currentUser?.activeCategoryId;

      const limit = 250;
      let cursorId: string | undefined = undefined;
      let allCreated: any[] = [];
      let pagesFetched = 0;
      const maxPages = 4; // Max 1000 orders total
      let source = 'cache';

      while (pagesFetched < maxPages) {
        const params: any = {
          limit,
        };

        if (activeCategoryId) {
          params.categoryId = activeCategoryId;
        }

        if (this.dateFilter && this.dateFilter !== 'all') {
          params.dateFilter = this.dateFilter;
        }

        const latPadding = viewRegion.latitudeDelta * 0.1;
        const lngPadding = viewRegion.longitudeDelta * 0.1;
        params.minLat = viewRegion.latitude - viewRegion.latitudeDelta / 2 - latPadding;
        params.maxLat = viewRegion.latitude + viewRegion.latitudeDelta / 2 + latPadding;
        params.minLng = viewRegion.longitude - viewRegion.longitudeDelta / 2 - lngPadding;
        params.maxLng = viewRegion.longitude + viewRegion.longitudeDelta / 2 + lngPadding;
        params.zoom = zoom;

        if (cursorId) {
          params.cursorId = cursorId;
        }

        const keyParts = ['map:spatial'];
        if (activeCategoryId) keyParts.push("dir:" + activeCategoryId);
        keyParts.push("bounds:" + params.minLat.toFixed(3) + ":" + params.maxLat.toFixed(3) + ":" + params.minLng.toFixed(3) + ":" + params.maxLng.toFixed(3));
        keyParts.push("zoom:" + zoom);
        if (params.dateFilter) keyParts.push("date:" + params.dateFilter);
        const routerKey = keyParts.join('_');

        const isCached = requestRouter.hasValidCache(routerKey, force ? 0 : 30000);

        if (!isCached && !cursorId) {
          source = 'network';
          logger.info('NETWORK_REQUEST', {
              requestId,
              endpoint: 'orders/spatial',
              routerKey
          });
        }

        const fetchStartTs = Date.now();
        const res: any = cursorId
          ? await this.apiService.getOrdersSpatial(params)
          : await this.requestRouter.request(routerKey, () => this.apiService.getOrdersSpatial(params), force ? 0 : 30000);

        if (!isCached && !cursorId) {
          logger.info('NETWORK_RESPONSE', {
              requestId,
              duration: Date.now() - fetchStartTs,
              count: res?.data?.created?.length || 0
          });
        }

        if (res && res.data) {
          const created: any[] = res.data.created;
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
        const realOrders = allCreated.filter(o => !o.isCluster);
        const clusters = allCreated.filter(o => o.isCluster);

        if (realOrders.length > 0) {
          this.entityStore.setOrders(realOrders, 'spatial');
        }

        if (clusters.length > 0) {
          const clusteredOrders = this.recalculateClusteredOrders(viewRegion);
          const seenIds = new Set(clusteredOrders.map(o => o.id));
          clusters.forEach(c => {
            if (!seenIds.has(c.id)) {
              clusteredOrders.push(c);
            }
          });
          this.lastClusteredOrders = clusteredOrders;
        }
      }

      this.lastSyncRegion = {
          latitude: viewRegion.latitude,
          longitude: viewRegion.longitude,
          latitudeDelta: viewRegion.latitudeDelta
      };
      this.triggerNotify();
      this.entityStore.persist();

      logger.info('SYNC_END', {
          requestId,
          source,
          duration: Date.now() - syncStartTs,
          totalEntities: allCreated.length
      });
    } catch (error: any) {
        if (error.name !== 'AbortError') logger.error('Map Sync Fail:', { error: error.message });
    } finally {
        this.syncLock = false;
        if (this.queuedSync) {
            const next = this.queuedSync;
            this.queuedSync = null;
            logger.info('SYNC_DEQUEUE', { reason: 'executing_queued_sync' });
            this.syncMap(next.force, next.region);
        }
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
    const currentUser = this.getCurrentUser();
    const activeCategoryId = currentUser?.activeCategoryId;

    const candidates = rawCandidates.filter((order: Order) => {
        if (activeCategoryId && order.categoryId && order.categoryId !== activeCategoryId) {
            return false;
        }

        // Filter by date
        if (this.dateFilter && this.dateFilter !== 'all') {
          const orderDate = new Date(order.date);
          const now = new Date();
          const diffTime = orderDate.getTime() - now.getTime();
          const diffDays = diffTime / (1000 * 60 * 60 * 24);

          if (this.dateFilter === 'today') {
            const isToday = orderDate.toDateString() === now.toDateString();
            if (!isToday) return false;
          } else if (this.dateFilter === '3days') {
            if (diffDays < -1 || diffDays > 3) return false;
          } else if (this.dateFilter === 'week') {
            if (diffDays < -1 || diffDays > 7) return false;
          }
        }

        const activeRole = useClientStore.getState().activeRole || 'WORKER';
        const isMineAsEmployer = !!myId && order.employerId === myId;
        const isMineAsWorker = !!myId && (
            order.executorId === myId ||
            order.applications?.some((a: any) => a.executorId === myId)
        );

        if (activeRole === 'EMPLOYER') {
            // Employer mode: only show my own orders as employer
            return isMineAsEmployer;
        } else {
            // Worker mode: show public orders OR my own orders as executor
            const isPublic = order.status === 'PUBLISHED' || order.status === 'HAS_RESPONSES';
            return isPublic || (isMineAsWorker && (order.status === 'CLAIMED' || order.status === 'IN_PROGRESS'));
        }
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
    const activeRole = useClientStore.getState().activeRole;
    if (!activeRole) {
        logger.info('[MapEngine] triggerMapUpdate bypassed - no active role');
        return;
    }
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

    // Invalidate request router cache
    this.requestRouter.clear();

    // Clean up cached spatial/other role orders from EntityStore
    this.entityStore.clearSpatialOrders();

    // Update local user with new role/profile details
    this.entityStore.setUser({ ...res.data, isMe: true });

    // Force socket room update depending on the new role
    const region = mapViewportStore.getRegion();
    if (role === 'EMPLOYER') {
        const { socketService } = require('./SocketService');
        const socket = socketService.getSocket();
        if (socket?.connected) {
            socket.emit('geo.join', {
                lat: 0,
                lng: 0,
                clear: true
            });
            this.lastGeoJoinKey = 'employer_clear';
        }
    } else if (region) {
        this.updateSocketRoom(region, true);
    }

    // Force a fresh sync of the map using the new role's context
    this.lastSyncRegion = null;
    this.syncMap(true);

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
