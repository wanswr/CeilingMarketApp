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

  // Local mutations register to block self-echo events
  private readonly localMutations = new Map<string, number>();

  // Active listeners registry
  private readonly listeners = new Map<string, Set<Function>>();
  private lastJoinedSocketId: string | null = null;
  private isConnectingFlag = false;

  constructor() {
    // Register standard core listeners
    this.on('connect', () => {
      const currentUser = entityStore.getCurrentUser();
      const userId = currentUser?.id || currentUser?.uid || 'anonymous';
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
      logger.info('ORDER_CREATED_RECEIVED', { orderId: order?.id, status: order?.status, lat: order?.latitude ?? order?.lat, lng: order?.longitude ?? order?.lng });
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
    const userId = currentUser?.id || currentUser?.uid || 'anonymous';
    const activeRole = currentUser?.role || 'none';
    const socketId = this.socket?.id || 'none';

    logger.info('[WebSocket] connect() called', {
        source: 'websocket',
        metadata: {
            userId,
            activeRole,
            socketId,
            connectSource: source,
            url: socketUrl,
            isConnecting: this.isConnectingFlag,
            connected: this.socket?.connected || false
        }
    });

    if (this.socket?.connected) {
        logger.info('[WebSocket] already connected, ignoring connect() call', { source });
        return;
    }

    if (this.isConnectingFlag) {
        logger.info('[WebSocket] already connecting, ignoring parallel connect() call', { source });
        return;
    }

    this.isConnectingFlag = true;

    if (this.socket) {
      if (this.currentUrl === socketUrl) {
          logger.info('[WebSocket] socket exists, ensuring connection...', {
              source: 'websocket',
              metadata: {
                  userId,
                  activeRole,
                  socketId,
                  connectSource: source,
                  url: socketUrl,
                  currentlyConnected: this.socket.connected
              }
          });

          this.socket.connect();
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

    this.socket.on('connect', () => {
      logger.info('WEBSOCKET_CONNECTED_EVENT', { socketId: this.socket?.id, url: socketUrl });
      this.isConnectingFlag = false;
    });

    this.socket.on('disconnect', (reason) => {
      logger.warn('WEBSOCKET_DISCONNECTED', { reason, url: socketUrl });
      this.lastJoinedSocketId = null;
      this.isConnectingFlag = false;
    });

    this.socket.on('connect_error', (err) => {
      logger.error('WEBSOCKET_CONNECT_ERROR', { error: err.message, url: socketUrl });
      this.isConnectingFlag = false;
    });

    // Rebind all registered event listeners to the new socket instance
    this.rebindAllListeners();
  }

  private joinPrivateRoom() {
      const currentUser = entityStore.getCurrentUser();
      const myId = currentUser?.id || currentUser?.uid;
      const activeRole = currentUser?.role || 'none';
      const socketId = this.socket?.id || 'none';

      if (myId && this.socket?.connected) {
          if (this.lastJoinedSocketId === socketId) {
              logger.info('[WebSocket] Already joined private room for this socket ID', { socketId });
              return;
          }
          logger.info('[WebSocket] joinPrivateRoom() emitting auth.join', {
              source: 'websocket',
              metadata: {
                  userId: myId,
                  activeRole,
                  socketId
              }
          });
          this.socket.emit('auth.join', myId);
          this.lastJoinedSocketId = socketId;
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
    this.lastJoinedSocketId = null;
    this.isConnectingFlag = false;
  }

  getSocket() {
      return this.socket;
  }

  /**
   * Register a local mutation key to prevent 'self-echo' WebSocket event loops.
   */
  registerLocalMutation(eventType: string, orderId: string, applicationId: string = 'none', status: string = 'none') {
      const key = eventType + '_' + orderId + '_' + applicationId + '_' + status;
      this.localMutations.set(key, Date.now());
      logger.debug('[WebSocket] Registered local mutation key', { key });

      if (this.localMutations.size > 100) {
          const oldestKey = this.localMutations.keys().next().value;
          if (oldestKey) this.localMutations.delete(oldestKey);
      }
  }

  /**
   * Verify if the incoming event matches a recently performed local client mutation.
   */
  isLocalMutationDuplicate(eventType: string, orderId: string, applicationId: string = 'none', status: string = 'none'): boolean {
      const keys = [
          eventType + '_' + orderId + '_' + applicationId + '_' + status,
          eventType + '_' + orderId + '_any_' + status,
          eventType + '_' + orderId + '_' + applicationId + '_any',
          eventType + '_' + orderId + '_any_any'
      ];
      for (const key of keys) {
          const mutationTime = this.localMutations.get(key);
          if (mutationTime) {
              const age = Date.now() - mutationTime;
              const DEDUPLICATION_TTL = 5000; // 5 seconds sliding window
              if (age < DEDUPLICATION_TTL) {
                  return true;
              }
          }
      }
      return false;
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

          // 3. Extract business identifiers for secondary self-echo deduplication
          let orderId = 'none';
          let applicationId = 'none';
          let status = 'none';

          if (event === 'order.created' || event === 'order.status.changed') {
              orderId = data?.id || 'none';
              status = data?.status || 'none';
          } else if (event === 'application.new') {
              orderId = data?.orderId || 'none';
              applicationId = data?.id || 'none';
              status = data?.status || 'none';
          }

          if (this.isLocalMutationDuplicate(event, orderId, applicationId, status)) {
              logger.debug('WS_EVENT_SELF_ECHO_BLOCKED', {
                  source: 'websocket',
                  metadata: {
                      event,
                      orderId,
                      applicationId,
                      status
                  }
              });
              return;
          }

          // 4. Dispatch to all registered listeners
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