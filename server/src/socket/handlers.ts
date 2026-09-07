import type { DefaultEventsMap, Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/protocol';
import {
  applyMoveToRoom,
  createRoom,
  getRoom,
  joinRoom,
  markAbsent,
  releaseSeat,
  requestRematch,
  serialise,
  sweep,
  type Room,
} from '../rooms';

/** Per-socket bookkeeping. A socket is in at most one room at a time in this
 * app, so remembering it here is enough to scope disconnect/error handling to
 * that one room instead of asking the store to scan every room for a match. */
interface SocketData {
  roomId?: string;
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;

export const SWEEP_INTERVAL_MS = 15_000;

/**
 * All realtime behaviour lives here so it can be mounted onto a server the
 * tests boot on an ephemeral port, rather than only onto the one `index.ts`
 * starts.
 *
 * The server is the sole authority: a client sends *intent*, and nothing
 * changes until this file has validated it. Every rejection path answers the
 * acknowledgement with a typed error, because a silent no-op leaves the UI
 * stuck with no way to explain itself.
 *
 * Every room mutation goes through exactly one atomic call into rooms.ts
 * (fetch, decide, and write happen together on the store side) -- this file
 * never fetches a room and hands it back into a second call to be mutated,
 * because on the Redis-backed store that gap is a real race window between
 * two different server instances.
 */
export function registerHandlers(io: GameServer): { stop: () => void } {
  const broadcastState = (room: Room) => {
    io.to(room.id).emit('room:state', serialise(room));
  };

  io.on('connection', (socket) => {
    socket.on('room:create', async ({ token }, ack) => {
      if (typeof token !== 'string' || token.length < 8) {
        ack({ ok: false, error: 'bad-token' });
        return;
      }
      const room = await createRoom(token, socket.id);
      socket.data.roomId = room.id;
      void socket.join(room.id);
      ack({ ok: true, state: serialise(room), seat: 'X' });
    });

    socket.on('room:join', async ({ roomId, token }, ack) => {
      if (typeof roomId !== 'string' || typeof token !== 'string' || token.length < 8) {
        ack({ ok: false, error: 'room-not-found' });
        return;
      }

      // Presenting a token that already holds a seat reclaims it; that one rule
      // covers refresh, tab restore, and socket-level reconnect alike.
      const result = await joinRoom(roomId, token, socket.id);
      if (!result.ok) {
        ack({ ok: false, error: result.error });
        return;
      }

      socket.data.roomId = result.room.id;
      void socket.join(result.room.id);
      ack({ ok: true, state: serialise(result.room), seat: result.seat });
      broadcastState(result.room);
    });

    socket.on('game:move', async ({ roomId, index }, ack) => {
      const result = await applyMoveToRoom(roomId, socket.id, index);
      if (!result.ok) {
        ack({ ok: false, error: result.error });
        // Resync the offending client so a rejected move can't leave it stuck.
        const current = await getRoom(roomId);
        if (current) socket.emit('room:state', serialise(current));
        return;
      }

      ack({ ok: true });
      io.to(result.room.id).emit('game:move', { index, mark: result.mark, state: serialise(result.room) });
    });

    socket.on('game:rematch', async ({ roomId }) => {
      const bothAgreed = await requestRematch(roomId, socket.id);
      const current = await getRoom(roomId);
      if (!current) return;

      if (!bothAgreed) {
        broadcastState(current);
        return;
      }

      const state = serialise(current);
      // Seats swap on a rematch, so each client is told its new seat directly.
      for (const seat of ['X', 'O'] as const) {
        const holderSocketId = current.seats[seat]?.socketId;
        if (!holderSocketId) continue;
        io.to(holderSocketId).emit('game:reset', { state, yourSeat: seat });
      }
    });

    socket.on('room:leave', async ({ roomId }) => {
      const result = await releaseSeat(roomId, socket.id);
      if (!result) return;
      socket.data.roomId = undefined;
      void socket.leave(result.room.id);
      broadcastState(result.room);
    });

    socket.on('disconnect', async () => {
      // The seat is held, not freed -- see GRACE_MS in rooms.ts.
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = await markAbsent(roomId, socket.id);
      if (room) broadcastState(room);
    });

    // Defensive: resync whatever room this socket was in, if any.
    socket.on('error', async () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      const room = await getRoom(roomId);
      if (room) broadcastState(room);
    });
  });

  const sweeper = setInterval(() => {
    void (async () => {
      for (const { id, reason } of await sweep()) {
        io.to(id).emit('room:closed', { reason });
        io.socketsLeave(id);
      }
    })();
  }, SWEEP_INTERVAL_MS);
  sweeper.unref?.();

  return { stop: () => clearInterval(sweeper) };
}
