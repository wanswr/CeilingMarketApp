import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { logger } from './logger/LoggerService';

/**
 * ApiService V11: Hardened connection logic with explicit host logging.
 */
// @ts-ignore
import { API_URL } from '@env';

const DEFAULT_API_URL = API_URL || (__DEV__ ? 'http://192.168.1.124:3000/api/' : 'https://api.ceilingsapp.com/api/');

class ApiService {
  public api: AxiosInstance;
  private baseURL: string;

  constructor() {
    this.baseURL = DEFAULT_API_URL;

    // V11: Log initialization to help diagnose IP mismatches after sleep
    logger.info('[ApiService] Initializing with Base URL:', { url: this.baseURL });

    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.setupInterceptors();
  }

  setBaseUrl(url: string) {
    logger.info('[ApiService] Base URL updated:', { from: this.baseURL, to: url });
    this.baseURL = url;
    this.api.defaults.baseURL = url;
  }

  private setupInterceptors() {
    this.api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
      const token = await SecureStore.getItemAsync('userToken');
      const requestId = Math.random().toString(36).substring(7);

      (config as any).requestId = requestId;

      // V11: Added detailed logging for connection attempts
      logger.logRequest(config.method?.toUpperCase() || 'GET', config.url || '', requestId, config.data);

      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    this.api.interceptors.response.use(
      (response) => {
        const requestId = (response.config as any).requestId;
        logger.logResponse(requestId, response.status, response.data);
        return response;
      },
      (error) => {
        const requestId = (error.config as any)?.requestId;
        if (requestId) {
            logger.logNetworkError(requestId, error);
        }

        // V11: Enhanced error detection for "overnight disconnect"
        if (error.code === 'ERR_NETWORK' || !error.response) {
            logger.error('NETWORK_DISCONNECT', {
                url: error.config?.url,
                host: this.baseURL,
                message: error.message
            });
        }

        return Promise.reject(error);
      }
    );
  }

  // Orders
  getOrders = (params: any) => this.api.get('orders', { params });
  getMyOrders = (params?: { skip?: number; take?: number }) => this.api.get('orders/my', { params });
  getOrdersSpatial = (params: any, config?: any) => this.api.get('orders/spatial', { params, ...config });

  parseOrderText = (text: string) => this.api.post('orders/parse', { text });
  createOrder = (data: any) => this.api.post('orders', data);
  getOrderDetails = (id: string) => this.api.get(`orders/${id}`);
  applyForOrder = (id: string, price?: number, idempotencyKey?: string) => this.api.post(`orders/${id}/apply`, { price, idempotencyKey });
  cancelApplication = (id: string) => this.api.delete(`orders/${id}/apply`);
  acceptApplication = (applicationId: string) => this.api.post(`orders/applications/${applicationId}/accept`);
  markApplicationViewed = (applicationId: string) => this.api.patch(`orders/applications/${applicationId}/view`);
  startOrder = (id: string) => this.api.post(`orders/${id}/start`);
  completeOrder = (id: string) => this.api.post(`orders/${id}/complete`);
  updateOrder = (id: string, data: any) => this.api.patch(`orders/${id}`, data);
  deleteOrder = (id: string) => this.api.delete(`orders/${id}`);

  // Users
  getProfile = () => this.api.get('users/profile');
  getDashboard = () => this.api.get('users/profile/dashboard');
  getUserProfile = (id: string) => this.api.get(`users/${id}`);
  updateProfile = (data: any) => this.api.patch('users/profile', data);
  verifyProfile = () => this.api.post('users/profile/verify');
  getCategories = () => this.api.get('categories');
  setActiveCategory = (categoryId: string) => this.api.patch('users/profile/category', { categoryId });
  setRole = (role: 'WORKER' | 'EMPLOYER') => this.api.patch('users/profile/role', { role });

  // Auth
  requestOtp = (phone: string) => this.api.post('auth/request-otp', { phone });
  verifyOtp = (phone: string, code: string) => this.api.post('auth/verify-otp', { phone, code });
  login = (phone: string) => this.api.post('auth/login', { phone });
  register = (data: any) => this.api.post('auth/register', data);

  // Chats
  getMyChats = () => this.api.get('chats');
  getChatMessages = (chatId: string, cursor?: string) => this.api.get(`chats/${chatId}/messages`, { params: { cursor } });
  getOrCreateChat = (orderId: string, executorId: string) => this.api.post('chats', { orderId, executorId });
  sendMessage = (chatId: string, text: string) => this.api.post(`chats/${chatId}/messages`, { text });
  markChatAsRead = (chatId: string) => this.api.patch(`chats/${chatId}/read`);

  // Reviews
  createReview = (data: { orderId: string, rating: number, comment?: string }) => this.api.post('reviews', data);
  getMasterReviews = (masterId: string) => this.api.get(`reviews/master/${masterId}`);
  getPendingReviews = () => this.api.get("reviews/pending");
  getMyReviews = () => this.api.get("reviews/my");

  // Subscriptions
  activateSubscription = (days: number) => this.api.post('subscriptions/activate', { days });

  getBaseUrl = () => this.baseURL;
}

export const apiService = new ApiService();
