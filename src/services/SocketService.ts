import { io, Socket } from 'socket.io-client';
import { mapEngine } from './MapEngine';

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
      console.log('[WebSocket] Connected to backend - ID:', this.socket?.id);
    });

    this.socket.on('order.created', (payload: any) => {
      const order = payload.order || payload;
      mapEngine.requestRouter.metrics.websocketUpdates++;
      if (__DEV__) {
          console.log('[WebSocket] New order received:', order.id);
      }
      mapEngine.entityStore?.setOrder(order);
      mapEngine.triggerNotify();
    });

    this.socket.on('order.status.changed', (order: any) => {
      mapEngine.requestRouter.metrics.websocketUpdates++;
      console.log('[WebSocket] order.status.changed received:', order.id, order.status);
      mapEngine.entityStore?.setOrder(order);
      mapEngine.triggerNotify();
    });

    this.socket.on('order.updated', (order: any) => {
      mapEngine.requestRouter.metrics.websocketUpdates++;
      console.log('[WebSocket] order.updated received:', order.id);
      mapEngine.entityStore?.setOrder(order);
      mapEngine.triggerNotify();
    });

    this.socket.on('application.new', (application: any) => {
      mapEngine.requestRouter.metrics.websocketUpdates++;
      console.log('[WebSocket] New application for order:', application.orderId);
      // Update order to reflect HAS_RESPONSES and include new app
      mapEngine.syncOrder(application.orderId, true);
    });

    this.socket.on('order.completed', (order: any) => {
      mapEngine.requestRouter.metrics.websocketUpdates++;
      console.log('[WebSocket] order.completed received:', order.id);
      mapEngine.entityStore?.setOrder(order);
      mapEngine.triggerNotify();
    });

    this.socket.on('disconnect', () => {
      console.log('[WebSocket] Disconnected');
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
