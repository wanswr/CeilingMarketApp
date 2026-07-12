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

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`[WebSocket] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[WebSocket] Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('chat.join')
  handleJoinChat(@MessageBody() chatId: string, @ConnectedSocket() client: Socket) {
    const roomName = `chat_${chatId}`;
    if (client.rooms.has(roomName)) {
      return;
    }
    client.join(roomName);
    console.log(`[WebSocket] Client ${client.id} joined ${roomName}`);
  }

  @SubscribeMessage('chat.leave')
  handleLeaveChat(@MessageBody() chatId: string, @ConnectedSocket() client: Socket) {
    const roomName = `chat_${chatId}`;
    if (!client.rooms.has(roomName)) {
      return;
    }
    client.leave(roomName);
    console.log(`[WebSocket] Client ${client.id} left ${roomName}`);
  }

  broadcast(event: string, payload: any) {
    this.server.emit(event, payload);
  }
}
