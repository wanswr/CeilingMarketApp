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

  /**
   * Primary request method with deduplication and caching.
   * @param key Unique key for the request (e.g., 'user:profile', 'order:uuid')
   * @param fetchFn The function that performs the actual API call
   * @param ttl Cache Time-To-Live in milliseconds (default: 30s)
   */
  async request<T>(key: string, fetchFn: () => Promise<T>, ttl: number = 30000): Promise<T> {
    const now = Date.now();

    // 1. Check Cache (Cache-First)
    const cached = this.cache.get(key);
    if (cached && (now - cached.timestamp) < ttl) {
      console.log(`[RequestRouter] CACHE HIT: ${key}`);
      return cached.data;
    }

    // 2. Handle In-Flight (Deduplication)
    if (this.inFlight.has(key)) {
      console.log(`[RequestRouter] DEDUP JOIN: ${key}`);
      return this.inFlight.get(key);
    }

    // 3. Perform Fetch
    console.log(`[RequestRouter] >>> FETCH START: ${key}`);
    const promise = (async () => {
      try {
        const data = await fetchFn();
        this.cache.set(key, { data, timestamp: Date.now() });
        return data;
      } catch (error) {
        console.error(`[RequestRouter] FETCH FAILED: ${key}`, error);
        throw error;
      } finally {
        this.inFlight.delete(key);
        console.log(`[RequestRouter] <<< FETCH END: ${key}`);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Force invalidate a specific cache key.
   */
  invalidate(key: string) {
    this.cache.delete(key);
  }

  /**
   * Clear all cache (useful for logout or manual refresh).
   */
  clear() {
    this.cache.clear();
    this.inFlight.clear();
  }
}

export const requestRouter = new RequestRouter();
