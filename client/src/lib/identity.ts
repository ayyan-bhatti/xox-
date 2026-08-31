import { nanoid } from 'nanoid';

const KEY = 'trio:token';

/**
 * A stable per-browser id. Presenting the same token to the server after a
 * refresh or a drop reclaims the same seat in the same room — this is what
 * makes reconnect work without any account system.
 *
 * Falls back to an in-memory value when storage is unavailable (private mode);
 * reconnect then survives a socket drop but not a page reload, which is the
 * best that can be done without persistence.
 */
let memoryToken: string | null = null;

export function getToken(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = nanoid(16);
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    if (!memoryToken) memoryToken = nanoid(16);
    return memoryToken;
  }
}
