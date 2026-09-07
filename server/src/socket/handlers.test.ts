import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { io as connect, type Socket } from 'socket.io-client';
import type { RoomState, Seat } from '../../../shared/protocol';
import { getRoom, GRACE_MS, joinRoom, resetRooms, sweep } from '../rooms';
import { createTrioServer, type TrioServer } from '../server';

/**
 * Integration tests: a real Socket.IO server on an ephemeral port with real
 * client sockets. These cover the acceptance path end to end — create, join,
 * third-player rejection, move validation, completion sync and disconnects —
 * because that is where client and server contracts actually meet.
 */

let server: TrioServer;
let url: string;
const open: Socket[] = [];

const TOKEN_A = 'aaaaaaaaaaaaaaaa';
const TOKEN_B = 'bbbbbbbbbbbbbbbb';
const TOKEN_C = 'cccccccccccccccc';

function client(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(url, { transports: ['websocket'], reconnection: false });
    open.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function emit<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function once<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

/** Waits until `predicate` holds, polling briefly. Avoids arbitrary sleeps. */
async function until(predicate: () => boolean | Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 20));
  }
}

before(async () => {
  server = createTrioServer();
  const port = await server.listen(0);
  url = `http://localhost:${port}`;
});

after(async () => {
  for (const socket of open) socket.close();
  await server.close();
});

beforeEach(() => {
  for (const socket of open.splice(0)) socket.close();
  resetRooms();
});

type CreateAck = { ok: true; state: RoomState; seat: Seat } | { ok: false; error: string };
type MoveAck = { ok: true } | { ok: false; error: string };

/** Two connected clients seated in one room. */
async function seatedRoom() {
  const a = await client();
  const b = await client();
  const created = await emit<CreateAck>(a, 'room:create', { token: TOKEN_A });
  assert.ok(created.ok);
  const roomId = created.state.roomId;
  const joined = await emit<CreateAck>(b, 'room:join', { roomId, token: TOKEN_B });
  assert.ok(joined.ok);
  return { a, b, roomId };
}

describe('room lifecycle over sockets', () => {
  it('creates a room and seats the creator as X', async () => {
    const a = await client();
    const res = await emit<CreateAck>(a, 'room:create', { token: TOKEN_A });
    assert.ok(res.ok);
    assert.equal(res.seat, 'X');
    assert.match(res.state.roomId, /^[A-Z0-9]{6}$/);
    assert.equal(res.state.present.O, false);
  });

  it('rejects a create with a junk token', async () => {
    const a = await client();
    const res = await emit<CreateAck>(a, 'room:create', { token: 'short' });
    assert.equal(res.ok, false);
  });

  it('seats a joiner as O and tells both sides', async () => {
    const a = await client();
    const created = await emit<CreateAck>(a, 'room:create', { token: TOKEN_A });
    assert.ok(created.ok);

    const hostSees = once<RoomState>(a, 'room:state');
    const b = await client();
    const joined = await emit<CreateAck>(b, 'room:join', {
      roomId: created.state.roomId,
      token: TOKEN_B,
    });

    assert.ok(joined.ok);
    assert.equal(joined.seat, 'O');
    const state = await hostSees;
    assert.equal(state.present.X && state.present.O, true);
  });

  it('rejects a join to an unknown code', async () => {
    const a = await client();
    const res = await emit<CreateAck>(a, 'room:join', { roomId: 'ZZZZZZ', token: TOKEN_A });
    assert.deepEqual(res, { ok: false, error: 'room-not-found' });
  });

  it('rejects a third player', async () => {
    const { roomId } = await seatedRoom();
    const c = await client();
    const res = await emit<CreateAck>(c, 'room:join', { roomId, token: TOKEN_C });
    assert.deepEqual(res, { ok: false, error: 'room-full' });
  });
});

describe('move authority over sockets', () => {
  it('broadcasts a legal move to both players', async () => {
    const { a, b, roomId } = await seatedRoom();
    const hostSaw = once<{ index: number; mark: string; state: RoomState }>(a, 'game:move');
    const guestSaw = once<{ index: number; mark: string; state: RoomState }>(b, 'game:move');

    const ack = await emit<MoveAck>(a, 'game:move', { roomId, index: 4 });
    assert.deepEqual(ack, { ok: true });

    for (const seen of [await hostSaw, await guestSaw]) {
      assert.equal(seen.index, 4);
      assert.equal(seen.mark, 'X');
      assert.equal(seen.state.board[4], 'X');
      assert.equal(seen.state.turn, 'O');
    }
  });

  it('rejects a move made out of turn', async () => {
    const { b, roomId } = await seatedRoom();
    const ack = await emit<MoveAck>(b, 'game:move', { roomId, index: 0 });
    assert.equal(ack.ok, false);
  });

  it('rejects a move onto an occupied cell', async () => {
    const { a, b, roomId } = await seatedRoom();
    await emit<MoveAck>(a, 'game:move', { roomId, index: 4 });
    const ack = await emit<MoveAck>(b, 'game:move', { roomId, index: 4 });
    assert.equal(ack.ok, false);
  });

  it('rejects an out-of-range index', async () => {
    const { a, roomId } = await seatedRoom();
    assert.equal((await emit<MoveAck>(a, 'game:move', { roomId, index: 99 })).ok, false);
    assert.equal((await emit<MoveAck>(a, 'game:move', { roomId, index: -1 })).ok, false);
  });

  it('rejects a move into a room that does not exist', async () => {
    const { a } = await seatedRoom();
    const ack = await emit<MoveAck>(a, 'game:move', { roomId: 'ZZZZZZ', index: 0 });
    assert.deepEqual(ack, { ok: false, error: 'room-not-found' });
  });

  it('resyncs the offending client after a rejection', async () => {
    const { b, roomId } = await seatedRoom();
    const resync = once<RoomState>(b, 'room:state');
    await emit<MoveAck>(b, 'game:move', { roomId, index: 0 });
    const state = await resync;
    assert.equal(state.turn, 'X');
    assert.ok(state.board.every((c) => c === null));
  });

  it('syncs a completed game and then refuses further moves', async () => {
    const { a, b, roomId } = await seatedRoom();
    let latest: RoomState | null = null;
    b.on('game:move', (p: { state: RoomState }) => {
      latest = p.state;
    });

    for (const [socket, index] of [
      [a, 0],
      [b, 3],
      [a, 1],
      [b, 4],
      [a, 2],
    ] as const) {
      assert.deepEqual(await emit<MoveAck>(socket, 'game:move', { roomId, index }), { ok: true });
    }

    await until(() => latest?.outcome.kind === 'win');
    assert.equal(latest!.outcome.kind, 'win');
    assert.equal(latest!.score.X, 1);

    const afterEnd = await emit<MoveAck>(b, 'game:move', { roomId, index: 5 });
    assert.equal(afterEnd.ok, false);
  });
});

describe('rematch over sockets', () => {
  it('restarts only once both sides ask, and swaps seats', async () => {
    const { a, b, roomId } = await seatedRoom();
    for (const [socket, index] of [
      [a, 0],
      [b, 3],
      [a, 1],
      [b, 4],
      [a, 2],
    ] as const) {
      await emit<MoveAck>(socket, 'game:move', { roomId, index });
    }

    const halfway = once<RoomState>(b, 'room:state');
    a.emit('game:rematch', { roomId });
    const pending = await halfway;
    assert.equal(pending.rematchRequested.X, true);
    assert.equal(pending.outcome.kind, 'win', 'must not restart on one request');

    const resetA = once<{ state: RoomState; yourSeat: Seat }>(a, 'game:reset');
    const resetB = once<{ state: RoomState; yourSeat: Seat }>(b, 'game:reset');
    b.emit('game:rematch', { roomId });
    const [ra, rb] = await Promise.all([resetA, resetB]);

    assert.ok(ra.state.board.every((c) => c === null));
    assert.equal(ra.state.round, 1);
    assert.equal(ra.yourSeat, 'O');
    assert.equal(rb.yourSeat, 'X');
  });
});

describe('disconnect handling', () => {
  it('tells the remaining player their opponent went away', async () => {
    const { a, b, roomId } = await seatedRoom();
    let state: RoomState | null = null;
    a.on('room:state', (s: RoomState) => {
      state = s;
    });

    b.close();
    await until(() => state?.present.O === false);
    assert.equal(state!.present.O, false);
    assert.ok(state!.graceUntil && state!.graceUntil > Date.now());
    assert.equal(roomId.length, 6);
  });

  it('lets the same token reclaim its seat and see the board again', async () => {
    const { a, b, roomId } = await seatedRoom();
    await emit<MoveAck>(a, 'game:move', { roomId, index: 4 });

    b.close();
    let away = false;
    a.on('room:state', (s: RoomState) => {
      if (!s.present.O) away = true;
    });
    await until(() => away);

    const b2 = await client();
    const back = await emit<CreateAck>(b2, 'room:join', { roomId, token: TOKEN_B });
    assert.ok(back.ok);
    assert.equal(back.seat, 'O');
    assert.equal(back.state.board[4], 'X');
    assert.equal(back.state.present.O, true);
  });

  it('frees the seat at once when a player leaves deliberately', async () => {
    const { a, b, roomId } = await seatedRoom();
    let freed = false;
    a.on('room:state', (s: RoomState) => {
      if (!s.present.O && s.graceUntil === null) freed = true;
    });

    b.emit('room:leave', { roomId });
    await until(() => freed);

    const c = await client();
    const res = await emit<CreateAck>(c, 'room:join', { roomId, token: TOKEN_C });
    assert.ok(res.ok);
    assert.equal(res.seat, 'O');
  });
});

describe('edge cases', () => {
  it('lets exactly one of two simultaneous joiners take the last seat', async () => {
    const host = await client();
    const created = await emit<CreateAck>(host, 'room:create', { token: TOKEN_A });
    assert.ok(created.ok);
    const roomId = created.state.roomId;

    // Fire both joins without awaiting either, so they queue back to back.
    const b = await client();
    const c = await client();
    const [rb, rc] = await Promise.all([
      emit<CreateAck>(b, 'room:join', { roomId, token: TOKEN_B }),
      emit<CreateAck>(c, 'room:join', { roomId, token: TOKEN_C }),
    ]);

    const winners = [rb, rc].filter((r) => r.ok);
    const losers = [rb, rc].filter((r) => !r.ok);
    assert.equal(winners.length, 1, 'exactly one joiner may be seated');
    assert.equal(losers.length, 1);
    assert.equal((losers[0] as { ok: false; error: string }).error, 'room-full');
    assert.equal((winners[0] as { ok: true; seat: Seat }).seat, 'O');
  });

  it('rejects a room that expired while nobody was looking', async () => {
    const { roomId, a, b } = await seatedRoom();
    a.close();
    b.close();
    // Closing a socket only *starts* the server's disconnect handling -- it
    // happens asynchronously -- so poll the real room state rather than
    // assuming any fixed number of ticks is enough for both to land.
    await until(async () => {
      const room = await getRoom(roomId);
      return room !== undefined && !room.seats.X?.socketId && !room.seats.O?.socketId;
    });

    // Fast-forward the sweep's own clock rather than forging timestamps on a
    // fetched room object -- the same trick rooms.test.ts uses, and the only
    // one that is also correct against the Redis-backed store, where get()
    // hands back a fresh deserialised object rather than a live reference.
    assert.deepEqual(await sweep(Date.now() + GRACE_MS + 60_000), [{ id: roomId, reason: 'empty' }]);

    const late = await client();
    const res = await emit<CreateAck>(late, 'room:join', { roomId, token: TOKEN_A });
    assert.deepEqual(res, { ok: false, error: 'room-not-found' });
  });

  it('keeps the board intact when the opponent closes their tab mid-game', async () => {
    const { a, b, roomId } = await seatedRoom();
    await emit<MoveAck>(a, 'game:move', { roomId, index: 0 });
    await emit<MoveAck>(b, 'game:move', { roomId, index: 4 });

    let latest: RoomState | null = null;
    a.on('room:state', (s: RoomState) => {
      latest = s;
    });

    b.close(); // tab closed, no clean leave
    await until(() => latest?.present.O === false);

    // The board survives, and the remaining player cannot sneak a move in
    // while the seat is empty.
    assert.equal(latest!.board[0], 'X');
    assert.equal(latest!.board[4], 'O');
    const blocked = await emit<MoveAck>(a, 'game:move', { roomId, index: 1 });
    assert.deepEqual(blocked, { ok: false, error: 'opponent-absent' });
  });

  it('hands the seat to someone new once the dropped player is past their grace', async () => {
    const { a, b, roomId } = await seatedRoom();
    b.close();
    let gone = false;
    // `a` is genuinely in this room (it went through room:create), so it is
    // actually a member of the Socket.IO room channel and will receive the
    // broadcast -- an unrelated fresh socket never would be.
    a.on('room:state', (s: RoomState) => {
      if (!s.present.O) gone = true;
    });
    await until(() => gone);

    // The real two-minute grace window is not something a test should sit
    // through, and forging a fetched room's timestamps and hoping the write
    // sticks is a memory-store-only trick (Redis's get() hands back a fresh
    // deserialised object every time). joinRoom's own `now` parameter exists
    // for exactly this: exercise the production function the socket handler
    // itself calls, with a clock that has genuinely moved past the deadline.
    const res = await joinRoom(roomId, TOKEN_C, 'stranger-sock', Date.now() + GRACE_MS + 1000);
    assert.ok(res.ok);
    assert.equal(res.seat, 'O');
  });

  it('moves the seat to the newest socket when the same token opens a second tab', async () => {
    const { a, roomId } = await seatedRoom();
    const secondTab = await client();
    const res = await emit<CreateAck>(secondTab, 'room:join', { roomId, token: TOKEN_A });
    assert.ok(res.ok);
    assert.equal(res.seat, 'X', 'the same token keeps its own seat');

    // The new tab plays; the stale one no longer holds the seat.
    assert.deepEqual(await emit<MoveAck>(secondTab, 'game:move', { roomId, index: 0 }), {
      ok: true,
    });
    const stale = await emit<MoveAck>(a, 'game:move', { roomId, index: 1 });
    assert.equal(stale.ok, false);
  });

  it('rejects a rematch request from a socket with no seat', async () => {
    const { roomId } = await seatedRoom();
    const stranger = await client();
    stranger.emit('game:rematch', { roomId });
    await until(() => true);
    const room = await getRoom(roomId);
    assert.ok(room);
    assert.equal(room.rematch.X, false);
    assert.equal(room.rematch.O, false);
  });
});

describe('health endpoint', () => {
  it('reports ok and a room count', async () => {
    await seatedRoom();
    const res = await fetch(`${url}/healthz`);
    const body = (await res.json()) as { ok: boolean; rooms: number };
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.rooms, 1);
  });
});
