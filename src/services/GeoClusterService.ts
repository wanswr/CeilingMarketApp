import { Order } from '../types'
import { GeoGridService } from './GeoGridService'

export interface Cluster {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  orderIds: string[];
  isCluster: boolean;
  type: 'weak' | 'strong';
}

/**
 * GeoClusterService: Aggregates orders based on zoom levels and grid buckets.
 */
export const GeoClusterService = {
  /**
   * Safe accessor for order coordinates.
   */
  getOrderCoords(order: Order): { latitude: number; longitude: number } | null {
    if (!order) return null;
    const lat = order.latitude ?? order.coordinates?.latitude ?? order.location?.latitude;
    const lng = order.longitude ?? order.coordinates?.longitude ?? order.location?.longitude;

    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    return { latitude: lat, longitude: lng };
  },

  /**
   * Clusters orders based on grid precision and density rules.
   */
  clusterOrders(orders: Order[], latDelta: number): (Order | Cluster)[] {
    if (typeof latDelta !== "number" || !Number.isFinite(latDelta) || latDelta <= 0) {
      latDelta = 0.1;
    }
    if (latDelta < 0.01) {
      // High zoom: show all markers individually
      return orders.filter(o => this.getOrderCoords(o) !== null);
    }

    const grid: Record<string, Cluster> = {};
    const ordersMap = new Map<string, Order>();
    const validOrders: Order[] = [];

    orders.forEach(o => {
        if (this.getOrderCoords(o)) {
            validOrders.push(o);
            ordersMap.set(o.id, o);
        }
    });

    validOrders.forEach(order => {
      const coords = this.getOrderCoords(order)!;
      const key = GeoGridService.getGridKey(coords.latitude, coords.longitude, latDelta);

      if (!grid[key]) {
        const normalized = GeoGridService.normalizeRegion(coords.latitude, coords.longitude, latDelta);
        grid[key] = {
          id: `cluster_${key}`,
          latitude: normalized.latitude,
          longitude: normalized.longitude,
          count: 0,
          orderIds: [],
          isCluster: true,
          type: 'weak'
        };
      }

      grid[key].count += 1;
      grid[key].orderIds.push(order.id);
    });

    const result: (Order | Cluster)[] = [];

    Object.values(grid).forEach(cluster => {
      if (cluster.count <= 3) {
        // Rule: 1-3 -> single markers
        cluster.orderIds.forEach(id => {
          const order = ordersMap.get(id);
          if (order) result.push(order);
        });
      } else {
        // Rule: 4+ -> cluster
        cluster.type = cluster.count > 10 ? 'strong' : 'weak';
        result.push(cluster);
      }
    });

    return result;
  }
};
