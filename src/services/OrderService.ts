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
let inFlightRequest: any = null;
let lastRequestParams: any = null;

const CACHE_TTL = 5000; // 5 seconds
const COORDINATE_PRECISION = 3; // ~110 meters at equator - enough for a "Gate"
const MIN_RADIUS_CHANGE = 2; // km
const MAX_LAT_DELTA_FOR_FETCH = 2.0; // Prevent fetch on extreme zoom out (entire country)
const MIN_LAT_DELTA_FOR_FETCH = 0.001; // Prevent fetch on extreme zoom in (one building)

export const OrderService = {
  async getNearbyOrders(params: { lat: number; lng: number; radius?: number; minPrice?: number; latDelta?: number }) {
    const { lat, lng, radius = 50, minPrice, latDelta } = params;

    // 1. Extreme Zoom Protection (Anti-Spam)
    if (latDelta !== undefined) {
      if (latDelta > MAX_LAT_DELTA_FOR_FETCH || latDelta < MIN_LAT_DELTA_FOR_FETCH) {
        console.log('[OrderService] Fetch blocked: extreme zoom level (delta:', latDelta, ')');
        return ordersCache?.data || [];
      }
    }

    // 2. Coordinate Rounding & Precision (Noise reduction)
    const roundedLat = parseFloat(lat.toFixed(COORDINATE_PRECISION));
    const roundedLng = parseFloat(lng.toFixed(COORDINATE_PRECISION));

    const paramsObj = {
      lat: roundedLat,
      lng: roundedLng,
      radius: Math.round(radius),
      minPrice,
      status: 'PENDING'
    };
    const paramsKey = JSON.stringify(paramsObj);

    // 3. Significance Threshold (Fetch Gate)
    if (lastRequestParams) {
      const latDiff = Math.abs(lastRequestParams.lat - roundedLat);
      const lngDiff = Math.abs(lastRequestParams.lng - roundedLng);
      const radDiff = Math.abs((lastRequestParams.radius || 0) - (paramsObj.radius || 0));

      // If change is too small, return cached or empty
      if (latDiff === 0 && lngDiff === 0 && radDiff < MIN_RADIUS_CHANGE && lastRequestParams.minPrice === minPrice) {
        console.log('[OrderService] Fetch Gate: change below threshold, ignoring request');
        return ordersCache?.data || [];
      }
    }

    // 4. Request Deduplication (In-flight)
    if (inFlightRequest) {
      if (inFlightRequest.params === paramsKey) {
        console.log('[OrderService] Returning in-flight request for params:', paramsKey);
        return inFlightRequest.promise;
      } else {
        // 5. Abort Stale Request (Abort previous if new one is different/more important)
        console.log('[OrderService] Aborting stale request');
        inFlightRequest.controller.abort();
        inFlightRequest = null;
      }
    }

    // 6. Cache Check
    const now = Date.now();
    if (ordersCache && ordersCache.params === paramsKey && (now - ordersCache.timestamp) < CACHE_TTL) {
      console.log('[OrderService] Returning cached orders for params:', paramsKey);
      return ordersCache.data;
    }

    // 7. Perform Request
    console.log('[OrderService] >>> PERFORMING API FETCH:', paramsKey);
    const controller = new AbortController();
    const fetchPromise = (async () => {
      try {
        const response = await apiService.getOrders(paramsObj, { signal: controller.signal });
        const data = response.data;

        ordersCache = {
          data,
          timestamp: Date.now(),
          params: paramsKey
        };
        lastRequestParams = paramsObj;

        return data;
      } catch (error: any) {
        if (error.name === 'CanceledError' || error.name === 'AbortError' || axiosIsCancel(error)) {
          console.log('[OrderService] Request aborted');
          return ordersCache?.data || [];
        }
        console.error('Error fetching orders:', error);
        throw error;
      } finally {
        if (inFlightRequest && inFlightRequest.params === paramsKey) {
          inFlightRequest = null;
        }
      }
    })();

    inFlightRequest = { promise: fetchPromise, params: paramsKey, controller };
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

function axiosIsCancel(value: any): boolean {
  return !!(value && value.__CANCEL__);
}
