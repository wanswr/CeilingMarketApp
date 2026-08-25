import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { LoggerService } from '../logger/logger.service';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';

const getAllowedOrigins = (): string[] => {
  const allowedOriginsStr = process.env.ALLOWED_ORIGINS;
  const defaults = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'http://localhost:19000',
    'http://127.0.0.1:19000',
  ];
  if (allowedOriginsStr) {
    return allowedOriginsStr.split(',').map(o => o.trim());
  }
  return defaults;
};

@WebSocketGateway({
  cors: {
    origin: getAllowedOrigins(),
    credentials: true,
  },
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private geoJoinCounters = new Map<string, { count: number, timer: NodeJS.Timeout }>();

  constructor(
    private logger: LoggerService,
    private prisma: PrismaService,
  ) {
    this.logger.setService('WebSocket');
  }
  @WebSocketServer()
  server: Server;

  private extractToken(client: Socket): string | null {
    if (client.handshake.auth?.token) {
        const token = client.handshake.auth.token;
        return token.startsWith('Bearer ') ? token.slice(7) : token;
    }
    if (client.handshake.headers?.authorization) {
        const token = client.handshake.headers.authorization;
        return token.startsWith('Bearer ') ? token.slice(7) : token;
    }
    // Handshake query string token fallback removed for security reasons (to prevent token leakage in URL/access logs)
    return null;
  }

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn('WS_AUTH_FAILED', `No token provided for connection: ${client.id}`);
        client.disconnect();
        return;
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        this.logger.warn('WS_AUTH_FAILED', `JWT_SECRET not configured, rejecting connection: ${client.id}`);
        client.disconnect();
        return;
      }
      const decoded = jwt.verify(token, secret) as any;
      const userId = decoded.id;

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.deletedAt || user.isBlocked) {
        this.logger.warn('WS_AUTH_FAILED', `User does not exist, soft-deleted, or blocked: ${userId}`);
        client.disconnect();
        return;
      }

      if (decoded.sessionVersion !== undefined && decoded.sessionVersion !== user.sessionVersion) {
        this.logger.warn('WS_AUTH_FAILED', `Session version mismatch for user ${userId}: expected ${user.sessionVersion}, got ${decoded.sessionVersion}`);
        client.disconnect();
        return;
      }

      if (decoded.sessionId) {
        const session = await this.prisma.session.findUnique({ where: { id: decoded.sessionId } });
        if (!session || session.revokedAt || new Date(session.expiresAt) < new Date()) {
          this.logger.warn('WS_AUTH_FAILED', `Session invalid, revoked, or expired for user ${userId}, sessionId ${decoded.sessionId}`);
          client.disconnect();
          return;
        }
      }

      (client as any).user = decoded;
      (client as any).userId = userId;

      this.logger.info('WS_CONNECTED', `Client authenticated: ${client.id}, userId: ${userId}`);
    } catch (err) {
      this.logger.warn('WS_AUTH_FAILED', `Token verification failed for connection ${client.id}: ${(err as any).message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.info('WS_DISCONNECTED', `Client disconnected: ${client.id}`);
    const session = this.geoJoinCounters.get(client.id);
    if (session) {
        clearTimeout(session.timer);
        this.geoJoinCounters.delete(client.id);
    }
  }

  @SubscribeMessage('auth.join')
  handleJoinPrivate(@MessageBody() userId: string, @ConnectedSocket() client: Socket) {
    const authUserId = (client as any).userId;
    if (!authUserId) {
        this.logger.warn('WS_JOIN_PRIVATE_DENIED', `Unauthorized private room join attempt`, { socketId: client.id });
        return;
    }
    client.join(`user:${authUserId}`);
    this.logger.debug('WS_JOIN_PRIVATE', `Client joined private room`, { userId: authUserId });
  }

  @SubscribeMessage('geo.join')
  handleJoinGeo(@MessageBody() data: { lat: number; lng: number; clear?: boolean }, @ConnectedSocket() client: Socket) {
    // V11: Clear old geo rooms if requested to prevent room accumulation
    if (data.clear) {
        this.leaveAllGeoRooms(client);
    }

    const existingSession = this.geoJoinCounters.get(client.id);
    if (existingSession && existingSession.count > 50) {
      this.logger.warn('WS_GEO_FLOOD_BLOCKED', `Too many geo.join calls`, { socketId: client.id });
      return;
    }

    const room = `geo:${Math.floor(data.lat * 10)}:${Math.floor(data.lng * 10)}`;
    client.join(room);

    let session = this.geoJoinCounters.get(client.id);
    if (session) {
        session.count++;
        clearTimeout(session.timer);
    } else {
        session = { count: 1, timer: null as any };
    }

    session.timer = setTimeout(() => {
        const finalSession = this.geoJoinCounters.get(client.id);
        if (finalSession) {
            const actualUserId = (client as any).userId || null;
            this.logger.info('WS_GEO_ROOMS_JOINED', `Client joined multiple geo rooms`, {
                userId: actualUserId,
                socketId: client.id,
                metadata: {
                    roomsCount: finalSession.count,
                    currentRooms: Array.from(client.rooms).filter(r => r.startsWith('geo:'))
                }
            });
            this.geoJoinCounters.delete(client.id);
        }
    }, 1000);

    this.geoJoinCounters.set(client.id, session);
  }

  private leaveAllGeoRooms(client: Socket) {
      const geoRooms = Array.from(client.rooms).filter(r => r.startsWith('geo:'));
      geoRooms.forEach(room => client.leave(room));
  }

  @SubscribeMessage('chat.join')
  async handleJoinChat(@MessageBody() chatId: string, @ConnectedSocket() client: Socket) {
    const userId = (client as any).userId;
    if (!userId) {
        this.logger.warn('WS_JOIN_CHAT_DENIED', `Unauthorized chat join attempt`, { socketId: client.id });
        return;
    }

    const chat = await this.prisma.chat.findUnique({
        where: { id: chatId }
    });

    if (!chat) {
        this.logger.warn('WS_JOIN_CHAT_NOT_FOUND', `Chat not found`, { chatId, userId });
        return;
    }

    if (chat.employerId !== userId && chat.executorId !== userId) {
        this.logger.warn('WS_JOIN_CHAT_FORBIDDEN', `User ${userId} is not part of chat ${chatId}`, { chatId, userId });
        return;
    }

    client.join(`chat:${chatId}`);
    this.logger.debug('WS_JOIN_CHAT', `Client joined chat room`, { chatId, userId });
  }

  @SubscribeMessage('chat.leave')
  handleLeaveChat(@MessageBody() chatId: string, @ConnectedSocket() client: Socket) {
    client.leave(`chat:${chatId}`);
  }

  async broadcast(event: string, payload: any) {
    try {
      const data = payload?.data || payload;

      // 1. Order creation event: STRICTLY to geo room only
      if (event === 'order.created') {
        const lat = data?.latitude ?? data?.lat;
        const lng = data?.longitude ?? data?.lng;

        if (lat !== undefined && lng !== undefined) {
            const room = `geo:${Math.floor(lat * 10)}:${Math.floor(lng * 10)}`;
            this.server.to(room).emit(event, payload);
            this.logger.info('WS_BROADCAST_CREATED_GEO', `Emitted order.created to geo room: ${room}`, { orderId: data?.id });
        } else {
            this.logger.warn('WS_BROADCAST_CREATED_NO_COORDS', `order.created lacks coordinates`, { payload });
        }
        return;
      }

      // 2. Order updates/modifications: STRICTLY to Employer room, Worker room, Chat participants room
      const orderEvents = ['order.status.changed', 'order.deleted', 'application.new', 'application.accepted'];
      if (orderEvents.includes(event)) {
        const orderId = data?.id || data?.orderId;
        let employerId = data?.employerId || null;
        let executorId = data?.executorId || null;
        let chatIds: string[] = data?.chatIds || [];

        // Fetch order details from database if necessary to resolve employer/executor
        if (orderId && (!employerId || !executorId)) {
            const order = await this.prisma.order.findUnique({ where: { id: orderId } });
            if (order) {
                if (!employerId) employerId = order.employerId;
                if (!executorId) executorId = order.executorId;
            }
        }

        // Fetch chats associated with this order to target chat participant rooms (if not already passed on delete)
        if (orderId && chatIds.length === 0) {
            const chats = await this.prisma.chat.findMany({
                where: { orderId: orderId },
                select: { id: true }
            });
            chatIds = chats.map(c => c.id);
        }

        const rooms: string[] = [];
        if (employerId) rooms.push(`user:${employerId}`);
        if (executorId) rooms.push(`user:${executorId}`);
        for (const chatId of chatIds) {
            rooms.push(`chat:${chatId}`);
        }

        // De-duplicate rooms list
        const uniqueRooms = Array.from(new Set(rooms));

        if (uniqueRooms.length > 0) {
            this.server.to(uniqueRooms).emit(event, payload);
            this.logger.info('WS_BROADCAST_MODIFIED', `Emitted update event to rooms: ${uniqueRooms.join(', ')}`, {
                event,
                orderId
            });
        } else {
            this.logger.warn('WS_BROADCAST_MODIFIED_NO_TARGET', `No target rooms found for update event`, { event, orderId });
        }
        return;
      }

      // 3. Unknown / unhandled events
      this.logger.warn('WS_BROADCAST_UNKNOWN_EVENT', `Attempted to broadcast an unknown or unhandled event: ${event}`, { event });
    } catch (err) {
      this.logger.error('WS_BROADCAST_ERROR', `Failed to broadcast event: ${event}`, { error: (err as any).message });
    }
  }
}
