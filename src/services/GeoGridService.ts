import { LatLng } from '../types';

/**
 * GeoGridService: Handles coordinate normalization and grid-based bucket key generation.
 * This ensures that small movements on the map don't always trigger a new cache bucket.
 */
export const GeoGridService = {
  /**
   * Generates a stable grid key based on coordinates and zoom level (latitudeDelta).
   */
  getGridKey(lat: number, lng: number, latDelta: number): string {
    const precision = this.getPrecision(latDelta);
    const bucketLat = Math.floor(lat * Math.pow(10, precision)) / Math.pow(10, precision);
    const bucketLng = Math.floor(lng * Math.pow(10, precision)) / Math.pow(10, precision);
    return `${bucketLat.toFixed(precision)}_${bucketLng.toFixed(precision)}`;
  },

  /**
   * Normalizes a region to a stable grid center.
   */
  normalizeRegion(lat: number, lng: number, latDelta: number): LatLng {
    const precision = this.getPrecision(latDelta);
    const factor = Math.pow(10, precision);
    return {
      latitude: Math.floor(lat * factor) / factor,
      longitude: Math.floor(lng * factor) / factor,
    };
  },

  /**
   * Determines grid precision based on zoom level.
   */
  getPrecision(latDelta: number): number {
    if (latDelta > 5.0) return 0;  // ~111km grid
    if (latDelta > 1.0) return 1;  // ~11km grid
    if (latDelta > 0.1) return 2;  // ~1.1km grid
    return 3;                     // ~110m grid
  }
};
