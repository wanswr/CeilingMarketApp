import { apiService } from './ApiService';

class OrderService {
  private currentRole: 'employer' | 'worker' = 'employer';

  async getOrders(filters: any = {}) {
    const response = await apiService.getOrders(filters);
    return response.data;
  }

  getCurrentRole(): 'employer' | 'worker' {
    return this.currentRole;
  }

  async setRole(role: 'employer' | 'worker') {
    this.currentRole = role;
    await apiService.updateProfile({ role: role.toUpperCase() });
  }

  async createOrder(data: any) {
    const response = await apiService.createOrder(data);
    return response.data;
  }

  async applyForOrder(orderId: string) {
    const response = await apiService.applyForOrder(orderId);
    return response.data;
  }

  async updateStatus(orderId: string, status: string) {
    const response = await apiService.updateOrderStatus(orderId, status.toUpperCase());
    return response.data;
  }
}

export const orderService = new OrderService();
