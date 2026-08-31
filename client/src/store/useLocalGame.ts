import { create } from 'zustand';
import {
  applyMove,
  emptyBoard,
  evaluate,
  isLegalMove,
  other,
  type Board,
  type Mark,
  type Outcome,
} from '@shared/game';
import { play } from '../lib/sound';

interface LocalGameState {
  board: Board;
  turn: Mark;
  outcome: Outcome;
  /** Move order, newest last. Drives the reverse-index stagger on reset. */
  order: number[];
  /** Who opens the next round — alternates so X isn't always first. */
  opener: Mark;
  score: { X: number; O: number; draws: number };
  round: number;

  place: (index: number) => void;
  reset: () => void;
  resetAll: () => void;
}

export const useLocalGame = create<LocalGameState>((set, get) => ({
  board: emptyBoard(),
  turn: 'X',
  outcome: { kind: 'playing' },
  order: [],
  opener: 'X',
  score: { X: 0, O: 0, draws: 0 },
  round: 0,

  place(index) {
    const { board, turn } = get();
    if (!isLegalMove(board, index, turn, turn)) return;

    const next = applyMove(board, index, turn);
    const outcome = evaluate(next);

    play(turn === 'X' ? 'placeX' : 'placeO');
    if (outcome.kind === 'win') play('win');
    else if (outcome.kind === 'draw') play('draw');

    set((s) => ({
      board: next,
      turn: other(turn),
      outcome,
      order: [...s.order, index],
      score:
        outcome.kind === 'win'
          ? { ...s.score, [outcome.winner]: s.score[outcome.winner] + 1 }
          : outcome.kind === 'draw'
            ? { ...s.score, draws: s.score.draws + 1 }
            : s.score,
    }));
  },

  reset() {
    const opener = other(get().opener);
    set((s) => ({
      board: emptyBoard(),
      turn: opener,
      opener,
      outcome: { kind: 'playing' },
      order: [],
      round: s.round + 1,
    }));
  },

  resetAll() {
    set({
      board: emptyBoard(),
      turn: 'X',
      opener: 'X',
      outcome: { kind: 'playing' },
      order: [],
      score: { X: 0, O: 0, draws: 0 },
      round: 0,
    });
  },
}));
