import { useEffect, useRef } from 'react';
import { gsap, prefersReducedMotion } from '../lib/motion';

/**
 * Custom cursor. Desktop + fine pointer only — on touch it never mounts and
 * the native cursor is left alone (DESIGN_SPEC §6).
 *
 * Elements opt in by carrying `data-cursor="play" | "blocked" | "action"`.
 * The ring reads that attribute off the event target's nearest ancestor, so
 * no component has to push cursor state anywhere. The "hide the native cursor"
 * flag deliberately uses a *different* attribute (`data-custom-cursor` on
 * <body>) — sharing `data-cursor` would make every `closest()` walk terminate
 * on the body and report a bogus mode.
 */
export default function Cursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)');
    const wide = window.matchMedia('(min-width: 1024px)');
    if (!fine.matches || !wide.matches || prefersReducedMotion()) return;

    const ring = ringRef.current;
    const dot = dotRef.current;
    if (!ring || !dot) return;

    document.body.dataset.customCursor = 'on';
    gsap.set([ring, dot], { xPercent: -50, yPercent: -50, opacity: 0 });

    // Lag the ring behind the pointer; the dot tracks exactly.
    const ringX = gsap.quickTo(ring, 'x', { duration: 0.28, ease: 'power3.out' });
    const ringY = gsap.quickTo(ring, 'y', { duration: 0.28, ease: 'power3.out' });
    const dotX = gsap.quickTo(dot, 'x', { duration: 0.08, ease: 'power3.out' });
    const dotY = gsap.quickTo(dot, 'y', { duration: 0.08, ease: 'power3.out' });

    let shown = false;
    let mode = '';
    let lastX = -1;
    let lastY = -1;

    const scaleFor = (m: string) =>
      m === 'play' ? 1.9 : m === 'action' ? 1.35 : m === 'blocked' ? 0.5 : 1;

    const setMode = (next: string) => {
      if (next === mode) return;
      mode = next;
      ring.dataset.mode = next;
      // The ring opens up over a playable cell, collapses over a dead one.
      gsap.to(ring, { scale: scaleFor(next), duration: 0.32, ease: 'power4.out' });
      gsap.to(dot, { opacity: next === 'play' ? 0 : 1, duration: 0.2 });
    };

    const modeAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      return (el?.closest?.('[data-cursor]') as HTMLElement | null)?.dataset.cursor ?? '';
    };

    const onMove = (event: PointerEvent) => {
      if (!shown) {
        shown = true;
        gsap.to([ring, dot], { opacity: 1, duration: 0.2 });
      }
      lastX = event.clientX;
      lastY = event.clientY;
      ringX(lastX);
      ringY(lastY);
      dotX(lastX);
      dotY(lastY);

      const host = (event.target as Element | null)?.closest?.('[data-cursor]') as HTMLElement | null;
      setMode(host?.dataset.cursor ?? '');
    };

    /**
     * Re-read the element under the pointer when the app's state changes but
     * the pointer has not moved — otherwise the ring keeps advertising a cell
     * as playable after the click that filled it (or ended the game).
     */
    const onSync = () => {
      if (lastX < 0) return;
      setMode(modeAt(lastX, lastY));
    };
    window.addEventListener('trio:cursor-sync', onSync);

    const onLeave = () => {
      shown = false;
      gsap.to([ring, dot], { opacity: 0, duration: 0.2 });
    };

    const onDown = () => gsap.to(ring, { scale: '-=0.35', duration: 0.12, ease: 'power3.out' });
    const onUp = () => gsap.to(ring, { scale: scaleFor(mode), duration: 0.28, ease: 'power4.out' });

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    document.addEventListener('pointerleave', onLeave);

    return () => {
      delete document.body.dataset.customCursor;
      window.removeEventListener('trio:cursor-sync', onSync);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <>
      <div ref={ringRef} className="cursor cursor--ring" aria-hidden="true" />
      <div ref={dotRef} className="cursor cursor--dot" aria-hidden="true" />
    </>
  );
}
