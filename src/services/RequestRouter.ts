/**
 * RequestRouter: Centralized Gateway for all API requests.
 * Features: Global Deduplication, Cache-First Policy, and Request Locking.
 */

interface CacheEntry {
  data: any;
  timestamp: number;
}

class RequestRouter {
  private cache: Map<string, CacheEntry> = new Map();
  private inFlight: Map<string, Promise<any>> = new Map();
  private lastResolved: Map<string, number> = new Map();

  // Task #6: Metrics
  public metrics = {
    apiCalls: 0,
    cacheHits: 0,
    bboxHits: 0,
    bboxMisses: 0,
    dedupHits: 0,
    websocketUpdates: 0,
    spatialChunksLoaded: 0,
    spatialCacheHits: 0,
    spatialCacheMisses: 0,
    spatialRequests: 0
  };

  /**
   * Primary request method with deduplication and caching.
   * Handles In-Flight locking (Deduplication) first to prevent race conditions.
   */
  request = async <T>(key: string, fetchFn: () => Promise<T>, ttl: number = 30000): Promise<T> => {
    const now = Date.now();

    // 1. Handle In-Flight (Deduplication) - TASK #1: Locking
    if (this.inFlight.has(key)) {
      if (__DEV__) console.log(`[RequestRouter] DEDUP JOIN: ${key}`);
      this.metrics.dedupHits++;
      return this.inFlight.get(key);
    }

    // 2. Check Cache (Cache-First) with a 500ms rapid-consecutive fetch guard
    const cached = this.cache.get(key);
    const lastResolvedTime = this.lastResolved.get(key) || 0;
    if (cached && ((now - cached.timestamp) < ttl || (now - lastResolvedTime) < 500)) {
      if (__DEV__) {
        console.log(`[RequestRouter] CACHE HIT: ${key}`);
      }
      this.metrics.cacheHits++;
      return cached.data;
    }

    // 3. Perform Fetch
    if (__DEV__) {
        console.log(`[RequestRouter] >>> FETCH START: ${key}`);
    }
    this.metrics.apiCalls++;

    const promise = (async () => {
      try {
        const data = await fetchFn();
        const resolveTime = Date.now();
        this.cache.set(key, { data, timestamp: resolveTime });
        this.lastResolved.set(key, resolveTime);
        return data;
      } catch (error: any) {
        if (error.name === 'AbortError' || error.message === 'canceled') {
           // Don't log or throw for cancellations
           return null as any;
        }
        console.error(`[RequestRouter] FETCH FAILED: ${key}`, error);
        throw error;
      } finally {
        this.inFlight.delete(key);
        if (__DEV__) {
            console.log(`[RequestRouter] <<< FETCH END: ${key}`);
        }
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Force invalidate a specific cache key.
   */
  invalidate = (key: string) => {
    this.cache.delete(key);
    this.lastResolved.delete(key);
  }

  /**
   * Clear all cache (useful for logout or manual refresh).
   */
  clear = () => {
    this.cache.clear();
    this.inFlight.clear();
    this.lastResolved.clear();
    this.metrics.apiCalls = 0;
    this.metrics.cacheHits = 0;
    this.metrics.bboxHits = 0;
    this.metrics.bboxMisses = 0;
    this.metrics.dedupHits = 0;
    this.metrics.websocketUpdates = 0;
    this.metrics.spatialChunksLoaded = 0;
    this.metrics.spatialCacheHits = 0;
    this.metrics.spatialCacheMisses = 0;
    this.metrics.spatialRequests = 0;
  }

  getMetrics = () => {
    return { ...this.metrics };
  }
}

export const requestRouter = new RequestRouter();
