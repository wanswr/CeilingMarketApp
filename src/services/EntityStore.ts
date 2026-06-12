import { Order, UserProfile } from '../types';

/**
 * EntityStore V2.1: Normalized Single Source of Truth.
 */

interface StoreMeta {
  lastUpdated: Map<string, number>;
  reads: number;
  writes: number;
}

class EntityStore {
  public users: Map<string, UserProfile> = new Map();
  public orders: Map<string, Order> = new Map();

  public meta: StoreMeta = {
    lastUpdated: new Map(),
    reads: 0,
    writes: 0
  };

  // --- Task #2: Normalization & Atomic Updates ---

  setOrder(order: Order) {
    if (!order?.id) return;

    // Normalize nested entities before storing the order
    const o = { ...order } as any;

    if (o.employer && typeof o.employer === 'object') {
      this.setUser(o.employer);
      // Optional: replace nested object with ID to keep store lean,
      // but usually we keep it for easier UI consumption if the backend sends it.
      // For now, we just ensure the User store is updated.
    }

    if (o.worker && typeof o.worker === 'object') {
      this.setUser(o.worker);
    }

    this.orders.set(order.id, order);
    this.meta.lastUpdated.set(`order:${order.id}`, Date.now());
    this.meta.writes++;
  }

  setOrders(orders: Order[]) {
    orders.forEach(o => this.setOrder(o));
  }

  setUser(user: UserProfile) {
    // Backend uses 'id' or 'uid' depending on context, we normalize to uid/id
    const id = (user as any).id || user.uid;
    if (!id) return;

    this.users.set(id, user);
    this.meta.lastUpdated.set(`user:${id}`, Date.now());
    this.meta.writes++;
  }

  // --- Task #3: Selectors (Partial implementation, moved to next step) ---

  getOrder(id: string): Order | undefined {
    this.meta.reads++;
    return this.orders.get(id);
  }

  getAllOrders(): Order[] {
    this.meta.reads++;
    return Array.from(this.orders.values());
  }

  getUser(id: string): UserProfile | undefined {
    this.meta.reads++;
    return this.users.get(id);
  }

  getCurrentUser(): UserProfile | undefined {
    this.meta.reads++;
    // In this app, we often store the current user profile with 'current' or by its UID
    // But typically we look it up from the AuthContext.
    // To satisfy the selector requirement here, we'll try to find a user with a specific flag or just provide the method.
    return Array.from(this.users.values()).find(u => (u as any).isMe);
  }

  // --- Task #6: Diagnostics ---

  getMetrics() {
    return {
      storeReads: this.meta.reads,
      storeWrites: this.meta.writes,
      ordersCount: this.orders.size,
      usersCount: this.users.size
    };
  }

  logDiagnostics() {
    if (__DEV__) {
      const { requestRouter } = require('./RequestRouter');
      console.log('[Diagnostics] EntityStore:', this.getMetrics());
      console.log('[Diagnostics] RequestRouter:', requestRouter.getMetrics());
    }
  }

  clear() {
    this.orders.clear();
    this.users.clear();
    this.meta.lastUpdated.clear();
    this.meta.reads = 0;
    this.meta.writes = 0;
  }
}

export const entityStore = new EntityStore();
