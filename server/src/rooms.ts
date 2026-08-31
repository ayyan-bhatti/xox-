import { customAlphabet } from 'nanoid';
import {
  applyMove,
  emptyBoard,
  evaluate,
  isLegalMove,
  other,
  type Board,
  type Mark,
  type Outcome,
} from '../../shared/game';
import type { RoomState, Seat } from '../../shared/protocol';

/** Unambiguous alphabet — no O/0, I/1, or S/5 to survive being read aloud. */
const newRoomId = customAlphabet('ABCDEFGHJKLMNPQRTUVWXYZ2346789', 6);

/** How long a dropped player keeps their seat. */
export const GRACE_MS = 2 * 60 * 1000;

/** How long a room with nobody connected survives before deletion. */
export const EMPTY_TTL_MS = GRACE_MS;

/** How long a room survives with no activity at all, even if someone is idle. */
export const IDLE_TTL_MS = 45 * 60 * 1000;

interface SeatHolder {
  token: string;
  socketId: string | null;
  /** Epoch ms when this seat last had a live socket. */
  lastSeen: number;
}

interface Room {
  id: string;
  board: Board;
  turn: Mark;
  outcome: Outcome;
  seats: { X: SeatHolder | null; O: SeatHolder | null };
  rematch: { X: boolean; O: boolean };
  round: number;
  score: { X: number; O: number; draws: number };
  createdAt: number;
  lastActivity: number;
}

const rooms = new Map<string, Room>();

/* ---------------------------------------------------------------------- */

function touch(room: Room): void {
  room.lastActivity = Date.now();
}

function seatIsPresent(holder: SeatHolder | null): boolean {
  return !!holder && holder.socketId !== null;
}

/** Earliest moment an absent seat loses its claim, or null when all present. */
function graceDeadline(room: Room): number | null {
  const absent = (['X', 'O'] as const)
    .map((seat) => room.seats[seat])
    .filter((holder): holder is SeatHolder => !!holder && holder.socketId === null);
  if (absent.length === 0) return null;
  return Math.max(...absent.map((h) => h.lastSeen + GRACE_MS));
}

export function serialise(room: Room): RoomState {
  return {
    roomId: room.id,
    board: room.board,
    turn: room.turn,
    outcome: room.outcome,
    present: { X: seatIsPresent(room.seats.X), O: seatIsPresent(room.seats.O) },
    rematchRequested: { ...room.rematch },
    round: room.round,
    score: { ...room.score },
    graceUntil: graceDeadline(room),
  };
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id.toUpperCase());
}

export function createRoom(token: string, socketId: string): Room {
  let id = newRoomId();
  // Collisions are vanishingly unlikely at 30^6, but cheap to rule out.
  while (rooms.has(id)) id = newRoomId();

  const now = Date.now();
  const room: Room = {
    id,
    board: emptyBoard(),
    turn: 'X',
    outcome: { kind: 'playing' },
    seats: { X: { token, socketId, lastSeen: now }, O: null },
    rematch: { X: false, O: false },
    round: 0,
    score: { X: 0, O: 0, draws: 0 },
    createdAt: now,
    lastActivity: now,
  };
  rooms.set(id, room);
  return room;
}

export type JoinResult =
  | { ok: true; room: Room; seat: Seat; rejoined: boolean }
  | { ok: false; error: 'room-not-found' | 'room-full' };

/**
 * Claim a seat. Presenting a token that already holds a seat reclaims it —
 * that single rule covers refresh, tab restore, and socket-level reconnect.
 */
export function joinRoom(id: string, token: string, socketId: string): JoinResult {
  const room = getRoom(id);
  if (!room) return { ok: false, error: 'room-not-found' };

  const now = Date.now();

  for (const seat of ['X', 'O'] as const) {
    const holder = room.seats[seat];
    if (holder?.token === token) {
      holder.socketId = socketId;
      holder.lastSeen = now;
      touch(room);
      return { ok: true, room, seat, rejoined: true };
    }
  }

  for (const seat of ['X', 'O'] as const) {
    const holder = room.seats[seat];
    const expired = holder !== null && holder.socketId === null && now - holder.lastSeen > GRACE_MS;
    if (holder === null || expired) {
      room.seats[seat] = { token, socketId, lastSeen: now };
      touch(room);
      return { ok: true, room, seat, rejoined: false };
    }
  }

  return { ok: false, error: 'room-full' };
}

export function seatOfSocket(room: Room, socketId: string): Seat | null {
  if (room.seats.X?.socketId === socketId) return 'X';
  if (room.seats.O?.socketId === socketId) return 'O';
  return null;
}

/** Marks a seat absent without releasing it — the grace window starts here. */
export function markAbsent(socketId: string): Room[] {
  const affected: Room[] = [];
  for (const room of rooms.values()) {
    const seat = seatOfSocket(room, socketId);
    if (!seat) continue;
    const holder = room.seats[seat];
    if (!holder) continue;
    holder.socketId = null;
    holder.lastSeen = Date.now();
    touch(room);
    affected.push(room);
  }
  return affected;
}

/** Deliberate leave — frees the seat immediately, no grace. */
export function releaseSeat(room: Room, socketId: string): Seat | null {
  const seat = seatOfSocket(room, socketId);
  if (!seat) return null;
  room.seats[seat] = null;
  room.rematch[seat] = false;
  touch(room);
  return seat;
}

export type MoveResult =
  | { ok: true; room: Room; mark: Mark }
  | { ok: false; error: string };

/**
 * The only place a board ever changes. Clients send intent; this decides.
 */
export function applyMoveToRoom(room: Room, socketId: string, index: number): MoveResult {
  const seat = seatOfSocket(room, socketId);
  if (!seat) return { ok: false, error: 'not-seated' };
  if (!isLegalMove(room.board, index, room.turn, seat)) return { ok: false, error: 'illegal-move' };
  if (!seatIsPresent(room.seats.X) || !seatIsPresent(room.seats.O)) {
    return { ok: false, error: 'opponent-absent' };
  }

  room.board = applyMove(room.board, index, seat);
  room.outcome = evaluate(room.board);
  room.turn = other(room.turn);

  if (room.outcome.kind === 'win') room.score[room.outcome.winner] += 1;
  else if (room.outcome.kind === 'draw') room.score.draws += 1;

  touch(room);
  return { ok: true, room, mark: seat };
}

/**
 * Records a rematch request. Returns true once both sides have asked, at which
 * point the caller should start a new round.
 */
export function requestRematch(room: Room, socketId: string): boolean {
  const seat = seatOfSocket(room, socketId);
  if (!seat) return false;
  if (room.outcome.kind === 'playing') return false;
  room.rematch[seat] = true;
  touch(room);
  return room.rematch.X && room.rematch.O;
}

/**
 * Starts a new round and swaps the two players between seats, so whoever
 * played O last opens as X this time.
 */
export function startNextRound(room: Room): void {
  const { X, O } = room.seats;
  room.seats = { X: O, O: X };
  room.board = emptyBoard();
  room.turn = 'X';
  room.outcome = { kind: 'playing' };
  room.rematch = { X: false, O: false };
  room.round += 1;
  // Scores follow the player, not the seat, so swap them alongside the seats.
  room.score = { X: room.score.O, O: room.score.X, draws: room.score.draws };
  touch(room);
}

/** Rooms the given socket is seated in. */
export function roomsForSocket(socketId: string): Room[] {
  return [...rooms.values()].filter((room) => seatOfSocket(room, socketId) !== null);
}

/**
 * Deletes rooms that nobody is coming back to. Returns the ids that were
 * dropped so the caller can notify anyone still listening.
 */
export function sweep(now = Date.now()): { id: string; reason: 'expired' | 'empty' }[] {
  const dropped: { id: string; reason: 'expired' | 'empty' }[] = [];

  for (const [id, room] of rooms) {
    const anyPresent = seatIsPresent(room.seats.X) || seatIsPresent(room.seats.O);

    if (!anyPresent) {
      const lastPresence = Math.max(
        room.seats.X?.lastSeen ?? 0,
        room.seats.O?.lastSeen ?? 0,
        room.createdAt,
      );
      if (now - lastPresence > EMPTY_TTL_MS) {
        rooms.delete(id);
        dropped.push({ id, reason: 'empty' });
        continue;
      }
    }

    if (now - room.lastActivity > IDLE_TTL_MS) {
      rooms.delete(id);
      dropped.push({ id, reason: 'expired' });
    }
  }

  return dropped;
}

export function roomCount(): number {
  return rooms.size;
}

/**
 * Test seam. The room table is module-level singleton state (there is only ever
 * one per process), so the unit tests need a way to start from empty.
 */
export function resetRooms(): void {
  rooms.clear();
}

export type { Room };
