import axios, { InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

// Base URL for the API.
const API_URL = 'http://192.168.1.229:3000/api/';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to add the JWT token to every request
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await SecureStore.getItemAsync('userToken');
  if (__DEV__) {
    console.log(`[API] ${config.method?.toUpperCase()} Request to: ${config.baseURL}${config.url}`);
    console.log(`[API] Auth Token: ${token ? 'PRESENT' : 'MISSING'}`);
  }
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response) {
      console.warn(`[API] Error ${error.response.status} from ${error.config?.url}:`, error.response.data);
    } else if (error.request) {
      console.error(`[API] Network Error from ${error.config?.url}: No response received.`, error.message);
    } else {
      console.error(`[API] Request Setup Error:`, error.message);
    }
    return Promise.reject(error);
  }
);

export const apiService = {
  getBaseUrl: () => API_URL,
  // Orders
  getOrders: (params: any) => api.get('orders', { params }),

  getMapOrders: (params?: any) => api.get('orders/map', { params }),

  getMapOrdersInBounds: (bounds: any, updatedAfter?: string) =>
    api.get('orders/map', { params: { ...bounds, updatedAfter } }),

  parseOrderText: (text: string) => api.post('orders/parse', { text }),

  createOrder: (data: any) => api.post('orders', data),

  getOrderDetails: (id: string) => api.get(`orders/${id}`),

  applyForOrder: (id: string) => api.post(`orders/${id}/claim`),

  updateOrder: (id: string, data: any) => api.patch(`orders/${id}`, data),

  deleteOrder: (id: string) => api.delete(`orders/${id}`),

  // Users
  getProfile: () => api.get('users/profile'),

  getUserProfile: (id: string) => api.get(`users/${id}`),

  updateProfile: (data: any) => api.patch('users/profile', data),

  // Auth
  login: (phone: string) => api.post('auth/login', { phone }),

  register: (data: { phone: string; name: string; role?: string }) =>
    api.post('auth/register', data),

  // Subscriptions
  activateSubscription: (days: number) => api.post('subscriptions/activate', { days }),
};
