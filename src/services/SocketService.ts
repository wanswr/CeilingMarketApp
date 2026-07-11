import { io, Socket } from 'socket.io-client'
import { entityStore } from './EntityStore'
import { requestRouter } from './RequestRouter'
import { logger } from './logger/LoggerService'

/**
 * SocketService V12: Advanced WebSocket Management with Event Deduplication & Active Listener Rebinding.
 */
class SocketService {
  private socket: Socket | null = null;
  private currentUrl: string | null = null;

  // Deduplication Set
  private readonly receivedEvents = new Set<string>();
  private readonly MAX_RECEIVED_EVENTS = 1000;

  // Active listeners registry
  private readonly listeners = new Map<string, Set<Function>>();

  constructor() {
    // Register standard core listeners
    this.on('connect', () => {
      const currentUser = entityStore.getCurrentUser();
      const userId = (currentUser as any)?.id || currentUser?.uid || 'anonymous';
      const activeRole = currentUser?.role || 'none';
      const socketId = this.socket?.id || 'none';

      logger.info('WEBSOCKET_CONNECTED', {
          source: 'websocket',
          metadata: {
              socketId,
              userId,
              activeRole,
              url: this.currentUrl
          }
      });

      this.joinPrivateRoom();

      const { mapViewportStore } = require('./MapViewportStore');
      const { mapEngine } = require('./MapEngine');
      const region = mapViewportStore.getRegion();
      if (region) {
          mapEngine.updateSocketRoom(region, true);
      }
    });

    this.on('order.created', (order: any) => {
      logger.info('WS_ORDER_CREATED', { orderId: order.id });
      requestRouter.metrics.websocketUpdates++;
      entityStore.setOrder(order, 'websocket');
      require('./MapEngine').mapEngine.triggerNotify();
      entityStore.persist();
    });

    this.on('order.status.changed', (order: any) => {
      logger.info('WS_ORDER_STATUS_CHANGED', { orderId: order.id, status: order.status });
      requestRouter.metrics.websocketUpdates++;
      entityStore.setOrder(order, 'websocket');
      require('./MapEngine').mapEngine.syncOrder(order.id, true);
      require('./MapEngine').mapEngine.triggerNotify();
      entityStore.persist();
    });

    this.on('application.new', (app: any) => {
      logger.info('WS_APPLICATION_NEW', { orderId: app.orderId });
      requestRouter.metrics.websocketUpdates++;
      require('./MapEngine').mapEngine.syncOrder(app.orderId, true).then(() => {
          require('./MapEngine').mapEngine.triggerNotify();
      });
    });
  }

  connect(url: string, source: string = 'unknown') {
    const socketUrl = url.replace('/api/', '');
    const currentUser = entityStore.getCurrentUser();
    const userId = (currentUser as any)?.id || currentUser?.uid || 'anonymous';
    const activeRole = currentUser?.role || 'none';
    const socketId = this.socket?.id || 'none';

    logger.info('[WebSocket] connect() called', {
        source: 'websocket',
        metadata: {
            userId,
            activeRole,
            socketId,
            connectSource: source,
            url: socketUrl
        }
    });

    if (this.socket) {
      if (this.currentUrl === socketUrl) {
          if (this.socket.connected) {
              logger.info('[WebSocket] already connected', {
                  source: 'websocket',
                  metadata: {
                      userId,
                      activeRole,
                      socketId,
                      connectSource: source,
                      url: socketUrl
                  }
              });
          } else {
              logger.info('[WebSocket] socket exists, ensuring connection...', {
                  source: 'websocket',
                  metadata: {
                      userId,
                      activeRole,
                      socketId,
                      connectSource: source,
                      url: socketUrl
                  }
              });
              this.socket.connect();
          }
          return;
      }

      logger.info('[WebSocket] URL changed, recreating socket...', { from: this.currentUrl, to: socketUrl });
      this.disconnect();
    }

    this.currentUrl = socketUrl;

    logger.info('[WebSocket] Initializing new connection...', { url: socketUrl });

    this.socket = io(socketUrl, {
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        timeout: 20000,
        transports: ['websocket'],
    });

    this.socket.on('disconnect', (reason) => {
      logger.warn('WEBSOCKET_DISCONNECTED', { reason, url: socketUrl });
    });

    this.socket.on('connect_error', (err) => {
      logger.error('WEBSOCKET_CONNECT_ERROR', { error: err.message, url: socketUrl });
    });

    // Rebind all registered event listeners to the new socket instance
    this.rebindAllListeners();
  }

  private joinPrivateRoom() {
      const currentUser = entityStore.getCurrentUser();
      const myId = (currentUser as any)?.id || currentUser?.uid;
      const activeRole = currentUser?.role || 'none';
      const socketId = this.socket?.id || 'none';

      if (myId && this.socket?.connected) {
          logger.info('[WebSocket] joinPrivateRoom() emitting auth.join', {
              source: 'websocket',
              metadata: {
                  userId: myId,
                  activeRole,
                  socketId
              }
          });
          this.socket.emit('auth.join', myId);
      }
  }

  disconnect() {
    if (this.socket) {
      logger.info('[WebSocket] Disconnecting manually');
      // Clean up all physical listeners on this instance before removing it
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket() {
      return this.socket;
  }

  /**
   * Register an event listener on the active socket instance.
   * Leverages internal registry so listeners automatically re-bind on reconnect or socket recreation.
   */
  on(event: string, handler: Function) {
      if (!this.listeners.has(event)) {
          this.listeners.set(event, new Set());
      }
      this.listeners.get(event)!.add(handler);
      this.setupSocketListener(event);
  }

  /**
   * Remove an event listener.
   */
  off(event: string, handler: Function) {
      const handlers = this.listeners.get(event);
      if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
              this.listeners.delete(event);
              if (this.socket) {
                  this.socket.off(event);
              }
          }
      }
  }

  /**
   * Internal helper to register a single unified dispatcher listener on the physical socket instance.
   * This dispatcher handles deduplication and unwraps the payload container if present.
   */
  private setupSocketListener(event: string) {
      if (!this.socket) return;

      // Ensure we only have one physical socket.on event listener for this event type
      this.socket.off(event);
      this.socket.on(event, (payload: any) => {
          // 1. Check event ID for deduplication
          if (payload?.eventId) {
              if (this.receivedEvents.has(payload.eventId)) {
                  logger.debug('WS_EVENT_DEDUPLICATED', { eventId: payload.eventId, event });
                  return;
              }
              this.receivedEvents.add(payload.eventId);
              if (this.receivedEvents.size > this.MAX_RECEIVED_EVENTS) {
                  const oldest = this.receivedEvents.values().next().value;
                  if (oldest) this.receivedEvents.delete(oldest);
              }
          }

          // 2. Extract unwrapped business data if it conforms to our { event, eventId, data } standard envelope
          const data = (payload && payload.data !== undefined) ? payload.data : payload;

          // 3. Dispatch to all registered listeners
          const handlers = this.listeners.get(event);
          if (handlers) {
              handlers.forEach(handler => {
                  try {
                      handler(data);
                  } catch (e) {
                      logger.error('WS_HANDLER_ERROR', { event, error: (e as any).message });
                  }
              });
          }
      });
  }

  /**
   * Rebinds all registered listeners to a newly created socket instance.
   */
  private rebindAllListeners() {
      if (!this.socket) return;
      this.listeners.forEach((_, event) => {
          this.setupSocketListener(event);
      });
  }
}

export const socketService = new SocketService();
