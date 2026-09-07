import { createServer, type Server as HttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { configureRoomStore, roomCount } from './rooms.js';
import { createMemoryStore } from './store/memoryStore.js';
import { createRedisStore } from './store/redisStore.js';
import { registerHandlers, type GameServer } from './socket/handlers.js';

export interface TrioServer {
  http: HttpServer;
  io: GameServer;
  /** Starts listening. Resolves with the bound port (useful when port is 0). */
  listen: (port: number) => Promise<number>;
  close: () => Promise<void>;
}

export interface CreateOptions {
  /** Allowed browser origins. Empty means reflect the request origin. */
  origins?: string[];
  /** Serve the built client from this server too (single-instance deploys). */
  serveClient?: boolean;
  /**
   * Redis connection string. Required whenever this process cannot guarantee
   * every player's socket lands on the same instance -- i.e. any serverless
   * deployment (Vercel Functions). Without it, room state lives in this
   * process's memory only, which is correct and simpler for a single
   * always-on process (local dev, Render) but silently wrong the moment a
   * second instance exists: one instance would create a room the other has
   * never heard of.
   */
  redisUrl?: string;
}

/**
 * Builds the HTTP + Socket.IO server without starting it, so tests can boot an
 * isolated instance on an ephemeral port and shut it down cleanly.
 */
export function createTrioServer({
  origins = [],
  serveClient = false,
  redisUrl,
}: CreateOptions = {}): TrioServer {
  const app = express();
  const http = createServer(app);

  const io: GameServer = new Server(http, {
    cors: origins.length ? { origin: origins, credentials: true } : { origin: true },
    // A dropped move costs a turn, so favour a short heartbeat: the grace window
    // on the room side is what actually gives players time to come back.
    pingInterval: 20_000,
    pingTimeout: 10_000,
  });

  let redisClients: Redis[] = [];

  if (redisUrl) {
    configureRoomStore(createRedisStore(new Redis(redisUrl)));

    // Socket.IO's own room/broadcast primitives (io.to(x).emit) only reach
    // sockets on THIS process by default. The redis adapter fans those out
    // over pub/sub so a broadcast from one function instance reaches sockets
    // accepted by a different one -- this is separate from, and in addition
    // to, the Redis-backed game-state store above: that store shares the
    // board/score data, this adapter shares Socket.IO's own delivery.
    const pubClient = new Redis(redisUrl);
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    redisClients = [pubClient, subClient];
  } else {
    configureRoomStore(createMemoryStore());
  }

  app.get('/healthz', (_req, res) => {
    void roomCount().then((rooms) => {
      res.json({ ok: true, rooms, uptime: Math.round(process.uptime()) });
    });
  });

  if (serveClient) {
    const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
    if (fs.existsSync(dist)) {
      app.use(express.static(dist, { maxAge: '1h', index: false }));
      // SPA fallback so /play/ABC123 resolves on a hard refresh.
      app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
      console.log(`[trio] serving client from ${dist}`);
    } else {
      console.warn(`[trio] SERVE_CLIENT=true but ${dist} does not exist — build the client first`);
    }
  }

  const handlers = registerHandlers(io);

  return {
    http,
    io,
    listen: (port) =>
      new Promise((resolve) => {
        http.listen(port, () => {
          const address = http.address();
          resolve(typeof address === 'object' && address ? address.port : port);
        });
      }),
    close: () =>
      new Promise((resolve) => {
        handlers.stop();
        io.close(() => {
          Promise.all(redisClients.map((c) => c.quit().catch(() => undefined))).then(() =>
            http.close(() => resolve()),
          );
        });
      }),
  };
}
