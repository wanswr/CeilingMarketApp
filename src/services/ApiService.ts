import axios, { InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'http://your-api-url.com/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await AsyncStorage.getItem('userToken');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const apiService = {
  // Orders
  getOrders: (params: any) => api.get('/orders', { params }),
  createOrder: (data: any) => api.post('/orders', data),
  getOrderDetails: (id: string) => api.get(`/orders/${id}`),
  applyForOrder: (id: string) => api.post(`/orders/${id}/apply`),
  updateOrderStatus: (id: string, status: string) => api.patch(`/orders/${id}/status`, { status }),

  // Users
  getUserProfile: (id: string) => api.get(`/users/${id}`),
  updateProfile: (data: any) => api.patch('/users/me', data),

  // Auth
  login: (phone: string) => api.post('/auth/login', { phone }),
  register: (data: any) => api.post('/auth/register', data),
};
