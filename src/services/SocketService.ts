import { io, Socket } from 'socket.io-client'
import { entityStore } from './EntityStore'
import { requestRouter } from './RequestRouter'
import { logger } from './logger/LoggerService'

/**
 * SocketService V11: Optimized for mobile reconnection and background wakeup.
 */
class SocketService {
  private socket: Socket | null = null;
  private currentUrl: string | null = null;

  connect(url: string) {
    const socketUrl = url.replace('/api/', '');

    // V11: Handle dynamic URL changes during runtime
    if (this.currentUrl && this.currentUrl !== socketUrl && this.socket) {
        logger.info('[WebSocket] URL changed, recreating socket...', { from: this.currentUrl, to: socketUrl });
        this.socket.disconnect();
        this.socket = null;
    }

    this.currentUrl = socketUrl;

    if (this.socket?.connected) {
        this.joinPrivateRoom();
        return;
    }

    if (this.socket) {
        logger.info('[WebSocket] Reconnecting to existing socket...', { url: socketUrl });
        this.socket.connect();
        return;
    }

    logger.info('[WebSocket] Initializing new connection...', { url: socketUrl });

    this.socket = io(socketUrl, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000, // V11: Increased max delay to save battery
        timeout: 20000,
        transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      logger.info('WEBSOCKET_CONNECTED', { socketId: this.socket?.id, url: socketUrl });
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
            logger.debug('WS_EVENT_DEDUPLICATED', { eventId: payload.eventId, name });
            return;
        }
        if (payload?.eventId) {
            entityStore.markEventSeen(payload.eventId);
        }
        action(payload);
    };

    // Standard Events
    this.socket.on('order.created', (payload: any) => {
      handleEvent('order.created', payload, (data) => {
          const order = data.order || data;
          logger.info('WS_ORDER_CREATED', { orderId: order.id });
          requestRouter.metrics.websocketUpdates++;
          entityStore.setOrder(order, 'websocket');
          require('./MapEngine').mapEngine.triggerNotify();
          entityStore.persist();
      });
    });

    this.socket.on('order.status.changed', (payload: any) => {
      handleEvent('order.status.changed', payload, (data) => {
          const order = data.order || data;
          logger.info('WS_ORDER_STATUS_CHANGED', { orderId: order.id, status: order.status });
          requestRouter.metrics.websocketUpdates++;
          entityStore.setOrder(order, 'websocket');
          require('./MapEngine').mapEngine.syncOrder(order.id, true);
          require('./MapEngine').mapEngine.triggerNotify();
          entityStore.persist();
      });
    });

    this.socket.on('application.new', (payload: any) => {
      handleEvent('application.new', payload, (data) => {
          logger.info('WS_APPLICATION_NEW', { orderId: data.orderId });
          requestRouter.metrics.websocketUpdates++;
          require('./MapEngine').mapEngine.syncOrder(data.orderId, true).then(() => {
              require('./MapEngine').mapEngine.triggerNotify();
          });
      });
    });

    this.socket.on('message.new', (msg: any) => {
        logger.info('WS_MESSAGE_NEW', { chatId: msg.chatId });
    });

    this.socket.on('disconnect', (reason) => {
      logger.warn('WEBSOCKET_DISCONNECTED', { reason, url: socketUrl });
    });

    this.socket.on('connect_error', (err) => {
      // V11: Log full error to identify IP issues
      logger.error('WEBSOCKET_CONNECT_ERROR', { error: err.message, url: socketUrl });
    });
  }

  private joinPrivateRoom() {
      const currentUser = entityStore.getCurrentUser();
      const myId = currentUser?.id || currentUser?.uid;
      if (myId && this.socket?.connected) {
          this.socket.emit('auth.join', myId);
      }
  }

  disconnect() {
    if (this.socket) {
      logger.info('[WebSocket] Disconnecting manually');
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket() {
      return this.socket;
  }
}

export const socketService = new SocketService();
