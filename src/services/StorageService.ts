/**
 * StorageService V11: High-performance synchronous storage using MMKV.
 * Hardened version with dynamic require and graceful degradation.
 */
import { logger } from './logger/LoggerService';
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 2000;

const secureStoreHelper = {
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value);
        await SecureStore.deleteItemAsync(`${key}_chunks`);
        return;
      }
      const chunksCount = Math.ceil(value.length / CHUNK_SIZE);
      for (let i = 0; i < chunksCount; i++) {
        const chunk = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunk);
      }
      await SecureStore.setItemAsync(`${key}_chunks`, String(chunksCount));
    } catch (e) {
      logger.error('[secureStoreHelper] Error setting item:', e);
    }
  },

  async getItem(key: string): Promise<string | null> {
    try {
      const chunksCountStr = await SecureStore.getItemAsync(`${key}_chunks`);
      if (!chunksCountStr) {
        return await SecureStore.getItemAsync(key);
      }
      const chunksCount = parseInt(chunksCountStr, 10);
      let value = '';
      for (let i = 0; i < chunksCount; i++) {
        const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
        if (chunk) value += chunk;
      }
      return value;
    } catch (e) {
      logger.error('[secureStoreHelper] Error getting item:', e);
      return null;
    }
  },

  async deleteItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
      const chunksCountStr = await SecureStore.getItemAsync(`${key}_chunks`);
      if (chunksCountStr) {
        const chunksCount = parseInt(chunksCountStr, 10);
        for (let i = 0; i < chunksCount; i++) {
          await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
        }
        await SecureStore.deleteItemAsync(`${key}_chunks`);
      }
    } catch (e) {
      logger.error('[secureStoreHelper] Error deleting item:', e);
    }
  }
};


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
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.init();
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const keysListStr = await SecureStore.getItemAsync('__memory_adapter_keys__');
        if (keysListStr) {
          const keys = JSON.parse(keysListStr) as string[];
          for (const key of keys) {
            const val = await secureStoreHelper.getItem(key);
            if (val !== null) {
              this.cache.set(key, val);
            }
          }
        }
        this.initialized = true;
        logger.info('[MemoryAdapter] Hydrated persistent fallback state from SecureStore.');
      } catch (e: any) {
        logger.error('[MemoryAdapter] Failed to hydrate persistent fallback:', e.message);
      }
    })();

    return this.initPromise;
  }

  get(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.cache.set(key, value);
    (async () => {
      await this.init();
      await secureStoreHelper.setItem(key, value);
      await this.persistKeysList();
    })();
  }

  delete(key: string): void {
    this.cache.delete(key);
    (async () => {
      await this.init();
      await secureStoreHelper.deleteItem(key);
      await this.persistKeysList();
    })();
  }

  clearAll(): void {
    const keys = Array.from(this.cache.keys());
    this.cache.clear();
    (async () => {
      await this.init();
      for (const key of keys) {
        await secureStoreHelper.deleteItem(key);
      }
      await SecureStore.deleteItemAsync('__memory_adapter_keys__');
    })();
  }

  getAllKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  private async persistKeysList() {
    try {
      const keys = Array.from(this.cache.keys());
      await SecureStore.setItemAsync('__memory_adapter_keys__', JSON.stringify(keys));
    } catch (e) {}
  }
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
  async initFallback(): Promise<void> {
    await _memoryFallback.init();
  },
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
