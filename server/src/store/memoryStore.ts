import type { Room, RoomStore } from './types.js';

/**
 * In-process Map. Safe with no locking because every mutator passed to
 * `update()` is synchronous — Node never interleaves two synchronous callbacks
 * on the same event-loop turn, so the read-modify-write is atomic for free.
 * This is what local dev and a single-instance host (Render) use; it is NOT
 * safe to share across more than one OS process.
 */
export function createMemoryStore(): RoomStore {
  const rooms = new Map<string, Room>();

  return {
    async update(id, mutator) {
      const { next, result } = mutator(rooms.get(id));
      if (next === null) rooms.delete(id);
      else if (next !== undefined) rooms.set(id, next);
      return result;
    },

    async get(id) {
      return rooms.get(id);
    },

    async ids() {
      return [...rooms.keys()];
    },

    async count() {
      return rooms.size;
    },

    async reset() {
      rooms.clear();
    },
  };
}
