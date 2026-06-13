import { LatLng } from '../types';

/**
 * GeoGridService: Handles coordinate normalization and grid-based bucket key generation.
 * This ensures that small movements on the map don't always trigger a new cache bucket.
 */
export const GeoGridService = {
  /**
   * Tile Engine V3: Generates a stable tile coordinate based on world coordinates and zoom.
   * Logic: (lat, lng) -> (tileX, tileY)
   */
  getTileKey(lat: number, lng: number, zoomLevel: number): string {
    // Zoom levels: 0 (World) to 20 (Building)
    const n = Math.pow(2, zoomLevel);
    const xtile = Math.floor(((lng + 180) / 360) * n);
    const ytile = Math.floor(
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n
    );
    return `tile:${zoomLevel}:${xtile}:${ytile}`;
  },

  /**
   * Maps latitudeDelta to a zoom level (approximate).
   */
  getZoomLevel(latDelta: number): number {
    // Basic approximation for zoom level
    if (latDelta > 10) return 4;
    if (latDelta > 5) return 6;
    if (latDelta > 1) return 8;
    if (latDelta > 0.5) return 10;
    if (latDelta > 0.1) return 12;
    if (latDelta > 0.05) return 14;
    return 16;
  },

  /**
   * Legacy Grid Support (used for clustering)
   */
  getGridKey(lat: number, lng: number, latDelta: number): string {
    const precision = this.getPrecision(latDelta);
    const bucketLat = Math.floor(lat * Math.pow(10, precision)) / Math.pow(10, precision);
    const bucketLng = Math.floor(lng * Math.pow(10, precision)) / Math.pow(10, precision);
    return `${bucketLat.toFixed(precision)}_${bucketLng.toFixed(precision)}`;
  },

  normalizeRegion(lat: number, lng: number, latDelta: number): LatLng {
    const precision = this.getPrecision(latDelta);
    const factor = Math.pow(10, precision);
    return {
      latitude: Math.floor(lat * factor) / factor,
      longitude: Math.floor(lng * factor) / factor,
    };
  },

  getPrecision(latDelta: number): number {
    if (latDelta > 5.0) return 0;
    if (latDelta > 1.0) return 1;
    if (latDelta > 0.1) return 2;
    return 3;
  }
};
