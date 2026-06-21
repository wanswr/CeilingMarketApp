import { Order, UserProfile } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * EntityStore V9: Normalized Single Source of Truth with Camera-Data Decoupling.
 */

interface StoreMeta {
  lastUpdated: Map<string, number>;
  reads: number;
  writes: number;
  spatialSyncs: number;
  lastClusterTime?: number;
}

class EntityStore {
  public ordersById: Map<string, Order> = new Map();
  public myOrders: Set<string> = new Set();
  public usersById: Map<string, UserProfile> = new Map();

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

  constructor() {
      // Initialize with stable empty data
  }

  setCurrentUserId(id: string | null) {
      if (this.currentUserId === id) return;
      this.currentUserId = id;
      console.log('[EntityStore] currentUserId changed:', id);
      // Re-evaluate all orders for "My Orders" status when user identity is confirmed
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
      console.log('[EntityStore] MyOrders recomputed. Count:', this.myOrders.size);
  }

  setOrder = (order: Order) => {
    if (!order?.id) return;

    // Normalize coordinates - handle multiple common field names
    const lat = Number(order.latitude ?? (order as any).lat ?? (order as any).coordinates?.latitude ?? (order as any).location?.latitude);
    const lng = Number(order.longitude ?? (order as any).lng ?? (order as any).coordinates?.longitude ?? (order as any).location?.longitude);

    if (isNaN(lat) || isNaN(lng)) {
        return;
    }

    const existing = this.ordersById.get(order.id);

    // Deep merge applications to preserve state
    let mergedApplications = order.applications;
    if (!mergedApplications && existing?.applications) {
        mergedApplications = existing.applications;
    } else if (mergedApplications && existing?.applications) {
        const appMap = new Map(existing.applications.map(a => [a.executorId, a]));
        mergedApplications.forEach(a => appMap.set(a.executorId, a));
        mergedApplications = Array.from(appMap.values());
    }

    const mergedOrder = existing ? { ...existing, ...order, applications: mergedApplications } : { ...order, applications: mergedApplications };

    // Skip if no change (stable reference optimization)
    if (existing && JSON.stringify(existing) === JSON.stringify(mergedOrder)) return;

    this.ordersById.set(order.id, mergedOrder);
    this.updateOrderInGrid(mergedOrder);

    // Update My Orders membership
    const myId = this.currentUserId;
    const isMeEmployer = !!(myId && mergedOrder.employerId === myId);
    const isMeExecutor = !!(myId && mergedOrder.executorId === myId);
    const isMeApplicant = !!(myId && mergedOrder.applications?.some((a: any) => a.executorId === myId));

    if (isMeEmployer || isMeExecutor || isMeApplicant) {
      if (!this.myOrders.has(mergedOrder.id)) {
          console.log('ORDERS_COUNT_CHANGED', { previousCount: this.myOrders.size, newCount: this.myOrders.size + 1, reason: 'order_added_to_my', orderId: mergedOrder.id });
          this.myOrders.add(mergedOrder.id);
      }
    } else {
      if (this.myOrders.has(mergedOrder.id)) {
          console.log('ORDERS_COUNT_CHANGED', { previousCount: this.myOrders.size, newCount: this.myOrders.size - 1, reason: 'order_removed_from_my', orderId: mergedOrder.id });
          this.myOrders.delete(mergedOrder.id);
      }
    }

    this.meta.writes++;
  }

  removeOrder = (id: string) => {
    const order = this.ordersById.get(id);
    if (order) {
        this.removeFromGrid(order);
        this.ordersById.delete(id);
        if (this.myOrders.has(id)) {
            this.myOrders.delete(id);
        }
        this.meta.writes++;
        this.persist();
    }
  }

  applyPatch = (patch: { created?: Order[], updated?: Order[], deleted?: string[] }) => {
      if (patch.created) patch.created.forEach(o => this.setOrder(o));
      if (patch.updated) patch.updated.forEach(o => this.setOrder(o));
      if (patch.deleted) patch.deleted.forEach(id => this.removeOrder(id));
  }

  setOrders = (orders: Order[]) => {
      // V5: FULL RECONCILIATION
      // For "My Orders", if the API returns a list, it is the absolute truth.
      // We should remove any orders currently marked as "My Orders" that aren't in this list.
      const incomingIds = new Set(orders.map(o => o.id));
      const myOrderIds = Array.from(this.myOrders);

      myOrderIds.forEach(id => {
          if (!incomingIds.has(id)) {
              // It's no longer my order (deleted or role changed)
              this.removeOrder(id);
          }
      });

      orders.forEach(o => this.setOrder(o));
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
      const lat = Number(order.latitude ?? (order as any).lat ?? (order as any).coordinates?.latitude ?? (order as any).location?.latitude);
      const lng = Number(order.longitude ?? (order as any).lng ?? (order as any).coordinates?.longitude ?? (order as any).location?.longitude);
      const key = `${Math.floor(lat * 2)}:${Math.floor(lng * 2)}`;
      if (!this.spatialGrid.has(key)) this.spatialGrid.set(key, new Set());
      this.spatialGrid.get(key)!.add(order.id);
  }

  private removeFromGrid = (order: Order) => {
      const lat = Number(order.latitude ?? (order as any).lat ?? (order as any).coordinates?.latitude ?? (order as any).location?.latitude);
      const lng = Number(order.longitude ?? (order as any).lng ?? (order as any).coordinates?.longitude ?? (order as any).location?.longitude);
      const key = `${Math.floor(lat * 2)}:${Math.floor(lng * 2)}`;
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
              const lat = Number(o.latitude ?? (o as any).lat ?? (o as any).coordinates?.latitude ?? (o as any).location?.latitude);
              const lng = Number(o.longitude ?? (o as any).lng ?? (o as any).coordinates?.longitude ?? (o as any).location?.longitude);
              return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
          }) as Order[];
  }

  hydrate = async () => {
    try {
      // V5: Cache versioning. Clear old versions.
      await AsyncStorage.removeItem('entity_store_v4');

      const data = await AsyncStorage.getItem('entity_store_v5');
      if (!data) return false;
      const parsed = JSON.parse(data);

      // Strict Cache Verification: only use if updated in the last 30 minutes
      // This forces more frequent API refreshes while keeping app start snappy
      const CACHE_TTL = 30 * 60 * 1000;
      if (!parsed.updatedAt || Date.now() - parsed.updatedAt > CACHE_TTL) {
          console.log('[EntityStore] Cache expired');
          await AsyncStorage.removeItem('entity_store_v5');
          return false;
      }

      if (parsed.loadedBounds) this.loadedBounds = parsed.loadedBounds;
      if (parsed.orders) {
          // Hydrate but don't mark as "InitialLoaded" from cache alone
          // We want the first spatial fetch to still happen
          parsed.orders.forEach((o: Order) => this.setOrder(o));
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  persist = async () => {
    try {
      const data = {
        orders: Array.from(this.ordersById.values()),
        loadedBounds: this.loadedBounds,
        updatedAt: Date.now()
      };
      await AsyncStorage.setItem('entity_store_v5', JSON.stringify(data));
    } catch (e) {}
  }

  clear = () => {
    this.ordersById.clear();
    this.myOrders.clear();
    this.spatialGrid.clear();
  }
}

export const entityStore = new EntityStore();
