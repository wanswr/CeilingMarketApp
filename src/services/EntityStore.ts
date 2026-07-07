import { Order, UserProfile } from '../types'
import { storageService } from './StorageService'
import { logger } from './logger/LoggerService'

/**
 * EntityStore V11: Normalized Single Source of Truth with Camera-Data Decoupling.
 * Modernized with StorageService (MMKV) for synchronous hydration.
 */

interface StoreMeta {
  lastUpdated: Map<string, number>;
  reads: number;
  writes: number;
  spatialSyncs: number;
  lastClusterTime?: number;
  lastSyncTime?: number;
}

class EntityStore {
  public ordersById: Map<string, Order> = new Map();
  public myOrders: Set<string> = new Set();
  public usersById: Map<string, UserProfile> = new Map();
  public seenEvents: Set<string> = new Set();

  private spatialGrid: Map<string, Set<string>> = new Map();
  public currentUserId: string | null = null;

  public loadedBounds: { north: number; south: number; east: number; west: number } | null = null;
  public isInitialLoaded = false;
  public isMyOrdersLoaded = false;

  public meta: StoreMeta = {
    lastUpdated: new Map(),
    reads: 0,
    writes: 0,
    spatialSyncs: 0
  };

  private readonly PERSISTENCE_KEY = 'entity_store_v11';

  constructor() {
    this.init();
  }

  private init() {
    this.hydrate();
  }

  setCurrentUserId(id: string | null) {
      if (this.currentUserId === id) return;
      this.currentUserId = id;
      logger.info('USER_CHANGED', { source: 'store', userId: id });
      this.recomputeMyOrders();
  }

  private recomputeMyOrders() {
      this.myOrders.clear();
      const myId = this.currentUserId;
      if (!myId) return;

      this.ordersById.forEach(order => {
          const isMeEmployer = order.employerId === myId;
          const isMeExecutor = order.executorId === myId;
          const isMeApplicant = order.applications?.some(a => a.executorId === myId);

          if (isMeEmployer || isMeExecutor || isMeApplicant) {
              this.myOrders.add(order.id);
          }
      });
      logger.debug('STORE_RECOMPUTE_MY_ORDERS', { source: 'store', count: this.myOrders.size });
  }

  private getCoords(order: any): { lat: number; lng: number } | null {
      const lat = Number(order.latitude ?? order.lat ?? order.coordinates?.latitude ?? order.location?.latitude);
      const lng = Number(order.longitude ?? order.lng ?? order.coordinates?.longitude ?? order.location?.longitude);
      if (isNaN(lat) || isNaN(lng)) return null;
      return { lat, lng };
  }

  setOrder = (order: Order, source: string = 'unknown') => {
    if (!order?.id) return;

    const existing = this.ordersById.get(order.id);

    // V11: Handle Partial Updates
    const incomingCoords = this.getCoords(order);
    const coords = incomingCoords || (existing ? this.getCoords(existing) : null);

    if (!coords) {
        logger.warn('STORE_SET_ORDER_FAILED: Missing coordinates', { source: 'store', orderId: order.id, source_orig: source });
        return;
    }

    // Deep merge applications
    let mergedApplications = order.applications;
    if (!mergedApplications && existing?.applications) {
        mergedApplications = existing.applications;
    } else if (mergedApplications && existing?.applications) {
        const appMap = new Map(existing.applications.map(a => [a.executorId, a]));
        mergedApplications.forEach(a => appMap.set(a.executorId, a));
        mergedApplications = Array.from(appMap.values());
    }

    const normalizedOrder = {
        ...order,
        latitude: coords.lat,
        longitude: coords.lng,
        lat: coords.lat,
        lng: coords.lng,
        applications: mergedApplications
    };

    const mergedOrder = existing ? { ...existing, ...normalizedOrder } : normalizedOrder as Order;

    if (existing === mergedOrder) return;

    if (existing && existing.status !== mergedOrder.status) {
        logger.info('ORDER_STATUS_TRANSITION', {
            source: 'store',
            orderId: order.id,
            old: existing.status,
            new: mergedOrder.status,
            trigger: source
        });
    } else if (!existing) {
        logger.debug('ORDER_ADDED_TO_STORE', { source: 'store', orderId: order.id, status: mergedOrder.status, trigger: source });
    }

    if (existing) {
        const oldCoords = this.getCoords(existing);
        if (oldCoords && (oldCoords.lat !== coords.lat || oldCoords.lng !== coords.lng)) {
            this.removeFromGrid(existing);
        }
    }
    this.ordersById.set(order.id, mergedOrder);
    this.updateOrderInGrid(mergedOrder);

    const myId = this.currentUserId;
    const isMeEmployer = !!(myId && mergedOrder.employerId === myId);
    const isMeExecutor = !!(myId && mergedOrder.executorId === myId);
    const isMeApplicant = !!(myId && mergedOrder.applications?.some((a: any) => a.executorId === myId));

    if (isMeEmployer || isMeExecutor || isMeApplicant) {
      this.myOrders.add(mergedOrder.id);
    } else {
      this.myOrders.delete(mergedOrder.id);
    }

    this.meta.writes++;
    this.persist();
  }

  removeOrder = (id: string, reason: string = 'unknown') => {
    const order = this.ordersById.get(id);
    if (order) {
        this.removeFromGrid(order);
    }
    logger.info('ORDER_REMOVED_FROM_STORE', { source: 'store', orderId: id, reason });
    this.ordersById.delete(id);
    this.myOrders.delete(id);
    this.meta.writes++;
    this.persist();
  }

  applyPatch = (patch: { created?: Order[], updated?: Order[], deleted?: string[] }, source: string = 'api_patch') => {
      if (patch.created) patch.created.forEach(o => this.setOrder(o, source));
      if (patch.updated) patch.updated.forEach(o => this.setOrder(o, source));
      if (patch.deleted) patch.deleted.forEach(id => this.removeOrder(id, source));
  }

  setOrders = (orders: Order[]) => {
      const incomingIds = new Set(orders.map(o => o.id));
      const myOrderIds = Array.from(this.myOrders);

      myOrderIds.forEach(id => {
          if (!incomingIds.has(id)) {
              this.removeOrder(id, 'sync_reconciliation');
          }
      });

      orders.forEach(o => this.setOrder(o, 'sync_reconciliation'));
      this.isMyOrdersLoaded = true;
      this.persist();
  }

  setUser = (user: UserProfile) => {
    const id = (user as any).id || user.uid;
    if (!id) return;
    const normalizedUser = { ...user, id, uid: id };

    if ((user as any).isMe) {
        this.setCurrentUserId(id);
    }

    this.usersById.set(id, normalizedUser);
  }

  getUser = (id: string): UserProfile | undefined => this.usersById.get(id);

  getCurrentUser = (): UserProfile | undefined => {
      if (!this.currentUserId) return undefined;
      return this.getUser(this.currentUserId);
  }

  getOrder = (id: string): Order | undefined => this.ordersById.get(id);
  getAllOrders = (): Order[] => Array.from(this.ordersById.values());
  getMyOrders = (): Order[] => Array.from(this.myOrders).map(id => this.ordersById.get(id)).filter(Boolean) as Order[];

  private updateOrderInGrid = (order: Order) => {
      const coords = this.getCoords(order);
      if (!coords) return;
      const key = `${Math.floor(coords.lat * 2)}:${Math.floor(coords.lng * 2)}`;
      if (!this.spatialGrid.has(key)) this.spatialGrid.set(key, new Set());
      this.spatialGrid.get(key)!.add(order.id);
  }

  private removeFromGrid = (order: Order) => {
      const coords = this.getCoords(order);
      if (!coords) return;
      const key = `${Math.floor(coords.lat * 2)}:${Math.floor(coords.lng * 2)}`;
      this.spatialGrid.get(key)?.delete(order.id);
  }

  getOrdersInBounds = (minLat: number, maxLat: number, minLng: number, maxLng: number): Order[] => {
      const startX = Math.floor(minLat * 2);
      const endX = Math.floor(maxLat * 2);
      const startY = Math.floor(minLng * 2);
      const endY = Math.floor(maxLng * 2);

      const resultIds = new Set<string>();
      for (let x = startX; x <= endX; x++) {
          for (let y = startY; y <= endY; y++) {
              const ids = this.spatialGrid.get(`${x}:${y}`);
              if (ids) ids.forEach(id => resultIds.add(id));
          }
      }

      return Array.from(resultIds)
          .map(id => this.ordersById.get(id))
          .filter(o => {
              if (!o) return false;
              const coords = this.getCoords(o);
              if (!coords) return false;
              return coords.lat >= minLat && coords.lat <= maxLat && coords.lng >= minLng && coords.lng <= maxLng;
          }) as Order[];
  }

  hydrate = () => {
    try {
      logger.debug('STORE_HYDRATE_START', { source: 'store' });
      const data = storageService.get<any>(this.PERSISTENCE_KEY);
      if (!data) {
          return false;
      }

      const CACHE_TTL = 30 * 60 * 1000;
      if (!data.updatedAt || Date.now() - data.updatedAt > CACHE_TTL) {
          logger.debug('STORE_HYDRATE_EXPIRED', { source: 'store' });
          storageService.delete(this.PERSISTENCE_KEY);
          return false;
      }

      if (data.loadedBounds) this.loadedBounds = data.loadedBounds;
      if (data.currentUserId) this.currentUserId = data.currentUserId;
      if (data.orders) {
          data.orders.forEach((o: Order) => {
              this.ordersById.set(o.id, o);
              this.updateOrderInGrid(o);
          });
          this.recomputeMyOrders();
      }
      if (data.seenEvents) {
          this.seenEvents = new Set(data.seenEvents);
      }
      logger.info('STORE_HYDRATED', { source: 'store', orders: data.orders?.length || 0 });
      return true;
    } catch (e) {
      return false;
    }
  }

  persist = () => {
    try {
      const data = {
        orders: Array.from(this.ordersById.values()),
        loadedBounds: this.loadedBounds,
        currentUserId: this.currentUserId,
        updatedAt: Date.now(),
        seenEvents: Array.from(this.seenEvents)
      };
      storageService.set(this.PERSISTENCE_KEY, data);
    } catch (e) {}
  }

  clear = () => {
    this.ordersById.clear();
    this.myOrders.clear();
    this.spatialGrid.clear();
    this.seenEvents.clear();
    this.isInitialLoaded = false;
    this.isMyOrdersLoaded = false;
    storageService.delete(this.PERSISTENCE_KEY);
    logger.info('STORE_CLEARED', { source: 'store' });
  }

  isEventSeen(eventId: string): boolean {
    return this.seenEvents.has(eventId);
  }

  markEventSeen(eventId: string) {
    this.seenEvents.add(eventId);
    if (this.seenEvents.size > 1000) {
        const oldest = this.seenEvents.values().next().value;
        if (oldest) this.seenEvents.delete(oldest);
    }
    this.persist();
  }
}

export const entityStore = new EntityStore();
