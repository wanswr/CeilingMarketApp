import { apiService } from './ApiService';
import { Order, OrderStatus } from '../types';

export { Order, OrderStatus };

// --- Simplified Pure Service: Fetch + Cache (Legacy Support for List View) ---

interface OrderParams {
  lat?: number;
  lng?: number;
  radius?: number;
  status?: string;
  minPrice?: number;
}

export const OrderService = {
  /**
   * Simple fetch for list view.
   * Note: MapScreen now bypasses this and uses OrderOrchestrator's single-load strategy.
   */
  async fetchOrders(params: OrderParams): Promise<Order[]> {
    try {
        const response = await apiService.getOrders(params);
        return response.data;
    } catch (error) {
        console.error("[OrderService] fetchOrders failed", error);
        return [];
    }
  },

  async getOrderById(id: string) {
    return (await apiService.getOrderDetails(id)).data;
  },

  async createOrder(orderData: Partial<Order>) {
    return (await apiService.createOrder(orderData)).data;
  },

  async applyForOrder(orderId: string) {
    return (await apiService.applyForOrder(orderId)).data;
  },

  async updateOrderStatus(orderId: string, status: OrderStatus) {
    return (await apiService.updateOrder(orderId, { status })).data;
  }
};
