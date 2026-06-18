import { Order, UserProfile } from '../types';

/**
 * EntityStore V2.1: Normalized Single Source of Truth.
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

    // Merge new data with existing to support partial updates via WebSockets
    const mergedOrder = existing ? { ...existing, ...order } : order;

    if (existing && !this.hasChanged(existing, mergedOrder)) return;

    const o = mergedOrder as any;

    if (o.employer && typeof o.employer === 'object') {
      this.setUser(o.employer);
    }

    if (o.executor && typeof o.executor === 'object') {
      this.setUser(o.executor);
    }

    this.ordersById.set(o.id, mergedOrder);
    this.meta.lastUpdated.set(`order:${o.id}`, Date.now());
    this.meta.writes++;

    // My Orders Logic: persist "my orders" membership based on relations
    const isMeEmployer = o.employerId === this.currentUserId;
    const isMeExecutor = o.executorId === this.currentUserId;
    const isMeApplicant = o.applications?.some((a: any) => a.executorId === this.currentUserId);

    if (isMeEmployer || isMeExecutor || isMeApplicant) {
      this.myOrders.add(o.id);
    } else {
      // ONLY delete if we are SURE it's not mine anymore (i.e. all relations are checked and false)
      // If o.applications is missing in a partial update, we don't know for sure, so we keep it if it was already there.
      if (existing && (order as any).applications === undefined && this.myOrders.has(o.id)) {
          // Keep it
      } else {
          this.myOrders.delete(o.id);
      }
    }

    // Update Spatial Index
    this.updateOrderInGrid(order);
  }

  removeOrder = (id: string) => {
    const order = this.ordersById.get(id);
    if (order) {
        this.removeFromGrid(order);
        this.ordersById.delete(id);
        this.myOrders.delete(id);
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

    if ((user as any).isMe) this.currentUserId = id;

    const existing = this.usersById.get(id);
    if (!this.hasChanged(existing, user)) return;

    this.usersById.set(id, user);
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
          cacheSizeMb: `${cacheSizeMb} MB`
      });
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
