import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/protocol';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * In dev the Vite proxy forwards /socket.io to localhost:8787, so the default
 * same-origin connection just works. In production set VITE_SERVER_URL when the
 * socket server is deployed to a different host than the static frontend.
 */
const SERVER_URL = import.meta.env.VITE_SERVER_URL as string | undefined;

let socket: GameSocket | null = null;

export function getSocket(): GameSocket {
  if (socket) return socket;
  socket = (SERVER_URL ? io(SERVER_URL, opts()) : io(opts())) as GameSocket;
  return socket;
}

function opts(): Partial<ManagerOptions & SocketOptions> {
  return {
    transports: ['websocket', 'polling'],
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
