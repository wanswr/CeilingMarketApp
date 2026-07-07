import { io, Socket } from 'socket.io-client'
import { mapEngine } from './MapEngine'
import { getDistance } from '../utils/geo'

class SocketService {
  private socket: Socket | null = null;

  connect(url: string) {
    if (this.socket?.connected) {
        this.joinPrivateRoom();
        return;
    }
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
        transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      console.log('WEBSOCKET_CONNECTED', { id: this.socket?.id });
      this.joinPrivateRoom();
    });

    this.socket.on('order.created', (payload: any) => {
      const order = payload.order || payload;

      const loadedBounds = mapEngine.entityStore?.loadedBounds;
      if (loadedBounds) {
          const centerLat = (loadedBounds.north + loadedBounds.south) / 2;
          const centerLng = (loadedBounds.east + loadedBounds.west) / 2;
          const lat = order.latitude ?? order.location?.latitude ?? order.lat;
          const lng = order.longitude ?? order.location?.longitude ?? order.lng;
          if (lat && lng) {
              const distance = getDistance(lat, lng, centerLat, centerLng);
              if (distance > 150) {
                  return;
              }
          }
      }

      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.setOrder(order, 'websocket');
      mapEngine.triggerNotify();
      mapEngine.entityStore?.persist();
    });

    this.socket.on('order.status.changed', (order: any) => {
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.setOrder(order, 'websocket');
      mapEngine.triggerNotify();
      mapEngine.entityStore?.persist();
    });

    this.socket.on('application.new', (application: any) => {
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.syncOrder(application.orderId);
    });

    this.socket.on('application.accepted', (data: any) => {
       mapEngine.syncOrder(data.orderId);
    });

    this.socket.on('order.deleted', (payload: any) => {
      const orderId = payload.id || payload.orderId || payload;
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.removeOrder(orderId);
      mapEngine.triggerNotify();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WEBSOCKET_DISCONNECTED', { reason });
    });
  }

  private joinPrivateRoom() {
      const currentUser = mapEngine.getCurrentUser();
      const myId = currentUser?.id || currentUser?.uid;
      if (myId && this.socket?.connected) {
          console.log('[WebSocket] Joining private room:', myId);
          this.socket.emit('auth.join', myId);
      }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket() {
      return this.socket;
  }
}

export const socketService = new SocketService();
