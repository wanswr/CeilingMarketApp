import { MMKV } from 'react-native-mmkv';

/**
 * StorageService V11: High-performance synchronous storage using MMKV.
 * Refactored to avoid prototype issues during early initialization.
 */
let _storage: MMKV | null = null;

const getStorage = () => {
  if (!_storage) {
    try {
      _storage = new MMKV({
        id: 'ceilings-app-storage',
      });
    } catch (e) {
      console.error('[StorageService] Failed to initialize MMKV', e);
      return null;
    }
  }
  return _storage;
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
