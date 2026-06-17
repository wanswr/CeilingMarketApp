/**
 * RegionManager V5: Handles regional viewport detection and caching.
 */

interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface MapRegion {
  id: string;
  name: string;
  bounds: Bounds;
}

const DEFINED_REGIONS: MapRegion[] = [
  {
    id: 'moscow',
    name: 'Москва и МО',
    bounds: { minLat: 55.1, maxLat: 56.1, minLng: 36.5, maxLng: 38.5 }
  },
  {
    id: 'spb',
    name: 'Санкт-Петербург',
    bounds: { minLat: 59.5, maxLat: 60.5, minLng: 29.5, maxLng: 31.0 }
  },
  {
    id: 'kazan',
    name: 'Казань',
    bounds: { minLat: 55.5, maxLat: 56.0, minLng: 48.8, maxLng: 49.5 }
  }
];

class RegionManager {
  private loadedRegions: Map<string, number> = new Map(); // id -> lastAccessedTimestamp
  private maxCachedRegions = 5;

  /**
   * Detects if the current viewport is within a known region.
   */
  detectRegion(lat: number, lng: number): MapRegion | null {
    return DEFINED_REGIONS.find(r =>
      lat >= r.bounds.minLat && lat <= r.bounds.maxLat &&
      lng >= r.bounds.minLng && lng <= r.bounds.maxLng
    ) || null;
  }

  isRegionLoaded(regionId: string): boolean {
    return this.loadedRegions.has(regionId);
  }

  markRegionLoaded(regionId: string) {
    this.loadedRegions.set(regionId, Date.now());
    this.unloadInactiveRegions();
  }

  private unloadInactiveRegions() {
    if (this.loadedRegions.size <= this.maxCachedRegions) return;

    // LRU: Sort by timestamp and remove oldest
    const sorted = Array.from(this.loadedRegions.entries())
      .sort((a, b) => a[1] - b[1]);

    while (this.loadedRegions.size > this.maxCachedRegions) {
      const oldest = sorted.shift();
      if (oldest) {
        this.loadedRegions.delete(oldest[0]);
        if (__DEV__) console.log(`[RegionManager] UNLOAD REGION: ${oldest[0]}`);
      }
    }
  }

  getDefinedRegions() {
    return DEFINED_REGIONS;
  }

  clear() {
    this.loadedRegions.clear();
  }
}

export const regionManager = new RegionManager();
