import type { Board, Mark, Outcome } from '../../../shared/game.js';

/** How long a dropped player keeps their seat. */
export const GRACE_MS = 2 * 60 * 1000;

/** How long a room with nobody connected survives before deletion. */
export const EMPTY_TTL_MS = GRACE_MS;

/** How long a room survives with no activity at all, even if someone is idle. */
export const IDLE_TTL_MS = 45 * 60 * 1000;

export interface SeatHolder {
  token: string;
  socketId: string | null;
  /** Epoch ms when this seat last had a live socket. */
  lastSeen: number;
}

export interface Room {
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

/**
 * Storage for room state, decoupled from the game rules that decide what the
 * next state should be (those live in `roomLogic.ts` as pure functions).
 *
 * There are two implementations:
 *   - `memoryStore`: a plain Map. Correct because Node is single-threaded and
 *     every mutator here runs synchronously with no `await` inside it, so one
 *     `update()` call can never interleave with another.
 *   - `redisStore`: backs a Vercel deployment, where a room's two players can
 *     have their sockets accepted by two different, unrelated function
 *     instances with no shared memory. `update()` there needs a real
 *     distributed compare-and-swap — see redisStore.ts for how.
 *
 * Both must satisfy the same contract, which `store.contract.test.ts` runs
 * against each of them: the "two players race for the last seat" case is the
 * one most likely to break if a store's atomicity is wrong.
 */
export interface RoomStore {
  /**
   * Atomically read-modify-write a single room.
   *
   * `mutator` receives the current value (`undefined` if the room does not
   * exist) and returns:
   *   - `{ next: someRoom, result }` to write `someRoom` and return `result`
   *   - `{ next: null, result }` to delete the room and return `result`
   *   - `{ next: undefined, result }` to leave the room untouched (a rejected
   *     move, a room that was never found, etc.) and return `result`
   *
   * The read and the write happen as one atomic step from every caller's
   * point of view, on both backends — that's what makes it safe for two
   * requests landing on two different processes at the same instant.
   */
  update<R>(
    id: string,
    mutator: (room: Room | undefined) => { next: Room | null | undefined; result: R },
  ): Promise<R>;

  get(id: string): Promise<Room | undefined>;

  /** All room ids currently stored. Used only by the sweep. */
  ids(): Promise<string[]>;

  count(): Promise<number>;

  /** Test seam: drop everything and start clean. */
  reset(): Promise<void>;
}
