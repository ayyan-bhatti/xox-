import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { BEAT, E, dur, gsap } from '../lib/motion';

interface ToastApi {
  toast: (message: string) => void;
}

const Ctx = createContext<ToastApi>({ toast: () => {} });

export function useToast(): ToastApi {
  return useContext(Ctx);
}

/** Single-slot micro-toast. A new message replaces the current one. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  const toast = useCallback((next: string) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setMessage(next);
  }, []);

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node || !message) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        node,
        { y: 16, opacity: 0, scale: 0.8 },
        { y: 0, opacity: 1, scale: 1, duration: dur(BEAT.toastIn), ease: E.back },
      );
    }, node);

    timerRef.current = window.setTimeout(() => {
      gsap.to(node, {
        y: -8,
        opacity: 0,
        duration: dur(BEAT.toastIn),
        ease: E.anticipate,
        onComplete: () => setMessage(null),
      });
    }, BEAT.toastHold * 1000);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      ctx.revert();
    };
  }, [message]);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="toast-slot" aria-live="polite">
        {message && (
          <div ref={nodeRef} className="toast">
            {message}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
