import { Order, UserProfile } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * EntityStore V4: Normalized Single Source of Truth with Persistence.
 */

interface StoreMeta {
  lastUpdated: Map<string, number>;
  reads: number;
  writes: number;
  spatialSyncs: number;
}

/**
 * EntityStore V3: Fully Normalized Storage with O(1) Lookups.
 */
class EntityStore {
  // Stage 2: Normalized storage by ID
  public ordersById: Map<string, Order> = new Map();
  public myOrders: Set<string> = new Set();
  public usersById: Map<string, UserProfile> = new Map();
  public subscriptionsById: Map<string, any> = new Map();
  public reviewsById: Map<string, any> = new Map();
  public messagesById: Map<string, any> = new Map();

  // Task #3: Spatial Grid Index (for O(1) viewport filtering)
  private spatialGrid: Map<string, Set<string>> = new Map();

  private currentUserId: string | null = null;
  public loadedArea: { lat: number; lng: number; radius: number } | null = null;
  public isInitialLoaded = false;

  public meta: StoreMeta = {
    lastUpdated: new Map(),
    reads: 0,
    writes: 0,
    spatialSyncs: 0
  };

  private globalMeta: Map<string, string> = new Map();

  setMeta = (key: string, value: string) => {
    this.globalMeta.set(key, value);
  }

  getMeta = (key: string) => {
    return this.globalMeta.get(key);
  }

  private hasChanged = (existing: any, incoming: any): boolean => {
    if (!existing) return true;
    for (const key in incoming) {
      if (incoming[key] !== existing[key]) {
        if (typeof incoming[key] === 'object' && incoming[key] !== null) {
          if (JSON.stringify(incoming[key]) !== JSON.stringify(existing[key])) return true;
        } else {
          return true;
        }
      }
    }
    return false;
  }

  // Stage 2: Normalized setters
  setOrder = (order: Order) => {
    // Task #4: Defensive validation
    if (!order?.id) return;
    const lat = order.latitude ?? order.coordinates?.latitude ?? order.location?.latitude;
    const lng = order.longitude ?? order.coordinates?.longitude ?? order.location?.longitude;

    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
        if (__DEV__) console.warn(`[EntityStore] Rejecting order ${order.id} due to invalid coordinates`, { lat, lng });
        return;
    }

    const existing = this.ordersById.get(order.id);

    // V7 Hardening: Deep merge applications to prevent loss of "My Orders" status during partial status updates
    let mergedApplications = order.applications;
    if (!mergedApplications && existing?.applications) {
        mergedApplications = existing.applications;
    } else if (mergedApplications && existing?.applications) {
        // Simple merge by executorId
        const appMap = new Map(existing.applications.map(a => [a.executorId, a]));
        mergedApplications.forEach(a => appMap.set(a.executorId, a));
        mergedApplications = Array.from(appMap.values());
    }

    const mergedOrder = existing ? { ...existing, ...order, applications: mergedApplications } : { ...order, applications: mergedApplications };

    if (existing && !this.hasChanged(existing, mergedOrder)) return;

    const o = mergedOrder as any;

    if (o.employer && typeof o.employer === 'object') {
      this.setUser(o.employer);
    }

    if (o.executor && typeof o.executor === 'object') {
      this.setUser(o.executor);
    }

    const prevCount = this.ordersById.size;
    this.ordersById.set(o.id, mergedOrder);
    const newCount = this.ordersById.size;

    if (prevCount !== newCount) {
        console.log('ORDERS_COUNT_CHANGED', {
            previousCount: prevCount,
            newCount: newCount,
            reason: existing ? 'update_with_new_id' : 'new_order_added',
            orderId: o.id
        });
    }

    this.meta.lastUpdated.set(`order:${o.id}`, Date.now());
    this.meta.writes++;

    // My Orders Logic: persist "my orders" membership based on relations
    const isMeEmployer = o.employerId === this.currentUserId;
    const isMeExecutor = o.executorId === this.currentUserId;
    const isMeApplicant = o.applications?.some((a: any) => a.executorId === this.currentUserId);

    if (isMeEmployer || isMeExecutor || isMeApplicant) {
      if (!this.myOrders.has(o.id)) {
          this.myOrders.add(o.id);
          if (__DEV__) console.log(`[EntityStore] Order ${o.id} added to MyOrders. Reason:`, { isMeEmployer, isMeExecutor, isMeApplicant });
      }
    } else {
      if (this.myOrders.has(o.id)) {
          this.myOrders.delete(o.id);
          if (__DEV__) console.log(`[EntityStore] Order ${o.id} removed from MyOrders`);
      }
    }

    // Update Spatial Index
    this.updateOrderInGrid(mergedOrder);
  }

  removeOrder = (id: string) => {
    const order = this.ordersById.get(id);
    if (order) {
        const prevCount = this.ordersById.size;
        this.removeFromGrid(order);
        this.ordersById.delete(id);
        this.myOrders.delete(id);
        const newCount = this.ordersById.size;

        console.log('ORDERS_COUNT_CHANGED', {
            previousCount: prevCount,
            newCount: newCount,
            reason: 'order_removed',
            orderId: id
        });

        this.meta.writes++;
    }
  }

  setOrders = (orders: Order[]) => {
    orders.forEach(o => this.setOrder(o));
  }

  applyPatch = (patch: { created?: Order[], updated?: Order[], deleted?: string[] }) => {
      if (patch.created) patch.created.forEach(o => this.setOrder(o));
      if (patch.updated) patch.updated.forEach(o => this.setOrder(o));
      if (patch.deleted) patch.deleted.forEach(id => this.removeOrder(id));
  }

  setUser = (user: UserProfile) => {
    const id = (user as any).id || user.uid;
    if (!id) return;

    // Normalize user object to have both id and uid
    const normalizedUser = { ...user, id, uid: id };

    if ((user as any).isMe) {
        this.currentUserId = id;
        if (__DEV__) console.log('[EntityStore] Current User Set:', id);
    }

    const existing = this.usersById.get(id);
    if (existing && !this.hasChanged(existing, normalizedUser)) return;

    this.usersById.set(id, normalizedUser);
    this.meta.lastUpdated.set(`user:${id}`, Date.now());
    this.meta.writes++;
  }

  // Stage 2: O(1) Selectors
  getOrder = (id: string): Order | undefined => {
    this.meta.reads++;
    return this.ordersById.get(id);
  }

  getAllOrders = (): Order[] => {
    this.meta.reads++;
    return Array.from(this.ordersById.values());
  }

  getMyOrders = (): Order[] => {
    this.meta.reads++;
    return Array.from(this.myOrders)
      .map(id => this.ordersById.get(id))
      .filter(Boolean) as Order[];
  }

  /**
   * Spatial Grid Logic: Indexes orders into ~20km buckets.
   * V6 Hardening: Standardized coordinate extraction and key generation.
   */
  private getOrderCoords = (order: Order) => {
      const lat = order.latitude ?? (order as any).coordinates?.latitude ?? (order as any).location?.latitude;
      const lng = order.longitude ?? (order as any).coordinates?.longitude ?? (order as any).location?.longitude;
      return (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng))
        ? { lat, lng }
        : null;
  }

  private getGridKey = (lat: number, lng: number) => {
      const scale = 2; // ~50km grid size for coarse pre-filtering
      const x = Math.floor(lat * scale);
      const y = Math.floor(lng * scale);
      return `${x}:${y}`;
  }

  private updateOrderInGrid = (order: Order) => {
      const coords = this.getOrderCoords(order);
      if (!coords) return;

      const key = this.getGridKey(coords.lat, coords.lng);
      if (!this.spatialGrid.has(key)) this.spatialGrid.set(key, new Set());
      this.spatialGrid.get(key)!.add(order.id);
  }

  private removeFromGrid = (order: Order) => {
      const coords = this.getOrderCoords(order);
      if (!coords) return;
      const key = this.getGridKey(coords.lat, coords.lng);
      this.spatialGrid.get(key)?.delete(order.id);
  }

  /**
   * Viewport Query: Returns orders within specified bounds using the grid index.
   */
  getOrdersInBounds = (minLat: number, maxLat: number, minLng: number, maxLng: number): Order[] => {
      const scale = 2;
      const startX = Math.floor(minLat * scale);
      const endX = Math.floor(maxLat * scale);
      const startY = Math.floor(minLng * scale);
      const endY = Math.floor(maxLng * scale);

      const resultIds = new Set<string>();
      for (let x = startX; x <= endX; x++) {
          for (let y = startY; y <= endY; y++) {
              const ids = this.spatialGrid.get(`${x}:${y}`);
              if (ids) ids.forEach(id => resultIds.add(id));
          }
      }

      this.meta.reads++;
      const allOrdersInBounds = Array.from(resultIds)
          .map(id => this.ordersById.get(id))
          .filter(Boolean) as Order[];

      // Fine-grained filter to match exact viewport
      return allOrdersInBounds.filter(o => {
          const c = this.getOrderCoords(o);
          return c && c.lat >= minLat && c.lat <= maxLat && c.lng >= minLng && c.lng <= maxLng;
      });
  }


  getUser = (id: string): UserProfile | undefined => {
    this.meta.reads++;
    return this.usersById.get(id);
  }

  getCurrentUser = (): UserProfile | undefined => {
    this.meta.reads++;
    if (!this.currentUserId) return undefined;
    return this.usersById.get(this.currentUserId);
  }

  // --- Task #6: Diagnostics ---

  getMetrics = () => {
    return {
      storeReads: this.meta.reads,
      storeWrites: this.meta.writes,
      ordersCount: this.ordersById.size,
      usersCount: this.usersById.size,
      spatialSyncs: this.meta.spatialSyncs
    };
  }

  logDiagnostics = () => {
    if (__DEV__) {
      const { requestRouter } = require('./RequestRouter');
      const network = requestRouter?.getMetrics() || {};
      const store = this.getMetrics();

      const cacheSizeMb = ((store.ordersCount * 2) / 1024).toFixed(2);
      console.log('MapEngine diagnostics:', {
          loadedChunks: network.spatialChunksLoaded || 0,
          cacheHits: network.spatialCacheHits || 0,
          cacheMisses: network.spatialCacheMisses || 0,
          ordersInMemory: store.ordersCount,
          myOrders: this.myOrders.size,
          cacheSizeMb: `${cacheSizeMb} MB`
      });
    }
  }

  /**
   * Persistence Layer: Hydrate store from disk.
   */
  hydrate = async () => {
    const start = Date.now();
    try {
      const data = await AsyncStorage.getItem('entity_store_v4');
      if (!data) return false;

      const parsed = JSON.parse(data);
      if (parsed.loadedArea) {
          this.loadedArea = parsed.loadedArea;
          this.isInitialLoaded = true;
      }
      if (parsed.orders) {
          parsed.orders.forEach((o: Order) => {
              // Stale check: skip orders older than 24h if they aren't 'mine'
              const age = Date.now() - new Date(o.createdAt).getTime();
              const isMine = o.employerId === this.currentUserId || o.executorId === this.currentUserId;
              if (age < 86400000 || isMine) {
                  this.setOrder(o);
              }
          });
      }

      if (__DEV__) console.log(`[EntityStore] MAP CACHE RESTORE: ${this.ordersById.size} orders in ${Date.now() - start}ms`);
      return true;
    } catch (e) {
      console.error('[EntityStore] Hydration failed', e);
      return false;
    }
  }

  persist = async () => {
    try {
      const data = {
        orders: Array.from(this.ordersById.values()),
        loadedArea: this.loadedArea,
        updatedAt: Date.now()
      };
      await AsyncStorage.setItem('entity_store_v4', JSON.stringify(data));
    } catch (e) {
      console.error('[EntityStore] Persistence failed', e);
    }
  }

  clear = () => {
    this.ordersById.clear();
    this.myOrders.clear();
    this.usersById.clear();
    this.spatialGrid.clear();
    this.meta.lastUpdated.clear();
    this.meta.reads = 0;
    this.meta.writes = 0;
  }
}

export const entityStore = new EntityStore();
