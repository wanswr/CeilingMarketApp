import { io, Socket } from 'socket.io-client';
import { mapEngine } from './MapEngine';
import { getDistance } from '../utils/geo';

class SocketService {
  private socket: Socket | null = null;

  connect(url: string) {
    if (this.socket?.connected) return;
    if (this.socket) {
        this.socket.connect();
        return;
    }

    const socketUrl = url.replace('/api/', '');
    console.log('[WebSocket] Initializing connection to:', socketUrl);
    this.socket = io(socketUrl, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket'], // Prefer pure websockets for stability
    });

    this.socket.on('connect', () => {
      console.log('WEBSOCKET_CONNECTED', { id: this.socket?.id });

      // Join personal room
      const user = mapEngine.getCurrentUser();
      const userId = user?.uid || user?.id;
      if (userId) {
          this.socket?.emit('user.join', userId);
      }

      // Join geo room based on current map center
      const region = mapEngine.entityStore.loadedBounds;
      if (region) {
          const lat = (region.north + region.south) / 2;
          const lng = (region.east + region.west) / 2;
          this.socket?.emit('geo.join', { lat, lng });
      }

      // V10: Sync missed events after reconnection
      mapEngine.syncAfterReconnect();
    });

    this.socket.on('order.created', (payload: any) => {
      const order = payload.order || payload;
      const eventId = payload.eventId;

      // V9 Optimization: Only add order if it's within 100km of our currently loaded area center
      const loadedBounds = mapEngine.entityStore?.loadedBounds;
      if (loadedBounds) {
          const centerLat = (loadedBounds.north + loadedBounds.south) / 2;
          const centerLng = (loadedBounds.east + loadedBounds.west) / 2;
          const lat = order.latitude ?? order.location?.latitude ?? order.lat;
          const lng = order.longitude ?? order.location?.longitude ?? order.lng;
          if (lat && lng) {
              const distance = getDistance(lat, lng, centerLat, centerLng);
              if (distance > 150) { // Increased buffer for WebSockets
                  console.log('[WebSocket] Order skipped (too far):', order.id, distance.toFixed(1) + 'km');
                  return;
              }
          }
      }

      const countBefore = mapEngine.entityStore?.getAllOrders().length;
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.setOrder(order, 'websocket', eventId);
      mapEngine.triggerNotify();
      mapEngine.entityStore?.persist();
      const countAfter = mapEngine.entityStore?.getAllOrders().length;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'order.created', id: order.id, countBefore, countAfter, eventId });
    });

    this.socket.on('order.status.changed', (payload: any) => {
      const order = payload.order || payload;
      const eventId = payload.eventId;
      const countBefore = mapEngine.entityStore?.getAllOrders().length;
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.setOrder(order, 'websocket', eventId);
      mapEngine.triggerNotify();
      mapEngine.entityStore?.persist();
      const countAfter = mapEngine.entityStore?.getAllOrders().length;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'order.status.changed', id: order.id, status: order.status, countBefore, countAfter, eventId });
    });

    this.socket.on('order.updated', (payload: any) => {
      const order = payload.order || payload;
      const eventId = payload.eventId;
      const countBefore = mapEngine.entityStore?.getAllOrders().length;
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.setOrder(order, 'websocket', eventId);
      mapEngine.triggerNotify();
      mapEngine.entityStore?.persist();
      const countAfter = mapEngine.entityStore?.getAllOrders().length;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'order.updated', id: order.id, countBefore, countAfter, eventId });
    });

    this.socket.on('application.new', (application: any) => {
      mapEngine.requestRouter.metrics.websocketUpdates++;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'application.new', orderId: application.orderId });
      mapEngine.syncOrder(application.orderId);
    });

    this.socket.on('order.completed', (payload: any) => {
      const order = payload.order || payload;
      const eventId = payload.eventId;
      const countBefore = mapEngine.entityStore?.getAllOrders().length;
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.setOrder(order, 'websocket', eventId);
      mapEngine.triggerNotify();
      mapEngine.entityStore?.persist();
      const countAfter = mapEngine.entityStore?.getAllOrders().length;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'order.completed', id: order.id, countBefore, countAfter, eventId });
    });

    this.socket.on('order.deleted', (payload: any) => {
      const orderId = payload.id || payload.orderId || payload;
      const eventId = payload.eventId;
      const countBefore = mapEngine.entityStore?.getAllOrders().length;
      mapEngine.requestRouter.metrics.websocketUpdates++;

      if (eventId) {
          if (mapEngine.entityStore.seenEvents.has(eventId)) return;
          mapEngine.entityStore.seenEvents.add(eventId);
      }

      mapEngine.entityStore?.removeOrder(orderId);
      mapEngine.triggerNotify();
      // removeOrder already persists
      const countAfter = mapEngine.entityStore?.getAllOrders().length;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'order.deleted', id: orderId, countBefore, countAfter, eventId });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WEBSOCKET_DISCONNECTED', { reason });
    });

    this.socket.on('connect_error', (error) => {
      console.warn('WEBSOCKET_CONNECT_ERROR', { message: error.message });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  updateGeoRoom(lat: number, lng: number) {
    if (this.socket?.connected) {
      this.socket.emit('geo.join', { lat, lng });
    }
  }
}

export const socketService = new SocketService();
