import { apiService } from './ApiService';
import { Order, OrderStatus } from '../types';

export { Order, OrderStatus };

// Simple cache for nearby orders
interface CacheEntry {
  data: Order[];
  timestamp: number;
  params: string;
}

let ordersCache: CacheEntry | null = null;
let inFlightRequest: { promise: Promise<Order[]>; params: string } | null = null;

const CACHE_TTL = 5000; // 5 seconds
const COORDINATE_PRECISION = 4; // ~11 meters at equator

export const OrderService = {
  async getNearbyOrders(lat: number, lng: number, radius: number = 50, minPrice?: number) {
    const paramsObj = {
      lat: parseFloat(lat.toFixed(COORDINATE_PRECISION)),
      lng: parseFloat(lng.toFixed(COORDINATE_PRECISION)),
      radius,
      minPrice,
      status: 'PENDING'
    };
    const paramsKey = JSON.stringify(paramsObj);

    // 1. Check in-flight requests (Deduplication)
    if (inFlightRequest && inFlightRequest.params === paramsKey) {
      console.log('[OrderService] Returning in-flight request for params:', paramsKey);
      return inFlightRequest.promise;
    }

    // 2. Check cache
    const now = Date.now();
    if (ordersCache && ordersCache.params === paramsKey && (now - ordersCache.timestamp) < CACHE_TTL) {
      console.log('[OrderService] Returning cached orders for params:', paramsKey);
      return ordersCache.data;
    }

    // 3. Perform new request
    console.log('[OrderService] Fetching new orders for params:', paramsKey);
    const fetchPromise = (async () => {
      try {
        const response = await apiService.getOrders(paramsObj);
        const data = response.data;

        // Update cache
        ordersCache = {
          data,
          timestamp: Date.now(),
          params: paramsKey
        };

        return data;
      } catch (error) {
        console.error('Error fetching nearby orders:', error);
        throw error;
      } finally {
        // Clear in-flight request
        if (inFlightRequest?.params === paramsKey) {
          inFlightRequest = null;
        }
      }
    })();

    inFlightRequest = { promise: fetchPromise, params: paramsKey };
    return fetchPromise;
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
