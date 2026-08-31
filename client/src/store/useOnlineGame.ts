import { create } from 'zustand';
import type { JoinAck, JoinError, MoveAck, RoomState, Seat, SeatAck } from '@shared/protocol';
import { getSocket, type GameSocket } from '../lib/socket';
import { getToken } from '../lib/identity';
import { play } from '../lib/sound';

export type Phase =
  | 'idle'
  | 'connecting'
  | 'waiting' // in the room, opponent hasn't arrived
  | 'ready' // both seats present
  | 'error'
  | 'closed';

export type Link = 'online' | 'reconnecting';

interface OnlineState {
  phase: Phase;
  link: Link;
  seat: Seat | null;
  room: RoomState | null;
  error: string | null;
  /** Cell awaiting server confirmation — rendered as a dimmed placeholder. */
  pending: number | null;
  /** Set for one render after the opponent arrives, to trigger the connect beat. */
  justConnected: boolean;
  /** Transient, self-clearing message (a dropped move, a stalled request). */
  notice: string | null;

  attach: () => () => void;
  create: () => Promise<string | null>;
  join: (roomId: string) => Promise<void>;
  move: (index: number) => void;
  rematch: () => void;
  leave: () => void;
  clearJustConnected: () => void;
}

const JOIN_MESSAGES: Record<JoinError, string> = {
  'room-not-found': 'That room does not exist, or it has already expired.',
  'room-full': 'That game already has two players in it.',
  'room-closed': 'That room has closed.',
};

/** True when both seats are occupied. */
function bothPresent(room: RoomState | null): boolean {
  return !!room && room.present.X && room.present.O;
}

/**
 * How long to wait for a server acknowledgement before giving up.
 *
 * This exists because of a real failure mode: `socket.emit` with an ack
 * BUFFERS the packet while the socket is disconnected and never invokes the
 * callback. With the server unreachable, "Create online game" sat disabled on
 * "Opening…" forever, a room link sat on "Connecting…" forever, and a move left
 * the board locked on `pending` forever — all three with no error and no way
 * back. Every request now races a timer.
 */
const ACK_TIMEOUT_MS = 8000;

const TIMED_OUT = Symbol('timed-out');

function withTimeout<T>(
  send: (ack: (res: T) => void) => void,
  ms = ACK_TIMEOUT_MS,
): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(TIMED_OUT);
    }, ms);
    send((res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    });
  });
}

const UNREACHABLE = 'Could not reach the game server. Check your connection and try again.';

export const useOnlineGame = create<OnlineState>((set, get) => ({
  phase: 'idle',
  link: 'online',
  seat: null,
  room: null,
  error: null,
  pending: null,
  justConnected: false,
  notice: null,

  /**
   * Subscribes to the socket. Returns an unsubscribe function; the room route
   * calls this once on mount and disposes on unmount.
   */
  attach() {
    const socket: GameSocket = getSocket();

    const applyRoom = (room: RoomState) => {
      const wasReady = bothPresent(get().room);
      const nowReady = bothPresent(room);
      if (!wasReady && nowReady) {
        play('join');
        set({ justConnected: true });
      }
      set({
        room,
        pending: null,
        notice: null,
        phase: nowReady ? 'ready' : 'waiting',
      });
    };

    const onState = (room: RoomState) => applyRoom(room);

    const onMove = ({ mark, state }: { mark: 'X' | 'O'; state: RoomState }) => {
      play(mark === 'X' ? 'placeX' : 'placeO');
      if (state.outcome.kind === 'win') play('win');
      else if (state.outcome.kind === 'draw') play('draw');
      applyRoom(state);
    };

    const onReset = ({ state, yourSeat }: { state: RoomState; yourSeat: Seat }) => {
      set({ seat: yourSeat });
      applyRoom(state);
    };

    const onClosed = () => set({ phase: 'closed', room: null });

    const onConnect = () => {
      set({ link: 'online' });
      // Re-present our token so the server hands the seat back after a drop.
      const room = get().room;
      if (room) void get().join(room.roomId);
    };

    const onDisconnect = () => set({ link: 'reconnecting' });

    socket.on('room:state', onState);
    socket.on('game:move', onMove);
    socket.on('game:reset', onReset);
    socket.on('room:closed', onClosed);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('room:state', onState);
      socket.off('game:move', onMove);
      socket.off('game:reset', onReset);
      socket.off('room:closed', onClosed);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  },

  async create() {
    set({ phase: 'connecting', error: null, notice: null });
    const res = await withTimeout<SeatAck>((ack) =>
      getSocket().emit('room:create', { token: getToken() }, ack),
    );

    if (res === TIMED_OUT) {
      set({ phase: 'error', error: UNREACHABLE });
      return null;
    }
    if (!res.ok) {
      set({ phase: 'error', error: UNREACHABLE });
      return null;
    }
    set({
      seat: res.seat,
      room: res.state,
      phase: bothPresent(res.state) ? 'ready' : 'waiting',
    });
    return res.state.roomId;
  },

  async join(roomId) {
    if (get().phase === 'idle') set({ phase: 'connecting', error: null });
    const res = await withTimeout<JoinAck>((ack) =>
      getSocket().emit('room:join', { roomId, token: getToken() }, ack),
    );

    if (res === TIMED_OUT) {
      // A silent reconnect attempt should not blow away a live game; only
      // surface the failure if we never had the room in the first place.
      if (get().room) set({ notice: 'Reconnecting is taking a while…' });
      else set({ phase: 'error', error: UNREACHABLE });
      return;
    }
    if (!res.ok) {
      set({ phase: 'error', error: JOIN_MESSAGES[res.error] ?? 'Could not join that room.' });
      return;
    }

    const wasReady = bothPresent(get().room);
    const nowReady = bothPresent(res.state);
    if (!wasReady && nowReady) {
      play('join');
      set({ justConnected: true });
    }
    set({
      seat: res.seat,
      room: res.state,
      error: null,
      notice: null,
      phase: nowReady ? 'ready' : 'waiting',
    });
  },

  /**
   * Server-authoritative: mark the cell pending and wait. Nothing is drawn on
   * this client until the broadcast comes back, which is what keeps the two
   * boards from ever diverging.
   */
  move(index) {
    const { room, seat, pending, link } = get();
    if (!room || !seat || pending !== null || link !== 'online') return;
    if (room.turn !== seat) return;
    if (room.board[index] !== null) return;
    if (room.outcome.kind !== 'playing') return;

    set({ pending: index, notice: null });
    void withTimeout<MoveAck>((ack) =>
      getSocket().emit('game:move', { roomId: room.roomId, index }, ack),
    ).then((res) => {
      // Only clear a pending cell that is still OUR pending cell — a broadcast
      // may already have landed and started the next turn.
      const stillPending = get().pending === index;
      if (res === TIMED_OUT) {
        if (stillPending) set({ pending: null, notice: 'That move did not reach the server. Try again.' });
        return;
      }
      // A rejection clears immediately; success is cleared by the broadcast.
      if (!res.ok && stillPending) set({ pending: null });
    });
  },

  rematch() {
    const room = get().room;
    if (!room) return;
    getSocket().emit('game:rematch', { roomId: room.roomId });
  },

  leave() {
    const room = get().room;
    if (room) getSocket().emit('room:leave', { roomId: room.roomId });
    set({ phase: 'idle', seat: null, room: null, error: null, pending: null, notice: null });
  },

  clearJustConnected() {
    set({ justConnected: false });
  },
}));
