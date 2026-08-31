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
import { chooseMove, thinkingTime, type Difficulty } from '../lib/ai';
import { play } from '../lib/sound';

/**
 * Single-player state. The human is always seat X; the computer is O.
 *
 * The computer's move is scheduled on a timer rather than applied inline so its
 * reply cannot land on the same frame as the player's own mark — the reference's
 * pacing depends on each stamp getting its own beat.
 */

interface SoloState {
  board: Board;
  turn: Mark;
  outcome: Outcome;
  round: number;
  score: { you: number; bot: number; draws: number };
  difficulty: Difficulty;
  /** True while the computer is "thinking" — the board is locked. */
  thinking: boolean;

  setDifficulty: (d: Difficulty) => void;
  place: (index: number) => void;
  reset: () => void;
  cancel: () => void;
}

const HUMAN: Mark = 'X';
const BOT: Mark = 'O';

let timer: number | null = null;

function clearTimer() {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
}

function tally(outcome: Outcome, score: SoloState['score']): SoloState['score'] {
  if (outcome.kind === 'win') {
    return outcome.winner === HUMAN
      ? { ...score, you: score.you + 1 }
      : { ...score, bot: score.bot + 1 };
  }
  if (outcome.kind === 'draw') return { ...score, draws: score.draws + 1 };
  return score;
}

export const useSoloGame = create<SoloState>((set, get) => {
  /** Runs the computer's turn after a deliberate pause. */
  const scheduleBot = (delay: number) => {
    clearTimer();
    set({ thinking: true });
    timer = window.setTimeout(() => {
      timer = null;
      const { board, turn, outcome, difficulty } = get();
      if (outcome.kind !== 'playing' || turn !== BOT) {
        set({ thinking: false });
        return;
      }
      const index = chooseMove(board, BOT, difficulty);
      if (index === null) {
        set({ thinking: false });
        return;
      }
      const next = applyMove(board, index, BOT);
      const nextOutcome = evaluate(next);
      play('placeO');
      if (nextOutcome.kind === 'win') play('win');
      else if (nextOutcome.kind === 'draw') play('draw');
      set((s) => ({
        board: next,
        turn: HUMAN,
        outcome: nextOutcome,
        thinking: false,
        score: tally(nextOutcome, s.score),
      }));
    }, delay);
  };

  return {
    board: emptyBoard(),
    turn: HUMAN,
    outcome: { kind: 'playing' },
    round: 0,
    score: { you: 0, bot: 0, draws: 0 },
    difficulty: 'sharp',
    thinking: false,

    setDifficulty(difficulty) {
      clearTimer();
      set({
        difficulty,
        board: emptyBoard(),
        turn: HUMAN,
        outcome: { kind: 'playing' },
        thinking: false,
      });
    },

    place(index) {
      const { board, turn, thinking } = get();
      if (thinking) return;
      if (!isLegalMove(board, index, turn, HUMAN)) return;

      const next = applyMove(board, index, HUMAN);
      const outcome = evaluate(next);
      play('placeX');
      if (outcome.kind === 'win') play('win');
      else if (outcome.kind === 'draw') play('draw');

      set((s) => ({
        board: next,
        turn: other(turn),
        outcome,
        score: tally(outcome, s.score),
      }));

      if (outcome.kind === 'playing') scheduleBot(thinkingTime(get().difficulty));
    },

    reset() {
      clearTimer();
      set((s) => ({
        board: emptyBoard(),
        turn: HUMAN,
        outcome: { kind: 'playing' },
        thinking: false,
        round: s.round + 1,
      }));
    },

    cancel() {
      clearTimer();
      set({ thinking: false });
    },
  };
});
