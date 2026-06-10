import { apiService } from './ApiService';
import { Order, OrderStatus } from '../types';

export { Order, OrderStatus };

// --- Architecture: Central Dispatcher (Single Brain) + Zoom-Aware Bucketing ---

export type OrderEvent = 'regionChanged' | 'screenFocused';

interface FetchRequest {
  lat: number;
  lng: number;
  radius: number;
  latDelta: number;
  minPrice?: number;
  status?: string;
}

interface CacheEntry {
  data: Order[];
  timestamp: number;
}

// Internal State (The "Brain")
let ordersCache: Record<string, CacheEntry> = {};
let inFlightRequest: { controller: AbortController; key: string } | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let currentOrders: Order[] = [];
let pendingRequest: FetchRequest | null = null;
const subscribers = new Set<(orders: Order[]) => void>();

// Configuration
const CACHE_TTL = 30000; // 30 seconds for stable buckets
const DEBOUNCE_MS = 1000; // 1s cooldown for coalescing

/**
 * Zoom-Aware Grid System.
 * Higher delta (zoomed out) -> lower precision (bigger bucket).
 */
const getPrecision = (latDelta: number): number => {
  if (latDelta > 1.0) return 0;   // ~111km grid (extreme zoom out)
  if (latDelta > 0.2) return 1;   // ~11km grid
  if (latDelta > 0.05) return 2;  // ~1.1km grid
  return 3;                      // ~110m grid (zoomed in)
};

const getGeoBucketKey = (req: FetchRequest): string => {
  const precision = getPrecision(req.latDelta);
  const factor = Math.pow(10, precision);
  const bucketLat = Math.floor(req.lat * factor);
  const bucketLng = Math.floor(req.lng * factor);

  return `grid${precision}_${bucketLat}_${bucketLng}_rad${req.radius}_price${req.minPrice || 0}_status${req.status || 'PENDING'}`;
};

export const OrderService = {
  /**
   * Only way for UI to interact with data.
   */
  subscribe(callback: (orders: Order[]) => void) {
    subscribers.add(callback);
    callback(currentOrders);
    return () => subscribers.delete(callback);
  },

  /**
   * UI Dispatcher: "Single Dispatcher" principle.
   */
  emit(event: OrderEvent, params: FetchRequest) {
    console.log(`[OrderService] Event received: ${event}`);

    // Coalescing Layer: Merge events into a single pending request
    pendingRequest = params;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (pendingRequest) {
        this.processQueue(pendingRequest);
        pendingRequest = null;
      }
    }, DEBOUNCE_MS);
  },

  async processQueue(params: FetchRequest) {
    const geoKey = getGeoBucketKey(params);
    const now = Date.now();

    // 1. Bucket Cache Hit
    if (ordersCache[geoKey] && (now - ordersCache[geoKey].timestamp) < CACHE_TTL) {
      console.log(`[OrderService] Cache Hit (Bucket: ${geoKey})`);
      this.notify(ordersCache[geoKey].data);
      return;
    }

    // 2. Request Coalescing / Abort Stale
    if (inFlightRequest) {
      if (inFlightRequest.key === geoKey) {
        console.log(`[OrderService] Request already in progress for bucket: ${geoKey}`);
        return;
      }
      console.log(`[OrderService] Aborting stale bucket fetch: ${inFlightRequest.key}`);
      inFlightRequest.controller.abort();
    }

    // 3. Network Execution
    console.log(`[OrderService] >>> DISPATCHING API FETCH: ${geoKey}`);
    const controller = new AbortController();
    inFlightRequest = { controller, key: geoKey };

    try {
      const response = await apiService.getOrders({
        lat: params.lat,
        lng: params.lng,
        radius: params.radius,
        minPrice: params.minPrice,
        status: params.status || 'PENDING'
      }, { signal: controller.signal });

      const data = response.data;

      // Update Cache
      ordersCache[geoKey] = { data, timestamp: Date.now() };
      this.notify(data);

    } catch (error: any) {
      if (error.name === 'CanceledError' || error.name === 'AbortError' || error?.__CANCEL__) {
        console.log(`[OrderService] Fetch aborted for bucket ${geoKey}`);
      } else {
        console.error('[OrderService] Fatal fetch error:', error);
      }
    } finally {
      if (inFlightRequest?.key === geoKey) inFlightRequest = null;
    }
  },

  notify(orders: Order[]) {
    currentOrders = orders;
    subscribers.forEach(cb => cb(orders));
  },

  // Stateless helpers
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
