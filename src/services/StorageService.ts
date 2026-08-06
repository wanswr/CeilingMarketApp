/**
 * StorageService V11: High-performance synchronous storage using MMKV.
 * Hardened version with dynamic require and graceful degradation.
 */
import { logger } from './logger/LoggerService';

/**
 * V11 Storage Adapter Interface: Unifies native and in-memory storage operations.
 */
interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
  clearAll(): void;
  getAllKeys(): string[];
}

let _adapter: StorageAdapter | null = null;
let _isNativeUnavailable = false;

/**
 * MMKV Adapter implementation with safety guards.
 */
class MMKVAdapter implements StorageAdapter {
  constructor(private storage: any) {}
  get(key: string): string | null { return this.storage.getString(key) ?? null; }
  set(key: string, value: string): void { this.storage.set(key, value); }
  delete(key: string): void {
      // V11: Explicit method detection and logging
      // react-native-mmkv usually has .delete(key)
      if (typeof this.storage.delete === 'function') {
          this.storage.delete(key);
          logger.info(`STORE_DELETE ${key}`);
          return;
      }

      if (typeof this.storage.remove === 'function') {
          this.storage.remove(key);
          logger.info(`STORE_DELETE ${key}`);
          return;
      }

      if (typeof this.storage.deleteMMKV === 'function') {
          this.storage.deleteMMKV(key);
          logger.info(`STORE_DELETE ${key}`);
          return;
      }

      if (typeof this.storage.removeItem === 'function') {
          this.storage.removeItem(key);
          logger.info(`STORE_DELETE ${key}`);
          return;
      }

      // Fallback try-catch for cases where JSI methods might not be enumerable/detectable via typeof
      try {
          this.storage.delete(key);
          logger.info(`STORE_DELETE ${key} (via fallback)`);
      } catch (e) {
          const methods = Object.keys(this.storage).filter(k => typeof this.storage[k] === 'function').join(', ');
          logger.warn(`[MMKVAdapter] all delete methods failed for key: ${key}. Available methods: ${methods}`);
      }
  }
  clearAll(): void {
      if (typeof this.storage.clearAll === 'function') {
          this.storage.clearAll();
      }
  }
  getAllKeys(): string[] { return this.storage.getAllKeys() ?? []; }
}

/**
 * Memory Fallback Adapter for dev client without native modules or test environments.
 */
class MemoryAdapter implements StorageAdapter {
  private cache: Map<string, string> = new Map();
  get(key: string): string | null { return this.cache.get(key) ?? null; }
  set(key: string, value: string): void { this.cache.set(key, value); }
  delete(key: string): void { this.cache.delete(key); }
  clearAll(): void { this.cache.clear(); }
  getAllKeys(): string[] { return Array.from(this.cache.keys()); }
}

const _memoryFallback = new MemoryAdapter();

const getAdapter = (): StorageAdapter => {
  if (_adapter) return _adapter;
  if (_isNativeUnavailable) return _memoryFallback;

  try {
    // V11: Robust MMKV initialization with clear error states
    let mmkvModule;
    try {
        mmkvModule = require('react-native-mmkv');
    } catch (e) {
        throw new Error('react-native-mmkv module not found in bundle');
    }

    // MMKV v4+ compatibility check
    let MMKV = mmkvModule.MMKV || (mmkvModule.default && mmkvModule.default.MMKV);

    // If MMKV class is not directly available, try to find it or use a factory
    if (!MMKV && typeof mmkvModule === 'function') {
        MMKV = mmkvModule;
    }

    let nativeInstance = null;
    if (MMKV) {
        nativeInstance = new MMKV({
            id: 'ceilings-app-storage'
        });
    } else if (mmkvModule.createMMKV) {
        // Fallback to factory function if available
        nativeInstance = mmkvModule.createMMKV({
            id: 'ceilings-app-storage'
        });
    } else {
        const keys = Object.keys(mmkvModule).filter(k => k !== 'default').join(', ');
        throw new Error(`MMKV constructor is missing (native modules likely not linked). Available keys: ${keys}`);
    }

    if (nativeInstance) {
        // Hardened: If nativeInstance is a factory/module, wrap it correctly
        _adapter = new MMKVAdapter(nativeInstance);
        return _adapter;
    }

    throw new Error('Failed to create native MMKV instance');
  } catch (e: any) {
    if (!_isNativeUnavailable) {
        logger.warn(`[StorageService] Native storage unavailable: ${e.message}. Using in-memory fallback.`);
    }
    _isNativeUnavailable = true;
    return _memoryFallback;
  }
};

export const storageService = {
  set(key: string, value: any): void {
    try {
      const adapter = getAdapter();
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      adapter.set(key, stringValue);
    } catch (error) {
      logger.error(`[StorageService] Error setting key "${key}":`, { error });
    }
  },

  get<T>(key: string): T | null {
    try {
      const adapter = getAdapter();
      const value = adapter.get(key);

      if (value === null || value === undefined) return null;

      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch (error) {
      logger.error(`[StorageService] Error getting key "${key}":`, { error });
      return null;
    }
  },

  delete(key: string): void {
    try {
      const adapter = getAdapter();
      adapter.delete(key);
    } catch (error) {
      logger.error(`[StorageService] Error deleting key "${key}":`, { error });
    }
  },

  clearAll(): void {
    try {
      const adapter = getAdapter();
      adapter.clearAll();
    } catch (error) {
      logger.error('[StorageService] Error clearing storage:', { error });
    }
  },

  getAllKeys(): string[] {
    try {
      const adapter = getAdapter();
      return adapter.getAllKeys();
    } catch (error) {
      logger.error('[StorageService] Error getting all keys:', { error });
      return [];
    }
  }
};
