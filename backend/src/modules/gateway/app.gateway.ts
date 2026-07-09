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
  }

  @SubscribeMessage('auth.join')
  handleJoinPrivate(@MessageBody() userId: string, @ConnectedSocket() client: Socket) {
    client.join(`user:${userId}`);
    this.logger.debug('WS_JOIN_PRIVATE', `Client joined private room`, { userId });
  }

  @SubscribeMessage('geo.join')
  handleJoinGeo(@MessageBody() data: { lat: number; lng: number }, @ConnectedSocket() client: Socket) {
    const room = `geo:${Math.floor(data.lat * 10)}:${Math.floor(data.lng * 10)}`;
    client.join(room);
    this.logger.debug('WS_JOIN_GEO', `Client joined geo room ${room}`, { metadata: { room } });
  }

  @SubscribeMessage('chat.join')
  handleJoinChat(@MessageBody() chatId: string, @ConnectedSocket() client: Socket) {
    client.join(`chat:${chatId}`);
    this.logger.debug('WS_JOIN_CHAT', `Client joined chat room`, { metadata: { chatId } });
  }

  @SubscribeMessage('chat.leave')
  handleLeaveChat(@MessageBody() chatId: string, @ConnectedSocket() client: Socket) {
    client.leave(`chat:${chatId}`);
    this.logger.debug('WS_LEAVE_CHAT', `Client left chat room`, { metadata: { chatId } });
  }

  broadcast(event: string, payload: any) {
    this.server.emit(event, payload);
  }
}
