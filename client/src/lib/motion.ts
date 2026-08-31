/**
 * Motion tokens.
 *
 * The easing curves are the exact cubic-beziers read out of the reference
 * experience's compiled stylesheet, registered with GSAP's CustomEase so the
 * JS-driven choreography and the CSS transitions share one set of curves.
 */

import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(CustomEase);

/** Registered once at module load; referenced by name from tweens. */
const CURVES: Record<string, [number, number, number, number]> = {
  xoxOut: [0, 0, 0.2, 1],
  xoxInOut: [0.4, 0, 0.2, 1],
  xoxSmooth: [0.26, 1, 0.48, 1],
  xoxAnticipate: [0.6, -0.28, 0.73, 0.04],
  xoxBack: [0.17, 0.89, 0.32, 1.27],
  xoxBackFull: [0.68, -0.55, 0.27, 1.55],
  xoxExpo: [0.66, 0, 0, 1],
};

for (const [name, [a, b, c, d]] of Object.entries(CURVES)) {
  CustomEase.create(name, `M0,0 C${a},${b} ${c},${d} 1,1`);
}

export const E = {
  out: 'xoxOut',
  inOut: 'xoxInOut',
  smooth: 'xoxSmooth',
  anticipate: 'xoxAnticipate',
  /** Overshoot — the reference's signature "pop" for marks and buttons. */
  back: 'xoxBack',
  backFull: 'xoxBackFull',
  expo: 'xoxExpo',
  soft: 'sine.inOut',
} as const;

/** Seconds. */
export const D = {
  instant: 0.12,
  quick: 0.24,
  base: 0.38,
  slow: 0.62,
  stage: 0.7,
} as const;

/** Per-beat timings. */
export const BEAT = {
  hoverIn: 0.16,
  hoverOut: 0.12,
  press: 0.2,
  /** An avatar mark stamping into a cell. */
  stamp: 0.42,
  stampSquash: 0.18,
  settle: 0.16,
  turnOut: 0.16,
  turnIn: 0.28,
  /** Background colour swap between turns / states. */
  stage: 0.7,
  winHold: 0.2,
  winLine: 0.48,
  winPulse: 0.34,
  loserFade: 0.32,
  drawFade: 0.3,
  drawStagger: 0.03,
  resultDelay: 0.2,
  resultIn: 0.46,
  resultStagger: 0.06,
  burstIn: 0.55,
  clearMark: 0.22,
  clearStagger: 0.035,
  gridDraw: 0.6,
  gridStagger: 0.08,
  screenOut: 0.24,
  screenIn: 0.46,
  toastIn: 0.24,
  toastHold: 1.4,
  connect: 0.46,
  bubbleIn: 0.4,
} as const;

let reduced =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

export function initMotion(): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const apply = () => {
    reduced = mq.matches;
    // Collapse rather than disable, so onComplete callbacks still fire and no
    // state transition can get stranded mid-animation.
    gsap.globalTimeline.timeScale(reduced ? 1000 : 1);
  };
  apply();
  mq.addEventListener('change', apply);
  return () => mq.removeEventListener('change', apply);
}

export function prefersReducedMotion(): boolean {
  return reduced;
}

export function dur(seconds: number): number {
  return reduced ? 0.001 : seconds;
}

export { gsap };
