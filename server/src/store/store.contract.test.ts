import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Redis } from 'ioredis';
import RedisMock from 'ioredis-mock';
import { createMemoryStore } from './memoryStore';
import { createRedisStore } from './redisStore';
import {
  buildRoom,
  decideJoin,
  decideMove,
  decideNextRound,
  decideRematchRequest,
  type JoinDecision,
} from './roomLogic';
import type { Room, RoomStore } from './types';

/**
 * The same behavioural contract, run against BOTH backends. The one case that
 * actually distinguishes them is the concurrent-join race: the memory store
 * is trivially safe because Node never interleaves synchronous callbacks, but
 * the Redis store has to prove its lock genuinely serialises two update()
 * calls that land at the same instant -- which is exactly the situation two
 * players' requests hitting two different Vercel function instances at once
 * would produce.
 */
function runContract(name: string, makeStore: () => RoomStore) {
  describe(`RoomStore contract: ${name}`, () => {
    it('round-trips a room through update/get', async () => {
      const store = makeStore();
      const room = buildRoom('ABC123', 'token-a', 'sock-a');
      await store.update('ABC123', () => ({ next: room, result: undefined }));
      const got = await store.get('ABC123');
      assert.deepEqual(got, room);
    });

    it('get returns undefined for a room that was never written', async () => {
      const store = makeStore();
      assert.equal(await store.get('NOPE00'), undefined);
    });

    it('mutator seeing next:undefined leaves the room untouched', async () => {
      const store = makeStore();
      const room = buildRoom('ABC123', 'token-a', 'sock-a');
      await store.update('ABC123', () => ({ next: room, result: undefined }));
      await store.update('ABC123', (current) => ({ next: undefined, result: current }));
      assert.deepEqual(await store.get('ABC123'), room);
    });

    it('mutator returning next:null deletes the room', async () => {
      const store = makeStore();
      const room = buildRoom('ABC123', 'token-a', 'sock-a');
      await store.update('ABC123', () => ({ next: room, result: undefined }));
      await store.update('ABC123', () => ({ next: null, result: undefined }));
      assert.equal(await store.get('ABC123'), undefined);
    });

    it('lists every room id that has been written', async () => {
      const store = makeStore();
      await store.update('AAA111', () => ({ next: buildRoom('AAA111', 't1', 's1'), result: undefined }));
      await store.update('BBB222', () => ({ next: buildRoom('BBB222', 't2', 's2'), result: undefined }));
      const ids = (await store.ids()).sort();
      assert.deepEqual(ids, ['AAA111', 'BBB222']);
      assert.equal(await store.count(), 2);
    });

    it('reset clears every room', async () => {
      const store = makeStore();
      await store.update('AAA111', () => ({ next: buildRoom('AAA111', 't1', 's1'), result: undefined }));
      await store.reset();
      assert.equal(await store.count(), 0);
    });

    it('plays a full game end to end through the store', async () => {
      const store = makeStore();
      const created = buildRoom('GAME01', 'token-a', 'sock-a');
      await store.update('GAME01', () => ({ next: created, result: undefined }));

      await store.update('GAME01', (room) => {
        const j = decideJoin(room!, 'token-b', 'sock-b');
        assert.ok(j.ok);
        return { next: j.ok ? j.room : undefined, result: undefined };
      });

      for (const [socketId, index] of [
        ['sock-a', 0],
        ['sock-b', 3],
        ['sock-a', 1],
        ['sock-b', 4],
        ['sock-a', 2],
      ] as const) {
        // eslint-disable-next-line no-await-in-loop
        await store.update('GAME01', (room) => {
          const m = decideMove(room!, socketId, index);
          assert.ok(m.ok, `move by ${socketId} at ${index} should be legal`);
          return { next: m.ok ? m.room : undefined, result: undefined };
        });
      }

      const final = await store.get('GAME01');
      assert.equal(final?.outcome.kind, 'win');
      assert.equal(final?.score.X, 1);
    });

    it('rematch only restarts once both seats have asked', async () => {
      const store = makeStore();
      let room: Room = buildRoom('RM0001', 'token-a', 'sock-a');
      room = (decideJoin(room, 'token-b', 'sock-b') as { room: Room }).room;
      room = { ...room, outcome: { kind: 'draw' } };
      await store.update('RM0001', () => ({ next: room, result: undefined }));

      await store.update('RM0001', (current) => {
        const r = decideRematchRequest(current!, 'sock-a');
        return { next: r?.room, result: r?.bothAgreed };
      });
      let after = await store.get('RM0001');
      assert.equal(after?.rematch.X, true);
      assert.equal(after?.outcome.kind, 'draw', 'must not restart on a single request');

      const bothAgreed = await store.update('RM0001', (current) => {
        const r = decideRematchRequest(current!, 'sock-b');
        if (!r) return { next: undefined, result: false };
        const restarted = r.bothAgreed ? decideNextRound(r.room) : r.room;
        return { next: restarted, result: r.bothAgreed };
      });
      assert.equal(bothAgreed, true);
      after = await store.get('RM0001');
      assert.ok(after?.board.every((c) => c === null));
      assert.equal(after?.round, 1);
    });

    it('serialises exactly one winner when two joins race for the last seat', async () => {
      const store = makeStore();
      await store.update('RACE01', () => ({ next: buildRoom('RACE01', 'token-a', 'sock-a'), result: undefined }));

      const attempt = (token: string, socketId: string) =>
        store.update<JoinDecision>('RACE01', (room) => {
          const decision = decideJoin(room!, token, socketId);
          if (!decision.ok) return { next: undefined, result: decision };
          return { next: decision.room, result: decision };
        });

      // Genuinely concurrent from the caller's point of view -- this is what
      // makes it a real test of the lock rather than the language's own
      // ordering guarantees.
      const [a, b] = await Promise.all([attempt('token-b', 'sock-b'), attempt('token-c', 'sock-c')]);

      const results = [a, b];
      const winners = results.filter((r) => r.ok);
      const losers = results.filter((r) => !r.ok);
      assert.equal(winners.length, 1, 'exactly one racer should win the seat');
      assert.equal(losers.length, 1);
      assert.equal((losers[0] as { ok: false; error: string }).error, 'room-full');

      const final = await store.get('RACE01');
      assert.equal(final?.seats.O !== null, true);
    });

    it('serialises many concurrent updates to the same room without dropping any', async () => {
      const store = makeStore();
      await store.update('BUSY01', () => ({
        next: { ...buildRoom('BUSY01', 'token-a', 'sock-a'), score: { X: 0, O: 0, draws: 0 } },
        result: undefined,
      }));

      const bump = () =>
        store.update('BUSY01', (room) => ({
          next: { ...room!, score: { ...room!.score, draws: room!.score.draws + 1 } },
          result: undefined,
        }));

      await Promise.all(Array.from({ length: 25 }, bump));

      const final = await store.get('BUSY01');
      assert.equal(final?.score.draws, 25, 'every concurrent increment must be reflected, none lost');
    });
  });
}

runContract('memory', () => createMemoryStore());
runContract('redis (mocked)', () => createRedisStore(new RedisMock() as unknown as Redis));
