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
    if (!order?.id) return;

    const existing = this.ordersById.get(order.id);
    if (!this.hasChanged(existing, order)) return;

    const o = { ...order } as any;

    if (o.employer && typeof o.employer === 'object') {
      this.setUser(o.employer);
    }

    if (o.worker && typeof o.worker === 'object') {
      this.setUser(o.worker);
    }

    this.ordersById.set(order.id, order);
    this.meta.lastUpdated.set(`order:${order.id}`, Date.now());
    this.meta.writes++;

    // Update Spatial Index
    this.updateOrderInGrid(order);
  }

  removeOrder = (id: string) => {
    const order = this.ordersById.get(id);
    if (order) {
        this.removeFromGrid(order);
        this.ordersById.delete(id);
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

  /**
   * Spatial Grid Logic: Indexes orders into ~5km buckets.
   */
  private getGridKey = (lat: number, lng: number) => {
      const scale = 5; // ~20km grid size for coarse filtering
      const x = Math.floor(lat * scale);
      const y = Math.floor(lng * scale);
      return `${x}:${y}`;
  }

  private updateOrderInGrid = (order: Order) => {
      const lat = order.latitude ?? order.coordinates?.latitude ?? order.location?.latitude;
      const lng = order.longitude ?? order.coordinates?.longitude ?? order.location?.longitude;
      if (typeof lat !== 'number') return;

      const key = this.getGridKey(lat, lng);
      if (!this.spatialGrid.has(key)) this.spatialGrid.set(key, new Set());
      this.spatialGrid.get(key)!.add(order.id);
  }

  private removeFromGrid = (order: Order) => {
      const lat = order.latitude ?? order.coordinates?.latitude ?? order.location?.latitude;
      const lng = order.longitude ?? order.coordinates?.longitude ?? order.location?.longitude;
      if (typeof lat !== 'number') return;
      const key = this.getGridKey(lat, lng);
      this.spatialGrid.get(key)?.delete(order.id);
  }

  /**
   * Viewport Query: Returns orders within specified bounds using the grid index.
   */
  getOrdersInBounds = (minLat: number, maxLat: number, minLng: number, maxLng: number): Order[] => {
      const scale = 5;
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
      return Array.from(resultIds)
          .map(id => this.ordersById.get(id))
          .filter(Boolean) as Order[];
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
    this.usersById.clear();
    this.spatialGrid.clear();
    this.meta.lastUpdated.clear();
    this.meta.reads = 0;
    this.meta.writes = 0;
  }
}

export const entityStore = new EntityStore();
