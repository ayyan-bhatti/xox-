import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { BEAT, E, dur, gsap, prefersReducedMotion } from '../lib/motion';

/**
 * Wraps a route so it rises into place on mount. Routes are swapped by the
 * router rather than cross-faded, so the incoming animation carries the
 * transition on its own — which keeps the board (which sits in a fixed band)
 * from ever appearing to move between screens.
 */
export default function Screen({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (prefersReducedMotion()) {
      gsap.set(node, { opacity: 1, y: 0 });
      return;
    }
    const ctx = gsap.context(() => {
      gsap.fromTo(
        node,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: dur(BEAT.screenIn),
          ease: E.out,
          // Drop the transform once it lands: a lingering `translate(0,0)`
          // would make this element a containing block and break the
          // position:fixed result overlay nested inside it.
          clearProps: 'transform',
        },
      );
    }, node);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={ref} className="screen" style={{ opacity: 0 }}>
      {children}
    </div>
  );
}
