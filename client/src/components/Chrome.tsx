import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { BEAT, E, dur, gsap, prefersReducedMotion } from '../lib/motion';
import './chrome.css';

/* ==========================================================================
   The reference's recurring UI furniture, rebuilt: lightning bolts, white
   pills with navy display text, speech bubbles, split headlines that sit
   left/right of the board, and the starburst behind a result.
   ========================================================================== */

/** The bolt that punctuates almost every label in the reference. */
export function Bolt({
  className,
  fill = 'currentColor',
  style,
}: {
  className?: string;
  fill?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      width="14"
      height="20"
      viewBox="0 0 14 20"
      aria-hidden="true"
    >
      <path d="M8.6 0 0 11.4h4.4L4.1 20 14 7.9H8.9L8.6 0z" fill={fill} />
    </svg>
  );
}

/** White rounded pill with navy display text — the reference's only button. */
export function Pill({
  children,
  onClick,
  disabled,
  tone = 'cream',
  bolt,
  type = 'button',
  full,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Semantic, not colour-named, so the palette can move without a rename. */
  tone?: 'cream' | 'accent' | 'outline';
  bolt?: boolean;
  type?: 'button' | 'submit';
  full?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);

  const pop = (scale: number, ease: string, d: number) => {
    if (prefersReducedMotion() || !ref.current) return;
    gsap.to(ref.current, { scale, duration: d, ease });
  };

  return (
    <button
      ref={ref}
      type={type}
      className={['pill', `pill--${tone}`, full ? 'pill--full' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      data-cursor="action"
      disabled={disabled}
      onClick={onClick}
      onPointerDown={() => pop(0.93, E.out, 0.1)}
      onPointerUp={() => pop(1, E.back, 0.26)}
      onPointerLeave={() => pop(1, E.out, 0.18)}
    >
      {bolt && <Bolt className="pill__bolt" />}
      <span>{children}</span>
    </button>
  );
}

/** Small white speech bubble with a tail — used for quips and part labels. */
export function Bubble({
  children,
  side = 'left',
  className,
}: {
  children: ReactNode;
  side?: 'left' | 'right';
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion()) {
      gsap.set(node, { scale: 1, opacity: 1 });
      return;
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(
        node,
        { scale: 0.4, opacity: 0 },
        { scale: 1, opacity: 1, duration: dur(BEAT.bubbleIn), ease: E.back },
      );
    }, node);
    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={ref}
      className={['bubble', `bubble--${side}`, className ?? ''].filter(Boolean).join(' ')}
      style={{ opacity: 0 }}
    >
      {children}
    </div>
  );
}

/**
 * The reference's status headline: two heavy words flanking the board, one on
 * each side, rotated in opposite directions. Re-animates whenever the text
 * changes so a turn swap is impossible to miss.
 */
export function SplitHeadline({ left, right }: { left: string; right: string }) {
  const leftRef = useRef<HTMLSpanElement>(null);
  const rightRef = useRef<HTMLSpanElement>(null);
  const key = `${left}|${right}`;

  useLayoutEffect(() => {
    const nodes = [leftRef.current, rightRef.current].filter(Boolean) as HTMLElement[];
    if (!nodes.length) return;
    if (prefersReducedMotion()) {
      gsap.set(nodes, { opacity: 1, x: 0, scale: 1 });
      return;
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(
        nodes,
        (i: number) => ({ opacity: 0, x: i === 0 ? -70 : 70, scale: 0.8 }),
        {
          opacity: 1,
          x: 0,
          scale: 1,
          duration: dur(BEAT.turnIn),
          ease: E.back,
          stagger: dur(0.06),
        },
      );
    });
    return () => ctx.revert();
  }, [key]);

  return (
    <div className="split" aria-hidden="true">
      <span ref={leftRef} className="display split__left" style={{ opacity: 0 }}>
        {left}
      </span>
      <span ref={rightRef} className="display split__right" style={{ opacity: 0 }}>
        {right}
      </span>
    </div>
  );
}

/** Spiky magenta burst behind a result avatar. */
export function Burst({ points = 14, className }: { points?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);

  const d = useMemo(() => {
    const parts: string[] = [];
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 100 : 66;
      parts.push(`${i === 0 ? 'M' : 'L'}${(100 + Math.cos(a) * r).toFixed(1)} ${(100 + Math.sin(a) * r).toFixed(1)}`);
    }
    return `${parts.join(' ')} Z`;
  }, [points]);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion()) {
      gsap.set(node, { scale: 1, opacity: 1, rotate: 0 });
      return;
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(
        node,
        { scale: 0.3, opacity: 0, rotate: -40 },
        { scale: 1, opacity: 1, rotate: 0, duration: dur(BEAT.burstIn), ease: E.back },
      );
      gsap.to(node, { rotate: 360, duration: 90, ease: 'none', repeat: -1, delay: dur(BEAT.burstIn) });
    }, node);
    return () => ctx.revert();
  }, []);

  return (
    <svg
      ref={ref}
      className={['burst', className ?? ''].filter(Boolean).join(' ')}
      viewBox="0 0 200 200"
      aria-hidden="true"
      style={{ opacity: 0 }}
    >
      <path d={d} fill="var(--coral)" />
    </svg>
  );
}

/** Scattered white bolts, as on the reference's VS and result screens. */
export function BoltField() {
  const bolts = useMemo(
    () =>
      [
        [6, 12, 1, 18],
        [88, 8, 0.7, -14],
        [14, 68, 0.8, 22],
        [92, 74, 1.1, -8],
        [78, 30, 0.5, 30],
        [22, 36, 0.55, -24],
        [50, 88, 0.6, 12],
      ] as const,
    [],
  );
  return (
    <div className="boltfield" aria-hidden="true">
      {bolts.map(([x, y, s, r], i) => (
        <Bolt
          key={i}
          className="boltfield__bolt"
          fill="var(--cream)"
          style={{ left: `${x}%`, top: `${y}%`, transform: `scale(${s * 2.2}) rotate(${r}deg)` }}
        />
      ))}
    </div>
  );
}
