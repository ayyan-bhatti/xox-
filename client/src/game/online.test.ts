import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomState } from '@shared/protocol';

/**
 * Regression tests for a real hang.
 *
 * `socket.emit(event, payload, ack)` BUFFERS the packet while the socket is
 * disconnected and never invokes the ack. With the server unreachable that left
 * "Create online game" disabled on "Opening…" forever, a room link stuck on
 * "Connecting…" forever, and a submitted move locking the board on `pending`
 * forever — none of them recoverable without a page reload.
 *
 * These drive the store with a socket whose ack is simply never called.
 */

/** Emits recorded by the fake socket, so a test can answer one on demand. */
const sent: { event: string; payload: unknown; ack: (res: unknown) => void }[] = [];

const fakeSocket = {
  emit: (event: string, payload: unknown, ack: (res: unknown) => void) => {
    sent.push({ event, payload, ack });
  },
  on: () => {},
  off: () => {},
};

vi.mock('../lib/socket', () => ({ getSocket: () => fakeSocket }));
vi.mock('../lib/sound', () => ({ play: () => {} }));
vi.mock('../lib/identity', () => ({ getToken: () => 'test-token-0001' }));

const { useOnlineGame } = await import('../store/useOnlineGame');

function room(over: Partial<RoomState> = {}): RoomState {
  return {
    roomId: 'ABC123',
    board: Array(9).fill(null),
    turn: 'X',
    outcome: { kind: 'playing' },
    present: { X: true, O: true },
    rematchRequested: { X: false, O: false },
    round: 0,
    score: { X: 0, O: 0, draws: 0 },
    graceUntil: null,
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  sent.length = 0;
  useOnlineGame.setState({
    phase: 'idle',
    link: 'online',
    seat: null,
    room: null,
    error: null,
    pending: null,
    justConnected: false,
    notice: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('create() when the server never answers', () => {
  it('gives up instead of hanging, and reports why', async () => {
    const promise = useOnlineGame.getState().create();
    expect(useOnlineGame.getState().phase).toBe('connecting');

    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result).toBeNull();
    expect(useOnlineGame.getState().phase).toBe('error');
    expect(useOnlineGame.getState().error).toMatch(/could not reach/i);
  });

  it('still succeeds normally when the server does answer', async () => {
    const promise = useOnlineGame.getState().create();
    expect(sent).toHaveLength(1);
    sent[0].ack({ ok: true, state: room({ present: { X: true, O: false } }), seat: 'X' });

    await expect(promise).resolves.toBe('ABC123');
    expect(useOnlineGame.getState().phase).toBe('waiting');
    expect(useOnlineGame.getState().seat).toBe('X');
  });
});

describe('join() when the server never answers', () => {
  it('surfaces an error when we never had the room', async () => {
    const promise = useOnlineGame.getState().join('ABC123');
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    expect(useOnlineGame.getState().phase).toBe('error');
    expect(useOnlineGame.getState().error).toMatch(/could not reach/i);
  });

  it('keeps a live game and only warns when a reconnect stalls', async () => {
    // Already in a room; this is the reconnect path, not a first join.
    useOnlineGame.setState({ phase: 'ready', room: room(), seat: 'X' });

    const promise = useOnlineGame.getState().join('ABC123');
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    const s = useOnlineGame.getState();
    expect(s.phase).toBe('ready');
    expect(s.room).not.toBeNull();
    expect(s.notice).toMatch(/taking a while/i);
  });

  it('reports a room that is full', async () => {
    const promise = useOnlineGame.getState().join('ABC123');
    sent[0].ack({ ok: false, error: 'room-full' });
    await promise;

    expect(useOnlineGame.getState().phase).toBe('error');
    expect(useOnlineGame.getState().error).toMatch(/two players/i);
  });
});

describe('move() when the server never answers', () => {
  beforeEach(() => {
    useOnlineGame.setState({ phase: 'ready', room: room(), seat: 'X', link: 'online' });
  });

  it('releases the board instead of locking it forever', async () => {
    useOnlineGame.getState().move(4);
    expect(useOnlineGame.getState().pending).toBe(4);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(useOnlineGame.getState().pending).toBeNull();
    expect(useOnlineGame.getState().notice).toMatch(/did not reach/i);
  });

  it('clears the pending cell when the server rejects the move', async () => {
    useOnlineGame.getState().move(4);
    sent[0].ack({ ok: false, error: 'illegal-move' });
    await vi.advanceTimersByTimeAsync(0);

    expect(useOnlineGame.getState().pending).toBeNull();
  });

  it('does not clear a newer pending cell when a stale timeout fires', async () => {
    useOnlineGame.getState().move(4);
    // The broadcast lands and the next turn begins with a different pending.
    useOnlineGame.setState({ pending: 7 });

    await vi.advanceTimersByTimeAsync(10_000);

    expect(useOnlineGame.getState().pending).toBe(7);
  });

  it('refuses to send while the socket is known to be down', () => {
    useOnlineGame.setState({ link: 'reconnecting' });
    useOnlineGame.getState().move(4);

    expect(sent).toHaveLength(0);
    expect(useOnlineGame.getState().pending).toBeNull();
  });
});
