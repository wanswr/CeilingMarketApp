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

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private geoJoinCounters = new Map<string, { count: number, timer: NodeJS.Timeout }>();

  constructor(private logger: LoggerService) {
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

  broadcast(event: string, payload: any) {
    const data = payload?.data || payload;
    let emitted = false;

    // 1. Identify and emit to geographic room if coordinates exist (for orders)
    const lat = data?.latitude ?? data?.lat;
    const lng = data?.longitude ?? data?.lng;

    if (lat !== undefined && lng !== undefined) {
        const room = `geo:${Math.floor(lat * 10)}:${Math.floor(lng * 10)}`;
        this.server.to(room).emit(event, payload);
        this.logger.debug('WS_BROADCAST_GEO', `Emitted event to geo room: ${room}`, { event });
        emitted = true;
    }

    // 2. Identify and emit directly to private participant rooms (employer & executor)
    const participants = new Set<string>();
    if (data?.employerId) participants.add(data.employerId);
    if (data?.executorId) participants.add(data.executorId);

    participants.forEach(userId => {
        const room = `user:${userId}`;
        this.server.to(room).emit(event, payload);
        this.logger.debug('WS_BROADCAST_PRIVATE', `Emitted event to private user room: ${room}`, { event });
        emitted = true;
    });

    // 3. Fallback: If no participants and no coordinates, emit globally
    if (!emitted) {
        this.server.emit(event, payload);
        this.logger.debug('WS_BROADCAST_GLOBAL', 'Fallback global broadcast', { event });
    }
  }
}
