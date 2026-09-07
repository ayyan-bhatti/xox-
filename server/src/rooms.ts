import type { Mark } from '../../shared/game.js';
import type { Seat } from '../../shared/protocol.js';
import { createMemoryStore } from './store/memoryStore.js';
import * as logic from './store/roomLogic.js';
import { EMPTY_TTL_MS, GRACE_MS, IDLE_TTL_MS, type Room, type RoomStore } from './store/types.js';

export { serialise, seatOfSocket } from './store/roomLogic';
export { EMPTY_TTL_MS, GRACE_MS, IDLE_TTL_MS };
export type { Room } from './store/types';

/**
 * This module used to hold the room table directly (a `Map`). It now holds
 * only a reference to whichever `RoomStore` was configured, and every
 * exported function is a thin, atomic wrapper around `store.update()` --
 * the store owns the actual read-modify-write, because on a Redis-backed
 * deployment that has to be a real distributed compare-and-swap, not a
 * fetch-then-mutate-then-save with a race window in the middle.
 *
 * `createTrioServer()` calls `configureRoomStore()` once at startup; tests
 * that never do so get a private in-memory store automatically.
 */
let store: RoomStore = createMemoryStore();

export function configureRoomStore(next: RoomStore): void {
  store = next;
}

export async function getRoom(id: string): Promise<Room | undefined> {
  return store.get(id.toUpperCase());
}

export async function createRoom(token: string, socketId: string): Promise<Room> {
  for (;;) {
    const id = logic.newRoomIdCandidate();
    // Collisions are vanishingly unlikely at 30^6, but this closes the gap
    // properly instead of assuming: only claim the id if it is still free at
    // the moment of the write, atomically, and try a new one otherwise.
    // eslint-disable-next-line no-await-in-loop
    const claimed = await store.update(id, (current) => {
      if (current) return { next: undefined, result: null };
      const room = logic.buildRoom(id, token, socketId);
      return { next: room, result: room };
    });
    if (claimed) return claimed;
  }
}

export type JoinError = 'room-not-found' | 'room-full';
export type JoinResult =
  | { ok: true; room: Room; seat: Seat; rejoined: boolean }
  | { ok: false; error: JoinError };

/**
 * Claim a seat. Presenting a token that already holds a seat reclaims it --
 * that single rule covers refresh, tab restore, and socket-level reconnect.
 */
/**
 * `now` defaults to the real clock; it exists as a parameter purely so tests
 * can exercise the grace-window boundary without either poking at internals
 * or actually waiting out a real two-minute grace period. The socket handler
 * never passes it — a client has no business dictating the server's clock.
 */
export async function joinRoom(
  id: string,
  token: string,
  socketId: string,
  now = Date.now(),
): Promise<JoinResult> {
  // Explicit type param: the callback's branches return differently-shaped
  // `result`s (a `room-not-found` error has no `seat`, a success has no
  // `error`), and TypeScript infers a generic's type argument from only the
  // first branch it evaluates rather than the union of all of them -- naming
  // `R` up front sidesteps that instead of fighting the inference.
  return store.update<JoinResult>(id.toUpperCase(), (current) => {
    if (!current) return { next: undefined, result: { ok: false, error: 'room-not-found' } };
    const decision = logic.decideJoin(current, token, socketId, now);
    if (!decision.ok) return { next: undefined, result: decision };
    return { next: decision.room, result: decision };
  });
}

/** Marks a seat absent without releasing it -- the grace window starts here. */
export async function markAbsent(roomId: string, socketId: string): Promise<Room | undefined> {
  return store.update(roomId.toUpperCase(), (current) => {
    if (!current) return { next: undefined, result: undefined };
    const next = logic.decideMarkAbsent(current, socketId);
    return { next, result: next };
  });
}

export interface ReleaseResult {
  room: Room;
  seat: Seat;
}

/** Deliberate leave -- frees the seat immediately, no grace. */
export async function releaseSeat(roomId: string, socketId: string): Promise<ReleaseResult | undefined> {
  return store.update(roomId.toUpperCase(), (current) => {
    if (!current) return { next: undefined, result: undefined };
    const released = logic.decideRelease(current, socketId);
    if (!released) return { next: undefined, result: undefined };
    return { next: released.room, result: released };
  });
}

export type MoveError = 'room-not-found' | 'not-seated' | 'illegal-move' | 'opponent-absent';
export type MoveResult = { ok: true; room: Room; mark: Mark } | { ok: false; error: MoveError };

/** The only place a board ever changes. Clients send intent; this decides. */
export async function applyMoveToRoom(roomId: string, socketId: string, index: number): Promise<MoveResult> {
  return store.update<MoveResult>(roomId.toUpperCase(), (current) => {
    if (!current) return { next: undefined, result: { ok: false, error: 'room-not-found' } };
    const decision = logic.decideMove(current, socketId, index);
    if (!decision.ok) return { next: undefined, result: decision };
    return { next: decision.room, result: decision };
  });
}

/**
 * Records a rematch request and, the instant both seats have asked, starts
 * the next round in the SAME atomic step -- doing that as two separate calls
 * (like the in-memory version used to) would reopen exactly the race window
 * this whole rewrite exists to close. Returns whether a new round started;
 * callers re-read the room afterwards to broadcast it.
 */
export async function requestRematch(roomId: string, socketId: string): Promise<boolean> {
  return store.update(roomId.toUpperCase(), (current) => {
    if (!current) return { next: undefined, result: false };
    const decision = logic.decideRematchRequest(current, socketId);
    if (!decision) return { next: undefined, result: false };
    const next = decision.bothAgreed ? logic.decideNextRound(decision.room) : decision.room;
    return { next, result: decision.bothAgreed };
  });
}

export type SweepReason = logic.SweepReason;

/**
 * Deletes rooms that nobody is coming back to. Returns the ids that were
 * dropped so the caller can notify anyone still listening.
 */
export async function sweep(now = Date.now()): Promise<{ id: string; reason: SweepReason }[]> {
  const dropped: { id: string; reason: SweepReason }[] = [];
  for (const id of await store.ids()) {
    // eslint-disable-next-line no-await-in-loop
    const reason = await store.update(id, (current) => {
      if (!current) return { next: undefined, result: null };
      const decision = logic.sweepDecision(current, now);
      if (!decision) return { next: undefined, result: null };
      return { next: null, result: decision };
    });
    if (reason) dropped.push({ id, reason });
  }
  return dropped;
}

export async function roomCount(): Promise<number> {
  return store.count();
}

/**
 * Test seam. The room table is module-level singleton state (there is only
 * ever one configured store per process), so the unit tests need a way to
 * start from empty.
 */
export async function resetRooms(): Promise<void> {
  return store.reset();
}
