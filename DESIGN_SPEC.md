# DESIGN SPEC

Internal design spec for **TRIO** — a fast, animated tic-tac-toe with three modes.

The visual language follows the reference experience at `xox.makemepulse.com`. Unlike the
first pass at this spec, everything below was **measured directly from the live site** in a
real browser — computed styles, the compiled stylesheet, the loaded font set, and driven
screenshots of the intro, avatar builder, VS reveal, board and result screens.

Values are tagged **[observed]** (read off the reference) or **[authored]** (my decision).

---

## 0. What the reference actually is

Worth stating plainly, because the secondary sources (award listings, press) describe it
inaccurately:

| | Reference reality **[observed]** |
| --- | --- |
| Background | Bright **pink `#FFBBFF`**, not dark mode. Flips to **navy `#204A78`** on the opponent's turn and to a third colour on the result screen (**cyan `#83ECFF`** on defeat). |
| Rendering | A single full-viewport WebGL canvas. `<body>` has exactly one `<div>` child; there is no DOM UI at all. |
| Marks | **Not X and O.** Each player's cartoon avatar head is stamped into the cell, with a coloured rim (cyan for one side, lime for the other). |
| Grid | Four **hand-drawn white brush strokes** — irregular, tapered, wobbling, and slightly rotated. Redrawn between rounds. |
| Type | `Bangers` + `Poppins` (both free Google fonts) + `a_aksi_mosi`, a proprietary heavy brush face. |
| Cursor | A small magenta dot. |
| Audio | A Howler audiosprite: `game_audio.mp3` + `game_audio.json`. |
| Flow | Preloader → welcome → avatar builder → VS reveal → board → result, with `SHARE` / `MY AVATAR` / `MEET THE TEAM` pills. |

**Note on the palette.** The reference's own colours were used in an earlier pass and have
since been replaced at the user's request with the "Dusk" palette in §1. What is still
taken from the reference is the *structure*: a full-screen colour flip as the turn signal,
brush-stroke grid, avatar-as-mark, pill and speech-bubble furniture, and the easing curves.

### What was deliberately not copied

- **Their character artwork.** ~70 sprite PNGs (`B0–B9`, `E0–E9`, `H1–H14`, …) make up their
  avatar system. All faces here are generated from scratch in SVG — see §3.
- **`a_aksi_mosi`**, their display face — a proprietary font file. Replaced with **Lilita One**
  (free, OFL), skewed −7° to get the same slanted-brush energy.
- **Their brand**: the XOX name, the makemepulse wordmark, real team members' names, roles,
  photos and quips. All copy here is original.

Everything else — palette, easing curves, the turn-driven background flip, the brush grid,
avatar-as-mark, pill/speech-bubble furniture, the split headline, the result starburst — is
rebuilt to match.

---

## 1. Colour — "Dusk" **[authored]**

The reference's own palette (pink `#FFBBFF`, magenta `#FF34FF`, navy `#204A78`, cyan
`#83ECFF`, lime `#97F935`, yellow `#FFD426`) was used in an earlier pass and then
replaced at the user's request. It also had a concrete defect: white display type on
`#FFBBFF` measures about **1.3:1**, so the headline that carries the turn signal was
barely legible, which is a large part of why the result looked cheap.

The replacement keeps the structural idea — the whole background flips colour to signal
state — but puts every stage in a **narrow mid-dark luminance band**, so cream type keeps
its contrast no matter which one is showing.

| Token | Hex | Role |
| --- | --- | --- |
| `--cream` | `#FBF7F0` | display type, grid, cards, pills |
| `--ink` | `#16181F` | text on cream |
| `--indigo` / `--indigo-soft` | `#2B3A6B` / `#35437A` | stage — your turn / player one |
| `--plum` / `--plum-soft` | `#4A2F63` / `#573872` | stage — their turn / player two |
| `--jade` / `--jade-soft` | `#146B57` / `#1B7C66` | stage — win |
| `--rose` / `--rose-soft` | `#9E3355` / `#B03D60` | stage — defeat |
| `--slate` / `--slate-soft` | `#46505F` / `#525D6E` | stage — draw |
| `--orchid` / `--orchid-soft` | `#6A3A8C` / `#78449C` | stage — waiting / disconnected |
| `--amber` | `#F5B944` | player one's rim, win stroke, sound-on, code |
| `--turquoise` | `#4FD1C5` | player two's rim, connection beat |
| `--coral` | `#FF7A5C` | burst, focus ring, accent pill, the wordmark dot |

Measured contrast of `--cream` against each stage:

| Stage | Ratio | |
| --- | --- | --- |
| indigo | 10.2:1 | AAA |
| plum | 10.5:1 | AAA |
| draw slate | 7.6:1 | AAA |
| orchid | 7.6:1 | AAA |
| rose | 6.4:1 | AA |
| jade | 6.0:1 | AA |

`Stage.tsx` owns the swap and writes `--stage` / `--stage-soft` onto `:root`; everything
else reads those. Its tones are named **semantically** (`p1`, `p2`, `win`, `lose`, `draw`,
`alert`) rather than by colour, so the palette can move again without touching a page.
Pill tones follow the same rule (`cream`, `accent`, `outline`).

Two rules fall out of the system:

- The two player rims are **warm against cool** (amber / turquoise), so the sides stay
  distinguishable without relying on hue discrimination alone.
- The result screen draws its face with a **cream** rim, not the player's identity
  colour — an amber rim on a stage that competes with it disappears. Identity is carried
  by the eyebrow pill and the score chips instead.

Depth is soft and directional (`--shadow-card`, `--shadow-pill`, `--shadow-face`) rather
than the flat hard-offset blocks of the earlier pass, which read as a sticker.

---

## 2. Type

| Role | Face | Source |
| --- | --- | --- |
| Display (`.hero`, `.display`, `.title`) | **Lilita One**, skewed −7° | **[authored]** substitute for their proprietary `a_aksi_mosi` |
| UI — buttons, pills, labels | **Bangers** | **[observed]** — same face the reference uses |
| Body copy | **Poppins** | **[observed]** — same face the reference uses |

Scale **[authored]**: `--t-hero` `clamp(4rem, 15vw, 12rem)`, `--t-display` `clamp(2.75rem, 9vw, 7rem)`,
`--t-title` `clamp(1.75rem, 5vw, 3rem)`, body `1rem`. Display line-height `0.86`.

The result word overrides this at `clamp(5rem, 24vw, 16rem)` — it sits *behind* the burst and
the face, so it must be meaningfully wider than the burst or only its outer letters show. The
reference's word:burst width ratio is ≈1.32; this build measures ≈1.31.

---

## 3. The avatar system **[authored]**

`Face.tsx` generates a cartoon head deterministically from a seed string: skin gradient, hair
colour and style (curls / bowl / buzz / puff / side / bald), eye style with **square pupils**
(the reference's most distinctive facial cue), brows, nose, mouth, and an extra
(freckles / blush / earring / stubble). Four moods — `idle`, `happy`, `sad`, `smug` — drive the
eyes and mouth, so the same face can celebrate or cry on the result screen.

The coloured rim is drawn by painting the silhouette group **twice**: once behind with a fat
stroke *and* fill in the rim colour, so the seams between the overlapping hair blobs disappear
and only the outer edge shows; then the real face on top. A second, wider, 30%-opacity pass
supplies the outer glow.

Two art rules learned by looking at the rendered output:

1. **Front hair is painted before the features, never after.** Painting it last let a fringe
   cover an eye and the face stopped reading.
2. **The viewBox is cropped to `25 27 150 150`**, not the nominal `0 0 200 200`. On the full art
   board the head occupies under half the frame and reads as a tiny dot once scaled into a cell.

Player one is always lime-rimmed, player two always cyan — the only identity convention shared
across all three modes.

---

## 4. The brush grid **[authored, matching observed behaviour]**

`brush.ts` generates tapered strokes: a spine sampled in 14 steps with per-step wobble, a
`sin(πt)^0.55` thickness envelope so the stroke is fat in the middle and tapers to a point at
both ends, and per-step thickness jitter. Peak width is `2.8%` of the board.

The four grid rules are regenerated from a per-round seed, and the whole board carries a small
per-round rotation (±3.5°) — so no two boards are identical, as on the reference. Background
watermarks use the same generator for loose Xs and Os.

The win stroke is a brush path too, so it cannot be revealed with a dash offset. It is instead
**painted on by regenerating its geometry every frame** as GSAP tweens a 0→1 parameter.

---

## 5. Motion

### Easings **[observed]**

Read verbatim from the reference stylesheet and registered with GSAP `CustomEase`, so the
JS choreography and the CSS transitions share one set of curves:

```
--e-out:        cubic-bezier(0,     0,     0.2,  1)
--e-inout:      cubic-bezier(0.4,   0,     0.2,  1)
--e-smooth:     cubic-bezier(0.26,  1,     0.48, 1)
--e-anticipate: cubic-bezier(0.6,  -0.28,  0.73, 0.04)
--e-back:       cubic-bezier(0.17,  0.89,  0.32, 1.27)
--e-back-full:  cubic-bezier(0.68, -0.55,  0.27, 1.55)
--e-expo:       cubic-bezier(0.66,  0,     0,    1)
```

`--e-back` is the signature overshoot — every mark, pill and bubble lands on it.

### Durations **[authored]**

| Beat | ms |
| --- | --- |
| Stage colour swap | **700**, `--e-smooth` |
| Mark stamp in | **420**, `--e-back`, from `scale 0, rotate −22°` |
| Stamp squash on impact | **180**, scaleY 1→0.9→1 / scaleX 1→1.08→1 |
| Hover ghost | in **160** `--e-back`, out **120** |
| Grid draw-in | **600** per stroke, **80** stagger, `--e-back` |
| Win stroke paint | **480**, `--e-expo`, after a **200** hold |
| Winner pop | **340**, scale 1→1.18→1.06, **60** stagger |
| Loser recede | **320** to 35% opacity, scale 0.86 |
| Headline swap | **280** in, ±70px, `--e-back` |
| Result takeover | **460**, **60** stagger, `--e-back` |
| Burst in | **550**, `--e-back`, then a 90s idle rotation |
| Board clear | **220** per mark, **35** reverse-index stagger, `--e-anticipate` |
| Computer "thinking" | **420–1160** by difficulty, so its reply never lands on the same frame as yours |

### Reduced motion

All durations collapse to ~0 (GSAP `globalTimeline.timeScale(1000)`, so `onComplete` callbacks
still fire and nothing gets stranded); the stage colour keeps a 160ms fade so the turn signal
survives; audio is suppressed. **No functionality is gated behind an animation completing** —
verified: with reduced motion forced, a full game still resolves and the result renders at
opacity 1.

---

## 6. Layout **[authored]**

4px spacing base (`--s-1` … `--s-9`). Shell is `header / body`; each game screen is
`top pill / board / footer`.

The board is sized on the **block axis** — `height: min(72vmin, 520px)`, `aspect-ratio: 1`,
`max-height: 100%`, `flex-shrink: 1` — so it shrinks to fit a short viewport instead of
overflowing into the header. Portrait phones get `min(88vmin, 520px)`: there, `vmin` is the
narrow width, and 72vmin leaves the board marooned in a tall viewport.

The two flanking headline words are hidden below 900px, where there is no room beside the board.

Verified with no overlap and no horizontal overflow at **1440×900, 1280×800, 1280×600,
1024×768, 768×1024, 390×844 and 360×640**. Smallest cell measured: **92px**, against a 44px
minimum.

---

## 7. Sound **[authored]**

The reference ships an audiosprite; whether and when it plays could not be fully mapped, so
audio here is **opt-in and starts muted**, toggled by the three-bar control in the header
(mirroring the reference's own corner affordance) and persisted to `localStorage`. Cues are
synthesised to WAV data URIs at load and played through Howler — no binary audio in the repo.
All cues are suppressed under reduced motion.

---

## 8. Accessibility

- Full keyboard play: arrow keys move a roving focus, Enter/Space commits, row-wrapping blocked.
- `role="grid"` / `role="gridcell"`, per-cell labels naming the *player* ("row 2, column 3, You").
- One polite live region announces turn, connection and result changes.
- The huge result word is `aria-hidden`; a `role="status"` paragraph carries the real text.
- Score chips use colour **and** number, and are wrapped in an `aria-label` that spells the
  score out.
- Focus ring: 3px magenta at 3px offset, never removed.
- Minimum touch target 44px; smallest actual cell 92px.
