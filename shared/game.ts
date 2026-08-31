/**
 * Pure tic-tac-toe rules. Shared verbatim by the client (for local pass-and-play
 * and for optimistic UI affordances) and by the realtime server (which is the
 * sole authority for online matches). No DOM, no node APIs — keep it that way.
 */

export type Mark = 'X' | 'O';
export type Cell = Mark | null;
export type Board = Cell[]; // length 9, index 0..8 reading left-to-right, top-to-bottom

/** All eight winning triples. */
export const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8], // rows
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8], // columns
  [0, 4, 8],
  [2, 4, 6], // diagonals
] as const;

export type Outcome =
  | { kind: 'playing' }
  | { kind: 'win'; winner: Mark; line: readonly [number, number, number] }
  | { kind: 'draw' };

export function emptyBoard(): Board {
  return Array<Cell>(9).fill(null);
}

export function evaluate(board: Board): Outcome {
  for (const line of LINES) {
    const [a, b, c] = line;
    const v = board[a];
    if (v && v === board[b] && v === board[c]) {
      return { kind: 'win', winner: v, line };
    }
  }
  if (board.every((c) => c !== null)) return { kind: 'draw' };
  return { kind: 'playing' };
}

/** True when `mark` may legally take `index` on `board` given whose turn it is. */
export function isLegalMove(board: Board, index: number, turn: Mark, mark: Mark): boolean {
  if (!Number.isInteger(index) || index < 0 || index > 8) return false;
  if (board[index] !== null) return false;
  if (turn !== mark) return false;
  return evaluate(board).kind === 'playing';
}

/** Returns a new board with the move applied. Caller must have checked legality. */
export function applyMove(board: Board, index: number, mark: Mark): Board {
  const next = board.slice();
  next[index] = mark;
  return next;
}

export function other(mark: Mark): Mark {
  return mark === 'X' ? 'O' : 'X';
}

/** Row/column label for accessibility announcements. 0-indexed input, 1-indexed output. */
export function cellLabel(index: number): string {
  return `row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}`;
}
