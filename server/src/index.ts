import { createTrioServer } from './server.js';

/** Process entry point. All behaviour lives in server.ts / socket/handlers.ts. */

const PORT = Number(process.env.PORT ?? 8787);

/**
 * Comma-separated list of allowed browser origins. Leave unset in development —
 * the Vite proxy makes the connection same-origin, so no CORS is involved.
 */
const origins = (process.env.CLIENT_ORIGIN ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Optional even for a standalone process like this one — a single long-running
 * server never has the cross-instance problem Redis exists to solve here.
 * Set it anyway if you want one Render deployment and one Vercel deployment
 * to share the same live rooms.
 */
const redisUrl = process.env.REDIS_URL;

const server = createTrioServer({
  origins,
  serveClient: process.env.SERVE_CLIENT === 'true',
  redisUrl,
});

void server.listen(PORT).then((port) => {
  console.log(`[trio] realtime server listening on :${port}`);
  if (origins.length) console.log(`[trio] CORS origins: ${origins.join(', ')}`);
  console.log(`[trio] room store: ${redisUrl ? 'redis' : 'memory'}`);
});

const shutdown = () => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
