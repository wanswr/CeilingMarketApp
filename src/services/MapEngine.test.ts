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

jest.mock('@env', () => ({
  __esModule: true,
  API_URL: 'http://localhost:3000/api/'
}), { virtual: true });

jest.mock('./MapViewportStore', () => {
  return {
    mapViewportStore: {
      subscribe: jest.fn(),
      getRegion: jest.fn().mockReturnValue({
        latitude: 55.75,
        longitude: 37.61,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      })
    }
  };
});

import { mapEngine } from './MapEngine';
import { CONFIG } from '../constants/config';
import { apiService } from './ApiService';
import { useClientStore } from '../store/client.store';
import { requestRouter } from './RequestRouter';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue('fake-token'),
  setItemAsync: jest.fn().mockResolvedValue(true),
  deleteItemAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('react-native-mmkv', () => {
  return {
    MMKV: jest.fn().mockImplementation(() => {
      return {
        getString: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
        clearAll: jest.fn(),
        getAllKeys: jest.fn().mockReturnValue([]),
      };
    })
  };
}, { virtual: true });

describe('MapEngine - syncMap pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requestRouter.clear();
    mapEngine.entityStore.clear();
    mapEngine.entityStore.setUser({ id: 'test-user-123', name: 'Test User', role: 'WORKER', isMe: true } as any);
    useClientStore.getState().setActiveRole('WORKER');
  });

  it('should bypass requestRouter on second and subsequent pages when cursorId is set', async () => {
    // Generate page 1 orders (250 items, last item with id 'order-250')
    const page1Orders = Array.from({ length: 250 }, (_, i) => ({
      id: `order-${i + 1}`,
      latitude: 55.75,
      longitude: 37.61,
      status: 'PUBLISHED',
    }));

    // Generate page 2 orders (250 items, different IDs)
    const page2Orders = Array.from({ length: 250 }, (_, i) => ({
      id: `order-${i + 251}`,
      latitude: 55.75,
      longitude: 37.61,
      status: 'PUBLISHED',
    }));

    // Mock apiService.getOrdersSpatial
    const getOrdersSpatialSpy = jest.spyOn(apiService, 'getOrdersSpatial')
      .mockImplementation(async (params: any) => {
        if (!params.cursorId) {
          return { data: { created: page1Orders } } as any;
        } else if (params.cursorId === 'order-250') {
          return { data: { created: page2Orders } } as any;
        }
        return { data: { created: [] } } as any;
      });

    // Spy on requestRouter.request
    const requestRouterSpy = jest.spyOn(requestRouter, 'request');

    // Execute syncMap with force = false
    const region = {
      latitude: 55.75,
      longitude: 37.61,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    };

    // We can spy on entityStore.setOrders to see what got saved
    const setOrdersSpy = jest.spyOn(mapEngine.entityStore, 'setOrders');

    await mapEngine.syncMap(false, region);

    // Verify apiService.getOrdersSpatial was called 3 times total
    // (Call 1: no cursor, returns 250 orders)
    // (Call 2: cursorId 'order-250', returns 250 orders)
    // (Call 3: cursorId 'order-500', returns 0 orders to terminate the pagination loop)
    expect(getOrdersSpatialSpy).toHaveBeenCalledTimes(3);

    // First call has no cursorId
    expect(getOrdersSpatialSpy.mock.calls[0][0]).toEqual({
      minLat: 55.690000000000005,
      maxLat: 55.809999999999995,
      minLng: 37.550000000000004,
      maxLng: 37.669999999999995,
      zoom: 14,
      limit: 250,
    });

    // Second call must have cursorId: 'order-250'
    expect(getOrdersSpatialSpy.mock.calls[1][0]).toEqual({
      minLat: 55.690000000000005,
      maxLat: 55.809999999999995,
      minLng: 37.550000000000004,
      maxLng: 37.669999999999995,
      zoom: 14,
      limit: 250,
      cursorId: 'order-250',
    });

    // Third call must have cursorId: 'order-500'
    expect(getOrdersSpatialSpy.mock.calls[2][0]).toEqual({
      minLat: 55.690000000000005,
      maxLat: 55.809999999999995,
      minLng: 37.550000000000004,
      maxLng: 37.669999999999995,
      zoom: 14,
      limit: 250,
      cursorId: 'order-500',
    });

    // Verify requestRouter.request was called exactly ONCE (only for page 1)
    // because subsequent pages have cursorId and bypass it completely
    expect(requestRouterSpy).toHaveBeenCalledTimes(1);
    expect(requestRouterSpy.mock.calls[0][0]).toContain('map:spatial');

    // Verify that entityStore.setOrders was called with the combined 500 orders
    expect(setOrdersSpy).toHaveBeenCalledTimes(1);
    const combinedOrders = setOrdersSpy.mock.calls[0][0];
    expect(combinedOrders.length).toBe(500);

    // Ensure all 500 are distinct
    const uniqueIds = new Set(combinedOrders.map((o: any) => o.id));
    expect(uniqueIds.size).toBe(500);
  });
});
