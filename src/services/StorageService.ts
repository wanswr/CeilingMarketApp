import { MMKV } from 'react-native-mmkv';

/**
 * StorageService: High-performance synchronous storage using MMKV.
 * Replaces AsyncStorage for critical path data.
 */
class StorageService {
  private storage: MMKV;

  constructor() {
    this.storage = new MMKV({
      id: 'ceilings-app-storage',
    });
  }

  set(key: string, value: any) {
    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      this.storage.set(key, stringValue);
    } catch (e) {
      console.error(`[StorageService] Failed to set ${key}`, e);
    }
  }

  get<T>(key: string): T | null {
    try {
      const value = this.storage.getString(key);
      if (!value) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch (e) {
      console.error(`[StorageService] Failed to get ${key}`, e);
      return null;
    }
  }

  delete(key: string) {
    this.storage.delete(key);
  }

  clearAll() {
    this.storage.clearAll();
  }

  getAllKeys(): string[] {
    return this.storage.getAllKeys();
  }
}

export const storageService = new StorageService();
