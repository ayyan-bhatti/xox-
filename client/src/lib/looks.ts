import { nanoid } from 'nanoid';
import type { Mark } from '@shared/game';
import type { PlayerLook } from '../components/Board';

/**
 * Who's who, visually. The reference identifies players by their avatar and a
 * coloured rim rather than by an X or an O, so every mode needs a pair of looks.
 * Player one is always amber, player two always turquoise — warm against cool,
 * so the two sides stay distinguishable without relying on hue alone. That
 * pairing is the one thing carried across all three modes.
 */

export const RIM = {
  one: 'var(--amber)',
  two: 'var(--turquoise)',
} as const;

const SEED_KEY = 'trio:face';

/** The player's own face, persisted so it survives reloads (as the reference does). */
export function myFaceSeed(): string {
  try {
    const existing = localStorage.getItem(SEED_KEY);
    if (existing) return existing;
    const fresh = nanoid(10);
    localStorage.setItem(SEED_KEY, fresh);
    return fresh;
  } catch {
    return 'guest-face';
  }
}

export function rerollMyFace(): string {
  const fresh = nanoid(10);
  try {
    localStorage.setItem(SEED_KEY, fresh);
  } catch {
    /* private mode — the new face just won't persist */
  }
  return fresh;
}

export function pair(
  one: { seed: string; name: string },
  two: { seed: string; name: string },
): Record<Mark, PlayerLook> {
  return {
    X: { seed: one.seed, rim: RIM.one, name: one.name },
    O: { seed: two.seed, rim: RIM.two, name: two.name },
  };
}

/** Original, deliberately silly opponent names — nothing from the reference. */
const BOT_NAMES = ['Pixel', 'Waffle', 'Bolt', 'Noodle', 'Rusty', 'Mango', 'Turnip', 'Comet'];

export function botName(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return BOT_NAMES[h % BOT_NAMES.length];
}
