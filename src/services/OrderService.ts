import { apiService } from './ApiService';
import { Order, OrderStatus } from '../types';

export { Order, OrderStatus };

// --- Architecture: Central Fetch Gate + Geo Bucketing ---

interface FetchRequest {
  lat: number;
  lng: number;
  radius: number;
  minPrice?: number;
  status?: string;
}

interface CacheEntry {
  data: Order[];
  timestamp: number;
}

// Internal State
let ordersCache: Record<string, CacheEntry> = {};
let inFlightRequest: { controller: AbortController; key: string } | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let currentOrders: Order[] = [];
const subscribers = new Set<(orders: Order[]) => void>();

// Configuration
const CACHE_TTL = 15000; // 15 seconds for geo-bucket
const DEBOUNCE_MS = 800;
const GEO_PRECISION = 2; // ~1.1km grid size

/**
 * Generates a stable bucket key based on normalized coordinates and parameters.
 * This ensures that minor movements within the same bucket don't trigger new fetches.
 */
const getGeoBucketKey = (req: FetchRequest): string => {
  const bucketLat = Math.floor(req.lat * Math.pow(10, GEO_PRECISION));
  const bucketLng = Math.floor(req.lng * Math.pow(10, GEO_PRECISION));
  return `geo_${bucketLat}_${bucketLng}_rad${req.radius}_price${req.minPrice || 0}_status${req.status || 'PENDING'}`;
};

export const OrderService = {
  /**
   * UI components subscribe to this to receive the latest orders.
   */
  subscribe(callback: (orders: Order[]) => void) {
    subscribers.add(callback);
    callback(currentOrders);
    return () => subscribers.delete(callback);
  },

  /**
   * Notifies all subscribers of new data.
   */
  privateNotify(orders: Order[]) {
    currentOrders = orders;
    subscribers.forEach(cb => cb(orders));
  },

  /**
   * CENTRAL FETCH GATE: Entry point for all UI request events.
   * Handles debouncing, deduplication, bucketing, and abortion.
   */
  emitFetchRequest(params: FetchRequest) {
    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      this.executeFetch(params);
    }, DEBOUNCE_MS);
  },

  async executeFetch(params: FetchRequest) {
    const geoKey = getGeoBucketKey(params);
    const now = Date.now();

    // 1. Check Cache (Bucket level)
    if (ordersCache[geoKey] && (now - ordersCache[geoKey].timestamp) < CACHE_TTL) {
      console.log(`[OrderService] Cache Hit for bucket: ${geoKey}`);
      this.privateNotify(ordersCache[geoKey].data);
      return;
    }

    // 2. Manage In-Flight / Race Conditions
    if (inFlightRequest) {
      if (inFlightRequest.key === geoKey) {
        console.log(`[OrderService] Deduplicating request for bucket: ${geoKey}`);
        return; // Already fetching this bucket
      }
      console.log(`[OrderService] Aborting stale request for bucket: ${inFlightRequest.key}`);
      inFlightRequest.controller.abort();
    }

    // 3. Perform Network Fetch
    console.log(`[OrderService] >>> FETCHING NEW BUCKET: ${geoKey}`);
    const controller = new AbortController();
    inFlightRequest = { controller, key: geoKey };

    try {
      const apiParams = {
        lat: params.lat,
        lng: params.lng,
        radius: params.radius,
        minPrice: params.minPrice,
        status: params.status || 'PENDING'
      };

      const response = await apiService.getOrders(apiParams, { signal: controller.signal });
      const data = response.data;

      // Update Cache
      ordersCache[geoKey] = {
        data,
        timestamp: Date.now()
      };

      this.privateNotify(data);
    } catch (error: any) {
      if (error.name === 'CanceledError' || error.name === 'AbortError' || (error && error.__CANCEL__)) {
        console.log(`[OrderService] Request for ${geoKey} was aborted.`);
      } else {
        console.error('[OrderService] Fetch error:', error);
      }
    } finally {
      if (inFlightRequest?.key === geoKey) {
        inFlightRequest = null;
      }
    }
  },

  // Legacy/Direct helper (if needed for one-off tasks, but emitFetchRequest is preferred)
  async getNearbyOrders(params: FetchRequest) {
    this.emitFetchRequest(params);
    return currentOrders;
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
