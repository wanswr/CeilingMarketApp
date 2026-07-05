import { MMKV } from 'react-native-mmkv';

/**
 * StorageService V11: High-performance synchronous storage using MMKV.
 */
class StorageService {
  private storage: MMKV;

  constructor() {
    this.storage = new MMKV({
      id: 'ceilings-app-storage',
    });
  }

  set(key: string, value: any): void {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      this.storage.set(key, stringValue);
    } catch (error) {
      console.error(`[StorageService] Error setting key "${key}":`, error);
    }
  }

  get<T>(key: string): T | null {
    try {
      const value = this.storage.getString(key);
      if (!value) return null;

      // Try to parse as JSON, return as string if fails
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch (error) {
      console.error(`[StorageService] Error getting key "${key}":`, error);
      return null;
    }
  }

  delete(key: string): void {
    try {
      this.storage.delete(key);
    } catch (error) {
      console.error(`[StorageService] Error deleting key "${key}":`, error);
    }
  }

  clearAll(): void {
    try {
      this.storage.clearAll();
    } catch (error) {
      console.error('[StorageService] Error clearing storage:', error);
    }
  }

  getAllKeys(): string[] {
    try {
      return this.storage.getAllKeys();
    } catch (error) {
      console.error('[StorageService] Error getting all keys:', error);
      return [];
    }
  }
}

export const storageService = new StorageService();
