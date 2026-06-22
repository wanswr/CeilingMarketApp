import { apiService } from '../services/ApiService';

/**
 * Resolves a potentially relative image URL from the backend to an absolute one.
 * If the URL is already absolute (starts with http), it returns it as is.
 */
export const resolveImageUrl = (path?: string): string | undefined => {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;

  // Strip leading slash if present
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;

  // Use current API base URL
  const baseUrl = apiService.getBaseUrl().replace('/api/', '/');
  return `${baseUrl}${cleanPath}`;
};
