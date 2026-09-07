/**
 * Vercel Function entry point for realtime play. This file (not a catch-all
 * route) only matches the literal path `/api/socket-io` -- vercel.json has a
 * rewrite forwarding every `/api/socket-io/:path*` sub-path here too, which
 * is what Socket.IO's own handshake and polling requests need (they land on
 * that same mount path with a query string, not a fresh path segment). The
 * server side has to be told to match on that full prefix explicitly (see
 * `socketPath` below) since the rewrite preserves the original request path
 * rather than trimming it back down to `/api/socket-io`.
 *
 * The client connects with a matching `VITE_SOCKET_PATH=/api/socket-io/socket.io`
 * build-time env var (see client/src/lib/socket.ts) -- both sides just need
 * to agree on the same literal string.
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
import { createTrioServer } from '../server/src/server.js';

const redisUrl = process.env.REDIS_URL ?? process.env.KV_URL ?? process.env.UPSTASH_REDIS_URL;

if (!redisUrl) {
  throw new Error(
    '[trio] REDIS_URL is not set. This function requires Redis — install the Upstash ' +
      'integration from the Vercel Marketplace on this project, then confirm the env var ' +
      'it adds is named REDIS_URL (rename it in Project Settings → Environment Variables ' +
      'if the integration used a different name, e.g. KV_URL).',
  );
}

const { http } = createTrioServer({ redisUrl, socketPath: '/api/socket-io/socket.io' });

export default http;
