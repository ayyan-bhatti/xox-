/**
 * Original microcopy. The reference gives its characters a line of attitude at
 * every beat; these are written from scratch for the same purpose.
 */

const POOLS: Record<string, string[]> = {
  win: [
    'Called it three moves ago.',
    'Diagonals are a personality type.',
    'Someone has been practising.',
    'The centre square. Always the centre square.',
    'That was never in doubt. Mostly.',
  ],
  lose: [
    'Well. That happened.',
    'Nine squares and not one of them helped.',
    'Beaten by a grid.',
    'Try the middle next time. Just a thought.',
    'A learning experience, allegedly.',
  ],
  draw: [
    'Two immovable objects.',
    'Nobody blinked.',
    'A perfectly balanced disagreement.',
    'Nine squares, zero winners.',
  ],
  taunt: [
    'Take your time. Really.',
    'I have seen this opening before.',
    'Bold. Wrong, but bold.',
    'You are thinking. I like that.',
    'Any day now.',
    'That corner is a trap, by the way.',
  ],
  waiting: [
    'Still nobody. Awkward.',
    'Send that link already.',
    'The board is not going to fill itself.',
  ],
};

export function quipFor(pool: keyof typeof POOLS | string, seed: string): string {
  const list = POOLS[pool] ?? POOLS.win;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

export function randomQuip(pool: keyof typeof POOLS | string): string {
  const list = POOLS[pool] ?? POOLS.taunt;
  return list[Math.floor(Math.random() * list.length)];
}
