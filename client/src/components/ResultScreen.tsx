import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { BEAT, E, dur, gsap, prefersReducedMotion } from '../lib/motion';
import { Burst } from './Chrome';
import Face, { type Mood } from './Face';
import './result.css';

/**
 * The end-of-round takeover, modelled on the reference's result beat: a single
 * huge word, a spiky burst, and the loser's/winner's face front and centre.
 */

interface Props {
  /** One heavy word, e.g. NICE! / NOPE / DRAW. */
  word: string;
  /** Small pill above the word. */
  eyebrow: ReactNode;
  quip: string;
  face: { seed: string };
  mood: Mood;
  score?: { one: number; two: number; draws: number };
  children?: ReactNode;
}

export default function ResultScreen({
  word,
  eyebrow,
  quip,
  face,
  mood,
  score,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion()) {
      gsap.set(node, { opacity: 1 });
      gsap.set(node.querySelectorAll('[data-stagger]'), { opacity: 1, y: 0, scale: 1 });
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: dur(BEAT.resultDelay) });
      tl.fromTo(node, { opacity: 0 }, { opacity: 1, duration: dur(0.24), ease: E.out });
      tl.fromTo(
        node.querySelectorAll('[data-stagger]'),
        { opacity: 0, y: 34, scale: 0.86 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: dur(BEAT.resultIn),
          ease: E.back,
          stagger: dur(BEAT.resultStagger),
        },
        dur(0.06),
      );
    }, node);
    return () => ctx.revert();
  }, []);

  return (
    <div className="result" ref={ref} style={{ opacity: 0 }} role="group" aria-label="Result">
      <div className="result__eyebrow" data-stagger>
        {eyebrow}
      </div>

      <div className="result__stack">
        <span className="hero result__word" data-stagger aria-hidden="true">
          {word}
        </span>
        <Burst />
        <div className="result__face" data-stagger>
          {/* Cream rim here, not the player's identity colour: a win would put
              an amber-rimmed face on a stage that competes with it. Identity is
              already carried by the eyebrow pill and the score chips. */}
          <Face seed={face.seed} rim="var(--cream)" mood={mood} size="100%" />
        </div>
      </div>

      <p className="lead result__quip" data-stagger>
        {quip}
      </p>

      {score && (
        <p
          className="label result__score"
          data-stagger
          aria-label={`Score: ${score.one} to ${score.two}, ${score.draws} draws`}
        >
          <span className="result__chip" style={{ background: 'var(--amber)' }}>
            {score.one}
          </span>
          <span aria-hidden="true">{score.draws} draws</span>
          <span className="result__chip" style={{ background: 'var(--turquoise)' }}>
            {score.two}
          </span>
        </p>
      )}

      {children && (
        <div className="result__actions" data-stagger>
          {children}
        </div>
      )}

      {/* The visible word is decorative; this is what a screen reader gets. */}
      <p className="sr-only" role="status">
        {word}. {quip}
      </p>
    </div>
  );
}
