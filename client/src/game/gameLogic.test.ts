import { describe, expect, it } from 'vitest';
import {
  applyMove,
  cellLabel,
  emptyBoard,
  evaluate,
  isLegalMove,
  LINES,
  other,
  type Board,
  type Mark,
} from '@shared/game';

/** Build a board from a 9-char string: 'X', 'O' or '.' for empty. */
function b(spec: string): Board {
  const cells = spec.replace(/\s/g, '').split('');
  if (cells.length !== 9) throw new Error(`board spec must be 9 cells, got ${cells.length}`);
  return cells.map((c) => (c === '.' ? null : (c as Mark)));
}

describe('board setup', () => {
  it('starts empty and in play', () => {
    const board = emptyBoard();
    expect(board).toHaveLength(9);
    expect(board.every((c) => c === null)).toBe(true);
    expect(evaluate(board).kind).toBe('playing');
  });

  it('has exactly the eight winning lines', () => {
    expect(LINES).toHaveLength(8);
    // No duplicates, every index in range.
    const seen = new Set(LINES.map((l) => l.join(',')));
    expect(seen.size).toBe(8);
    for (const line of LINES) {
      for (const i of line) expect(i).toBeGreaterThanOrEqual(0);
      for (const i of line) expect(i).toBeLessThan(9);
    }
  });
});

describe('win detection', () => {
  const rows = [
    ['XXX......', [0, 1, 2]],
    ['...XXX...', [3, 4, 5]],
    ['......XXX', [6, 7, 8]],
  ] as const;
  const cols = [
    ['X..X..X..', [0, 3, 6]],
    ['.X..X..X.', [1, 4, 7]],
    ['..X..X..X', [2, 5, 8]],
  ] as const;
  const diags = [
    ['X...X...X', [0, 4, 8]],
    ['..X.X.X..', [2, 4, 6]],
  ] as const;

  for (const mark of ['X', 'O'] as const) {
    for (const [label, group] of [
      ['row', rows],
      ['column', cols],
      ['diagonal', diags],
    ] as const) {
      for (const [spec, line] of group) {
        it(`detects ${mark} winning on ${label} ${line.join('')}`, () => {
          const board = b(mark === 'X' ? spec : spec.replaceAll('X', 'O'));
          const outcome = evaluate(board);
          expect(outcome.kind).toBe('win');
          if (outcome.kind !== 'win') return;
          expect(outcome.winner).toBe(mark);
          expect([...outcome.line]).toEqual([...line]);
        });
      }
    }
  }

  it('does not call a win on a mixed line', () => {
    expect(evaluate(b('XOX......')).kind).toBe('playing');
  });

  it('reports the winner even when the board is also full', () => {
    // X takes the top row; every other cell is filled too.
    const outcome = evaluate(b('XXXOOXXOO'));
    expect(outcome.kind).toBe('win');
  });
});

describe('draw detection', () => {
  it('calls a draw only when the board is full with no line', () => {
    expect(evaluate(b('XOXXOOOXX')).kind).toBe('draw');
  });

  it('is still playing with one cell left and no winner', () => {
    expect(evaluate(b('XOXXOOOX.')).kind).toBe('playing');
  });

  it('never reports a draw on a partially filled board', () => {
    expect(evaluate(b('XO.......')).kind).toBe('playing');
  });
});

describe('move legality', () => {
  it('allows an empty cell on your own turn', () => {
    expect(isLegalMove(emptyBoard(), 4, 'X', 'X')).toBe(true);
  });

  it('rejects an occupied cell', () => {
    expect(isLegalMove(b('X........'), 0, 'O', 'O')).toBe(false);
  });

  it('rejects a move out of turn', () => {
    expect(isLegalMove(emptyBoard(), 0, 'X', 'O')).toBe(false);
  });

  it('rejects a move after the game has been won', () => {
    expect(isLegalMove(b('XXX......'), 3, 'O', 'O')).toBe(false);
  });

  it('rejects a move after a draw', () => {
    expect(isLegalMove(b('XOXXOOOXX'), 0, 'X', 'X')).toBe(false);
  });

  it('rejects out-of-range and non-integer indices', () => {
    for (const i of [-1, 9, 100, 1.5, NaN]) {
      expect(isLegalMove(emptyBoard(), i, 'X', 'X')).toBe(false);
    }
  });
});

describe('applyMove', () => {
  it('places the mark', () => {
    expect(applyMove(emptyBoard(), 4, 'X')[4]).toBe('X');
  });

  it('does not mutate the board it was given', () => {
    const board = emptyBoard();
    applyMove(board, 0, 'X');
    expect(board[0]).toBeNull();
  });

  it('leaves every other cell alone', () => {
    const next = applyMove(b('XO.......'), 8, 'X');
    expect(next.slice(0, 2)).toEqual(['X', 'O']);
    expect(next[8]).toBe('X');
  });
});

describe('helpers', () => {
  it('alternates marks', () => {
    expect(other('X')).toBe('O');
    expect(other('O')).toBe('X');
  });

  it('labels cells one-indexed for screen readers', () => {
    expect(cellLabel(0)).toBe('row 1, column 1');
    expect(cellLabel(4)).toBe('row 2, column 2');
    expect(cellLabel(8)).toBe('row 3, column 3');
  });
});

describe('a full alternating game', () => {
  it('plays out to a legal X win without ever allowing an illegal move', () => {
    let board = emptyBoard();
    let turn: Mark = 'X';
    for (const index of [0, 3, 1, 4, 2]) {
      expect(isLegalMove(board, index, turn, turn)).toBe(true);
      board = applyMove(board, index, turn);
      turn = other(turn);
    }
    const outcome = evaluate(board);
    expect(outcome.kind).toBe('win');
    if (outcome.kind === 'win') expect(outcome.winner).toBe('X');
  });
});
