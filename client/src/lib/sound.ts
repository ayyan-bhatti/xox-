/**
 * SFX via Howler.
 *
 * There are no binary audio assets in this repo on purpose — every cue is a
 * short tone synthesised into a WAV data URI at module load and handed to
 * Howler. That keeps the bundle free of media, keeps the cues exactly as
 * specified in DESIGN_SPEC.md §5, and still routes playback through Howler's
 * pooling/unlock handling (which is the part that actually matters on iOS).
 *
 * Audio starts MUTED. The reference site's use of sound could not be verified,
 * so nothing plays until the user opts in via the header toggle.
 */

import { Howl, Howler } from 'howler';
import { prefersReducedMotion } from './motion';

const SR = 22050;

interface ToneSpec {
  /** [frequency Hz, duration seconds] segments played back to back. */
  segments: [number, number][];
  gain: number;
  /** Fractional attack/release applied to each segment to kill clicks. */
  shape?: 'blip' | 'click';
}

function encodeWav(samples: Float32Array): string {
  const bytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SR, true);
  view.setUint32(28, SR * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, bytes, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped * 0x7fff, true);
  }

  // btoa over a large string via chunks — avoids blowing the argument limit.
  const raw = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < raw.length; i += 0x8000) {
    binary += String.fromCharCode(...raw.subarray(i, i + 0x8000));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function synth(spec: ToneSpec): string {
  const total = spec.segments.reduce((n, [, d]) => n + Math.round(d * SR), 0);
  const out = new Float32Array(total);
  let cursor = 0;

  for (const [freq, seconds] of spec.segments) {
    const len = Math.round(seconds * SR);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const p = i / len;
      // Short attack, long-ish decay. 'click' is near-instant on both ends.
      const attack = spec.shape === 'click' ? Math.min(1, p / 0.05) : Math.min(1, p / 0.08);
      const release = Math.pow(1 - p, spec.shape === 'click' ? 1.2 : 2.4);
      const env = attack * release;
      // Sine plus a quiet third harmonic — reads as "digital" rather than "beep".
      const wave = Math.sin(2 * Math.PI * freq * t) + 0.18 * Math.sin(2 * Math.PI * freq * 3 * t);
      out[cursor + i] = wave * env * spec.gain;
    }
    cursor += len;
  }
  return encodeWav(out);
}

const SPECS: Record<string, ToneSpec> = {
  tick: { segments: [[1400, 0.012]], gain: 0.1, shape: 'click' },
  placeX: { segments: [[196, 0.09]], gain: 0.3 },
  placeO: { segments: [[294, 0.09]], gain: 0.3 },
  win: {
    segments: [
      [523, 0.11],
      [784, 0.24],
    ],
    gain: 0.3,
  },
  draw: {
    segments: [
      [349, 0.13],
      [349, 0.2],
    ],
    gain: 0.24,
  },
  join: { segments: [[659, 0.22]], gain: 0.28 },
};

export type Cue = keyof typeof SPECS;

const howls: Partial<Record<Cue, Howl>> = {};
let built = false;

function build() {
  if (built) return;
  built = true;
  for (const key of Object.keys(SPECS) as Cue[]) {
    howls[key] = new Howl({ src: [synth(SPECS[key])], format: ['wav'], preload: true });
  }
}

const STORAGE_KEY = 'trio:muted';
let muted = true;

export function initSound(): void {
  try {
    // Default is muted; only an explicit stored "false" unmutes.
    muted = localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    muted = true;
  }
  Howler.mute(muted);
  if (!muted) build();
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  if (!muted) build();
  Howler.mute(muted);
  try {
    localStorage.setItem(STORAGE_KEY, String(muted));
  } catch {
    /* private mode — the setting just won't persist */
  }
}

export function play(cue: Cue): void {
  if (muted) return;
  // Sound is part of the motion design; if motion is suppressed, so is audio.
  if (prefersReducedMotion()) return;
  build();
  howls[cue]?.play();
}
