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

  @SubscribeMessage('user.join')
  handleJoinUserRoom(@MessageBody() userId: string, @ConnectedSocket() client: Socket) {
    if (!userId) return;
    client.join(`user:${userId}`);
    console.log(`[WebSocket] Client ${client.id} joined user:${userId}`);
  }

  @SubscribeMessage('geo.join')
  handleJoinGeoRoom(@MessageBody() data: { lat: number, lng: number }, @ConnectedSocket() client: Socket) {
    const { lat, lng } = data;
    const geoRoom = this.getGeoRoom(lat, lng);

    // Leave previous geo rooms
    const currentRooms = Array.from(client.rooms);
    currentRooms.forEach(room => {
      if (room.startsWith('geo:') && room !== geoRoom) {
        client.leave(room);
      }
    });

    client.join(geoRoom);
    console.log(`[WebSocket] Client ${client.id} joined ${geoRoom}`);
  }

  @SubscribeMessage('chat.join')
  handleJoinChat(@MessageBody() chatId: string, @ConnectedSocket() client: Socket) {
    client.join(`chat:${chatId}`);
    console.log(`[WebSocket] Client ${client.id} joined chat:${chatId}`);
  }

  @SubscribeMessage('chat.leave')
  handleLeaveChat(@MessageBody() chatId: string, @ConnectedSocket() client: Socket) {
    client.leave(`chat:${chatId}`);
    console.log(`[WebSocket] Client ${client.id} left chat:${chatId}`);
  }

  broadcast(event: string, payload: any) {
    this.server.emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: any) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitToGeo(lat: number, lng: number, event: string, payload: any) {
    const geoRoom = this.getGeoRoom(lat, lng);
    this.server.to(geoRoom).emit(event, payload);
  }

  private getGeoRoom(lat: number, lng: number): string {
    // 0.1 degree grid (~11km precision)
    const gridLat = Math.floor(lat * 10) / 10;
    const gridLng = Math.floor(lng * 10) / 10;
    return `geo:${gridLat.toFixed(1)}:${gridLng.toFixed(1)}`;
  }
}
