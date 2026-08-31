import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Board as BoardModel, Mark, Outcome } from '@shared/game';
import { cellLabel } from '@shared/game';
import { BEAT, E, dur, gsap, prefersReducedMotion } from '../lib/motion';
import { play } from '../lib/sound';
import { brushStroke, gridStrokes } from './brush';
import Face, { type Mood } from './Face';
import './board.css';

/** How a player is drawn: a generated face plus an identity rim colour. */
export interface PlayerLook {
  seed: string;
  rim: string;
  name: string;
}

interface Props {
  board: BoardModel;
  outcome: Outcome;
  canPlay: boolean;
  /** Whose ghost preview to show on hover. Null suppresses it. */
  ghostMark: Mark | null;
  pending?: number | null;
  looks: Record<Mark, PlayerLook>;
  /** Bumped each round so the brush grid is redrawn with fresh randomness. */
  round: number;
  onPlay: (index: number) => void;
}

const VB = 300;

export default function Board({
  board,
  outcome,
  canPlay,
  ghostMark,
  pending,
  looks,
  round,
  onPlay,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<SVGGElement>(null);
  const winRef = useRef<SVGPathElement>(null);

  /** `view` lags `board` so cleared marks can animate out before unmounting. */
  const [view, setView] = useState<BoardModel>(board);
  const prevView = useRef<BoardModel>(board);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /* The grid is redrawn each round — no two boards are identical, exactly as
     the reference does it. */
  const grid = useMemo(() => gridStrokes(VB, round * 977 + 13), [round]);
  const tilt = useMemo(() => ((round * 37) % 7) - 3.5, [round]);

  /* ---- board <- props, with a clear-out animation on reset --------------- */

  useLayoutEffect(() => {
    const incomingEmpty = board.every((c) => c === null);
    const viewHasMarks = prevView.current.some((c) => c !== null);
    const root = rootRef.current;

    if (!incomingEmpty || !viewHasMarks || !root) {
      setView(board);
      prevView.current = board;
      return;
    }

    const filled = prevView.current
      .map((cell, i) => (cell ? i : -1))
      .filter((i) => i >= 0)
      .reverse();

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          setView(board);
          prevView.current = board;
        },
      });
      filled.forEach((index, order) => {
        const node = root.querySelector<HTMLElement>(`[data-face="${index}"]`);
        if (!node) return;
        tl.to(
          node,
          { scale: 0, rotate: -25, opacity: 0, duration: dur(BEAT.clearMark), ease: E.anticipate },
          order * dur(BEAT.clearStagger),
        );
      });
      if (winRef.current) {
        tl.to(winRef.current, { opacity: 0, duration: dur(0.2), ease: E.out }, 0);
      }
    }, root);

    return () => ctx.revert();
  }, [board]);

  /* ---- grid draws itself in at the start of each round -------------------- */

  useLayoutEffect(() => {
    const g = gridRef.current;
    if (!g || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        g.querySelectorAll('path'),
        { scale: 0.6, opacity: 0, transformOrigin: '50% 50%' },
        {
          scale: 1,
          opacity: 1,
          duration: dur(BEAT.gridDraw),
          ease: E.back,
          stagger: dur(BEAT.gridStagger),
        },
      );
    }, g);
    return () => ctx.revert();
  }, [round]);

  /* ---- resolution: win stroke, winner pop, loser recede ------------------ */

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (outcome.kind === 'playing') {
      if (view.every((c) => c === null)) {
        gsap.set(root.querySelectorAll('[data-face]'), { opacity: 1, filter: 'none', scale: 1 });
        if (winRef.current) gsap.set(winRef.current, { opacity: 0 });
      }
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: dur(BEAT.winHold) });

      if (outcome.kind === 'win') {
        const winning = new Set<number>(outcome.line);
        const losers = view
          .map((c, i) => (c && !winning.has(i) ? i : -1))
          .filter((i) => i >= 0)
          .map((i) => root.querySelector(`[data-face="${i}"]`))
          .filter(Boolean) as Element[];

        if (losers.length) {
          tl.to(
            losers,
            { opacity: 0.35, scale: 0.86, duration: dur(BEAT.loserFade), ease: E.out },
            0,
          );
        }

        // The win stroke is a brush path, so it is "painted on" by regenerating
        // its geometry each frame rather than with a dash offset.
        const path = winRef.current;
        if (path) {
          const a = centre(outcome.line[0]);
          const b = centre(outcome.line[2]);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const over = 34;
          const from = { x: a.x - (dx / len) * over, y: a.y - (dy / len) * over };
          const to = { x: b.x + (dx / len) * over, y: b.y + (dy / len) * over };

          gsap.set(path, { opacity: 1 });
          const state = { t: 0.001 };
          tl.to(
            state,
            {
              t: 1,
              duration: dur(BEAT.winLine),
              ease: E.expo,
              onUpdate: () => {
                path.setAttribute(
                  'd',
                  brushStroke(
                    from.x,
                    from.y,
                    from.x + (to.x - from.x) * state.t,
                    from.y + (to.y - from.y) * state.t,
                    VB * 0.045,
                    91,
                    2,
                  ),
                );
              },
            },
            0,
          );
        }

        outcome.line.forEach((index, i) => {
          const node = root.querySelector(`[data-face="${index}"]`);
          if (!node) return;
          tl.to(
            node,
            {
              keyframes: { scale: [1, 1.18, 1.06] },
              duration: dur(BEAT.winPulse),
              ease: E.back,
            },
            i * dur(0.06),
          );
        });
      } else {
        const order = [4, 1, 3, 5, 7, 0, 2, 6, 8];
        order.forEach((index, i) => {
          const node = root.querySelector(`[data-face="${index}"]`);
          if (!node) return;
          tl.to(
            node,
            {
              opacity: 0.5,
              scale: 0.9,
              filter: 'saturate(0.3)',
              duration: dur(BEAT.drawFade),
              ease: E.out,
            },
            i * dur(BEAT.drawStagger),
          );
        });
      }
    }, root);

    return () => ctx.revert();
  }, [outcome, view]);

  /* ---- interaction ------------------------------------------------------- */

  const ghostIndex =
    hovered !== null && ghostMark && canPlay && view[hovered] === null && pending !== hovered
      ? hovered
      : null;

  const commit = useCallback(
    (index: number) => {
      if (!canPlay || view[index] !== null || outcome.kind !== 'playing') return;
      onPlay(index);
    },
    [canPlay, onPlay, outcome.kind, view],
  );

  const onKeyDown = useCallback((event: React.KeyboardEvent, index: number) => {
    const deltas: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 3,
      ArrowUp: -3,
    };
    const delta = deltas[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const row = Math.floor(index / 3);
    const next = index + delta;
    if (Math.abs(delta) === 1) {
      if (next < row * 3 || next > row * 3 + 2) return;
    } else if (next < 0 || next > 8) {
      return;
    }
    setFocusIndex(next);
    cellRefs.current[next]?.focus();
  }, []);

  /* Tell the custom cursor to re-read what is under it. Cells change
     playability without the pointer moving — placing a mark, the game ending,
     the turn passing to the opponent — and the ring would otherwise keep
     advertising a dead cell as playable. */
  useEffect(() => {
    window.dispatchEvent(new Event('trio:cursor-sync'));
  }, [view, canPlay, outcome.kind]);

  useEffect(() => {
    if (hovered === null) return;
    if (!window.matchMedia?.('(pointer: fine)').matches) return;
    if (view[hovered] !== null || !canPlay) return;
    play('tick');
  }, [hovered, canPlay, view]);

  const moodFor = (index: number): Mood => {
    if (outcome.kind === 'win') {
      return (outcome.line as readonly number[]).includes(index) ? 'happy' : 'sad';
    }
    return 'idle';
  };

  return (
    <div className="board" ref={rootRef} style={{ '--tilt': `${tilt}deg` } as React.CSSProperties}>
      <svg className="board__ink" viewBox={`0 0 ${VB} ${VB}`} aria-hidden="true" focusable="false">
        <g ref={gridRef} className="board__grid">
          {grid.map((d, i) => (
            <path key={`${round}-${i}`} d={d} />
          ))}
        </g>
        <path ref={winRef} className="board__win" d="" style={{ opacity: 0 }} />
      </svg>

      <div className="board__marks" aria-hidden="true">
        {view.map((cell, index) =>
          cell ? (
            <Stamp key={`${round}-${index}-${cell}`} index={index} mood={moodFor(index)}>
              <Face seed={looks[cell].seed} rim={looks[cell].rim} mood={moodFor(index)} />
            </Stamp>
          ) : null,
        )}

        {ghostIndex !== null && ghostMark && (
          <Ghost key={ghostIndex} index={ghostIndex}>
            <Face seed={looks[ghostMark].seed} rim={looks[ghostMark].rim} />
          </Ghost>
        )}

        {pending != null && view[pending] === null && (
          <div className="board__pending" style={cellStyle(pending)}>
            <span />
            <span />
            <span />
          </div>
        )}
      </div>

      <div className="board__cells" role="grid" aria-label="Tic-tac-toe board">
        {view.map((cell, index) => {
          const playable = canPlay && cell === null && outcome.kind === 'playing';
          return (
            <button
              key={index}
              ref={(el) => {
                cellRefs.current[index] = el;
              }}
              type="button"
              className="board__cell"
              role="gridcell"
              data-cursor={playable ? 'play' : 'blocked'}
              tabIndex={index === focusIndex ? 0 : -1}
              aria-label={`${cellLabel(index)}, ${cell ? looks[cell].name : 'empty'}`}
              aria-disabled={!playable}
              onPointerEnter={() => setHovered(index)}
              onPointerLeave={() => setHovered((h) => (h === index ? null : h))}
              onFocus={() => {
                setFocusIndex(index);
                setHovered(index);
              }}
              onBlur={() => setHovered((h) => (h === index ? null : h))}
              onClick={() => commit(index)}
              onKeyDown={(e) => onKeyDown(e, index)}
            />
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function centre(index: number) {
  const third = VB / 3;
  return { x: (index % 3) * third + third / 2, y: Math.floor(index / 3) * third + third / 2 };
}

function cellStyle(index: number): React.CSSProperties {
  return {
    gridColumn: (index % 3) + 1,
    gridRow: Math.floor(index / 3) + 1,
  };
}

/** A face landing in a cell: overshoot in, with a squash on impact. */
function Stamp({
  index,
  mood,
  children,
}: {
  index: number;
  mood: Mood;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion()) {
      gsap.set(node, { scale: 1, opacity: 1, rotate: 0 });
      return;
    }
    const ctx = gsap.context(() => {
      gsap
        .timeline()
        .fromTo(
          node,
          { scale: 0, opacity: 0, rotate: -22 },
          { scale: 1, opacity: 1, rotate: 0, duration: dur(BEAT.stamp), ease: E.back },
        )
        .to(
          node,
          {
            keyframes: { scaleY: [1, 0.9, 1], scaleX: [1, 1.08, 1] },
            duration: dur(BEAT.stampSquash),
            ease: E.out,
          },
          `-=${dur(0.12)}`,
        );
    }, node);
    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={ref}
      className="board__face"
      data-face={index}
      data-mood={mood}
      style={{ ...cellStyle(index), opacity: 0 }}
    >
      {children}
    </div>
  );
}

/** Faint preview of your own face before you commit to a cell. */
function Ghost({ index, children }: { index: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion()) {
      gsap.set(node, { opacity: 0.34, scale: 0.86 });
      return;
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(
        node,
        { opacity: 0, scale: 0.6 },
        { opacity: 0.34, scale: 0.86, duration: dur(BEAT.hoverIn), ease: E.back },
      );
    }, node);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={ref} className="board__ghost" style={{ ...cellStyle(index), opacity: 0 }}>
      {children}
    </div>
  );
}
