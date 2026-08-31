import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/protocol';
import {
  applyMoveToRoom,
  createRoom,
  getRoom,
  joinRoom,
  markAbsent,
  releaseSeat,
  requestRematch,
  roomsForSocket,
  serialise,
  startNextRound,
  sweep,
  type Room,
} from '../rooms';

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;

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
 */
export function registerHandlers(io: GameServer): { stop: () => void } {
  const broadcastState = (room: Room) => {
    io.to(room.id).emit('room:state', serialise(room));
  };

  io.on('connection', (socket) => {
    socket.on('room:create', ({ token }, ack) => {
      if (typeof token !== 'string' || token.length < 8) {
        ack({ ok: false, error: 'bad-token' });
        return;
      }
      const room = createRoom(token, socket.id);
      void socket.join(room.id);
      ack({ ok: true, state: serialise(room), seat: 'X' });
    });

    socket.on('room:join', ({ roomId, token }, ack) => {
      if (typeof roomId !== 'string' || typeof token !== 'string' || token.length < 8) {
        ack({ ok: false, error: 'room-not-found' });
        return;
      }

      // Presenting a token that already holds a seat reclaims it; that one rule
      // covers refresh, tab restore, and socket-level reconnect alike.
      const result = joinRoom(roomId, token, socket.id);
      if (!result.ok) {
        ack({ ok: false, error: result.error });
        return;
      }

      void socket.join(result.room.id);
      ack({ ok: true, state: serialise(result.room), seat: result.seat });
      broadcastState(result.room);
    });

    socket.on('game:move', ({ roomId, index }, ack) => {
      const room = getRoom(roomId);
      if (!room) {
        ack({ ok: false, error: 'room-not-found' });
        return;
      }

      const result = applyMoveToRoom(room, socket.id, index);
      if (!result.ok) {
        ack({ ok: false, error: result.error });
        // Resync the offending client so a rejected move can't leave it stuck.
        socket.emit('room:state', serialise(room));
        return;
      }

      ack({ ok: true });
      io.to(room.id).emit('game:move', { index, mark: result.mark, state: serialise(room) });
    });

    socket.on('game:rematch', ({ roomId }) => {
      const room = getRoom(roomId);
      if (!room) return;

      const bothAgreed = requestRematch(room, socket.id);
      if (!bothAgreed) {
        broadcastState(room);
        return;
      }

      startNextRound(room);
      const state = serialise(room);

      // Seats swap on a rematch, so each client is told its new seat directly.
      for (const seat of ['X', 'O'] as const) {
        const holderSocketId = room.seats[seat]?.socketId;
        if (!holderSocketId) continue;
        io.to(holderSocketId).emit('game:reset', { state, yourSeat: seat });
      }
    });

    socket.on('room:leave', ({ roomId }) => {
      const room = getRoom(roomId);
      if (!room) return;
      if (releaseSeat(room, socket.id) === null) return;
      void socket.leave(room.id);
      broadcastState(room);
    });

    socket.on('disconnect', () => {
      // The seat is held, not freed — see GRACE_MS in rooms.ts.
      for (const room of markAbsent(socket.id)) broadcastState(room);
    });

    // Defensive: a socket that never joined anything still gets cleaned up above.
    socket.on('error', () => {
      for (const room of roomsForSocket(socket.id)) broadcastState(room);
    });
  });

  const sweeper = setInterval(() => {
    for (const { id, reason } of sweep()) {
      io.to(id).emit('room:closed', { reason });
      io.socketsLeave(id);
    }
  }, SWEEP_INTERVAL_MS);
  sweeper.unref?.();

  return { stop: () => clearInterval(sweeper) };
}
