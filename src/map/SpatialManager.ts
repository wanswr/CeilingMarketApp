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
    return !!chunk && chunk.loaded && (Date.now() - chunk.timestamp < 3600000); // 1h TTL
  }

  markChunkLoaded(lat: number, lng: number) {
    const key = this.getChunkKey(lat, lng);
    this.cache.set(key, { loaded: true, timestamp: Date.now() });
  }

  /**
   * Marks all chunks covered by a BBOX as loaded.
   */
  markAreaLoaded(minLat: number, maxLat: number, minLng: number, maxLng: number) {
    for (let lat = minLat; lat <= maxLat; lat += this.cellSize) {
      for (let lng = minLng; lng <= maxLng; lng += this.cellSize) {
        this.markChunkLoaded(lat, lng);
      }
    }
    this.markChunkLoaded(maxLat, maxLng);
  }

  getLoadedChunksCount(): number {
    return this.cache.size;
  }

  clear() {
    this.cache.clear();
  }
}

export const spatialManager = new SpatialManager();
