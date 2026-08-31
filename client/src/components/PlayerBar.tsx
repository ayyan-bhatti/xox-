import type { Mark } from '@shared/game';
import Face from './Face';
import type { PlayerLook } from './Board';
import './playerbar.css';

/**
 * Persistent "who is who" strip.
 *
 * The board marks players with generated faces rather than X and O glyphs, so
 * without this there was nothing on screen telling you which side you were —
 * you had to infer it from whose face landed when you clicked. This states it
 * outright, keeps the underlying X/O symbol visible (that is still the seat the
 * server talks about), and marks whose turn it is.
 */

interface Props {
  looks: Record<Mark, PlayerLook>;
  /** Seat whose turn it is, or null when the round is over. */
  turn: Mark | null;
  /** Seat belonging to this device. Null in pass-and-play. */
  you?: Mark | null;
  /** Seats currently connected. Absent seats read as "away". */
  present?: Record<Mark, boolean>;
  score?: { X: number; O: number };
}

export default function PlayerBar({ looks, turn, you = null, present, score }: Props) {
  return (
    <div className="playerbar">
      {(['X', 'O'] as const).map((mark, i) => {
        const look = looks[mark];
        const active = turn === mark;
        const away = present ? !present[mark] : false;
        return (
          <div key={mark} className="playerbar__slot">
            {i === 1 && <span className="playerbar__vs" aria-hidden="true">vs</span>}
            <div
              className="playerbar__chip"
              data-active={active || undefined}
              data-away={away || undefined}
              style={{ '--rim': look.rim } as React.CSSProperties}
            >
              <span className="playerbar__face">
                <Face seed={look.seed} rim={look.rim} size="100%" />
              </span>

              <span className="playerbar__text">
                <span className="playerbar__name">{look.name}</span>
                <span className="playerbar__symbol">
                  {away ? 'away' : `plays ${mark}`}
                </span>
              </span>

              {score && <span className="playerbar__score">{score[mark]}</span>}

              {/* The turn dot is the only moving part, so it reads at a glance. */}
              <span className="playerbar__pip" aria-hidden="true" />
            </div>
          </div>
        );
      })}

      {/* One unambiguous sentence for screen readers and for anyone who does
          not read the colour coding. */}
      <p className="sr-only" role="status">
        {you
          ? `You are player ${you}. `
          : `${looks.X.name} plays X, ${looks.O.name} plays O. `}
        {turn ? `It is ${looks[turn].name}'s turn, playing ${turn}.` : 'The round is over.'}
      </p>
    </div>
  );
}
