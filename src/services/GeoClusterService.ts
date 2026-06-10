import { Order } from '../types';

export interface Cluster {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  orderIds: string[];
  isCluster: boolean;
}

/**
 * GeoClusterService: Grid-based grouping logic (~1-5km tiles).
 * This service is responsible for aggregating orders based on zoom levels.
 */
export const GeoClusterService = {
  /**
   * Clusters orders based on grid precision.
   * Higher latitudeDelta -> lower precision -> larger clusters.
   */
  clusterOrders(orders: Order[], latDelta: number): (Order | Cluster)[] {
    if (latDelta < 0.02) {
      // Zoomed in: show raw markers
      return orders;
    }

    const precision = this.getPrecision(latDelta);
    const grid: Record<string, Cluster> = {};

    orders.forEach(order => {
      // Use coordinates (preferred) or fallback to location
      const lat = order.coordinates?.latitude ?? order.location.latitude;
      const lng = order.coordinates?.longitude ?? order.location.longitude;

      const bucketLat = Math.floor(lat * Math.pow(10, precision)) / Math.pow(10, precision);
      const bucketLng = Math.floor(lng * Math.pow(10, precision)) / Math.pow(10, precision);
      const key = `${bucketLat}_${bucketLng}`;

      if (!grid[key]) {
        grid[key] = {
          id: `cluster_${key}`,
          latitude: bucketLat,
          longitude: bucketLng,
          count: 0,
          orderIds: [],
          isCluster: true
        };
      }

      grid[key].count += 1;
      grid[key].orderIds.push(order.id);
    });

    return Object.values(grid).map(cluster => {
        if (cluster.count === 1) {
            // If only one order in grid, return the order itself instead of a cluster
            return orders.find(o => o.id === cluster.orderIds[0])!;
        }
        return cluster;
    });
  },

  getPrecision(latDelta: number): number {
    if (latDelta > 2.0) return 0; // ~111km grid
    if (latDelta > 0.5) return 1; // ~11km grid
    return 2;                    // ~1.1km grid
  }
};
