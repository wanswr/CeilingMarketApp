import { Order, UserProfile } from '../types';

/**
 * EntityStore V2.1: Normalized Single Source of Truth.
 */

interface StoreMeta {
  lastUpdated: Map<string, number>;
  reads: number;
  writes: number;
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
  public tilesToOrders: Map<string, Set<string>> = new Map(); // Stage 1: Tile mapping

  private currentUserId: string | null = null;

  public meta: StoreMeta = {
    lastUpdated: new Map(),
    reads: 0,
    writes: 0
  };

  private globalMeta: Map<string, string> = new Map();

  setMeta(key: string, value: string) {
    this.globalMeta.set(key, value);
  }

  getMeta(key: string) {
    return this.globalMeta.get(key);
  }

  private hasChanged(existing: any, incoming: any): boolean {
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
  setOrder(order: Order) {
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

    // Stage 1: Map to tile if coordinates present
    const { GeoGridService } = require('./GeoGridService');
    const lat = order.latitude ?? order.coordinates?.latitude ?? order.location?.latitude;
    const lng = order.longitude ?? order.coordinates?.longitude ?? order.location?.longitude;

    if (typeof lat === 'number' && typeof lng === 'number') {
      const zoom = 14; // Default indexing zoom
      const tileKey = GeoGridService.getTileKey(lat, lng, zoom);
      if (!this.tilesToOrders.has(tileKey)) this.tilesToOrders.set(tileKey, new Set());
      this.tilesToOrders.get(tileKey)!.add(order.id);
    }
  }

  setOrders(orders: Order[]) {
    orders.forEach(o => this.setOrder(o));
  }

  setUser(user: UserProfile) {
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
  getOrder(id: string): Order | undefined {
    this.meta.reads++;
    return this.ordersById.get(id);
  }

  getAllOrders(): Order[] {
    this.meta.reads++;
    return Array.from(this.ordersById.values());
  }

  getOrdersInTile(tileKey: string): Order[] {
    const ids = this.tilesToOrders.get(tileKey);
    if (!ids) return [];
    return Array.from(ids).map(id => this.ordersById.get(id)).filter(Boolean) as Order[];
  }

  getUser(id: string): UserProfile | undefined {
    this.meta.reads++;
    return this.usersById.get(id);
  }

  getCurrentUser(): UserProfile | undefined {
    this.meta.reads++;
    if (!this.currentUserId) return undefined;
    return this.usersById.get(this.currentUserId);
  }

  // --- Task #6: Diagnostics ---

  getMetrics() {
    return {
      storeReads: this.meta.reads,
      storeWrites: this.meta.writes,
      ordersCount: this.ordersById.size,
      usersCount: this.usersById.size,
      tilesCount: this.tilesToOrders.size
    };
  }

  logDiagnostics() {
    if (__DEV__) {
      const { requestRouter } = require('./RequestRouter');
      console.log('[Diagnostics] EntityStore V3:', this.getMetrics());
      console.log('[Diagnostics] RequestRouter:', requestRouter.getMetrics());
    }
  }

  clear() {
    this.ordersById.clear();
    this.usersById.clear();
    this.tilesToOrders.clear();
    this.meta.lastUpdated.clear();
    this.meta.reads = 0;
    this.meta.writes = 0;
  }
}

export const entityStore = new EntityStore();
