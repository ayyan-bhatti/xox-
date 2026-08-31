import type { ReactNode } from 'react';
import type { Board as BoardModel, Mark, Outcome } from '@shared/game';
import Board, { type PlayerLook } from './Board';
import { SplitHeadline } from './Chrome';
import './gameview.css';

/**
 * Shared in-game layout for all three modes: a top status pill, the two heavy
 * words flanking the board, the board itself, and an optional speech bubble.
 * The three routes differ only in where their state comes from.
 */

interface Props {
  /** Persistent who-is-who strip. Sits where the status pill used to. */
  identity: ReactNode;
  headline: { left: string; right: string };
  bubble?: ReactNode;
  footer?: ReactNode;

  board: BoardModel;
  outcome: Outcome;
  canPlay: boolean;
  ghostMark: Mark | null;
  pending?: number | null;
  looks: Record<Mark, PlayerLook>;
  round: number;
  onPlay: (index: number) => void;

  /** Live-region text so turn changes are announced. */
  status: string;
}

export default function GameView({
  identity,
  headline,
  bubble,
  footer,
  status,
  ...boardProps
}: Props) {
  return (
    <div className="gameview">
      <div className="gameview__top">{identity}</div>

      <div className="gameview__stage">
        <SplitHeadline left={headline.left} right={headline.right} />
        <div className="gameview__boardwrap">
          {bubble && <div className="gameview__bubble">{bubble}</div>}
          <Board {...boardProps} />
        </div>
      </div>

      <div className="gameview__foot">{footer}</div>

      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
