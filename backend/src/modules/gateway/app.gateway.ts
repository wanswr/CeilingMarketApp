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
import { PrismaService } from '../../prisma/prisma.service';

@WebSocketGateway({
  cors: {
    origin: '*',
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

  handleConnection(client: Socket) {
    this.logger.info('WS_CONNECTED', `Client connected: ${client.id}`);
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
    client.join(`user:${userId}`);
    this.logger.debug('WS_JOIN_PRIVATE', `Client joined private room`, { userId });
  }

  @SubscribeMessage('geo.join')
  handleJoinGeo(@MessageBody() data: { lat: number; lng: number; clear?: boolean }, @ConnectedSocket() client: Socket) {
    // V11: Clear old geo rooms if requested to prevent room accumulation
    if (data.clear) {
        this.leaveAllGeoRooms(client);
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
            this.logger.info('WS_GEO_ROOMS_JOINED', `Client joined multiple geo rooms`, {
                userId: (client as any).userId || client.id,
                metadata: { roomsCount: finalSession.count, currentRooms: Array.from(client.rooms).filter(r => r.startsWith('geo:')) }
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
  handleJoinChat(@MessageBody() chatId: string, @ConnectedSocket() client: Socket) {
    client.join(`chat:${chatId}`);
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

      // 3. Fallback for any other (non-order) events
      this.server.emit(event, payload);
      this.logger.info('WS_BROADCAST_GLOBAL_FALLBACK', `Fallback global emit for event: ${event}`);
    } catch (err) {
      this.logger.error('WS_BROADCAST_ERROR', `Failed to broadcast event: ${event}`, { error: (err as any).message });
    }
  }
}
