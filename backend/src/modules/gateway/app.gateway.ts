import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: any) {
    console.log(`[WebSocket] Client connected: ${client.id}`);
  }

  handleDisconnect(client: any) {
    console.log(`[WebSocket] Client disconnected: ${client.id}`);
  }

  broadcast(event: string, payload: any) {
    this.server.emit(event, payload);
  }
}
