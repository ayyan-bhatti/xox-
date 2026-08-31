/**
 * Hand-drawn brush strokes, generated.
 *
 * The reference draws its grid as four irregular, tapered white brush strokes
 * rather than straight rules, and redraws them each round so no two boards look
 * identical. These helpers produce the same effect as filled SVG paths: a
 * stroke is an outline that bulges in the middle and tapers at both ends, with
 * a little wobble along its length.
 */

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A tapered brush stroke from (x1,y1) to (x2,y2) as a closed path.
 *
 * @param width  peak thickness at the middle of the stroke
 * @param wobble how far the spine drifts off the straight line
 */
export function brushStroke(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  seed: number,
  wobble = 3,
): string {
  const r = rng(seed);
  const steps = 14;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // Unit normal — thickness is applied perpendicular to the spine.
  const nx = -dy / len;
  const ny = dx / len;

  const spine: { x: number; y: number; w: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Thickness envelope: fat in the middle, tapering to a point at each end.
    const taper = Math.sin(Math.PI * t) ** 0.55;
    const drift = (r() - 0.5) * wobble;
    spine.push({
      x: x1 + dx * t + nx * drift,
      y: y1 + dy * t + ny * drift,
      w: (width * taper * (0.82 + r() * 0.36)) / 2,
    });
  }

  const side = (sign: number) =>
    spine.map((p, i) => {
      const x = p.x + nx * p.w * sign;
      const y = p.y + ny * p.w * sign;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    });

  const forward = side(1);
  const back = side(-1).reverse().map((c) => c.replace('M', 'L'));
  return `${forward.join(' ')} ${back.join(' ').replace(/^L/, 'L')} Z`;
}

/** The four grid rules for a `size`×`size` board, as brush paths. */
export function gridStrokes(size: number, seed: number): string[] {
  const third = size / 3;
  const inset = size * 0.06;
  const jitter = (n: number) => (rng(seed + n)() - 0.5) * size * 0.035;

  return [
    // verticals
    brushStroke(third + jitter(1), inset + jitter(2), third + jitter(3), size - inset + jitter(4), size * 0.028, seed + 11),
    brushStroke(third * 2 + jitter(5), inset + jitter(6), third * 2 + jitter(7), size - inset + jitter(8), size * 0.028, seed + 22),
    // horizontals
    brushStroke(inset + jitter(9), third + jitter(10), size - inset + jitter(11), third + jitter(12), size * 0.028, seed + 33),
    brushStroke(inset + jitter(13), third * 2 + jitter(14), size - inset + jitter(15), third * 2 + jitter(16), size * 0.028, seed + 44),
  ];
}

/** A big loose X, used as a background watermark. */
export function brushX(cx: number, cy: number, r: number, seed: number): string[] {
  return [
    brushStroke(cx - r, cy - r, cx + r, cy + r, r * 0.42, seed, r * 0.09),
    brushStroke(cx + r, cy - r, cx - r, cy + r, r * 0.42, seed + 7, r * 0.09),
  ];
}

/** A loose O ring, used as a background watermark. Returned as a stroked path. */
export function brushO(cx: number, cy: number, r: number, seed: number): string {
  const rand = rng(seed);
  const pts: string[] = [];
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const rr = r * (0.93 + rand() * 0.14);
    pts.push(`${i === 0 ? 'M' : 'L'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `${pts.join(' ')} Z`;
}
