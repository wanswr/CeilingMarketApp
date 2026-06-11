import { Order } from '../types';
import { OrderService } from './OrderService';
import { GeoGridService } from './GeoGridService';

export interface ViewportRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

type OrderCallback = (orders: Order[]) => void;

/**
 * OrderOrchestrator: The central brain of the system.
 * Manages state, event firewalling, and coordinates data flow.
 */
class OrderOrchestrator {
  private orders: Order[] = [];
  private lastNormalizedRegion: ViewportRegion | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private subscribers: Set<OrderCallback> = new Set();
  private isLoading: boolean = false;

  /**
   * Subscribe to order updates.
   */
  subscribe(callback: OrderCallback) {
    this.subscribers.add(callback);
    callback(this.orders); // Initial push
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers() {
    this.subscribers.forEach(cb => cb(this.orders));
  }

  /**
   * Main entry point for map movement events.
   * Implements Event Firewall: Debounce, Validation, and Delta Check.
   */
  onViewportChange(region: ViewportRegion) {
    if (!region || !region.latitude) return;

    // 1. Delta Check: Only proceed if movement is significant (> 10% of viewport)
    if (this.lastNormalizedRegion) {
      const latDiff = Math.abs(this.lastNormalizedRegion.latitude - region.latitude);
      const lngDiff = Math.abs(this.lastNormalizedRegion.longitude - region.longitude);
      const threshold = this.lastNormalizedRegion.latitudeDelta * 0.1;

      if (latDiff < threshold && lngDiff < threshold) return;
    }

    // 2. Debounce (800ms)
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.fetchOrdersForRegion(region);
    }, 800);
  }

  private async fetchOrdersForRegion(region: ViewportRegion) {
    this.isLoading = true;
    try {
      const data = await OrderService.fetchOrders({
        lat: region.latitude,
        lng: region.longitude,
        latDelta: region.latitudeDelta,
        radius: 50 // Standard radius for most views
      });

      // Merge data: Prevent duplicates and keep state clean
      const existingIds = new Set(this.orders.map(o => o.id));
      const newOrders = data.filter(o => !existingIds.has(o.id));

      if (newOrders.length > 0) {
        this.orders = [...this.orders, ...newOrders];
        this.notifySubscribers();
      }

      this.lastNormalizedRegion = region;
    } catch (error) {
      console.error("[OrderOrchestrator] Error:", error);
    } finally {
      this.isLoading = false;
    }
  }

  getOrders() {
    return this.orders;
  }

  clearCache() {
    this.orders = [];
    this.lastNormalizedRegion = null;
    this.notifySubscribers();
  }

  getLoadingState() {
    return this.isLoading;
  }
}

export const orderOrchestrator = new OrderOrchestrator();
