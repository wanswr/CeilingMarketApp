jest.mock('react-native', () => {
  (global as any).__DEV__ = true;
  (global as any).API_URL = 'http://localhost:3000/api/';
  return {
    Platform: {
      OS: 'ios',
      select: jest.fn().mockImplementation((obj) => obj.ios || obj.default),
    }
  };
}, { virtual: true });

jest.mock('@env', () => {
  (global as any).API_URL = 'http://localhost:3000/api/';
  return {
    __esModule: true,
    API_URL: 'http://localhost:3000/api/'
  };
}, { virtual: true });

import { mutationQueueService } from './MutationQueueService';
import { networkService } from './NetworkService';
import { apiService } from './ApiService';
import { entityStore } from './EntityStore';

jest.mock('@react-native-community/netinfo', () => {
  let isConnected = true;
  let listeners: any[] = [];
  return {
    fetch: jest.fn().mockImplementation(() => Promise.resolve({ isConnected })),
    addEventListener: jest.fn().mockImplementation((cb) => {
      listeners.push(cb);
      return () => {
        listeners = listeners.filter(l => l !== cb);
      };
    }),
    __setConnected: (status: boolean) => {
      isConnected = status;
      listeners.forEach(cb => cb({ isConnected: status }));
    }
  };
});

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue('fake-token'),
  setItemAsync: jest.fn().mockResolvedValue(true),
  deleteItemAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('react-native-mmkv', () => {
  return {
    MMKV: jest.fn().mockImplementation(() => {
      let store = new Map();
      return {
        getString: (k: string) => store.get(k),
        set: (k: string, v: string) => store.set(k, v),
        delete: (k: string) => store.delete(k),
        clearAll: () => store.clear(),
        getAllKeys: () => Array.from(store.keys()),
      };
    })
  };
}, { virtual: true });

describe('MutationQueueService & Offline-First flow', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    mutationQueueService.clearQueue();
    entityStore.clear();
    entityStore.setUser({ id: 'user-1', name: 'Test User', role: 'WORKER', isMe: true } as any);

    const netinfo = require('@react-native-community/netinfo');
    netinfo.__setConnected(true);
  });

  it('Scenario A: Mutation executes immediately when online', async () => {
    const apiSpy = jest.spyOn(apiService, 'createOrder').mockResolvedValue({
      data: { id: 'srv_order_123', title: 'Test Order', status: 'PUBLISHED', latitude: 55.75, longitude: 37.61 },
      status: 201
    } as any);

    const result = await apiService.createOrder({ title: 'Test Order', latitude: 55.75, longitude: 37.61 });

    expect(result.data.id).toBe('srv_order_123');
    expect(apiSpy).toHaveBeenCalledTimes(1);
    expect(mutationQueueService.getQueue().length).toBe(0);
  });

  it('Scenario B: Mutation queued when offline', async () => {
    const netinfo = require('@react-native-community/netinfo');
    netinfo.__setConnected(false);

    expect(networkService.isOnline()).toBe(false);

    const result = await apiService.createOrder({ title: 'Offline Order', latitude: 55.75, longitude: 37.61 });

    expect(result.data.id).toContain('temp_create_');
    expect(mutationQueueService.getQueue().length).toBe(1);
    expect(mutationQueueService.getQueue()[0].status).toBe('pending');
  });

  it('Scenario C & D: Internet appears -> automatically processed and removed from queue', async () => {
    const netinfo = require('@react-native-community/netinfo');
    netinfo.__setConnected(false);

    await apiService.createOrder({ title: 'Offline Order', latitude: 55.75, longitude: 37.61 });
    expect(mutationQueueService.getQueue().length).toBe(1);

    const apiSpy = jest.spyOn(apiService, 'createOrder').mockResolvedValue({
      data: { id: 'srv_order_789', title: 'Offline Order', status: 'PUBLISHED', latitude: 55.75, longitude: 37.61 },
      status: 201
    } as any);

    netinfo.__setConnected(true);
    expect(networkService.isOnline()).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 150));

    expect(apiSpy).toHaveBeenCalledTimes(1);
    expect(mutationQueueService.getQueue().length).toBe(0);
    expect(entityStore.getOrder('srv_order_789')).toBeDefined();
  });

  it('Scenario E: Mutation gets permanent error -> removed from active queue with failed status', async () => {
    const netinfo = require('@react-native-community/netinfo');
    netinfo.__setConnected(false);

    await apiService.createOrder({ title: 'Bad Order', latitude: 55.75, longitude: 37.61 });

    const apiSpy = jest.spyOn(apiService, 'createOrder').mockRejectedValue({
      response: { status: 400 },
      message: 'Bad Request'
    });

    netinfo.__setConnected(true);

    await new Promise(resolve => setTimeout(resolve, 150));

    expect(apiSpy).toHaveBeenCalledTimes(1);
    const queue = mutationQueueService.getQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].status).toBe('failed');
    expect(queue[0].error).toContain('Permanent error');
  });

  it('Scenario F: Persisted queue survives reload', () => {
    const netinfo = require('@react-native-community/netinfo');
    netinfo.__setConnected(false);

    mutationQueueService.add('updateProfile', { data: { name: 'Bob' } });
    expect(mutationQueueService.getQueue().length).toBe(1);

    const list = entityStore.hydrate();
    expect(mutationQueueService.getQueue().length).toBe(1);
  });

  it('Scenario G: Multiple mutations in queue processed in FIFO order', async () => {
    const netinfo = require('@react-native-community/netinfo');
    netinfo.__setConnected(false);

    await apiService.createOrder({ title: 'Order A', latitude: 55.75, longitude: 37.61 });
    await apiService.createOrder({ title: 'Order B', latitude: 55.75, longitude: 37.61 });

    const queue = mutationQueueService.getQueue();
    expect(queue.length).toBe(2);

    const apiSpy = jest.spyOn(apiService, 'createOrder').mockResolvedValue({
      data: { id: 'srv_order_real', title: 'Order', status: 'PUBLISHED', latitude: 55.75, longitude: 37.61 },
      status: 201
    } as any);

    netinfo.__setConnected(true);

    await new Promise(resolve => setTimeout(resolve, 150));

    expect(apiSpy).toHaveBeenCalledTimes(2);
    expect(mutationQueueService.getQueue().length).toBe(0);
  });

  it('Scenario H: applyForOrder on a temp_ ID order is blocked', async () => {
    await expect(apiService.applyForOrder('temp_create_123', 500)).rejects.toThrow();
  });
});

describe('MutationQueueService - Idempotency & Retry Policy', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    mutationQueueService.clearQueue();
    const netinfo = require('@react-native-community/netinfo');
    netinfo.__setConnected(true);
  });

  it('should preserve and pass the SAME idempotencyKey across retries', async () => {
    const netinfo = require('@react-native-community/netinfo');
    netinfo.__setConnected(false);

    const idempotencyKey = 'unique-idem-key-999';
    await apiService.createOrder({ title: 'Idempotent Order', latitude: 55.75, longitude: 37.61, idempotencyKey });

    const queue = mutationQueueService.getQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].idempotencyKey).toBe(idempotencyKey);

    let attempts = 0;
    const apiSpy = jest.spyOn(apiService, 'createOrder').mockImplementation(async (data: any) => {
      attempts++;
      expect(data.idempotencyKey).toBe(idempotencyKey);
      if (attempts === 1) {
        throw { response: { status: 500 }, message: 'Server Internal Error' };
      }
      return { data: { id: 'srv_order_idem', title: 'Idempotent Order' }, status: 201 } as any;
    });

    netinfo.__setConnected(true);
    await new Promise(resolve => setTimeout(resolve, 100));

    // Attempt 1 failed with 500
    expect(apiSpy).toHaveBeenCalledTimes(1);
    expect(mutationQueueService.getQueue()[0].retryCount).toBe(1);

    // Attempt 2 succeeds using the EXACT SAME idempotencyKey
    await mutationQueueService.processQueue();
    expect(apiSpy).toHaveBeenCalledTimes(2);
    expect(mutationQueueService.getQueue().length).toBe(0);
  });

  it('should stop retrying 5xx or 429 errors when MAX_RETRY_COUNT is reached', async () => {
    const netinfo = require('@react-native-community/netinfo');
    netinfo.__setConnected(false);

    mutationQueueService.add('applyForOrder', { id: 'order-1', price: 1000 }, 'idem-apply-123');

    const apiSpy = jest.spyOn(apiService, 'applyForOrder').mockRejectedValue({
      response: { status: 429 },
      message: 'Too Many Requests'
    });

    netinfo.__setConnected(true);
    await new Promise(resolve => setTimeout(resolve, 100)); // Attempt 1

    await mutationQueueService.processQueue(); // Attempt 2
    await mutationQueueService.processQueue(); // Attempt 3

    expect(apiSpy).toHaveBeenCalledTimes(3);

    const queue = mutationQueueService.getQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].status).toBe('failed');
    expect(queue[0].error).toContain('Exceeded retry limit');
  });
});

describe('MutationQueueService - Independent vs Dependent Ordering', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    mutationQueueService.clearQueue();
    const netinfo = require('@react-native-community/netinfo');
    netinfo.__setConnected(true);
  });

  it('Test 1: Independent mutations - updateProfile 5xx error does NOT block sendMessage', async () => {
    const netinfo = require('@react-native-community/netinfo');
    netinfo.__setConnected(false);

    mutationQueueService.add('updateProfile', { data: { name: 'Alice' } });
    mutationQueueService.add('sendMessage', { chatId: 'chat-100', text: 'Hello' });

    expect(mutationQueueService.getQueue().length).toBe(2);

    const updateProfileSpy = jest.spyOn(apiService, 'updateProfile').mockRejectedValue({
      response: { status: 500 },
      message: 'Internal Server Error'
    });

    const sendMessageSpy = jest.spyOn(apiService, 'sendMessage').mockResolvedValue({
      data: { success: true }
    } as any);

    netinfo.__setConnected(true);
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(updateProfileSpy).toHaveBeenCalledTimes(1);
    expect(sendMessageSpy).toHaveBeenCalledTimes(1);

    const queue = mutationQueueService.getQueue();
    expect(queue.length).toBe(1);
    expect(queue[0].type).toBe('updateProfile');
  });

  it('Test 2: Dependent mutations - createOrder 5xx error blocks applyForOrder on same order', async () => {
    const netinfo = require('@react-native-community/netinfo');
    netinfo.__setConnected(false);

    const tempId = 'temp_order_999';
    mutationQueueService.add('createOrder', { tempId, data: { title: 'Order' } });
    mutationQueueService.add('applyForOrder', { id: tempId, price: 500 });

    expect(mutationQueueService.getQueue().length).toBe(2);

    const createOrderSpy = jest.spyOn(apiService, 'createOrder').mockRejectedValue({
      response: { status: 500 },
      message: 'Internal Server Error'
    });

    const applyForOrderSpy = jest.spyOn(apiService, 'applyForOrder');

    netinfo.__setConnected(true);
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(createOrderSpy).toHaveBeenCalledTimes(1);
    expect(applyForOrderSpy).not.toHaveBeenCalled();

    const queue = mutationQueueService.getQueue();
    expect(queue.length).toBe(2);
  });
});
