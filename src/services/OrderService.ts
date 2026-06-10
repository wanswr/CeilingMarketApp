import { apiService } from './ApiService';
import { Order, OrderStatus } from '../types';

export { Order, OrderStatus };

// --- Simplified Architecture: Load-All + Central Cache ---

let currentOrders: Order[] = [];
let isLoading = false;
const subscribers = new Set<(orders: Order[]) => void>();

export const OrderService = {
  /**
   * Subscribe to global order updates.
   */
  subscribe(callback: (orders: Order[]) => void) {
    subscribers.add(callback);
    callback(currentOrders);
    return () => subscribers.delete(callback);
  },

  notify() {
    subscribers.forEach(cb => cb(currentOrders));
  },

  /**
   * Fetches all active orders once.
   * No geo-bucketing, no movement triggers.
   */
  async fetchAllOrders() {
    if (isLoading) return;
    isLoading = true;
    console.log('[OrderService] Fetching all active orders...');

    try {
      // Fetch with status=PENDING and large radius to cover all regions
      const response = await apiService.getOrders({
        status: 'PENDING',
        radius: 1000 // Large radius for MVP to get all relevant orders
      });

      currentOrders = response.data;
      console.log(`[OrderService] Loaded ${currentOrders.length} orders.`);
      this.notify();
    } catch (error) {
      console.error('[OrderService] Failed to load orders:', error);
    } finally {
      isLoading = false;
    }
  },

  /**
   * Manual refresh trigger.
   */
  async refresh() {
    await this.fetchAllOrders();
  },

  // Statics / Single helpers
  async getOrderById(id: string) {
    return (await apiService.getOrderDetails(id)).data;
  },

  async createOrder(orderData: Partial<Order>) {
    const res = await apiService.createOrder(orderData);
    await this.refresh(); // Refresh local state after creation
    return res.data;
  },

  async applyForOrder(orderId: string) {
    return (await apiService.applyForOrder(orderId)).data;
  },

  async updateOrderStatus(orderId: string, status: OrderStatus) {
    const res = await apiService.updateOrder(orderId, { status });
    await this.refresh(); // Refresh local state after status change
    return res.data;
  }
};
