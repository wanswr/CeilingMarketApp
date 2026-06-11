import { Order } from '../types';
import { apiService } from './ApiService';

export interface ViewportRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

type OrderCallback = (orders: Order[]) => void;

/**
 * OrderOrchestrator: Single-Load Map Strategy.
 * Fetches all active orders once and maintains them in local memory.
 */
class OrderOrchestrator {
  private orders: Order[] = [];
  private isInitialLoadDone: boolean = false;
  private isLoading: boolean = false;
  private subscribers: Set<OrderCallback> = new Set();

  /**
   * Subscribe to order updates.
   */
  subscribe(callback: OrderCallback) {
    this.subscribers.add(callback);
    callback(this.orders); // Push current state
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers() {
    this.subscribers.forEach(cb => cb(this.orders));
  }

  /**
   * Triggers the single-load fetch if not already done.
   */
  async loadMapData() {
    if (this.isInitialLoadDone || this.isLoading) {
      console.log(`[OrderOrchestrator] SKIPPING LOAD: already loaded=${this.isInitialLoadDone}, loading=${this.isLoading}`);
      return;
    }

    console.log('[OrderOrchestrator] >>> INITIAL MAP LOAD: Starting...');
    this.isLoading = true;
    try {
      const response = await apiService.getMapOrders();
      this.orders = response.data;
      this.isInitialLoadDone = true;
      console.log(`[OrderOrchestrator] >>> INITIAL MAP LOAD: SUCCESS. Loaded ${this.orders.length} orders.`);
      this.notifySubscribers();
    } catch (error) {
      console.error("[OrderOrchestrator] Error during initial load:", error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Map movement no longer triggers API requests.
   */
  onViewportChange(region: ViewportRegion) {
    // LOG ONLY: To prove no API requests are made
    console.log(`[OrderOrchestrator] Viewport changed: lat=${region.latitude.toFixed(4)}, delta=${region.latitudeDelta.toFixed(4)}. NO API REQUEST TRIGGERED.`);
  }

  getOrders() {
    return this.orders;
  }

  forceRefresh() {
    console.log('[OrderOrchestrator] Manual Refresh Triggered.');
    this.isInitialLoadDone = false;
    this.loadMapData();
  }

  getLoadingState() {
    return this.isLoading;
  }
}

export const orderOrchestrator = new OrderOrchestrator();
