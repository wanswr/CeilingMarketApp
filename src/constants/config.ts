// @ts-ignore
import { SOCKET_URL as ENV_SOCKET_URL } from '@env';

export function resolveSocketUrl(): string {
  if (typeof ENV_SOCKET_URL === 'string' && ENV_SOCKET_URL.trim() !== '') {
    return ENV_SOCKET_URL.trim();
  }
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return 'http://127.0.0.1:3000';
  }
  return '';
}

export const SOCKET_URL = resolveSocketUrl();

/**
 * CeilingsApp Central Configuration Parameters
 */
export const CONFIG = {
  // Radius parameters in kilometers
  INITIAL_SEARCH_RADIUS_KM: 50,
  DEFAULT_SEARCH_RADIUS_KM: 50,
  MAX_SEARCH_RADIUS_KM: 100,

  // Debounce delay for user input geocoding suggestions (ms)
  GEOCODE_DEBOUNCE_DELAY_MS: 600,
};
