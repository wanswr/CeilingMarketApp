import axios, { InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

// Base URL for the API.
// For Android Emulator, use 'http://10.0.2.2:3000/api'
// For iOS Simulator, 'http://localhost:3000/api' works
// For physical devices, use your machine's local IP address (e.g., 'http://192.168.1.50:3000/api')
const API_URL = 'http://192.168.1.229:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to add the JWT token to every request
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await SecureStore.getItemAsync('userToken');
  console.log(`[API] Request to ${config.url} with token: ${token ? 'PRESENT' : 'MISSING'}`);
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      console.warn("[API] 401 Unauthorized detected. URL:", error.config?.url);
    }
    return Promise.reject(error);
  }
);

export const apiService = {
  // Orders
  getOrders: (params: any, config: any = {}) =>
    api.get('/orders', { params, ...config }),

  getMapOrders: () => api.get('/orders/map'),

  createOrder: (data: any) => api.post('/orders', data),

  getOrderDetails: (id: string) => api.get(`/orders/${id}`),

  applyForOrder: (id: string) => api.post(`/orders/${id}/apply`),

  updateOrder: (id: string, data: any) => api.patch(`/orders/${id}`, data),

  deleteOrder: (id: string) => api.delete(`/orders/${id}`),

  // Users
  getProfile: () => api.get('/users/profile'),

  getUserProfile: (id: string) => api.get(`/users/${id}`),

  updateProfile: (data: any) => api.patch('/users/profile', data),

  // Auth
  login: (phone: string) => api.post('/auth/login', { phone }),

  register: (data: { phone: string; name: string; role?: string }) =>
    api.post('/auth/register', data),

  // Subscriptions
  activateSubscription: (days: number) => api.post('/subscriptions/activate', { days }),
};
