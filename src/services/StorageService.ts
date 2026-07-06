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
    const { MMKV } = require('react-native-mmkv');
    _storage = new MMKV({
      id: 'ceilings-app-storage'
    });
    return _storage;
  } catch (e) {
    console.warn('[StorageService] MMKV native module not found. Persistence disabled.');
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
      console.error(`[StorageService] Error setting key "${key}":`, error);
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
      console.error(`[StorageService] Error getting key "${key}":`, error);
      return null;
    }
  },

  delete(key: string): void {
    try {
      const storage = getStorage();
      if (storage) storage.delete(key);
    } catch (error) {
      console.error(`[StorageService] Error deleting key "${key}":`, error);
    }
  },

  clearAll(): void {
    try {
      const storage = getStorage();
      if (storage) storage.clearAll();
    } catch (error) {
      console.error('[StorageService] Error clearing storage:', error);
    }
  },

  getAllKeys(): string[] {
    try {
      const storage = getStorage();
      return storage ? storage.getAllKeys() : [];
    } catch (error) {
      console.error('[StorageService] Error getting all keys:', error);
      return [];
    }
  }
};
