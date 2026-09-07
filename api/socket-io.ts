/**
 * Vercel Function entry point for realtime play. Deployed at `/api/socket-io`;
 * Socket.IO appends its own `/socket.io` suffix, so the client connects to
 * `/api/socket-io/socket.io` (see client/src/lib/socket.ts).
 *
 * Static hosting of `client/dist` is handled separately by Vercel's own build
 * output (see vercel.json) — this function's only job is the realtime layer.
 *
 * Vercel's own docs on this are explicit about why Redis is not optional here:
 * "A single WebSocket connection is pinned to one Vercel Function instance...
 * store durable state in an external data store instead of relying on
 * in-memory variables." Two players' connections landing on two different
 * instances is the ordinary case, not an edge case — without Redis, the
 * second player's "join" would hit an instance that has never heard of the
 * room the first player created.
 */
import { createTrioServer } from '../server/src/server';

const redisUrl = process.env.REDIS_URL ?? process.env.KV_URL ?? process.env.UPSTASH_REDIS_URL;

if (!redisUrl) {
  throw new Error(
    '[trio] REDIS_URL is not set. This function requires Redis — install the Upstash ' +
      'integration from the Vercel Marketplace on this project, then confirm the env var ' +
      'it adds is named REDIS_URL (rename it in Project Settings → Environment Variables ' +
      'if the integration used a different name, e.g. KV_URL).',
  );
}

const { http } = createTrioServer({ redisUrl });

export default http;
