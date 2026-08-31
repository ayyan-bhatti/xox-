import { useEffect, useMemo } from 'react';
import { brushO, brushX } from './brush';
import './stage.css';

/**
 * The full-bleed coloured backdrop.
 *
 * The whole background colour flips to signal state: one colour while it is your
 * move, another while it is your opponent's, and a third once the round
 * resolves. That swap is the loudest piece of feedback in the game, so it is
 * modelled as first-class state rather than as decoration.
 *
 * Every tone sits in the same mid-dark luminance band, so cream type keeps its
 * contrast no matter which one is showing.
 */

/**
 * Semantic names, not colour names: routes ask for the *meaning* and the
 * palette is free to change underneath without touching a single page.
 */
export type StageTone = 'p1' | 'p2' | 'win' | 'lose' | 'draw' | 'alert';

const TONES: Record<StageTone, { bg: string; soft: string }> = {
  p1: { bg: 'var(--indigo)', soft: 'var(--indigo-soft)' },
  p2: { bg: 'var(--plum)', soft: 'var(--plum-soft)' },
  win: { bg: 'var(--jade)', soft: 'var(--jade-soft)' },
  lose: { bg: 'var(--rose)', soft: 'var(--rose-soft)' },
  draw: { bg: 'var(--slate)', soft: 'var(--slate-soft)' },
  alert: { bg: 'var(--orchid)', soft: 'var(--orchid-soft)' },
};

export default function Stage({ tone }: { tone: StageTone }) {
  useEffect(() => {
    const t = TONES[tone];
    const root = document.documentElement.style;
    root.setProperty('--stage', t.bg);
    root.setProperty('--stage-soft', t.soft);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', RAW[tone]);
  }, [tone]);

  /* Loose brush X/O watermarks, fixed per session so they don't dance about. */
  const marks = useMemo(() => {
    const xs = [
      ...brushX(120, 140, 150, 3).map((d) => ({ d, fill: true })),
      ...brushX(1180, 760, 190, 9).map((d) => ({ d, fill: true })),
      ...brushX(980, 120, 110, 17).map((d) => ({ d, fill: true })),
    ];
    const os = [
      { d: brushO(210, 720, 120, 5), fill: false },
      { d: brushO(1290, 300, 95, 13), fill: false },
    ];
    return [...xs, ...os];
  }, []);

  return (
    <div className="stage" aria-hidden="true">
      <svg
        className="stage__marks"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        {marks.map((m, i) =>
          m.fill ? (
            <path key={i} d={m.d} fill="var(--stage-soft)" />
          ) : (
            <path
              key={i}
              d={m.d}
              fill="none"
              stroke="var(--stage-soft)"
              strokeWidth="26"
              strokeLinejoin="round"
            />
          ),
        )}
      </svg>
    </div>
  );
}

/** Literal values for the theme-color meta tag, which cannot take a var(). */
const RAW: Record<StageTone, string> = {
  p1: '#2B3A6B',
  p2: '#4A2F63',
  win: '#146B57',
  lose: '#9E3355',
  draw: '#46505F',
  alert: '#6A3A8C',
};
