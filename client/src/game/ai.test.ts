import { describe, expect, it } from 'vitest';
import { applyMove, emptyBoard, evaluate, other, type Board, type Mark } from '@shared/game';
import { chooseMove, DIFFICULTIES, thinkingTime, winningMoves } from '../lib/ai';

function b(spec: string): Board {
  return spec
    .replace(/\s/g, '')
    .split('')
    .map((c) => (c === '.' ? null : (c as Mark)));
}

const LEVELS = DIFFICULTIES.map((d) => d.id);

/** chooseMove is randomised; run each assertion enough times to catch slop. */
const REPS = 60;

describe('winningMoves', () => {
  it('finds the cell that completes a line', () => {
    expect(winningMoves(b('XX.......'), 'X')).toEqual([2]);
  });

  it('finds every winning cell when there is more than one', () => {
    // X on 0,1,4 — completes the top row at 2, the middle column at 7,
    // and the leading diagonal at 8.
    expect(winningMoves(b('XX.OX.O..'), 'X').sort()).toEqual([2, 7, 8]);
  });

  it('returns nothing when no line is one move away', () => {
    expect(winningMoves(emptyBoard(), 'X')).toEqual([]);
  });
});

describe('chooseMove — legality', () => {
  it.each(LEVELS)('%s never picks an occupied cell', (level) => {
    // A board with a single gap: the only legal move is index 8.
    const board = b('XOXXOOOX.');
    for (let i = 0; i < REPS; i++) {
      expect(chooseMove(board, 'O', level)).toBe(8);
    }
  });

  it.each(LEVELS)('%s only ever returns an empty cell on a busy board', (level) => {
    const board = b('XO.X.O...');
    for (let i = 0; i < REPS; i++) {
      const move = chooseMove(board, 'X', level);
      expect(move).not.toBeNull();
      expect(board[move as number]).toBeNull();
    }
  });

  it.each(LEVELS)('%s returns null once the game is over', (level) => {
    expect(chooseMove(b('XXX......'), 'O', level)).toBeNull();
    expect(chooseMove(b('XOXXOOOXX'), 'O', level)).toBeNull();
  });
});

describe('chooseMove — tactics are never skipped, at any difficulty', () => {
  it.each(LEVELS)('%s takes an immediate win', (level) => {
    // O to play: O has 3 and 4, so 5 wins immediately.
    const board = b('XX.OO.X..');
    for (let i = 0; i < REPS; i++) {
      expect(chooseMove(board, 'O', level)).toBe(5);
    }
  });

  it.each(LEVELS)('%s blocks the opponent immediate win', (level) => {
    // X threatens the top row at 2. O's own marks (5, 7) share no line, so 2 is
    // purely a block — nothing here lets the AI pass this by winning instead.
    const board = b('XX...O.O.');
    expect(winningMoves(board, 'O')).toEqual([]);
    for (let i = 0; i < REPS; i++) {
      expect(chooseMove(board, 'O', level)).toBe(2);
    }
  });

  it.each(LEVELS)('%s prefers its own win over blocking', (level) => {
    // Both sides are one move from winning; taking the win must come first.
    // X wins at 2 (top row). O wins at 5 (middle row).
    const board = b('XX.OO....');
    for (let i = 0; i < REPS; i++) {
      expect(chooseMove(board, 'O', level)).toBe(5);
    }
  });
});

describe('ruthless minimax is unbeatable', () => {
  /** Plays every possible human line against the AI and asserts it never loses. */
  function search(board: Board, turn: Mark, human: Mark): void {
    const outcome = evaluate(board);
    if (outcome.kind === 'win') {
      expect(outcome.winner).not.toBe(human);
      return;
    }
    if (outcome.kind === 'draw') return;

    if (turn === human) {
      for (let i = 0; i < 9; i++) {
        if (board[i] !== null) continue;
        search(applyMove(board, i, human), other(human), human);
      }
      return;
    }

    const move = chooseMove(board, turn, 'ruthless');
    expect(move).not.toBeNull();
    search(applyMove(board, move as number, turn), other(turn), human);
  }

  it('never loses when the human moves first', () => {
    search(emptyBoard(), 'X', 'X');
  });

  it('never loses when the AI moves first', () => {
    search(emptyBoard(), 'O', 'X');
  });
});

describe('difficulty metadata', () => {
  it('exposes three levels with names and blurbs', () => {
    expect(DIFFICULTIES).toHaveLength(3);
    for (const d of DIFFICULTIES) {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.blurb.length).toBeGreaterThan(0);
    }
  });

  it('keeps the thinking pause inside the 400-700ms budget', () => {
    for (const level of LEVELS) {
      for (let i = 0; i < REPS; i++) {
        const ms = thinkingTime(level);
        expect(ms).toBeGreaterThanOrEqual(400);
        expect(ms).toBeLessThanOrEqual(700);
      }
    }
  });
});
