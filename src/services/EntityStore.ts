import { Order } from '../types';

/**
 * EntityStore: Single Source of Truth for normalized data.
 * Features: Local memory persistence, Cache-first lookup.
 */
class EntityStore {
  private orders: Map<string, Order> = new Map();
  private users: Map<string, any> = new Map();

  // --- Orders ---

  setOrder(order: Order) {
    if (!order?.id) return;
    this.orders.set(order.id, order);

    // Auto-extract and store employer if present
    if ((order as any).employer) {
      this.setUser((order as any).employer);
    }
    // Auto-extract and store worker if present
    if ((order as any).worker) {
      this.setUser((order as any).worker);
    }
  }

  setOrders(orders: Order[]) {
    orders.forEach(o => this.setOrder(o));
  }

  getOrder(id: string): Order | undefined {
    return this.orders.get(id);
  }

  getAllOrders(): Order[] {
    return Array.from(this.orders.values());
  }

  // --- Users ---

  setUser(user: any) {
    if (!user?.id) return;
    this.users.set(user.id, user);
  }

  getUser(id: string): any | undefined {
    return this.users.get(id);
  }

  // --- Lifecycle ---

  clear() {
    this.orders.clear();
    this.users.clear();
  }
}

export const entityStore = new EntityStore();
