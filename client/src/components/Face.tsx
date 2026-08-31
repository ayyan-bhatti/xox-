import { useId, useMemo } from 'react';

/**
 * A generated cartoon head — the thing that gets stamped into a board cell.
 *
 * The reference experience marks cells with each player's avatar rather than an
 * X or an O, so the "mark" here is a face. All of this geometry is original and
 * drawn from scratch; nothing is traced from the reference's sprite sheets.
 *
 * Every feature is chosen deterministically from `seed`, so the same player
 * keeps the same face for the whole session, and the same room code always
 * produces the same opponent.
 *
 * The coloured rim is drawn by painting the silhouette group twice: once behind
 * with a fat stroke *and* fill in the rim colour (so the internal edges between
 * the overlapping blobs vanish), then the real face on top.
 */

export type Mood = 'idle' | 'happy' | 'sad' | 'smug';

interface Props {
  seed: string;
  /** Rim colour — the player's identity colour. */
  rim: string;
  mood?: Mood;
  /** Number of px, or any CSS length. Defaults to filling its container. */
  size?: number | string;
  className?: string;
  title?: string;
}

function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKINS: [string, string][] = [
  ['#FFE6C9', '#F7C79A'],
  ['#FFD9AE', '#E9AE79'],
  ['#F0BC8C', '#D2905C'],
  ['#D69B6E', '#B0713F'],
  ['#A9683F', '#82492A'],
  ['#7A4A2C', '#5A331C'],
];

const HAIRS = ['#1B2438', '#26324A', '#3F2A1E', '#6B4A2A', '#C7913F', '#5B7FE0', '#8A5BE0', '#E05B8A'];

const HAIR_STYLES = ['curls', 'bowl', 'buzz', 'puff', 'bald', 'side'] as const;
const EYE_STYLES = ['square', 'round', 'wide', 'sleepy'] as const;
const NOSE_STYLES = ['button', 'long', 'wide'] as const;
const EXTRAS = ['none', 'freckles', 'blush', 'earring', 'stubble'] as const;

export default function Face({ seed, rim, mood = 'idle', size = '100%', className, title }: Props) {
  const uid = useId().replace(/:/g, '');
  const f = useMemo(() => {
    const r = rng(seed);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
    return {
      skin: pick(SKINS),
      hair: pick(HAIRS),
      hairStyle: pick(HAIR_STYLES),
      eyes: pick(EYE_STYLES),
      nose: pick(NOSE_STYLES),
      extra: pick(EXTRAS),
      brows: r() > 0.12,
      tilt: (r() - 0.5) * 8,
      eyeGap: 25 + r() * 6,
    };
  }, [seed]);

  const [skinLight, skinDark] = f.skin;
  const silId = `sil-${uid}`;
  const skinId = `skin-${uid}`;
  const hairId = `hair-${uid}`;

  /* --- silhouette: hair mass + head + ears, drawn once, reused as the rim --- */
  const silhouette = (
    <g id={silId}>
      {f.hairStyle !== 'bald' && <HairMass style={f.hairStyle} />}
      <ellipse cx="100" cy="103" rx="46" ry="47" />
      <ellipse cx="55" cy="105" rx="9" ry="12" />
      <ellipse cx="145" cy="105" rx="9" ry="12" />
    </g>
  );

  return (
    <svg
      className={className}
      width={size}
      height={size}
      /* Cropped tight to the drawn head rather than the nominal 200×200 art
         board — otherwise the face floats in dead space and reads tiny once it
         is scaled down into a board cell. `overflow: visible` lets the rim glow
         spill past this box. */
      viewBox="25 27 150 150"
      role="img"
      aria-label={title ?? 'Player avatar'}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={skinId} x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor={skinLight} />
          <stop offset="100%" stopColor={skinDark} />
        </linearGradient>
        <linearGradient id={hairId} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor={f.hair} />
          <stop offset="100%" stopColor={shade(f.hair, -0.28)} />
        </linearGradient>
        {silhouette}
      </defs>

      <g transform={`rotate(${f.tilt} 100 105)`}>
        {/* Rim: same shapes, filled AND stroked in the rim colour so the seams
            between the overlapping blobs disappear and only the outer edge shows. */}
        <use
          href={`#${silId}`}
          fill={rim}
          stroke={rim}
          strokeWidth="17"
          strokeLinejoin="round"
        />
        {/* A second, softer pass reads as the reference's outer glow. */}
        <use
          href={`#${silId}`}
          fill="none"
          stroke={rim}
          strokeWidth="21"
          strokeLinejoin="round"
          opacity="0.3"
        />

        {/* Ears and head */}
        <ellipse cx="55" cy="105" rx="9" ry="12" fill={skinDark} />
        <ellipse cx="145" cy="105" rx="9" ry="12" fill={skinDark} />
        {f.hairStyle !== 'bald' && <HairMass style={f.hairStyle} fill={`url(#${hairId})`} back />}
        <ellipse cx="100" cy="103" rx="46" ry="47" fill={`url(#${skinId})`} />

        {/* Front hair goes on before the features, never after: painting it last
            let a fringe cover an eye and the face stopped reading. */}
        {f.hairStyle !== 'bald' && <HairMass style={f.hairStyle} fill={`url(#${hairId})`} />}

        {f.extra === 'blush' && (
          <>
            <ellipse cx="66" cy="118" rx="10" ry="6" fill="#EE9A8F" opacity="0.5" />
            <ellipse cx="134" cy="118" rx="10" ry="6" fill="#EE9A8F" opacity="0.5" />
          </>
        )}
        {f.extra === 'freckles' &&
          [-16, -8, 0, 8, 16].map((dx, i) => (
            <circle
              key={i}
              cx={100 + dx}
              cy={112 + (i % 2 ? 5 : 0)}
              r="2"
              fill={skinDark}
              opacity="0.75"
            />
          ))}
        {f.extra === 'stubble' && (
          <path d="M62 118 q38 40 76 0 q-6 38 -38 38 q-32 0 -38 -38z" fill={f.hair} opacity="0.28" />
        )}

        <Eyes style={f.eyes} mood={mood} gap={f.eyeGap} />
        {f.brows && <Brows mood={mood} hair={f.hair} gap={f.eyeGap} />}
        <Nose style={f.nose} light={skinLight} dark={skinDark} />
        <Mouth mood={mood} />

        {f.extra === 'earring' && <circle cx="150" cy="123" r="5" fill="#E4573C" />}

        {mood === 'sad' && (
          <>
            <Tear x={72} y={122} />
            <Tear x={128} y={124} />
          </>
        )}
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */

function HairMass({
  style,
  fill,
  back,
}: {
  style: (typeof HAIR_STYLES)[number];
  fill?: string;
  back?: boolean;
}) {
  const p = fill ? { fill } : {};

  if (style === 'buzz') {
    return <path d="M56 96 q6 -44 44 -44 q38 0 44 44 q-44 -18 -88 0z" {...p} />;
  }

  if (style === 'bowl') {
    return <path d="M52 100 q0 -50 48 -50 q48 0 48 50 q-48 -26 -96 0z" {...p} />;
  }

  if (style === 'side') {
    return <path d="M53 98 q-2 -48 47 -48 q30 0 42 24 q-30 8 -50 22 q-20 14 -39 2z" {...p} />;
  }

  if (style === 'puff') {
    return (
      <g {...p}>
        <ellipse cx="100" cy="66" rx="52" ry="34" />
        {back && <ellipse cx="100" cy="118" rx="54" ry="42" />}
      </g>
    );
  }

  /* curls — a ring of blobs, the reference's signature silhouette */
  const blobs: [number, number, number][] = back
    ? [
        [62, 130, 17],
        [138, 130, 17],
        [72, 148, 16],
        [128, 148, 16],
        [100, 152, 17],
      ]
    : [
        [66, 84, 20],
        [86, 66, 22],
        [114, 64, 23],
        [136, 84, 20],
        [58, 106, 16],
        [142, 106, 16],
        [100, 58, 21],
      ];
  return (
    <g {...p}>
      {blobs.map(([cx, cy, r], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} />
      ))}
    </g>
  );
}

function Eyes({
  style,
  mood,
  gap,
}: {
  style: (typeof EYE_STYLES)[number];
  mood: Mood;
  gap: number;
}) {
  const lx = 100 - gap;
  const rx = 100 + gap;
  const y = 100;

  if (mood === 'happy') {
    return (
      <g stroke="#121A2B" strokeWidth="5" fill="none" strokeLinecap="round">
        <path d={`M${lx - 11} ${y + 3} q11 -13 22 0`} />
        <path d={`M${rx - 11} ${y + 3} q11 -13 22 0`} />
      </g>
    );
  }
  if (mood === 'sad') {
    return (
      <g stroke="#121A2B" strokeWidth="5" fill="none" strokeLinecap="round">
        <path d={`M${lx - 11} ${y - 2} q11 12 22 0`} />
        <path d={`M${rx - 11} ${y - 2} q11 12 22 0`} />
      </g>
    );
  }

  const white = (cx: number) => {
    if (style === 'round') return <circle cx={cx} cy={y} r="13" fill="#fff" />;
    if (style === 'wide') return <ellipse cx={cx} cy={y} rx="15" ry="11" fill="#fff" />;
    if (style === 'sleepy') return <ellipse cx={cx} cy={y} rx="13" ry="7" fill="#fff" />;
    return <rect x={cx - 13} y={y - 12} width="26" height="24" rx="7" fill="#fff" />;
  };

  // Square pupils are the reference's most distinctive facial cue.
  const pupil = (cx: number) => {
    const dx = mood === 'smug' ? 4 : 0;
    return <rect x={cx - 4 + dx} y={y - 4} width="8" height="8" rx="1.5" fill="#121A2B" />;
  };

  return (
    <g>
      {white(lx)}
      {white(rx)}
      {pupil(lx)}
      {pupil(rx)}
    </g>
  );
}

function Brows({ mood, hair, gap }: { mood: Mood; hair: string; gap: number }) {
  const lx = 100 - gap;
  const rx = 100 + gap;
  const y = mood === 'smug' ? 80 : 82;
  const angle = mood === 'smug' ? 10 : mood === 'sad' ? -12 : 0;
  return (
    <g fill={hair}>
      <rect
        x={lx - 14}
        y={y}
        width="28"
        height="9"
        rx="4.5"
        transform={`rotate(${-angle} ${lx} ${y + 4})`}
      />
      <rect
        x={rx - 14}
        y={y}
        width="28"
        height="9"
        rx="4.5"
        transform={`rotate(${angle} ${rx} ${y + 4})`}
      />
    </g>
  );
}

function Nose({
  style,
  light,
  dark,
}: {
  style: (typeof NOSE_STYLES)[number];
  light: string;
  dark: string;
}) {
  if (style === 'long') {
    return <path d="M96 104 q-3 22 7 24 q8 -1 6 -10 q-2 -8 -5 -14z" fill={dark} opacity="0.85" />;
  }
  if (style === 'wide') {
    return <ellipse cx="100" cy="122" rx="13" ry="9" fill={dark} opacity="0.8" />;
  }
  return (
    <>
      <circle cx="100" cy="120" r="9" fill={light} />
      <circle cx="100" cy="121" r="9" fill={dark} opacity="0.45" />
    </>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  if (mood === 'happy') {
    return (
      <g>
        <path d="M78 134 q22 26 44 0 z" fill="#7A2E3A" />
        <path d="M86 143 q14 12 28 0 q-14 6 -28 0z" fill="#E8798A" />
      </g>
    );
  }
  if (mood === 'sad') {
    return (
      <path
        d="M84 148 q16 -16 32 0"
        stroke="#E4573C"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
    );
  }
  if (mood === 'smug') {
    return (
      <path
        d="M84 138 q18 12 32 -4"
        stroke="#E4573C"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
    );
  }
  return (
    <g fill="#E4573C">
      <rect x="84" y="136" width="26" height="6" rx="3" />
      <rect x="92" y="146" width="14" height="5" rx="2.5" opacity="0.75" />
    </g>
  );
}

function Tear({ x, y }: { x: number; y: number }) {
  return <path d={`M${x} ${y} q7 12 0 18 q-7 -6 0 -18z`} fill="#7FD8D0" stroke="#4BB3AC" strokeWidth="2" />;
}

/** Lighten (t > 0) or darken (t < 0) a #rrggbb colour. */
function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(t < 0 ? c * (1 + t) : c + (255 - c) * t),
  );
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
