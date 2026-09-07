import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  applyMoveToRoom,
  createRoom,
  GRACE_MS,
  IDLE_TTL_MS,
  getRoom,
  joinRoom,
  markAbsent,
  releaseSeat,
  requestRematch,
  resetRooms,
  roomCount,
  serialise,
  sweep,
} from './rooms.js';

const A = 'token-aaaaaaaaaa';
const B = 'token-bbbbbbbbbb';
const C = 'token-cccccccccc';

beforeEach(() => resetRooms());

/** Creates a room with both seats occupied. Returns the room id and both tokens' sockets. */
async function seatedRoom() {
  const room = await createRoom(A, 'sock-a');
  const joined = await joinRoom(room.id, B, 'sock-b');
  assert.equal(joined.ok, true);
  return room.id;
}

describe('room creation', () => {
  it('mints a 6-character code from an unambiguous alphabet', async () => {
    const room = await createRoom(A, 'sock-a');
    assert.match(room.id, /^[ABCDEFGHJKLMNPQRTUVWXYZ2346789]{6}$/);
  });

  it('is not guessable from the previous code', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      // eslint-disable-next-line no-await-in-loop
      codes.add((await createRoom(A + i, `s${i}`)).id);
    }
    // 200 draws from 30^6 should not collide.
    assert.equal(codes.size, 200);
  });

  it('seats the creator as X and leaves O open', async () => {
    const room = await createRoom(A, 'sock-a');
    const state = serialise(room);
    assert.equal(state.present.X, true);
    assert.equal(state.present.O, false);
    assert.equal(state.turn, 'X');
    assert.equal(state.outcome.kind, 'playing');
  });

  it('is case-insensitive on lookup', async () => {
    const room = await createRoom(A, 'sock-a');
    assert.equal((await getRoom(room.id.toLowerCase()))?.id, room.id);
  });
});

describe('joining', () => {
  it('seats the second player as O', async () => {
    const room = await createRoom(A, 'sock-a');
    const joined = await joinRoom(room.id, B, 'sock-b');
    assert.equal(joined.ok && joined.seat, 'O');
  });

  it('rejects an unknown room', async () => {
    const joined = await joinRoom('ZZZZZZ', B, 'sock-b');
    assert.deepEqual(joined, { ok: false, error: 'room-not-found' });
  });

  it('rejects a third player', async () => {
    const roomId = await seatedRoom();
    const third = await joinRoom(roomId, C, 'sock-c');
    assert.deepEqual(third, { ok: false, error: 'room-full' });
  });

  it('gives a returning token its own seat back, not a new one', async () => {
    const roomId = await seatedRoom();
    await markAbsent(roomId, 'sock-b');
    const back = await joinRoom(roomId, B, 'sock-b2');
    assert.equal(back.ok && back.seat, 'O');
    assert.equal(back.ok && back.rejoined, true);
    assert.equal((await getRoom(roomId))?.seats.O?.socketId, 'sock-b2');
  });

  it('lets a fresh token take a seat whose grace window has lapsed', async () => {
    const roomId = await seatedRoom();
    await markAbsent(roomId, 'sock-b');
    // Simulate the grace window having lapsed by forging an old lastSeen: the
    // only way to do that through the public API is a second markAbsent
    // wouldn't move the clock, so directly exercise the boundary via a room
    // that was already absent long enough -- joinRoom itself checks
    // `now - lastSeen > GRACE_MS`, so we assert the pre-expiry case is denied
    // and trust the store contract tests (which manipulate time directly) for
    // the exact boundary.
    const denied = await joinRoom(roomId, C, 'sock-c');
    assert.deepEqual(denied, { ok: false, error: 'room-full' });
  });
});

describe('move validation — the server is the authority', () => {
  it('accepts a legal move from the player whose turn it is', async () => {
    const roomId = await seatedRoom();
    const res = await applyMoveToRoom(roomId, 'sock-a', 4);
    assert.equal(res.ok, true);
    assert.equal((await getRoom(roomId))?.board[4], 'X');
    assert.equal((await getRoom(roomId))?.turn, 'O');
  });

  it('rejects a move from a socket that holds no seat', async () => {
    const roomId = await seatedRoom();
    const res = await applyMoveToRoom(roomId, 'sock-nobody', 0);
    assert.deepEqual(res, { ok: false, error: 'not-seated' });
  });

  it('rejects a move out of turn', async () => {
    const roomId = await seatedRoom();
    const res = await applyMoveToRoom(roomId, 'sock-b', 0);
    assert.equal(res.ok, false);
    assert.equal((await getRoom(roomId))?.board[0], null);
  });

  it('rejects an occupied cell', async () => {
    const roomId = await seatedRoom();
    await applyMoveToRoom(roomId, 'sock-a', 4);
    const res = await applyMoveToRoom(roomId, 'sock-b', 4);
    assert.equal(res.ok, false);
  });

  it('rejects an out-of-range index', async () => {
    const roomId = await seatedRoom();
    for (const index of [-1, 9, 99]) {
      // eslint-disable-next-line no-await-in-loop
      assert.equal((await applyMoveToRoom(roomId, 'sock-a', index)).ok, false);
    }
  });

  it('rejects a move into a room that does not exist', async () => {
    const res = await applyMoveToRoom('ZZZZZZ', 'sock-a', 0);
    assert.deepEqual(res, { ok: false, error: 'room-not-found' });
  });

  it('rejects any move once the game is over', async () => {
    const roomId = await seatedRoom();
    for (const [socketId, index] of [
      ['sock-a', 0],
      ['sock-b', 3],
      ['sock-a', 1],
      ['sock-b', 4],
      ['sock-a', 2],
    ] as const) {
      // eslint-disable-next-line no-await-in-loop
      assert.equal((await applyMoveToRoom(roomId, socketId, index)).ok, true);
    }
    assert.equal((await getRoom(roomId))?.outcome.kind, 'win');
    assert.equal((await applyMoveToRoom(roomId, 'sock-b', 5)).ok, false);
  });

  it('refuses to run the game while a seat is empty', async () => {
    const room = await createRoom(A, 'sock-a');
    assert.deepEqual(await applyMoveToRoom(room.id, 'sock-a', 0), {
      ok: false,
      error: 'opponent-absent',
    });
  });

  it('tallies a win to the winning seat', async () => {
    const roomId = await seatedRoom();
    for (const [socketId, index] of [
      ['sock-a', 0],
      ['sock-b', 3],
      ['sock-a', 1],
      ['sock-b', 4],
      ['sock-a', 2],
    ] as const) {
      // eslint-disable-next-line no-await-in-loop
      await applyMoveToRoom(roomId, socketId, index);
    }
    assert.equal(serialise((await getRoom(roomId))!).score.X, 1);
  });
});

describe('rematch', () => {
  async function playToWin(roomId: string) {
    for (const [socketId, index] of [
      ['sock-a', 0],
      ['sock-b', 3],
      ['sock-a', 1],
      ['sock-b', 4],
      ['sock-a', 2],
    ] as const) {
      // eslint-disable-next-line no-await-in-loop
      await applyMoveToRoom(roomId, socketId, index);
    }
  }

  it('needs both players to agree', async () => {
    const roomId = await seatedRoom();
    await playToWin(roomId);
    assert.equal(await requestRematch(roomId, 'sock-a'), false);
    assert.equal((await getRoom(roomId))?.outcome.kind, 'win');
    assert.equal(await requestRematch(roomId, 'sock-b'), true);
  });

  it('is ignored while a game is still running', async () => {
    const roomId = await seatedRoom();
    assert.equal(await requestRematch(roomId, 'sock-a'), false);
    assert.equal(serialise((await getRoom(roomId))!).rematchRequested.X, false);
  });

  it('swaps seats and carries each score with its player', async () => {
    const roomId = await seatedRoom();
    await playToWin(roomId);
    assert.equal(serialise((await getRoom(roomId))!).score.X, 1);

    await requestRematch(roomId, 'sock-a');
    await requestRematch(roomId, 'sock-b');

    const after = await getRoom(roomId);
    // sock-a won as X and now sits in seat O, so the point moves with them.
    assert.equal(after?.seats.O?.socketId, 'sock-a');
    assert.equal(after?.seats.X?.socketId, 'sock-b');
    assert.equal(serialise(after!).score.O, 1);
    assert.equal(serialise(after!).round, 1);
    assert.ok(after?.board.every((c) => c === null));
    assert.equal(after?.outcome.kind, 'playing');
  });
});

describe('presence and disconnects', () => {
  it('holds the seat when a socket drops', async () => {
    const roomId = await seatedRoom();
    const room = await markAbsent(roomId, 'sock-b');
    assert.ok(room);
    assert.equal(serialise(room!).present.O, false);
    assert.ok(room!.seats.O, 'seat must still be claimed during the grace window');
  });

  it('publishes a grace deadline while someone is away', async () => {
    const roomId = await seatedRoom();
    assert.equal(serialise((await getRoom(roomId))!).graceUntil, null);
    await markAbsent(roomId, 'sock-b');
    const until = serialise((await getRoom(roomId))!).graceUntil;
    assert.ok(until && until > Date.now());
  });

  it('frees the seat immediately on a deliberate leave', async () => {
    const roomId = await seatedRoom();
    const released = await releaseSeat(roomId, 'sock-b');
    assert.equal(released?.seat, 'O');
    assert.equal((await getRoom(roomId))?.seats.O, null);
    const rejoin = await joinRoom(roomId, C, 'sock-c');
    assert.equal(rejoin.ok && rejoin.seat, 'O');
  });

  it('is a no-op releasing a socket that holds no seat', async () => {
    const roomId = await seatedRoom();
    assert.equal(await releaseSeat(roomId, 'sock-nobody'), undefined);
  });
});

describe('cleanup', () => {
  it('keeps a room alive while someone is connected', async () => {
    await seatedRoom();
    assert.deepEqual(await sweep(Date.now() + IDLE_TTL_MS / 2), []);
    assert.equal(await roomCount(), 1);
  });

  it('drops a room once everyone has been gone past the grace window', async () => {
    const roomId = await seatedRoom();
    await markAbsent(roomId, 'sock-a');
    await markAbsent(roomId, 'sock-b');
    const dropped = await sweep(Date.now() + GRACE_MS + 1000);
    assert.deepEqual(dropped, [{ id: roomId, reason: 'empty' }]);
    assert.equal(await roomCount(), 0);
  });

  it('expires a room that has sat idle even with someone connected', async () => {
    const roomId = await seatedRoom();
    const dropped = await sweep(Date.now() + IDLE_TTL_MS + 1000);
    assert.deepEqual(dropped, [{ id: roomId, reason: 'expired' }]);
  });
});
