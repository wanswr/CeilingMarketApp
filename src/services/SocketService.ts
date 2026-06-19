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

    console.log('[WebSocket] Initializing connection to:', url);
    this.socket = io(url.replace('/api/', ''), {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('WEBSOCKET_CONNECTED', { id: this.socket?.id });
    });

    this.socket.on('order.created', (payload: any) => {
      const order = payload.order || payload;

      // V8 Optimization: Only add order if it's within 100km of our currently loaded area center
      const loadedArea = mapEngine.entityStore?.loadedArea;
      if (loadedArea) {
          const lat = order.latitude ?? order.location?.latitude;
          const lng = order.longitude ?? order.location?.longitude;
          if (lat && lng) {
              const distance = getDistance(lat, lng, loadedArea.lat, loadedArea.lng);
              if (distance > 100) {
                  console.log('[WebSocket] Order skipped (too far):', order.id, distance.toFixed(1) + 'km');
                  return;
              }
          }
      }

      const countBefore = mapEngine.entityStore?.getAllOrders().length;
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.setOrder(order);
      mapEngine.triggerNotify();
      const countAfter = mapEngine.entityStore?.getAllOrders().length;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'order.created', id: order.id, countBefore, countAfter });
    });

    this.socket.on('order.status.changed', (order: any) => {
      const countBefore = mapEngine.entityStore?.getAllOrders().length;
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.setOrder(order);
      mapEngine.triggerNotify();
      const countAfter = mapEngine.entityStore?.getAllOrders().length;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'order.status.changed', id: order.id, status: order.status, countBefore, countAfter });
    });

    this.socket.on('order.updated', (order: any) => {
      const countBefore = mapEngine.entityStore?.getAllOrders().length;
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.setOrder(order);
      mapEngine.triggerNotify();
      const countAfter = mapEngine.entityStore?.getAllOrders().length;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'order.updated', id: order.id, countBefore, countAfter });
    });

    this.socket.on('application.new', (application: any) => {
      mapEngine.requestRouter.metrics.websocketUpdates++;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'application.new', orderId: application.orderId });
      mapEngine.syncOrder(application.orderId);
    });

    this.socket.on('order.completed', (order: any) => {
      const countBefore = mapEngine.entityStore?.getAllOrders().length;
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.setOrder(order);
      mapEngine.triggerNotify();
      const countAfter = mapEngine.entityStore?.getAllOrders().length;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'order.completed', id: order.id, countBefore, countAfter });
    });

    this.socket.on('order.deleted', (payload: any) => {
      const orderId = payload.id || payload.orderId || payload;
      const countBefore = mapEngine.entityStore?.getAllOrders().length;
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.removeOrder(orderId);
      mapEngine.triggerNotify();
      const countAfter = mapEngine.entityStore?.getAllOrders().length;
      console.log('MAP_DATA_SOURCE: WEBSOCKET', { event: 'order.deleted', id: orderId, countBefore, countAfter });
    });

    this.socket.on('disconnect', () => {
      console.log('WEBSOCKET_DISCONNECTED');
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
