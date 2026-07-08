import { io, Socket } from 'socket.io-client'
import { mapEngine } from './MapEngine'
import { getDistance } from '../utils/geo'
import { logger } from './logger/LoggerService'

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
    logger.info('[WebSocket] Connecting...', { source: 'websocket', url: socketUrl });

    this.socket = io(socketUrl, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      logger.logWS('WS_CONNECTED', { socketId: this.socket?.id });
      this.joinPrivateRoom();
    });

    this.socket.on('order.created', (payload: any) => {
      const eventId = payload.eventId || payload.id;
      if (eventId && mapEngine.entityStore?.isEventSeen(eventId)) {
          logger.logWS('WS_EVENT_DUPLICATE', { event: 'order.created', eventId });
          return;
      }
      if (eventId) mapEngine.entityStore?.markEventSeen(eventId);

      const order = payload.order || payload;
      logger.logWS('WS_EVENT_RECEIVED', { event: 'order.created', orderId: order.id });

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

    this.socket.on('order.status.changed', (payload: any) => {
      const eventId = payload.eventId || `status_${payload.id}_${payload.status}`;
      if (mapEngine.entityStore?.isEventSeen(eventId)) {
          logger.logWS('WS_EVENT_DUPLICATE', { event: 'order.status.changed', eventId });
          return;
      }
      mapEngine.entityStore?.markEventSeen(eventId);

      const order = payload.order || payload;
      logger.logWS('WS_EVENT_RECEIVED', { event: 'order.status.changed', orderId: order.id, status: order.status });
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.setOrder(order, 'websocket');
      mapEngine.triggerNotify();
      mapEngine.entityStore?.persist();
    });

    this.socket.on('application.new', (payload: any) => {
      const eventId = payload.eventId || `app_new_${payload.id}`;
      if (mapEngine.entityStore?.isEventSeen(eventId)) return;
      mapEngine.entityStore?.markEventSeen(eventId);

      const application = payload.application || payload;
      logger.logWS('WS_EVENT_RECEIVED', { event: 'application.new', orderId: application.orderId });
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.syncOrder(application.orderId);
    });

    this.socket.on('application.accepted', (payload: any) => {
       const eventId = payload.eventId || `app_acc_${payload.orderId}`;
       if (mapEngine.entityStore?.isEventSeen(eventId)) return;
       mapEngine.entityStore?.markEventSeen(eventId);

       logger.logWS('WS_EVENT_RECEIVED', { event: 'application.accepted', orderId: payload.orderId });
       mapEngine.syncOrder(payload.orderId);
    });

    this.socket.on('message.new', (msg: any) => {
        logger.logWS('WS_EVENT_RECEIVED', { event: 'message.new', chatId: msg.chatId, messageId: msg.id });
    });

    this.socket.on('order.deleted', (payload: any) => {
      const orderId = payload.id || payload.orderId || payload;
      logger.logWS('WS_EVENT_RECEIVED', { event: 'order.deleted', orderId });
      mapEngine.requestRouter.metrics.websocketUpdates++;
      mapEngine.entityStore?.removeOrder(orderId);
      mapEngine.triggerNotify();
    });

    this.socket.on('disconnect', (reason) => {
      logger.logWS('WS_DISCONNECTED', { reason });
    });

    this.socket.on('connect_error', (err) => {
      logger.error('WEBSOCKET_CONNECT_ERROR', { source: 'websocket', error: err.message });
    });
  }

  private joinPrivateRoom() {
      const currentUser = mapEngine.getCurrentUser();
      const myId = currentUser?.id || currentUser?.uid;
      if (myId && this.socket?.connected) {
          logger.debug('[WebSocket] Joining private room', { source: 'websocket', userId: myId });
          this.socket.emit('auth.join', myId);
      }
  }

  disconnect() {
    if (this.socket) {
      logger.info('[WebSocket] Disconnecting manually', { source: 'websocket' });
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket() {
      return this.socket;
  }
}

export const socketService = new SocketService();
