import { io, Socket } from 'socket.io-client'
import { mapEngine } from './MapEngine'
import { getDistance } from '../utils/geo'

class SocketService {
  private socket: Socket | null = null;
  private processedEvents: Set<string> = new Set();

  private isDuplicateEvent(eventName: string, payload: any): boolean {
    if (!payload) return false;
    
    // Extract a unique identifier for the payload object
    const id = payload.id || payload.orderId || payload.order?.id || '';
    const status = payload.status || payload.order?.status || '';
    const updatedAt = payload.updatedAt || payload.order?.updatedAt || '';
    
    const eventKey = `${eventName}:${id}:${status}:${updatedAt}`;
    
    if (this.processedEvents.has(eventKey)) {
      if (__DEV__) console.log(`[SocketService] Duplicate event skipped: ${eventKey}`);
      return true;
    }
    
    this.processedEvents.add(eventKey);
    
    // Cap size at 1000 items
    if (this.processedEvents.size > 1000) {
      const oldest = this.processedEvents.values().next().value;
      if (oldest) {
        this.processedEvents.delete(oldest);
      }
    }
    
    return false;
  }

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
    });

    this.socket.on('order.created', (payload: any) => {
      if (this.isDuplicateEvent('order.created', payload)) return;

      const order = payload.order || payload;

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
      mapEngine.entityStore?.setOrder(order, 'websocket');
      mapEngine.triggerNotify();
      mapEngine.entityStore?.persist();
      const countAfter = mapEngine.entityStore?.getAllOrders().length;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'order.created', id: order.id, countBefore, countAfter });
    });

    this.socket.on('order.status.changed', (order: any) => {
      if (this.isDuplicateEvent('order.status.changed', order)) return;

      const countBefore = mapEngine.entityStore?.getAllOrders().length;
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.setOrder(order, 'websocket');
      mapEngine.triggerNotify();
      mapEngine.entityStore?.persist();
      const countAfter = mapEngine.entityStore?.getAllOrders().length;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'order.status.changed', id: order.id, status: order.status, countBefore, countAfter });
    });

    this.socket.on('order.updated', (order: any) => {
      if (this.isDuplicateEvent('order.updated', order)) return;

      const countBefore = mapEngine.entityStore?.getAllOrders().length;
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.setOrder(order, 'websocket');
      mapEngine.triggerNotify();
      mapEngine.entityStore?.persist();
      const countAfter = mapEngine.entityStore?.getAllOrders().length;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'order.updated', id: order.id, countBefore, countAfter });
    });

    this.socket.on('application.new', (application: any) => {
      if (this.isDuplicateEvent('application.new', application)) return;

      mapEngine.requestRouter.metrics.websocketUpdates++;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'application.new', orderId: application.orderId });
      mapEngine.syncOrder(application.orderId);
    });

    this.socket.on('order.completed', (order: any) => {
      if (this.isDuplicateEvent('order.completed', order)) return;

      const countBefore = mapEngine.entityStore?.getAllOrders().length;
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.setOrder(order, 'websocket');
      mapEngine.triggerNotify();
      mapEngine.entityStore?.persist();
      const countAfter = mapEngine.entityStore?.getAllOrders().length;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'order.completed', id: order.id, countBefore, countAfter });
    });

    this.socket.on('order.deleted', (payload: any) => {
      if (this.isDuplicateEvent('order.deleted', payload)) return;

      const orderId = payload.id || payload.orderId || payload;
      const countBefore = mapEngine.entityStore?.getAllOrders().length;
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.removeOrder(orderId);
      mapEngine.triggerNotify();
      const countAfter = mapEngine.entityStore?.getAllOrders().length;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'order.deleted', id: orderId, countBefore, countAfter });
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
}

export const socketService = new SocketService();
