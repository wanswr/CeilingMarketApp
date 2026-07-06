import { storageService } from '../services/StorageService'

/**
 * SpatialManager V11: Handles global coordinate-based chunking and caching.
 * Modernized with StorageService (MMKV) for synchronous operations.
 */

interface ChunkMetadata {
  loaded: boolean;
  timestamp: number;
}

class SpatialManager {
  private cache: Map<string, ChunkMetadata> = new Map();
  private cellSize = 0.5;
  private maxChunks = 500;
  private persistenceKey = 'spatial_cache_v11';

  constructor() {
    this.hydrate();
  }

  getChunkKey(lat: number, lng: number): string {
    const latIdx = Math.floor(lat / this.cellSize);
    const lngIdx = Math.floor(lng / this.cellSize);
    return `${latIdx}_${lngIdx}`;
  }

  isAreaLoaded(minLat: number, maxLat: number, minLng: number, maxLng: number): boolean {
    for (let lat = minLat; lat <= maxLat; lat += this.cellSize) {
      for (let lng = minLng; lng <= maxLng; lng += this.cellSize) {
        if (!this.isChunkLoaded(lat, lng)) return false;
      }
    }
    if (!this.isChunkLoaded(maxLat, maxLng)) return false;
    return true;
  }

  isChunkLoaded(lat: number, lng: number): boolean {
    const key = this.getChunkKey(lat, lng);
    const chunk = this.cache.get(key);

    if (chunk) {
        this.cache.delete(key);
        this.cache.set(key, chunk);
        return chunk.loaded && (Date.now() - chunk.timestamp < 3600000);
    }

    return false;
  }

  markChunkLoaded(lat: number, lng: number) {
    const key = this.getChunkKey(lat, lng);

    if (this.cache.has(key)) {
        this.cache.delete(key);
    } else if (this.cache.size >= this.maxChunks) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, { loaded: true, timestamp: Date.now() });
    this.persist();
  }

  getAlignedBounds(minLat: number, maxLat: number, minLng: number, maxLng: number) {
      const normalize = (val: number, op: 'floor' | 'ceil') => {
          const raw = op === 'floor'
              ? Math.floor(val / this.cellSize) * this.cellSize
              : Math.ceil(val / this.cellSize) * this.cellSize;
          return Number(raw.toFixed(3));
      };

      return {
          minLat: normalize(minLat, 'floor'),
          maxLat: normalize(maxLat, 'ceil'),
          minLng: normalize(minLng, 'floor'),
          maxLng: normalize(maxLng, 'ceil') };
  }

  markAreaLoaded(minLat: number, maxLat: number, minLng: number, maxLng: number) {
    const aligned = this.getAlignedBounds(minLat, maxLat, minLng, maxLng);

    for (let lat = aligned.minLat; lat <= aligned.maxLat; lat += this.cellSize) {
      for (let lng = aligned.minLng; lng <= aligned.maxLng; lng += this.cellSize) {
        const key = this.getChunkKey(lat, lng);
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxChunks) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) this.cache.delete(oldestKey);
        }
        this.cache.set(key, { loaded: true, timestamp: Date.now() });
      }
    }
    this.persist();
  }

  getLoadedChunksCount(): number {
    return this.cache.size;
  }

  hydrate() {
    try {
      const data = storageService.get<any>(this.persistenceKey);
      if (!data) return;

      Object.entries(data).forEach(([key, meta]: [string, any]) => {
        if (Date.now() - meta.timestamp < 7200000) {
            this.cache.set(key, meta);
        }
      });
    } catch (e) {
      console.error('[SpatialManager] Hydration failed', e);
    }
  }

  persist() {
    try {
      const data = Object.fromEntries(this.cache);
      storageService.set(this.persistenceKey, data);
    } catch (e) {
      console.error('[SpatialManager] Persistence failed', e);
    }
  }

  clear() {
    this.cache.clear();
    storageService.delete(this.persistenceKey);
  }
}

export const spatialManager = new SpatialManager();
