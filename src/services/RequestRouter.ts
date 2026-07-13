import { logger } from './logger/LoggerService';

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
   * @param key Unique key for the request (e.g., 'user:profile', 'order:uuid')
   * @param fetchFn The function that performs the actual API call
   * @param ttl Cache Time-To-Live in milliseconds (default: 30s)
   */
  /**
   * Primary request method with deduplication and caching.
   * Handles In-Flight locking (Deduplication) first to prevent race conditions.
   */
  request = async <T>(key: string, fetchFn: () => Promise<T>, ttl: number = 30000): Promise<T> => {
    const now = Date.now();

    // 1. Handle In-Flight (Deduplication) - TASK #1: Locking
    if (this.inFlight.has(key)) {
      logger.debug(`DEDUP JOIN: ${key}`, { source: 'api' });
      this.metrics.dedupHits++;
      return this.inFlight.get(key);
    }

    // 2. Check Cache (Cache-First)
    const cached = this.cache.get(key);
    if (cached && (now - cached.timestamp) < ttl) {
      logger.debug(`CACHE HIT: ${key}`, { source: 'api', age: now - cached.timestamp });
      this.metrics.cacheHits++;
      return cached.data;
    }

    // 3. Perform Fetch
    logger.debug(`FETCH START: ${key}`, { source: 'api' });
    this.metrics.apiCalls++;

    const promise = (async () => {
      try {
        const data = await fetchFn();
        this.cache.set(key, { data, timestamp: Date.now() });
        return data;
      } catch (error: any) {
        if (error.name === 'AbortError' || error.message === 'canceled') {
           // Don't log or throw for cancellations
           return null as any;
        }
        logger.error(`FETCH FAILED: ${key}`, { source: 'api', error: error.message });
        throw error;
      } finally {
        this.inFlight.delete(key);
        logger.debug(`FETCH END: ${key}`, { source: 'api' });
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
    logger.debug(`CACHE_INVALIDATE: ${key}`, { source: 'api' });
  }

  /**
   * Clear all cache (useful for logout or manual refresh).
   */
  clear = () => {
    this.cache.clear();
    this.inFlight.clear();
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
    logger.info(`CACHE_CLEAR_ALL`, { source: 'api' });
  }

  getMetrics = () => {
    return { ...this.metrics };
  }
}

export const requestRouter = new RequestRouter();
