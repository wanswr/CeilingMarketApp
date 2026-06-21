import { Order } from '../types';
import { apiService } from './ApiService';
import { requestRouter } from './RequestRouter';
import { entityStore } from './EntityStore';
import { GeoClusterService } from './GeoClusterService';
import { spatialManager } from '../map/SpatialManager';

type OrderCallback = (orders: Order[]) => void;

class MapEngine {
  private subscribers: Map<string, OrderCallback> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private syncLock: boolean = false;
  private currentAbortController: AbortController | null = null;
  private requestCounter: number = 0;
  private lastSyncRegion: { latitude: number, longitude: number, latitudeDelta: number } | null = null;
  public spatialManager = spatialManager;
  private isHydrated = false;
  private lastClusteredOrders: any[] = [];

  constructor(
      public apiService: any,
      public entityStore: any,
      public requestRouter: any,
      public geoClusterService: any
  ) {
      this.initPersistence();
  }

  private initPersistence = async () => {
    if (this.isHydrated) return;
    await Promise.all([
      this.entityStore.hydrate(),
      this.spatialManager.hydrate()
    ]);
    this.isHydrated = true;

    const count = this.entityStore.getAllOrders().length;
    if (count > 0) {
        console.log('MAP_DATA_SOURCE: STORAGE (Hydrated)', { count });
        this.triggerNotify();
    }
  }

  subscribe = (callback: OrderCallback, source: string) => {
    if (!source) {
        console.warn('[MapEngine] Subscribe called without source');
        source = 'unknown_' + Math.random().toString(36).substr(2, 5);
    }
    this.subscribers.set(source, callback);
    console.log('MAP_SUBSCRIBE', { source, total: this.subscribers.size });
    if (this.isHydrated) {
        callback([...this.getOrdersArray()]);
    }
    return () => {
        this.subscribers.delete(source);
        console.log('MAP_UNSUBSCRIBE', { source, remaining: this.subscribers.size });
    };
  }

  private notifySubscribers = (clusteredOrders?: any[]) => {
    const orders = this.getOrdersArray();
    if (__DEV__) console.log('[MapEngine] notifySubscribers, count:', this.subscribers.size);

    let mapOrders = clusteredOrders;
    if (!mapOrders) {
        const currentRegion = mapViewportStore.getRegion();
        mapOrders = this.recalculateClusteredOrders(currentRegion);
    }

    this.subscribers.forEach((cb, source) => {
        if (source === 'MapScreen') {
            cb(mapOrders!);
        } else {
            cb(orders);
        }
    });
  }

  triggerNotify = () => {
      // Re-run clustering with current region if available
      const region = mapViewportStore.getRegion();
      if (region) {
          this.triggerMapUpdate(region);
      } else {
          this.notifySubscribers();
      }
  };

  getOrdersArray = (myOnly: boolean = false): Order[] => {
    if (!this.entityStore) return [];
    const orders = myOnly ? this.entityStore.getMyOrders() : this.entityStore.getAllOrders();
    return orders.sort((a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a =
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
  }

  isSyncRequired = (viewRegion: any, force: boolean = false): boolean => {
    if (!this.entityStore || !viewRegion) return false;

    // 1. BOUNDS-BASED CACHE CHECK (V9)
    const viewport = {
        north: viewRegion.latitude + viewRegion.latitudeDelta / 2,
        south: viewRegion.latitude - viewRegion.latitudeDelta / 2,
        east: viewRegion.longitude + viewRegion.longitudeDelta / 2,
        west: viewRegion.longitude - viewRegion.longitudeDelta / 2,
    };

    const isInside = this.entityStore.loadedBounds &&
        viewport.north <= this.entityStore.loadedBounds.north &&
        viewport.south >= this.entityStore.loadedBounds.south &&
        viewport.east <= this.entityStore.loadedBounds.east &&
        viewport.west >= this.entityStore.loadedBounds.west;

    const shouldFetch = force || !isInside || this.entityStore.getAllOrders().length === 0;

    if (!shouldFetch) return false;
    if (this.syncLock) return false;

    // 1.5. MOVEMENT THRESHOLD CHECK
    if (!force && this.lastSyncRegion) {
        const dist = this.calculateDistance(viewRegion.latitude, viewRegion.longitude, this.lastSyncRegion.latitude, this.lastSyncRegion.longitude);
        const scaleChange = Math.abs(viewRegion.latitudeDelta - this.lastSyncRegion.latitudeDelta) / this.lastSyncRegion.latitudeDelta;

        if (dist < 10 && scaleChange < 0.2) return false;
    }

    return true;
  }

  syncMap = async (force: boolean = false, viewRegion?: { latitude: number, longitude: number, latitudeDelta: number, longitudeDelta: number }) => {
    if (!this.entityStore || !viewRegion) return;

    if (!this.isSyncRequired(viewRegion, force)) {
        if (!this.syncLock) this.notifySubscribers();
        return;
    }

    if (this.currentAbortController) this.currentAbortController.abort();
    this.currentAbortController = new AbortController();
    this.syncLock = true;
    const requestId = ++this.requestCounter;

    try {
      if (__DEV__) console.log('MAP_FETCH_START', { lat: viewRegion.latitude, lng: viewRegion.longitude, requestId });
      const startTime = Date.now();

      const response = await this.apiService.getSpatialOrders({
          lat: viewRegion.latitude,
          lng: viewRegion.longitude,
          radius: 100
      }, { signal: this.currentAbortController?.signal });

      if (requestId !== this.requestCounter) {
          if (__DEV__) console.log('MAP_FETCH_IGNORED_STALE_RESPONSE', { requestId, latest: this.requestCounter });
          return;
      }

      if (response.data) {
        const returnedOrders = response.data.created || response.data.orders || [];
        if (__DEV__) console.log('MAP_FETCH_END', { returnedOrders: returnedOrders.length, durationMs: Date.now() - startTime });

        // V9: PRUNING STALE SPATIAL DATA
        // Before applying the new patch, find orders that should be in this region but weren't returned
        const radiusKm = 100;
        const existingInRegion = this.getOrdersInBounds(
            viewRegion.latitude - 1.0,
            viewRegion.latitude + 1.0,
            viewRegion.longitude - 1.5,
            viewRegion.longitude + 1.5
        );

        const newOrderIds = new Set(returnedOrders.map((o: any) => o.id));
        const myId = this.entityStore.currentUserId;

        let prunedCount = 0;
        existingInRegion.forEach((order: Order) => {
            // Only prune if it's NOT a "My Order" and NOT in the new response
            const isMine = order.employerId === myId || order.executorId === myId || order.applications?.some((a: any) => a.executorId === myId);
            if (!isMine && !newOrderIds.has(order.id)) {
                this.entityStore.removeOrder(order.id);
                prunedCount++;
            }
        });

        if (prunedCount > 0 && __DEV__) {
            console.log('MAP_PRUNED_STALE_ORDERS', { count: prunedCount });
        }

        this.entityStore.applyPatch(response.data);

        // V9: Expanded Bounds (approx 120km to ensure buffer)
        this.entityStore.loadedBounds = {
            north: viewRegion.latitude + 0.9,
            south: viewRegion.latitude - 0.9,
            east: viewRegion.longitude + 1.3,
            west: viewRegion.longitude - 1.3,
        };
        this.entityStore.isInitialLoaded = true;
        this.lastSyncRegion = {
            latitude: viewRegion.latitude,
            longitude: viewRegion.longitude,
            latitudeDelta: viewRegion.latitudeDelta
        };
        console.log('MAP_DATA_SOURCE: API', { count: this.entityStore.getAllOrders().length });
        this.triggerNotify();
        this.entityStore.persist();
      }
    } catch (error: any) {
        if (error.name !== 'AbortError') console.error('Map Sync Fail:', error.message);
    } finally {
        this.syncLock = false;
        this.currentAbortController = null;
    }
  }

  initialLoad = async (lat: number, lng: number) => {
      // V5: Force a sync on initial load to ensure we are not looking at stale storage data
      console.log('[MapEngine] Performing initial server sync...');
      return this.syncMap(true, { latitude: lat, longitude: lng, latitudeDelta: 0.5, longitudeDelta: 0.5 });
  }

  private recalculateClusteredOrders = (region: any): any[] => {
    if (__DEV__) console.log('MAP_VISIBLE_RECALC_START');
    const startTime = Date.now();
    const latPadding = region.latitudeDelta * 0.7; // Wider padding for smoother panning
    const lngPadding = region.longitudeDelta * 0.7;

    const rawCandidates = this.getOrdersInBounds(
        region.latitude - latPadding,
        region.latitude + latPadding,
        region.longitude - lngPadding,
        region.longitude + lngPadding
    );

    // V9: Filter map candidates by status (Only show available orders)
    const candidates = rawCandidates.filter((order: Order) =>
        order.status === 'PUBLISHED' || order.status === 'HAS_RESPONSES'
    );

    // V9: Perform clustering but NEVER hide single orders unless they are actually in a cluster
    const result = this.clusterOrders(candidates, region.latitudeDelta);

    const safeItems = result.filter((item: any) => {
        const coords = this.getOrderCoords(item);
        return coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude);
    });

    this.lastClusteredOrders = safeItems;
    if (__DEV__) {
        console.log('MAP_VISIBLE_RECALC_END', {
            candidates: candidates.length,
            visible: safeItems.length,
            duration: Date.now() - startTime
        });
    }
    return safeItems;
  }

  triggerMapUpdate = (region: any) => {
    if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
        // 1. RECALC VISIBLE & CLUSTERING (Heavy logic moved here)
        const safeItems = this.recalculateClusteredOrders(region);

        // 2. Notify Map Screen with optimized data
        this.notifySubscribers(safeItems);

        // 3. Trigger cache sync/fetch
        this.syncMap(false, region);
    }, 300); // Swifter update
  }

  // --- Selectors ---
  getOrders = (myOnly: boolean = false) => {
      if (myOnly) return this.getOrdersArray(true);
      if (this.lastClusteredOrders.length > 0) return this.lastClusteredOrders;
      // Fallback for first render before any region change
      return this.recalculateClusteredOrders(mapViewportStore.getRegion());
  };
  getOrder = (id: string) => this.entityStore?.getOrder(id);
  getUser = (id: string) => this.entityStore?.getUser(id);
  getCurrentUser = () => {
      const user = this.entityStore?.getCurrentUser();
      if (!user) {
          console.warn("[MapEngine] currentUser unavailable");
      }
      return user;
  };
  getOrdersInBounds = (minLat: number, maxLat: number, minLng: number, maxLng: number) => this.entityStore?.getOrdersInBounds(minLat, maxLat, minLng, maxLng) || [];
  clusterOrders = (orders: Order[], latDelta: number) => this.geoClusterService?.clusterOrders(orders, latDelta) || [];
  getOrderCoords = (order: Order) => this.geoClusterService?.getOrderCoords(order);

  // --- Actions ---
  syncUser = async (force: boolean = false) => {
    if (!force) {
      const cached = this.entityStore.getCurrentUser();
      if (cached) {
        return cached;
      }
    }
    const data = (await this.apiService.getProfile()).data;
    this.entityStore.setUser({ ...data, isMe: true });
    return data;
  }

  getExternalUser = async (userId: string) => {
    const data = (await this.apiService.getUserProfile(userId)).data;
    this.entityStore.setUser(data);
    return data;
  }

  syncOrder = async (orderId: string) => {
    const data = (await this.apiService.getOrderDetails(orderId)).data;
    this.entityStore.setOrder(data);
    return data;
  }

  getApiBaseUrl = () => this.apiService.getBaseUrl();
  syncMyOrders = async () => {
    try {
      const res = await this.apiService.getMyOrders();
      this.entityStore.setOrders(res.data);
      this.notifySubscribers();
      return res.data;
    } catch (e) { return []; }
  }

  updateProfile = async (data: any) => {
    const res = await this.apiService.updateProfile(data);
    this.entityStore?.setUser({ ...res.data, isMe: true });
    return res.data;
  }

  createOrder = async (data: any) => {
    const res = await this.apiService.createOrder(data);
    this.entityStore?.setOrder(res.data);
    this.notifySubscribers();
    return res.data;
  }

  updateOrder = async (id: string, data: any) => {
    const res = await this.apiService.updateOrder(id, data);
    this.entityStore?.setOrder(res.data);
    this.notifySubscribers();
    return res.data;
  }

  applyForOrder = async (id: string, price?: number) => {
    const res = await this.apiService.applyForOrder(id, price);
    if (res.data?.order) {
        this.entityStore.setOrder(res.data.order);
        this.notifySubscribers();
    }
    return res.data;
  }

  cancelApplication = async (id: string) => this.apiService.cancelApplication(id);
  acceptApplication = async (id: string) => this.apiService.acceptApplication(id);
  startOrder = async (id: string) => this.apiService.startOrder(id);
  completeOrder = async (id: string) => this.apiService.completeOrder(id);
  deleteOrder = async (id: string) => {
    const res = await this.apiService.deleteOrder(id);
    this.entityStore.removeOrder(id);
    this.triggerNotify();
    return res.data;
  };
  activateSubscription = async (days: number) => {
    const res = await this.apiService.activateSubscription(days);
    const profile = await this.apiService.getProfile();
    this.entityStore.setUser({ ...profile.data, isMe: true });
    return res.data;
  }
  login = async (phone: string) => {
    const res = await this.apiService.login(phone);
    if (res.data.user) this.entityStore?.setUser({ ...res.data.user, isMe: true });
    return res.data;
  }
  parseOrderText = async (text: string) => (await this.apiService.parseOrderText(text)).data;
  forceRefresh = async () => {
    this.entityStore?.clear();
    return this.syncMap(true, mapViewportStore.getRegion());
  }
}

import { mapViewportStore } from './MapViewportStore';
export const mapEngine = new MapEngine(apiService, entityStore, requestRouter, GeoClusterService);
export const orderOrchestrator = mapEngine;
