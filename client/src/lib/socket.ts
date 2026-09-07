import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/protocol';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * In dev the Vite proxy forwards /socket.io to localhost:8787, so the default
 * same-origin connection just works. In production set VITE_SERVER_URL when the
 * socket server is deployed to a different host than the static frontend.
 */
const SERVER_URL = import.meta.env.VITE_SERVER_URL as string | undefined;

/**
 * A standalone server (Render, local) mounts Socket.IO at the default
 * `/socket.io` path. On Vercel the realtime layer is a Function at
 * `/api/socket-io`, and Socket.IO appends its own `/socket.io` suffix to
 * whatever path you give it — so the full path there is
 * `/api/socket-io/socket.io`. Set VITE_SOCKET_PATH to that when building for
 * Vercel; leave it unset everywhere else.
 */
const SOCKET_PATH = (import.meta.env.VITE_SOCKET_PATH as string | undefined) || '/socket.io';

let socket: GameSocket | null = null;

export function getSocket(): GameSocket {
  if (socket) return socket;
  socket = (SERVER_URL ? io(SERVER_URL, opts()) : io(opts())) as GameSocket;
  return socket;
}

function opts(): Partial<ManagerOptions & SocketOptions> {
  return {
    path: SOCKET_PATH,
    // Vercel's own docs are explicit that a Socket.IO client connecting to a
    // Functions-hosted server MUST set this: "Socket.IO defaults to HTTP
    // long-polling" otherwise, and a polling connection has no guarantee two
    // consecutive requests land on the same function instance, which breaks
    // the handshake. Standalone hosts (Render, local) are just as happy with
    // websocket-only, so there is no reason to keep the polling fallback
    // conditional on which server this is talking to.
    transports: ['websocket'],
    // Socket.io's own backoff covers the "reconnecting" window; the server
    // holds the seat for a grace period that comfortably outlasts it.
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 400,
    reconnectionDelayMax: 4000,
    timeout: 8000,
  };
}

export function disposeSocket(): void {
  socket?.close();
  socket = null;
}
