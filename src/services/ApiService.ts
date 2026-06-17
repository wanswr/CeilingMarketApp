import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

const DEFAULT_API_URL = 'http://192.168.100.10:3000/api/'; // Replace with your machine's IP

class ApiService {
  private api: AxiosInstance;
  private baseURL: string;

  constructor() {
    this.baseURL = DEFAULT_API_URL;
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  setBaseUrl(url: string) {
    this.baseURL = url;
    this.api.defaults.baseURL = url;
  }

  private setupInterceptors() {
    this.api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
      const token = await SecureStore.getItemAsync('userToken');
      if (__DEV__) {
        console.log(`[API] ${config.method?.toUpperCase()} -> ${config.url}`);
      }
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (__DEV__) {
          console.warn(`[API] FAIL ${error.response?.status} -> ${error.config?.url}`, error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  // Orders
  getOrders = (params: any) => this.api.get('orders', { params });
  getMapOrdersInBounds = (bounds: any, updatedAfter?: string) =>
    this.api.get('orders/map/bounds', { params: { ...bounds, updatedAfter } });

  getSpatialOrders = (params: any) => this.api.get('orders/spatial', { params });

  parseOrderText = (text: string) => this.api.post('orders/parse', { text });
  createOrder = (data: any) => this.api.post('orders', data);
  getOrderDetails = (id: string) => this.api.get(`orders/${id}`);
  applyForOrder = (id: string) => this.api.post(`orders/${id}/claim`);
  updateOrder = (id: string, data: any) => this.api.patch(`orders/${id}`, data);
  deleteOrder = (id: string) => this.api.delete(`orders/${id}`);

  // Users
  getProfile = () => this.api.get('users/profile');
  getUserProfile = (id: string) => this.api.get(`users/${id}`);
  updateProfile = (data: any) => this.api.patch('users/profile', data);

  // Auth
  login = (phone: string) => this.api.post('auth/login', { phone });
  register = (data: any) => this.api.post('auth/register', data);

  // Subscriptions
  activateSubscription = (days: number) => this.api.post('subscriptions/activate', { days });

  getBaseUrl = () => this.baseURL;
}

export const apiService = new ApiService();
