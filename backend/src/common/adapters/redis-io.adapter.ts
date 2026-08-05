import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: any;

  async connectToRedis(): Promise<void> {
    const host = process.env.REDIS_HOST;
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = process.env.REDIS_PASSWORD;

    if (!host) {
      console.log('[RedisIoAdapter] REDIS_HOST is not set. Falling back to In-Memory IoAdapter.');
      return;
    }

    try {
      const pubClient = new Redis({
        host,
        port,
        password,
        maxRetriesPerRequest: 1, // fast failure
        connectTimeout: 3000,
      });

      const subClient = pubClient.duplicate();

      // Ensure errors on clients don't crash Node process
      pubClient.on('error', (err) => {
        console.warn('[RedisIoAdapter] Redis Pub client error:', err.message);
      });
      subClient.on('error', (err) => {
        console.warn('[RedisIoAdapter] Redis Sub client error:', err.message);
      });

      // Verification of ready state
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('Pub client timeout')), 3000);
          pubClient.once('ready', () => { clearTimeout(t); resolve(); });
          pubClient.once('error', (err) => { clearTimeout(t); reject(err); });
        }),
        new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('Sub client timeout')), 3000);
          subClient.once('ready', () => { clearTimeout(t); resolve(); });
          subClient.once('error', (err) => { clearTimeout(t); reject(err); });
        }),
      ]);

      this.adapterConstructor = createAdapter(pubClient, subClient);
      console.log('[RedisIoAdapter] Connected to Redis successfully. WebSocket clustering active.');
    } catch (e: any) {
      console.warn(`[RedisIoAdapter] Failed to connect to Redis: ${e.message}. Falling back to In-Memory IoAdapter.`);
    }
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
