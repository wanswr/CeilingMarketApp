import { io, Socket } from 'socket.io-client';
import { orderOrchestrator } from './OrderOrchestrator';

class SocketService {
  private socket: Socket | null = null;

  connect(url: string) {
    if (this.socket) return;

    this.socket = io(url.replace('/api/', ''));

    this.socket.on('connect', () => {
      console.log('[WebSocket] Connected to backend');
    });

    this.socket.on('order_created', (order: any) => {
      if (__DEV__) {
          console.log('[WebSocket] New order received:', order.id);
          const meta = orderOrchestrator.entityStore?.meta;
          if (meta) meta.wsUpdates = (meta.wsUpdates || 0) + 1;
      }
      orderOrchestrator.entityStore?.setOrder(order);
      orderOrchestrator.triggerNotify();
    });

    this.socket.on('order_updated', (order: any) => {
      if (__DEV__) {
          console.log('[WebSocket] Order update received:', order.id);
          const meta = orderOrchestrator.entityStore?.meta;
          if (meta) meta.wsUpdates = (meta.wsUpdates || 0) + 1;
      }
      orderOrchestrator.entityStore?.setOrder(order);
      orderOrchestrator.triggerNotify();
    });

    this.socket.on('order_claimed', (order: any) => {
      console.log('[WebSocket] Order claimed received:', order.id);
      orderOrchestrator.entityStore?.setOrder(order);
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
