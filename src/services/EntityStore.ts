import { Order, UserProfile } from '../types'
import { logger } from './logger/LoggerService';
import { storageService } from './StorageService';


function simpleHash(str: string): string {
  if (!str) return 'none';
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).substring(0, 8);
}

class EntityStore {
  private readonly PERSISTENCE_KEY = 'entity_store_v11';
  private ordersById: Map<string, Order> = new Map();
  private usersById: Map<string, UserProfile> = new Map();
  private spatialGrid: Map<string, Set<string>> = new Map();
  private myOrders: Set<string> = new Set();
  private seenEvents: Set<string> = new Set();

  public currentUserId: string | null = null;
  public isInitialLoaded = false;
  public isMyOrdersLoaded = false;
  private reconcileVersion = 0;
  public loadedBounds: { north: number, south: number, east: number, west: number } | null = null;

  public meta = {
    writes: 0,
    reads: 0,
    lastSync: 0
  };

  private isHydratedFlag = false;

  getPersistenceKey() {
    return this.currentUserId ? `entity_store_v11_${this.currentUserId}` : 'entity_store_v11_anonymous';
  }

  setCurrentUserId(id: string) {
    if (this.currentUserId !== id) {
      logger.info('[EntityStore] User switched, re-initializing store...', { old: this.currentUserId, new: id });
      this.currentUserId = id;
      this.isHydratedFlag = false;
      this.ordersById.clear();
      this.myOrders.clear();
      this.spatialGrid.clear();
      this.seenEvents.clear();
      this.hydrate();
    }
  }

  private recomputeMyOrders() {
      this.myOrders.clear();
      const myId = this.currentUserId;
      if (!myId) return;

      this.ordersById.forEach(order => {
          const isMine = order.employerId === myId ||
                         order.executorId === myId ||
                         order.applications?.some((a: any) => a.executorId === myId);
          if (isMine) this.myOrders.add(order.id);
      });
  }

  private getCoords(order: any) {
      const lat = order.latitude ?? order.lat ?? order.coordinates?.latitude ?? order.location?.latitude;
      const lng = order.longitude ?? order.lng ?? order.coordinates?.longitude ?? order.location?.longitude;
      if (isNaN(lat) || isNaN(lng)) return null;
      return { lat, lng };
  }

  private readonly STATUS_PRIORITY: Record<string, number> = {
    'PENDING': 0,
    'PUBLISHED': 1,
    'HAS_RESPONSES': 1,
    'CLAIMED': 2,
    'IN_PROGRESS': 3,
    'COMPLETED': 4,
    'PARTIALLY_REVIEWED': 4,
    'REVIEWED': 4,
    'CANCELLED': 6,
    'DISPUTE': 6
  };

  setOrder = (order: Order, source: string = 'unknown') => {
    if (!order?.id) return;

    const existing = this.ordersById.get(order.id);

    if (existing) {
        const isIdentical =
          existing.status === order.status &&
          Number(existing.price) === Number(order.price) &&
          existing.title === order.title &&
          existing.description === order.description &&
          existing.workType === order.workType &&
          existing.executorId === order.executorId &&
          (existing.applications?.length || 0) === (order.applications?.length || 0);

        if (isIdentical) {
          logger.debug('DUPLICATE_ORDER_UPDATE_IGNORED', { orderId: order.id, status: order.status, source });
          return;
        }
    }

    if (existing && order.status) {
        const currentPrio = this.STATUS_PRIORITY[existing.status] || 0;
        const newPrio = this.STATUS_PRIORITY[order.status] || 0;
        if (newPrio < currentPrio) {
            logger.debug('STATUS_ROLLBACK_BLOCKED', { orderId: order.id, current: existing.status, incoming: order.status, source });
            return;
        }
    }

    const incomingCoords = this.getCoords(order);
    const coords = incomingCoords || (existing ? this.getCoords(existing) : null);

    if (!coords) return;

    let mergedApplications = order.applications;
    if (source === 'websocket' || source === 'api_sync') {
        mergedApplications = order.applications;
    } else {
        if (!mergedApplications && existing?.applications) {
            mergedApplications = existing.applications;
        } else if (mergedApplications && existing?.applications) {
            const appMap = new Map(existing.applications.map(a => [a.executorId, a]));
            mergedApplications.forEach(a => {
                const current = appMap.get(a.executorId);
                appMap.set(a.executorId, current ? { ...current, ...a } : a);
            });
            mergedApplications = Array.from(appMap.values());
        }
    }

    const executorId = order.executorId ?? existing?.executorId;
    const executor = order.executor ?? existing?.executor;

    const normalizedOrder = {
        ...order,
        latitude: coords.lat,
        longitude: coords.lng,
        lat: coords.lat,
        lng: coords.lng,
        executorId,
        executor,
        applications: mergedApplications
    };

    const mergedOrder = existing ? { ...existing, ...normalizedOrder } : normalizedOrder as Order;

    if (existing && existing.status !== mergedOrder.status) {
        logger.info('ORDER_STATUS_TRANSITION', { source: 'store', orderId: order.id, old: existing.status, new: mergedOrder.status, trigger: source as any });
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
    const isMine = !!(myId && (mergedOrder.employerId === myId || mergedOrder.executorId === myId || mergedOrder.applications?.some((a: any) => a.executorId === myId)));

    if (isMine) {
      this.myOrders.add(mergedOrder.id);
    } else {
      this.myOrders.delete(mergedOrder.id);
    }

    this.meta.writes++;
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
  }

  applyPatch = (patch: { created?: Order[], updated?: Order[], deleted?: string[] }, source: string = 'api_patch') => {
      if (patch.created) patch.created.forEach(o => this.setOrder(o, source));
      if (patch.updated) patch.updated.forEach(o => this.setOrder(o, source));
      if (patch.deleted) patch.deleted.forEach(id => this.removeOrder(id, source));
      this.enforceCacheLimit();
      this.persist();
  }

  /**
   * Reconcile orders based on source.
   * Spatial sync (map) should only add/update and NOT purge existing data.
   * 'my' sync should reconcile only the user's participation list.
   */
  setOrders = (orders: Order[], source: 'spatial' | 'my' = 'spatial') => {
      const incomingIds = new Set(orders.map(o => o.id));

      if (source === 'my') {
          const currentVersion = ++this.reconcileVersion;
          const currentMyOrders = Array.from(this.myOrders);

          const SecureStore = require('expo-secure-store');
          const { apiService } = require('./ApiService');

          (async () => {
              const token = await SecureStore.getItemAsync('userToken');
              const tokenHash = token ? simpleHash(token) : 'none';
              const myId = this.currentUserId || 'anonymous';

              logger.info('RECONCILE_DEBUG', {
                  userId: myId,
                  tokenHash,
                  timestamp: Date.now(),
                  endpoint: 'orders/my',
                  responseCount: orders.length,
                  reconcileVersion: currentVersion,
                  localCount: currentMyOrders.length
              });

              for (const id of currentMyOrders) {
                  if (!incomingIds.has(id)) {
                      try {
                          await apiService.getOrderDetails(id);
                          logger.debug('[EntityStore] Reconcile bypass: order still exists on server', { id, version: currentVersion });
                      } catch (err: any) {
                          // Check if a newer reconcile has preempted us!
                          if (currentVersion < this.reconcileVersion) {
                              logger.info('[EntityStore] Reconcile preempted and discarded', { old: currentVersion, current: this.reconcileVersion });
                              return;
                          }

                          if (err.response?.status === 404) {
                              logger.warn('[EntityStore] Reconcile: order confirmed deleted by server (404), removing', { id, version: currentVersion });
                              this.removeOrder(id, 'reconcile_my_orders');
                          } else {
                              logger.warn('[EntityStore] Reconcile: order fetch failed but not 404, keeping', { id, status: err.response?.status });
                          }
                      }
                  }
              }
          })();
      }

      orders.forEach(o => this.setOrder(o, `sync_${source}`));

      if (source === 'my') this.isMyOrdersLoaded = true;
      this.enforceCacheLimit();
      this.persist();
  }

  setUser = (user: UserProfile) => {
    const id = (user as any).id || user.uid;
    if (!id) return;
    const normalizedUser = { ...user, id, uid: id };
    if ((user as any).isMe) this.setCurrentUserId(id);
    this.usersById.set(id, normalizedUser);
  }

  getUser = (id: string): UserProfile | undefined => this.usersById.get(id);
  getCurrentUser = (): UserProfile | undefined => this.currentUserId ? this.getUser(this.currentUserId) : undefined;
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
      return Array.from(resultIds).map(id => this.ordersById.get(id)).filter(o => {
          if (!o) return false;
          const coords = this.getCoords(o);
          if (!coords) return false;
          return coords.lat >= minLat && coords.lat <= maxLat && coords.lng >= minLng && coords.lng <= maxLng;
      }) as Order[];
  }

  hydrate = () => {
    if (this.isHydratedFlag) return true;
    try {
      const key = this.getPersistenceKey();
      const data = storageService.get<any>(key);
      if (!data) return false;
      const CACHE_TTL = 30 * 60 * 1000;
      if (!data.updatedAt || Date.now() - data.updatedAt > CACHE_TTL) {
          storageService.delete(key);
          return false;
      }
      if (data.currentUserId) this.currentUserId = data.currentUserId;
      if (data.orders) {
          data.orders.forEach((o: Order) => {
              this.ordersById.set(o.id, o);
              this.updateOrderInGrid(o);
          });
          this.recomputeMyOrders();
      }
      if (data.seenEvents) this.seenEvents = new Set(data.seenEvents);
      this.isHydratedFlag = true;
      return true;
    } catch (e) { return false; }
  }

  private enforceCacheLimit() {
    const MAX_CACHED_ORDERS = 500;
    if (this.ordersById.size <= MAX_CACHED_ORDERS) return;

    const candidates: { id: string; updatedAt: number }[] = [];
    this.ordersById.forEach((order, id) => {
      if (!this.myOrders.has(id)) {
        const upd = order.updatedAt ? new Date(order.updatedAt).getTime() : 0;
        candidates.push({ id, updatedAt: upd });
      }
    });

    candidates.sort((a, b) => a.updatedAt - b.updatedAt);

    let toEvict = this.ordersById.size - MAX_CACHED_ORDERS;
    for (let i = 0; i < candidates.length && toEvict > 0; i++) {
      const candidateId = candidates[i].id;
      const order = this.ordersById.get(candidateId);
      if (order) {
        this.removeFromGrid(order);
      }
      this.ordersById.delete(candidateId);
      toEvict--;
    }
  }

  persist = () => {
    try {
      const key = this.getPersistenceKey();
      storageService.set(key, {
        orders: Array.from(this.ordersById.values()),
        currentUserId: this.currentUserId,
        updatedAt: Date.now(),
        seenEvents: Array.from(this.seenEvents)
      });
    } catch (e) {}
  }

  clearSpatialOrders = () => {
    const myOrderIds = new Set(this.myOrders);
    for (const key of this.ordersById.keys()) {
      if (!myOrderIds.has(key)) {
        this.ordersById.delete(key);
      }
    }
    this.spatialGrid.clear();
    this.ordersById.forEach(order => {
      this.updateOrderInGrid(order);
    });
    this.persist();
  }

  clear = () => {
    logger.info('[EntityStore] Clearing global session state and persistent storage...');
    this.ordersById.clear();
    this.myOrders.clear();
    this.spatialGrid.clear();
    this.seenEvents.clear();
    storageService.delete(this.getPersistenceKey());
    this.currentUserId = null;
    this.isHydratedFlag = false;
    this.isMyOrdersLoaded = false;
    this.isInitialLoaded = false;
    this.loadedBounds = null;
  }

  isEventSeen(eventId: string): boolean { return this.seenEvents.has(eventId); }
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
