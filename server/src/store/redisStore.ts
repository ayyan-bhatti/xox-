import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { Room, RoomStore } from './types';

/**
 * Redis-backed store, for deployments where a room's two players can have
 * their sockets accepted by two different, unrelated processes with no shared
 * memory (Vercel Functions: "a single WebSocket connection is pinned to one
 * function instance... store durable state in an external data store instead
 * of relying on in-memory variables" — straight from Vercel's own docs on
 * this). A plain GET-then-SET across two such processes is a lost-update bug
 * waiting to happen — exactly the "two players race for the last seat" case
 * this store is tested against — so every `update()` takes a short-lived
 * per-room advisory lock around the read-modify-write.
 *
 * The lock is deliberately simple (SET NX PX, not full Redlock consensus):
 * this app has at most two writers per room, writes are a handful of
 * microseconds of pure JS plus two Redis round trips, and Upstash is a single
 * logical Redis endpoint — there is no multi-master split-brain scenario here
 * for Redlock to protect against. A stale lock still self-heals via its TTL.
 */

const PREFIX = 'trio:room:';
const LOCK_PREFIX = 'trio:lock:';

/** Generous headroom over an in-process compute + two round trips. */
const LOCK_TTL_MS = 3000;
const LOCK_RETRY_DELAY_MS = 25;
const LOCK_MAX_WAIT_MS = 4000;

/** Redis-side safety net if a room is somehow never explicitly deleted. */
const ROOM_KEY_TTL_MS = 60 * 60 * 1000;

const RELEASE_IF_OWNER = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(client: Redis, key: string): Promise<string> {
  const token = randomBytes(12).toString('hex');
  const deadline = Date.now() + LOCK_MAX_WAIT_MS;

  for (;;) {
    const got = await client.set(key, token, 'PX', LOCK_TTL_MS, 'NX');
    if (got === 'OK') return token;
    if (Date.now() >= deadline) {
      throw new Error(`trio: timed out waiting for the room lock at ${key}`);
    }
    await sleep(LOCK_RETRY_DELAY_MS + Math.random() * LOCK_RETRY_DELAY_MS);
  }
}

async function releaseLock(client: Redis, key: string, token: string): Promise<void> {
  await client.eval(RELEASE_IF_OWNER, 1, key, token);
}

async function scanKeys(client: Redis, pattern: string): Promise<string[]> {
  const found: string[] = [];
  let cursor = '0';
  do {
    // eslint-disable-next-line no-await-in-loop
    const [next, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = next;
    found.push(...keys);
  } while (cursor !== '0');
  return found;
}

export function createRedisStore(client: Redis): RoomStore {
  return {
    async update(id, mutator) {
      const roomKey = PREFIX + id;
      const lockKey = LOCK_PREFIX + id;
      const token = await acquireLock(client, lockKey);
      try {
        const raw = await client.get(roomKey);
        const current: Room | undefined = raw ? (JSON.parse(raw) as Room) : undefined;
        const { next, result } = mutator(current);

        if (next === null) {
          await client.del(roomKey);
        } else if (next !== undefined) {
          await client.set(roomKey, JSON.stringify(next), 'PX', ROOM_KEY_TTL_MS);
        }
        return result;
      } finally {
        await releaseLock(client, lockKey, token);
      }
    },

    async get(id) {
      const raw = await client.get(PREFIX + id);
      return raw ? (JSON.parse(raw) as Room) : undefined;
    },

    async ids() {
      const keys = await scanKeys(client, PREFIX + '*');
      return keys.map((k) => k.slice(PREFIX.length));
    },

    async count() {
      return (await scanKeys(client, PREFIX + '*')).length;
    },

    async reset() {
      const keys = await scanKeys(client, PREFIX + '*');
      const locks = await scanKeys(client, LOCK_PREFIX + '*');
      const all = [...keys, ...locks];
      if (all.length) await client.del(...all);
    },
  };
}
