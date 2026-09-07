import { customAlphabet } from 'nanoid';
import {
  applyMove,
  emptyBoard,
  evaluate,
  isLegalMove,
  other,
  type Mark,
} from '../../../shared/game.js';
import type { RoomState, Seat } from '../../../shared/protocol.js';
import { EMPTY_TTL_MS, GRACE_MS, IDLE_TTL_MS, type Room, type SeatHolder } from './types.js';

/**
 * Pure game-rule functions: given a `Room` value (and sometimes some inputs),
 * decide what the next `Room` value should be. Nothing in this file touches
 * storage — every function here is synchronous and side-effect-free, which is
 * what lets `RoomStore.update()` run them safely inside a compare-and-swap
 * retry loop on either backend without any risk of a partial mutation leaking
 * out on a failed attempt.
 */

/** Unambiguous alphabet — no O/0, I/1, or S/5 to survive being read aloud. */
const newRoomId = customAlphabet('ABCDEFGHJKLMNPQRTUVWXYZ2346789', 6);

export function newRoomIdCandidate(): string {
  return newRoomId();
}

function touch(room: Room): Room {
  return { ...room, lastActivity: Date.now() };
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

export function seatOfSocket(room: Room, socketId: string): Seat | null {
  if (room.seats.X?.socketId === socketId) return 'X';
  if (room.seats.O?.socketId === socketId) return 'O';
  return null;
}

export function buildRoom(id: string, token: string, socketId: string): Room {
  const now = Date.now();
  return {
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
}

export type JoinDecision =
  | { ok: true; room: Room; seat: Seat; rejoined: boolean }
  | { ok: false; error: 'room-full' };

/**
 * Claim a seat on an existing room. Presenting a token that already holds a
 * seat reclaims it — that single rule covers refresh, tab restore, and
 * socket-level reconnect alike.
 */
export function decideJoin(room: Room, token: string, socketId: string, now = Date.now()): JoinDecision {

  for (const seat of ['X', 'O'] as const) {
    const holder = room.seats[seat];
    if (holder?.token === token) {
      const next = touch({
        ...room,
        seats: { ...room.seats, [seat]: { ...holder, socketId, lastSeen: now } },
      });
      return { ok: true, room: next, seat, rejoined: true };
    }
  }

  for (const seat of ['X', 'O'] as const) {
    const holder = room.seats[seat];
    const expired = holder !== null && holder.socketId === null && now - holder.lastSeen > GRACE_MS;
    if (holder === null || expired) {
      const next = touch({
        ...room,
        seats: { ...room.seats, [seat]: { token, socketId, lastSeen: now } },
      });
      return { ok: true, room: next, seat, rejoined: false };
    }
  }

  return { ok: false, error: 'room-full' };
}

/** Marks a seat absent without releasing it — the grace window starts here. */
export function decideMarkAbsent(room: Room, socketId: string): Room | undefined {
  const seat = seatOfSocket(room, socketId);
  if (!seat) return undefined;
  const holder = room.seats[seat];
  if (!holder) return undefined;
  return touch({
    ...room,
    seats: { ...room.seats, [seat]: { ...holder, socketId: null, lastSeen: Date.now() } },
  });
}

export interface ReleaseResult {
  room: Room;
  seat: Seat;
}

/** Deliberate leave — frees the seat immediately, no grace. */
export function decideRelease(room: Room, socketId: string): ReleaseResult | undefined {
  const seat = seatOfSocket(room, socketId);
  if (!seat) return undefined;
  const next = touch({
    ...room,
    seats: { ...room.seats, [seat]: null },
    rematch: { ...room.rematch, [seat]: false },
  });
  return { room: next, seat };
}

export type MoveDecision =
  | { ok: true; room: Room; mark: Mark }
  | { ok: false; error: 'not-seated' | 'illegal-move' | 'opponent-absent' };

/** The only place a board ever changes. Clients send intent; this decides. */
export function decideMove(room: Room, socketId: string, index: number): MoveDecision {
  const seat = seatOfSocket(room, socketId);
  if (!seat) return { ok: false, error: 'not-seated' };
  if (!isLegalMove(room.board, index, room.turn, seat)) return { ok: false, error: 'illegal-move' };
  if (!seatIsPresent(room.seats.X) || !seatIsPresent(room.seats.O)) {
    return { ok: false, error: 'opponent-absent' };
  }

  const board = applyMove(room.board, index, seat);
  const outcome = evaluate(board);
  const score = { ...room.score };
  if (outcome.kind === 'win') score[outcome.winner] += 1;
  else if (outcome.kind === 'draw') score.draws += 1;

  const next = touch({ ...room, board, outcome, turn: other(room.turn), score });
  return { ok: true, room: next, mark: seat };
}

export interface RematchDecision {
  room: Room;
  bothAgreed: boolean;
}

/**
 * Records a rematch request. `bothAgreed` tells the caller whether to also
 * apply `decideNextRound` in the same transaction.
 */
export function decideRematchRequest(room: Room, socketId: string): RematchDecision | undefined {
  const seat = seatOfSocket(room, socketId);
  if (!seat) return undefined;
  if (room.outcome.kind === 'playing') return undefined;
  const rematch = { ...room.rematch, [seat]: true };
  const next = touch({ ...room, rematch });
  return { room: next, bothAgreed: rematch.X && rematch.O };
}

/**
 * Starts a new round and swaps the two players between seats, so whoever
 * played O last opens as X this time. Score follows the player, not the seat.
 */
export function decideNextRound(room: Room): Room {
  const { X, O } = room.seats;
  return touch({
    ...room,
    seats: { X: O, O: X },
    board: emptyBoard(),
    turn: 'X',
    outcome: { kind: 'playing' },
    rematch: { X: false, O: false },
    round: room.round + 1,
    score: { X: room.score.O, O: room.score.X, draws: room.score.draws },
  });
}

export type SweepReason = 'expired' | 'empty';

/** Whether `room` should be dropped right now, and why. */
export function sweepDecision(room: Room, now: number): SweepReason | null {
  const anyPresent = seatIsPresent(room.seats.X) || seatIsPresent(room.seats.O);

  if (!anyPresent) {
    const lastPresence = Math.max(
      room.seats.X?.lastSeen ?? 0,
      room.seats.O?.lastSeen ?? 0,
      room.createdAt,
    );
    if (now - lastPresence > EMPTY_TTL_MS) return 'empty';
  }

  if (now - room.lastActivity > IDLE_TTL_MS) return 'expired';
  return null;
}
