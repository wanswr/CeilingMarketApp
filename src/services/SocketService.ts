import { io, Socket } from 'socket.io-client'
import { entityStore } from './EntityStore'
import { requestRouter } from './RequestRouter'
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
      logger.info('WEBSOCKET_CONNECTED', { source: 'websocket', socketId: this.socket?.id });
      this.joinPrivateRoom();

      const { mapViewportStore } = require('./MapViewportStore');
      const { mapEngine } = require('./MapEngine');
      const region = mapViewportStore.getRegion();
      if (region) {
          mapEngine.updateSocketRoom(region, true);
      }
    });

    const handleEvent = (name: string, payload: any, action: (data: any) => void) => {
        if (payload?.eventId && entityStore.isEventSeen(payload.eventId)) {
            logger.debug('WS_EVENT_DEDUPLICATED', { source: 'websocket', eventId: payload.eventId, name });
            return;
        }
        if (payload?.eventId) {
            entityStore.markEventSeen(payload.eventId);
        }
        action(payload);
    };

    this.socket.on('order.created', (payload: any) => {
      handleEvent('order.created', payload, (data) => {
          const order = data.order || data;
          logger.info('WS_ORDER_CREATED', { source: 'websocket', orderId: order.id, status: order.status });
          requestRouter.metrics.websocketUpdates++;
          entityStore.setOrder(order, 'websocket');
          require('./MapEngine').mapEngine.triggerNotify();
          entityStore.persist();
      });
    });

    this.socket.on('order.status.changed', (payload: any) => {
      handleEvent('order.status.changed', payload, (data) => {
          const order = data.order || data;
          logger.info('WS_ORDER_STATUS_CHANGED', { source: 'websocket', orderId: order.id, status: order.status });
          requestRouter.metrics.websocketUpdates++;
          entityStore.setOrder(order, 'websocket');
          require('./MapEngine').mapEngine.syncOrder(order.id, true);
          require('./MapEngine').mapEngine.triggerNotify();
          entityStore.persist();
      });
    });

    this.socket.on('application.new', (payload: any) => {
      handleEvent('application.new', payload, (data) => {
          logger.info('WS_APPLICATION_NEW', { source: 'websocket', orderId: data.orderId });
          requestRouter.metrics.websocketUpdates++;
          require('./MapEngine').mapEngine.syncOrder(data.orderId, true).then(() => {
              require('./MapEngine').mapEngine.triggerNotify();
          });
      });
    });

    this.socket.on('application.accepted', (payload: any) => {
       handleEvent('application.accepted', payload, (data) => {
           logger.info('WS_APPLICATION_ACCEPTED', { source: 'websocket', orderId: data.orderId });
           require('./MapEngine').mapEngine.syncOrder(data.orderId, true).then(() => {
               require('./MapEngine').mapEngine.triggerNotify();
           });
       });
    });

    this.socket.on('message.new', (msg: any) => {
        logger.info('WS_MESSAGE_NEW', { source: 'websocket', chatId: msg.chatId, messageId: msg.id });
    });

    this.socket.on('order.deleted', (payload: any) => {
      handleEvent('order.deleted', payload, (data) => {
          const orderId = data.id || data.orderId || data;
          logger.info('WS_ORDER_DELETED', { source: 'websocket', orderId });
          requestRouter.metrics.websocketUpdates++;
          entityStore.removeOrder(orderId);
          require('./MapEngine').mapEngine.triggerNotify();
      });
    });

    this.socket.on('disconnect', (reason) => {
      logger.warn('WEBSOCKET_DISCONNECTED', { source: 'websocket', reason });
    });

    this.socket.on('connect_error', (err) => {
      logger.error('WEBSOCKET_CONNECT_ERROR', { source: 'websocket', error: err.message });
    });
  }

  private joinPrivateRoom() {
      const currentUser = entityStore.getCurrentUser();
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
