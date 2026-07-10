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
    this.geoJoinCounters.delete(client.id);
  }

  @SubscribeMessage('auth.join')
  handleJoinPrivate(@MessageBody() userId: string, @ConnectedSocket() client: Socket) {
    client.join(`user:${userId}`);
    // Debug log for private room join is fine as it happens once
    this.logger.debug('WS_JOIN_PRIVATE', `Client joined private room`, { userId });
  }

  @SubscribeMessage('geo.join')
  handleJoinGeo(@MessageBody() data: { lat: number; lng: number }, @ConnectedSocket() client: Socket) {
    const room = `geo:${Math.floor(data.lat * 10)}:${Math.floor(data.lng * 10)}`;
    client.join(room);

    // Aggregating geo room joins to reduce noise
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
                metadata: { roomsCount: finalSession.count }
            });
            this.geoJoinCounters.delete(client.id);
        }
    }, 1000);

    this.geoJoinCounters.set(client.id, session);
  }

  @SubscribeMessage('chat.join')
  handleJoinChat(@MessageBody() chatId: string, @ConnectedSocket() client: Socket) {
    client.join(`chat:${chatId}`);
    // Minimal log for chat join
  }

  @SubscribeMessage('chat.leave')
  handleLeaveChat(@MessageBody() chatId: string, @ConnectedSocket() client: Socket) {
    client.leave(`chat:${chatId}`);
  }

  broadcast(event: string, payload: any) {
    this.server.emit(event, payload);
  }
}
