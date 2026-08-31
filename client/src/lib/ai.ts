import { applyMove, evaluate, other, type Board, type Mark } from '@shared/game';

/**
 * The computer opponent.
 *
 * `ruthless` is exhaustive minimax with alpha-beta — tic-tac-toe is small
 * enough that it never loses, so the best a human can do is force a draw.
 * The easier levels are the *same* search with a deliberate, bounded chance of
 * playing a random legal move instead, which keeps them beatable without making
 * them play obviously silly openings every time.
 */

export type Difficulty = 'chill' | 'sharp' | 'ruthless';

export const DIFFICULTIES: { id: Difficulty; name: string; blurb: string }[] = [
  { id: 'chill', name: 'Chill', blurb: 'Makes mistakes. Often.' },
  { id: 'sharp', name: 'Sharp', blurb: 'Punishes anything lazy.' },
  { id: 'ruthless', name: 'Ruthless', blurb: 'Perfect play. Draw is the best you get.' },
];

/**
 * Probability of playing a random legal move instead of the best one.
 *
 * This never applies when a cell is *tactically forced* — see `chooseMove`.
 * An opponent that overlooks a win already on the board, or lets you complete a
 * line it could have blocked, reads as broken rather than easy, so every level
 * plays those two cases perfectly and only differs in its positional judgement.
 */
const SLOP: Record<Difficulty, number> = {
  chill: 0.55,
  sharp: 0.18,
  ruthless: 0,
};

function emptyCells(board: Board): number[] {
  const out: number[] = [];
  for (let i = 0; i < 9; i++) if (board[i] === null) out.push(i);
  return out;
}

/** Cells where `mark` completes a line immediately. */
export function winningMoves(board: Board, mark: Mark): number[] {
  return emptyCells(board).filter((i) => {
    const outcome = evaluate(applyMove(board, i, mark));
    return outcome.kind === 'win' && outcome.winner === mark;
  });
}

/**
 * Score from `me`'s point of view. Depth is subtracted from wins and added to
 * losses so the search prefers winning *sooner* and losing *later* — without
 * it, the AI will happily stall a won game or walk into a loss early.
 */
function minimax(
  board: Board,
  turn: Mark,
  me: Mark,
  depth: number,
  alpha: number,
  beta: number,
): number {
  const outcome = evaluate(board);
  if (outcome.kind === 'win') return outcome.winner === me ? 10 - depth : depth - 10;
  if (outcome.kind === 'draw') return 0;

  const cells = emptyCells(board);

  if (turn === me) {
    let best = -Infinity;
    for (const i of cells) {
      const score = minimax(applyMove(board, i, turn), other(turn), me, depth + 1, alpha, beta);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  }

  let best = Infinity;
  for (const i of cells) {
    const score = minimax(applyMove(board, i, turn), other(turn), me, depth + 1, alpha, beta);
    if (score < best) best = score;
    if (best < beta) beta = best;
    if (beta <= alpha) break;
  }
  return best;
}

/** Every move that ties for the best score, so openings vary between games. */
function bestMoves(board: Board, me: Mark): number[] {
  const cells = emptyCells(board);
  let best = -Infinity;
  let winners: number[] = [];

  for (const i of cells) {
    const score = minimax(applyMove(board, i, me), other(me), me, 0, -Infinity, Infinity);
    if (score > best) {
      best = score;
      winners = [i];
    } else if (score === best) {
      winners.push(i);
    }
  }
  return winners;
}

/**
 * Picks the computer's move. Returns null when the board is finished or full.
 *
 * Order of business, and it matters:
 *   1. If we can win right now, win. No level ever declines this.
 *   2. If the opponent could win next move, block it. Likewise non-negotiable.
 *   3. Otherwise, play the minimax best move — or, on the easier levels, throw
 *      the turn away at random.
 *
 * Steps 1 and 2 are redundant for `ruthless` (minimax finds them anyway) but
 * they are what stops `chill` from being unplayably stupid.
 */
export function chooseMove(board: Board, me: Mark, difficulty: Difficulty): number | null {
  if (evaluate(board).kind !== 'playing') return null;
  const cells = emptyCells(board);
  if (cells.length === 0) return null;

  const mine = winningMoves(board, me);
  if (mine.length) return mine[Math.floor(Math.random() * mine.length)];

  const theirs = winningMoves(board, other(me));
  if (theirs.length) return theirs[Math.floor(Math.random() * theirs.length)];

  if (Math.random() < SLOP[difficulty]) {
    return cells[Math.floor(Math.random() * cells.length)];
  }

  const best = bestMoves(board, me);
  return best[Math.floor(Math.random() * best.length)];
}

/**
 * How long the computer "thinks" before committing, in ms. Instant replies feel
 * mechanical and step on the mark-stamp animation, so every level pauses.
 */
export function thinkingTime(difficulty: Difficulty): number {
  const base = difficulty === 'chill' ? 400 : difficulty === 'sharp' ? 480 : 550;
  return base + Math.random() * 150;
}
