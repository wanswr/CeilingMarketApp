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
    // Dynamic require prevents early prototype resolution issues in Hermes
    // We check for both default export and direct import for compatibility
    let mmkvModule;
    try {
        mmkvModule = require('react-native-mmkv');
    } catch (e) {
        throw new Error('react-native-mmkv module not found');
    }

    const MMKV = mmkvModule.MMKV;

    if (!MMKV) {
        throw new Error('MMKV constructor is missing from the module');
    }

    _storage = new MMKV({
      id: 'ceilings-app-storage'
    });
    return _storage;
  } catch (e: any) {
    // Only warn once to avoid console spam
    if (!_isNativeUnavailable) {
        // In Expo Go or some web/test environments, MMKV is expected to be missing
        const isExpectedMissing = e.message?.includes('not found') || e.message?.includes('Native');
        if (__DEV__ && !isExpectedMissing) {
            console.warn('[StorageService] MMKV native module unavailable. Persistence disabled.', e.message);
        } else if (!isExpectedMissing) {
            console.log('[StorageService] MMKV unavailable (expected in some environments)');
        }
    }
    _isNativeUnavailable = true;
    return null;
  }
};

export const storageService = {
  set(key: string, value: any): void {
    try {
      const storage = getStorage();
      if (!storage) return;
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      storage.set(key, stringValue);
    } catch (error) {
      if (__DEV__) console.error(`[StorageService] Error setting key "${key}":`, error);
    }
  },

  get<T>(key: string): T | null {
    try {
      const storage = getStorage();
      if (!storage) return null;
      const value = storage.getString(key);
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
      if (storage) storage.delete(key);
    } catch (error) {
      if (__DEV__) console.error(`[StorageService] Error deleting key "${key}":`, error);
    }
  },

  clearAll(): void {
    try {
      const storage = getStorage();
      if (storage) storage.clearAll();
    } catch (error) {
      if (__DEV__) console.error('[StorageService] Error clearing storage:', error);
    }
  },

  getAllKeys(): string[] {
    try {
      const storage = getStorage();
      return storage ? storage.getAllKeys() : [];
    } catch (error) {
      if (__DEV__) console.error('[StorageService] Error getting all keys:', error);
      return [];
    }
  }
};
