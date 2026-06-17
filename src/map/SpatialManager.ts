/**
 * SpatialManager V6: Handles global coordinate-based chunking and caching.
 * No predefined regions, works anywhere in the world.
 */

interface ChunkMetadata {
  loaded: boolean;
  timestamp: number;
}

class SpatialManager {
  private cache: Map<string, ChunkMetadata> = new Map();
  private cellSize = 0.5; // Approx 50km cells
  private maxChunks = 500; // LRU Limit

  /**
   * Generates a unique key for a geographic cell.
   * Example: 55.75, 37.61 -> "111_75" (using floor with factor 2 for 0.5 deg)
   */
  getChunkKey(lat: number, lng: number): string {
    const latIdx = Math.floor(lat / this.cellSize);
    const lngIdx = Math.floor(lng / this.cellSize);
    return `${latIdx}_${lngIdx}`;
  }

  /**
   * Checks if all cells within the given bounds are already loaded.
   */
  isAreaLoaded(minLat: number, maxLat: number, minLng: number, maxLng: number): boolean {
    for (let lat = minLat; lat <= maxLat; lat += this.cellSize) {
      for (let lng = minLng; lng <= maxLng; lng += this.cellSize) {
        if (!this.isChunkLoaded(lat, lng)) return false;
      }
    }
    // Check corners and edges just in case
    if (!this.isChunkLoaded(maxLat, maxLng)) return false;
    return true;
  }

  isChunkLoaded(lat: number, lng: number): boolean {
    const key = this.getChunkKey(lat, lng);
    const chunk = this.cache.get(key);

    if (chunk) {
        // LRU Refresh: Move to the end of the Map
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
        // Evict oldest (first item in Map iterator)
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, { loaded: true, timestamp: Date.now() });
  }

  /**
   * Aligns any BBOX to geocell boundaries to prevent jitter-induced cache misses.
   * Returns a larger BBOX that perfectly fits the geocell grid.
   */
  getAlignedBounds(minLat: number, maxLat: number, minLng: number, maxLng: number) {
      return {
          minLat: Math.floor(minLat / this.cellSize) * this.cellSize,
          maxLat: Math.ceil(maxLat / this.cellSize) * this.cellSize,
          minLng: Math.floor(minLng / this.cellSize) * this.cellSize,
          maxLng: Math.ceil(maxLng / this.cellSize) * this.cellSize,
      };
  }

  /**
   * Marks all chunks covered by a BBOX as loaded.
   */
  markAreaLoaded(minLat: number, maxLat: number, minLng: number, maxLng: number) {
    const aligned = this.getAlignedBounds(minLat, maxLat, minLng, maxLng);

    for (let lat = aligned.minLat; lat <= aligned.maxLat; lat += this.cellSize) {
      for (let lng = aligned.minLng; lng <= aligned.maxLng; lng += this.cellSize) {
        this.markChunkLoaded(lat, lng);
      }
    }
  }

  getLoadedChunksCount(): number {
    return this.cache.size;
  }

  clear() {
    this.cache.clear();
  }
}

export const spatialManager = new SpatialManager();
