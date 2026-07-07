/**
 * StorageService V11: High-performance synchronous storage using MMKV.
 * Hardened version with dynamic require and graceful degradation.
 */

let _storage: any = null;
let _isNativeUnavailable = false;

const getStorage = () => {
  if (_storage) return _storage;
  if (_isNativeUnavailable) return null;

  try {
    // V11: Using standard react-native-mmkv import pattern
    // In Dev Client/Native build, the MMKV constructor is expected to be present.
    let mmkvModule;
    try {
        mmkvModule = require('react-native-mmkv');
    } catch (e) {
        throw new Error('react-native-mmkv module not found');
    }

    const { MMKV } = mmkvModule;

    if (!MMKV) {
        throw new Error('MMKV constructor is missing from the module');
    }

    _storage = new MMKV({
      id: 'ceilings-app-storage'
    });
    return _storage;
  } catch (e: any) {
    // Reduced log level for expected missing native modules (e.g., standard Expo Go or some simulators)
    if (!_isNativeUnavailable) {
        console.log('[StorageService] Native storage unavailable (using in-memory fallback):', e.message);
    }
    _isNativeUnavailable = true;
    return null;
  }
};

// In-memory fallback for cases where MMKV is missing (Persistence disabled)
const _memoryCache: Record<string, string> = {};

export const storageService = {
  set(key: string, value: any): void {
    try {
      const storage = getStorage();
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

      if (storage) {
          storage.set(key, stringValue);
      } else {
          _memoryCache[key] = stringValue;
      }
    } catch (error) {
      if (__DEV__) console.error(`[StorageService] Error setting key "${key}":`, error);
    }
  },

  get<T>(key: string): T | null {
    try {
      const storage = getStorage();
      const value = storage ? storage.getString(key) : _memoryCache[key];

      if (!value) return null;

      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch (error) {
      if (__DEV__) console.error(`[StorageService] Error getting key "${key}":`, error);
      return null;
    }
  },

  delete(key: string): void {
    try {
      const storage = getStorage();
      if (storage) {
          storage.delete(key);
      } else {
          delete _memoryCache[key];
      }
    } catch (error) {
      if (__DEV__) console.error(`[StorageService] Error deleting key "${key}":`, error);
    }
  },

  clearAll(): void {
    try {
      const storage = getStorage();
      if (storage) {
          storage.clearAll();
      } else {
          Object.keys(_memoryCache).forEach(k => delete _memoryCache[k]);
      }
    } catch (error) {
      if (__DEV__) console.error('[StorageService] Error clearing storage:', error);
    }
  },

  getAllKeys(): string[] {
    try {
      const storage = getStorage();
      return storage ? storage.getAllKeys() : Object.keys(_memoryCache);
    } catch (error) {
      if (__DEV__) console.error('[StorageService] Error getting all keys:', error);
      return [];
    }
  }
};
