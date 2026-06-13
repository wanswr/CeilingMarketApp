import { io, Socket } from 'socket.io-client';
import { entityStore } from './EntityStore';

class SocketService {
  private socket: Socket | null = null;

  connect(url: string) {
    if (this.socket) return;

    this.socket = io(url.replace('/api/', ''));

    this.socket.on('connect', () => {
      console.log('[WebSocket] Connected to backend');
    });

    this.socket.on('order_created', (order: any) => {
      console.log('[WebSocket] New order received:', order.id);
      entityStore.setOrder(order);
    });

    this.socket.on('order_updated', (order: any) => {
      console.log('[WebSocket] Order update received:', order.id);
      entityStore.setOrder(order);
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
