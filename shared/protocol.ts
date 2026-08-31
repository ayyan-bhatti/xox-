/**
 * Wire protocol between the browser client and the realtime server.
 * Both sides import these types, so a change here breaks compilation on
 * whichever side forgot to keep up — which is the point.
 */

import type { Board, Mark, Outcome } from './game';

export type Seat = 'X' | 'O';

/** Public, serialisable view of a room. This is what the server broadcasts. */
export interface RoomState {
  roomId: string;
  board: Board;
  turn: Mark;
  outcome: Outcome;
  /** Which seats are currently occupied by a live socket. */
  present: { X: boolean; O: boolean };
  /** Seats that have asked for a rematch since the current game ended. */
  rematchRequested: { X: boolean; O: boolean };
  /** Games completed in this room — used to alternate who opens as X. */
  round: number;
  /** Wins per seat across the room's lifetime, plus draws. */
  score: { X: number; O: number; draws: number };
  /**
   * Epoch ms after which a seat that is currently absent loses its claim.
   * Null when nobody is missing.
   */
  graceUntil: number | null;
}

export type JoinError =
  | 'room-not-found'
  | 'room-full'
  | 'room-closed';

/**
 * Acknowledgement payloads, named so the client and the integration tests can
 * both refer to them instead of re-declaring the shapes inline.
 */
export type SeatAck =
  | { ok: true; state: RoomState; seat: Seat }
  | { ok: false; error: string };

export type JoinAck =
  | { ok: true; state: RoomState; seat: Seat }
  | { ok: false; error: JoinError };

export type MoveAck = { ok: true } | { ok: false; error: string };

/** Client → server. */
export interface ClientToServerEvents {
  /** Create a fresh room; the creator takes seat X. */
  'room:create': (
    payload: { token: string },
    ack: (res: { ok: true; state: RoomState; seat: Seat } | { ok: false; error: string }) => void,
  ) => void;

  /**
   * Join (or rejoin) an existing room. `token` is a stable per-browser id kept in
   * localStorage — presenting the same token reclaims the same seat after a refresh.
   */
  'room:join': (
    payload: { roomId: string; token: string },
    ack: (res: { ok: true; state: RoomState; seat: Seat } | { ok: false; error: JoinError }) => void,
  ) => void;

  /** Attempt a move. The server validates; the client renders nothing until it hears back. */
  'game:move': (
    payload: { roomId: string; index: number },
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;

  /** Ask for another round. When both seats have asked, the server starts one. */
  'game:rematch': (payload: { roomId: string }) => void;

  /** Leave deliberately (as opposed to dropping) — frees the seat immediately. */
  'room:leave': (payload: { roomId: string }) => void;
}

/** Server → client. */
export interface ServerToClientEvents {
  /** Full authoritative state. Clients replace their local copy wholesale. */
  'room:state': (state: RoomState) => void;

  /** A move was committed. Carries the state too, so a dropped `room:state` self-heals. */
  'game:move': (payload: { index: number; mark: Mark; state: RoomState }) => void;

  /** A new round began in this room. */
  'game:reset': (payload: { state: RoomState; yourSeat: Seat }) => void;

  /** The room is gone (expired, or both players left). */
  'room:closed': (payload: { reason: 'expired' | 'empty' }) => void;
}
