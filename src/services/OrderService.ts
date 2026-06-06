import { apiService } from './ApiService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type OrderStatus = 'pending' | 'accepted' | 'started' | 'finished' | 'completed' | 'cancelled';

export interface Order {
  id: string;
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  price: number;
  details: string;
  date: string;
  status: OrderStatus;
  employerId: string;
  workerId?: string;
  distance?: number;
}

export const OrderService = {
  async getNearbyOrders(lat: number, lng: number, radius: number = 50) {
    try {
      const response = await apiService.getOrders({ lat, lng, radius, status: 'PENDING' });
      return response.data;
    } catch (error) {
      console.error('Error fetching nearby orders:', error);
      throw error;
    }
  },

  async getOrderById(id: string) {
    try {
      const response = await apiService.getOrderDetails(id);
      return response.data;
    } catch (error) {
      console.error('Error fetching order details:', error);
      throw error;
    }
  },

  async createOrder(orderData: Partial<Order>) {
    try {
      const response = await apiService.createOrder(orderData);
      return response.data;
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  },

  async applyForOrder(orderId: string) {
    try {
      const response = await apiService.applyForOrder(orderId);
      return response.data;
    } catch (error) {
      console.error('Error applying for order:', error);
      throw error;
    }
  },

  async updateOrderStatus(orderId: string, status: OrderStatus) {
    try {
      const response = await apiService.updateOrder(orderId, { status });
      return response.data;
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  }
};
