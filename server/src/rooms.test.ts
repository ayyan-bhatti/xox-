import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  applyMoveToRoom,
  createRoom,
  getRoom,
  GRACE_MS,
  IDLE_TTL_MS,
  joinRoom,
  markAbsent,
  releaseSeat,
  requestRematch,
  resetRooms,
  roomCount,
  roomsForSocket,
  seatOfSocket,
  serialise,
  startNextRound,
  sweep,
} from './rooms';

const A = 'token-aaaaaaaaaa';
const B = 'token-bbbbbbbbbb';
const C = 'token-cccccccccc';

beforeEach(() => resetRooms());

/** Creates a room with both seats occupied. Returns the room and its ids. */
function seatedRoom() {
  const room = createRoom(A, 'sock-a');
  const joined = joinRoom(room.id, B, 'sock-b');
  assert.equal(joined.ok, true);
  return room;
}

describe('room creation', () => {
  it('mints a 6-character code from an unambiguous alphabet', () => {
    const room = createRoom(A, 'sock-a');
    assert.match(room.id, /^[ABCDEFGHJKLMNPQRTUVWXYZ2346789]{6}$/);
  });

  it('is not guessable from the previous code', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) codes.add(createRoom(A + i, `s${i}`).id);
    // 200 draws from 30^6 should not collide.
    assert.equal(codes.size, 200);
  });

  it('seats the creator as X and leaves O open', () => {
    const room = createRoom(A, 'sock-a');
    const state = serialise(room);
    assert.equal(state.present.X, true);
    assert.equal(state.present.O, false);
    assert.equal(state.turn, 'X');
    assert.equal(state.outcome.kind, 'playing');
  });

  it('is case-insensitive on lookup', () => {
    const room = createRoom(A, 'sock-a');
    assert.equal(getRoom(room.id.toLowerCase())?.id, room.id);
  });
});

describe('joining', () => {
  it('seats the second player as O', () => {
    const room = createRoom(A, 'sock-a');
    const joined = joinRoom(room.id, B, 'sock-b');
    assert.equal(joined.ok && joined.seat, 'O');
  });

  it('rejects an unknown room', () => {
    const joined = joinRoom('ZZZZZZ', B, 'sock-b');
    assert.deepEqual(joined, { ok: false, error: 'room-not-found' });
  });

  it('rejects a third player', () => {
    const room = seatedRoom();
    const third = joinRoom(room.id, C, 'sock-c');
    assert.deepEqual(third, { ok: false, error: 'room-full' });
  });

  it('gives a returning token its own seat back, not a new one', () => {
    const room = seatedRoom();
    markAbsent('sock-b');
    const back = joinRoom(room.id, B, 'sock-b2');
    assert.equal(back.ok && back.seat, 'O');
    assert.equal(back.ok && back.rejoined, true);
    assert.equal(serialise(room).present.O, true);
  });

  it('lets a fresh token take a seat whose grace window has lapsed', () => {
    const room = seatedRoom();
    markAbsent('sock-b');
    const holder = room.seats.O;
    assert.ok(holder);
    holder.lastSeen = Date.now() - GRACE_MS - 1000;

    const taken = joinRoom(room.id, C, 'sock-c');
    assert.equal(taken.ok && taken.seat, 'O');
    assert.equal(taken.ok && taken.rejoined, false);
  });
});

describe('move validation — the server is the authority', () => {
  it('accepts a legal move from the player whose turn it is', () => {
    const room = seatedRoom();
    const res = applyMoveToRoom(room, 'sock-a', 4);
    assert.equal(res.ok, true);
    assert.equal(room.board[4], 'X');
    assert.equal(room.turn, 'O');
  });

  it('rejects a move from a socket that holds no seat', () => {
    const room = seatedRoom();
    const res = applyMoveToRoom(room, 'sock-nobody', 0);
    assert.deepEqual(res, { ok: false, error: 'not-seated' });
  });

  it('rejects a move out of turn', () => {
    const room = seatedRoom();
    const res = applyMoveToRoom(room, 'sock-b', 0);
    assert.equal(res.ok, false);
    assert.equal(room.board[0], null);
  });

  it('rejects an occupied cell', () => {
    const room = seatedRoom();
    applyMoveToRoom(room, 'sock-a', 4);
    const res = applyMoveToRoom(room, 'sock-b', 4);
    assert.equal(res.ok, false);
  });

  it('rejects an out-of-range index', () => {
    const room = seatedRoom();
    for (const index of [-1, 9, 99]) {
      assert.equal(applyMoveToRoom(room, 'sock-a', index).ok, false);
    }
  });

  it('rejects any move once the game is over', () => {
    const room = seatedRoom();
    for (const [socket, index] of [
      ['sock-a', 0],
      ['sock-b', 3],
      ['sock-a', 1],
      ['sock-b', 4],
      ['sock-a', 2],
    ] as const) {
      assert.equal(applyMoveToRoom(room, socket, index).ok, true);
    }
    assert.equal(room.outcome.kind, 'win');
    assert.equal(applyMoveToRoom(room, 'sock-b', 5).ok, false);
  });

  it('refuses to run the game while a seat is empty', () => {
    const room = createRoom(A, 'sock-a');
    assert.deepEqual(applyMoveToRoom(room, 'sock-a', 0), {
      ok: false,
      error: 'opponent-absent',
    });
  });

  it('tallies a win to the winning seat', () => {
    const room = seatedRoom();
    for (const [socket, index] of [
      ['sock-a', 0],
      ['sock-b', 3],
      ['sock-a', 1],
      ['sock-b', 4],
      ['sock-a', 2],
    ] as const) {
      applyMoveToRoom(room, socket, index);
    }
    assert.equal(serialise(room).score.X, 1);
  });
});

describe('rematch', () => {
  it('needs both players to agree', () => {
    const room = seatedRoom();
    for (const [socket, index] of [
      ['sock-a', 0],
      ['sock-b', 3],
      ['sock-a', 1],
      ['sock-b', 4],
      ['sock-a', 2],
    ] as const) {
      applyMoveToRoom(room, socket, index);
    }
    assert.equal(requestRematch(room, 'sock-a'), false);
    assert.equal(room.outcome.kind, 'win');
    assert.equal(requestRematch(room, 'sock-b'), true);
  });

  it('is ignored while a game is still running', () => {
    const room = seatedRoom();
    assert.equal(requestRematch(room, 'sock-a'), false);
    assert.equal(serialise(room).rematchRequested.X, false);
  });

  it('swaps seats and carries each score with its player', () => {
    const room = seatedRoom();
    for (const [socket, index] of [
      ['sock-a', 0],
      ['sock-b', 3],
      ['sock-a', 1],
      ['sock-b', 4],
      ['sock-a', 2],
    ] as const) {
      applyMoveToRoom(room, socket, index);
    }
    assert.equal(serialise(room).score.X, 1);

    startNextRound(room);

    // sock-a won as X and now sits in seat O, so the point moves with them.
    assert.equal(seatOfSocket(room, 'sock-a'), 'O');
    assert.equal(seatOfSocket(room, 'sock-b'), 'X');
    assert.equal(serialise(room).score.O, 1);
    assert.equal(serialise(room).round, 1);
    assert.ok(room.board.every((c) => c === null));
    assert.equal(room.outcome.kind, 'playing');
  });
});

describe('presence and disconnects', () => {
  it('holds the seat when a socket drops', () => {
    const room = seatedRoom();
    const affected = markAbsent('sock-b');
    assert.equal(affected.length, 1);
    assert.equal(serialise(room).present.O, false);
    assert.ok(room.seats.O, 'seat must still be claimed during the grace window');
  });

  it('publishes a grace deadline while someone is away', () => {
    const room = seatedRoom();
    assert.equal(serialise(room).graceUntil, null);
    markAbsent('sock-b');
    const until = serialise(room).graceUntil;
    assert.ok(until && until > Date.now());
  });

  it('frees the seat immediately on a deliberate leave', () => {
    const room = seatedRoom();
    assert.equal(releaseSeat(room, 'sock-b'), 'O');
    assert.equal(room.seats.O, null);
    const rejoin = joinRoom(room.id, C, 'sock-c');
    assert.equal(rejoin.ok && rejoin.seat, 'O');
  });

  it('finds the rooms a socket is seated in', () => {
    const room = seatedRoom();
    assert.deepEqual(
      roomsForSocket('sock-a').map((r) => r.id),
      [room.id],
    );
    assert.deepEqual(roomsForSocket('sock-nobody'), []);
  });
});

describe('cleanup', () => {
  it('keeps a room alive while someone is connected', () => {
    seatedRoom();
    assert.deepEqual(sweep(Date.now() + IDLE_TTL_MS / 2), []);
    assert.equal(roomCount(), 1);
  });

  it('drops a room once everyone has been gone past the grace window', () => {
    const room = seatedRoom();
    markAbsent('sock-a');
    markAbsent('sock-b');
    const dropped = sweep(Date.now() + GRACE_MS + 1000);
    assert.deepEqual(dropped, [{ id: room.id, reason: 'empty' }]);
    assert.equal(roomCount(), 0);
  });

  it('expires a room that has sat idle even with someone connected', () => {
    const room = seatedRoom();
    const dropped = sweep(Date.now() + IDLE_TTL_MS + 1000);
    assert.deepEqual(dropped, [{ id: room.id, reason: 'expired' }]);
  });
});
