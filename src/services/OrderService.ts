import { apiService } from './ApiService';
import { Order, OrderStatus } from '../types';
import { GeoGridService } from './GeoGridService';

export { Order, OrderStatus };

// --- Simplified Pure Service: Fetch + Cache ---

interface OrderParams {
  lat: number;
  lng: number;
  radius?: number;
  status?: string;
  minPrice?: number;
  latDelta: number; // Required for bucket key generation
}

interface CacheEntry {
  data: Order[];
  timestamp: number;
}

const ordersCache: Record<string, CacheEntry> = {};
let inFlightRequest: { controller: AbortController; key: string; promise: Promise<Order[]> } | null = null;

const CACHE_TTL = 30000; // 30 seconds

/**
 * Deterministic bucket key generator using GeoGrid.
 */
const getBucketKey = (params: OrderParams): string => {
  const gridKey = GeoGridService.getGridKey(params.lat, params.lng, params.latDelta);
  return `geo_${gridKey}_s${params.status || 'PENDING'}_p${params.minPrice || 0}`;
};

export const OrderService = {
  /**
   * Pure fetch with deterministic caching and abortion.
   */
  async fetchOrders(params: OrderParams): Promise<Order[]> {
    const key = getBucketKey(params);
    const now = Date.now();

    // 1. Check Cache
    if (ordersCache[key] && (now - ordersCache[key].timestamp) < CACHE_TTL) {
      console.log(`[OrderService] Cache Hit: ${key}`);
      return ordersCache[key].data;
    }

    // 2. Handle In-Flight / Deduplication
    if (inFlightRequest && inFlightRequest.key === key) {
      console.log(`[OrderService] Joining in-flight request: ${key}`);
      return inFlightRequest.promise;
    }

    // 3. Abort previous if it was different
    if (inFlightRequest) {
      console.log(`[OrderService] Aborting stale request: ${inFlightRequest.key}`);
      inFlightRequest.controller.abort();
    }

    return this.performFetch(params, key);
  },

  async performFetch(params: OrderParams, key: string): Promise<Order[]> {
    const controller = new AbortController();

    const fetchPromise = (async () => {
      try {
        console.log(`[OrderService] >>> API FETCH: ${key}`);
        const response = await apiService.getOrders(params, { signal: controller.signal });
        const data = response.data;

        // Cleanup old cache entries (simple LRU-like)
        const cacheKeys = Object.keys(ordersCache);
        if (cacheKeys.length > 20) {
            delete ordersCache[cacheKeys[0]];
        }

        // Update Cache
        ordersCache[key] = { data, timestamp: Date.now() };
        return data;
      } catch (error: any) {
        if (error.name === 'AbortError' || error.name === 'CanceledError' || error?.__CANCEL__) {
          console.log(`[OrderService] Fetch aborted: ${key}`);
          return [];
        }
        throw error;
      } finally {
        if (inFlightRequest?.key === key) inFlightRequest = null;
      }
    })();

    inFlightRequest = { controller, key, promise: fetchPromise };
    return fetchPromise;
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
