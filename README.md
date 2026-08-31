# TRIO

A fast, animated tic-tac-toe in three modes:

- **Same device** — two people, pass and play.
- **vs Computer** — one player against minimax, at three difficulties.
- **Online** — create a room, send the link, play live against anyone.

Instead of X and O, each player is a generated cartoon face stamped into the cell,
and the whole background colour flips to signal whose turn it is.

The UX and motion language are modelled on [xox.makemepulse.com](https://xox.makemepulse.com/).
Palette, easing curves and type pairing were measured from the live site; all code,
artwork and copy here are original. See [`DESIGN_SPEC.md`](./DESIGN_SPEC.md) for what
was observed, what was authored, and what was deliberately not copied.

---

## Quick start

Requires **Node 20+**.

```bash
npm install     # installs both workspaces
npm run dev     # client on :5173, realtime server on :8787
```

Open <http://localhost:5173>. That's it — no env vars, no database, no accounts.

| Command | What it does |
| --- | --- |
| `npm install` | Installs `client` and `server` (npm workspaces) |
| `npm run dev` | Runs both dev servers together |
| `npm run dev:client` / `npm run dev:server` | Run one side on its own |
| `npm run build` | Type-checks and builds the client to `client/dist` |
| `npm test` | Runs the whole suite (client + server) |
| `npm run test:client` / `npm run test:server` | Run one suite |
| `npm run typecheck` | Type-checks both workspaces |
| `npm start` | Runs the server in production mode |

The Vite dev server proxies `/socket.io` to `localhost:8787`, so the browser talks
to one origin and CORS never comes into it.

---

## Layout

```
.
├── client/                  # React + TypeScript + Vite
│   └── src/
│       ├── components/       # Board, Face, Stage, GameView, Chrome, ResultScreen, brush
│       ├── pages/            # Landing, LocalGame, SoloGame, OnlineGame
│       ├── game/             # test suites for the engine and the AI
│       ├── lib/              # ai (minimax), motion, looks, quips, sound, socket, identity
│       ├── store/            # Zustand stores: local, solo, online
│       └── styles/           # design tokens + base layer
├── server/                  # Node + Express + Socket.IO
│   └── src/
│       ├── server.ts         # builds the HTTP + Socket.IO server (no side effects)
│       ├── index.ts          # process entry point
│       ├── rooms.ts          # room store: seats, moves, rematch, cleanup
│       └── socket/handlers.ts# all realtime event wiring
└── shared/                  # imported by BOTH sides
    ├── game.ts               # the rules engine — the single source of truth
    └── protocol.ts           # the wire contract
```

**Why `shared/` rather than a copy in each side.** The brief allows the engine to be
shared or mirrored. Sharing it means the server cannot drift from the client on what
counts as a win or a legal move — the class of bug that mirroring invites. The client
reaches it through a `@shared/*` alias (Vite + tsconfig paths); the server imports it
directly.

---

## The three modes

Routes: `/` (menu), `/local`, `/solo`, `/play/:roomId`.

### Same device
Two players alternate on one screen. The stage colour flips indigo ↔ plum each turn, so
whose go it is is readable from across the room, and the player bar names who is up. Win, draw, restart, and a running
score across rematches.

### vs Computer
Entirely local — no network, no external service. You are the amber face and play X;
the computer is turquoise and plays O.

| Level | Behaviour |
| --- | --- |
| Chill | 55% chance of ignoring the best positional move |
| Sharp | 18% chance |
| Ruthless | Full minimax, no slop — it cannot lose |

Three things worth knowing about the implementation:

1. **Tactics are never skipped, at any level.** Before the slop roll, the AI checks for
   an immediate win, then an immediate block. An opponent that walks past a win already
   on the board reads as broken rather than easy, so those two cases are always played
   perfectly and the levels differ only in positional judgement.
2. **Depth is scored.** Minimax subtracts depth from wins and adds it to losses, so the
   search prefers winning sooner and losing later. Without that the AI stalls won games
   and walks into early losses.
3. **The reply is on a timer** (400–700ms), not inline. An instant answer lands on the
   same frame as your own mark and flattens the pacing. The board is locked while it
   thinks, with an animated cue.

Ties for the best score are pooled and picked from at random, so openings vary.

### Who is who

Marks on the board are generated faces, not X and O glyphs, so a persistent
`PlayerBar` above the board states the pairing outright: each player's face,
their name, the seat they play (**X** or **O**), their score, and a pulsing dot
on whoever is to move. The active chip picks up that player's own rim colour —
the same colour their face carries on the board. Player one is always amber,
player two always turquoise (warm against cool, so the sides never depend on hue
discrimination alone). A visually-hidden live region says it in a sentence:
*"You are player O. It is Them's turn, playing X."*

### Online
Create Game → server mints a room code → waiting screen with the link and a copy button
→ opponent joins → play → rematch or leave.

**The server is the only authority.** The client proposes a move and renders nothing
until the server broadcasts the committed board. Every move is validated against: the
room exists, this socket holds a seat, both seats are occupied, the game is still
running, it is this player's turn, and the cell is empty and in range. Anything else is
rejected with a typed error and the offending client is resynced, so a rejection can
never leave a board stuck.

- **Room codes** are 6 characters from a 30-symbol alphabet with `O/0`, `I/1` and `S/5`
  removed, so they survive being read aloud. That is ~730M combinations.
- **Identity** is a per-browser token in `localStorage`. The server maps token → seat;
  a client-declared symbol is never trusted.
- **Reconnect**: presenting the same token reclaims the same seat. One rule covers
  refresh, tab restore and socket drop. The seat is held for a **2-minute grace window**.
- **Disconnects** show the remaining player "Opponent disconnected" with a live
  countdown and a way out. The UI is never left stuck.
- **Rematch** needs both players; seats swap each round so X alternates, and each score
  travels with its player rather than staying with the seat.
- **Cleanup**: a sweep every 15s drops rooms once everyone has been gone past the grace
  window, and expires rooms idle for 45 minutes.

---

## Error states

Every failure has a real message and an exit:

| Situation | What you see |
| --- | --- |
| Invalid or expired code | "That room does not exist, or it has already expired." + Back to menu |
| Room already has two players | "That game already has two players in it." + Back to menu |
| Server unreachable on create | "Could not reach the game server. Check your connection and try again." — persistent, with the button re-enabled |
| Move never acknowledged | "That move did not reach the server. Try again." + board released |
| Reconnect stalls | "Reconnecting is taking a while…" — the live game is kept |
| Connection lost | "Connection lost, reconnecting" + Leave |
| Opponent disconnected | "Opponent disconnected, back in m:ss" + New game |
| Room expired while open | "Room closed" + Back to menu |
| Illegal move | Rejected server-side, client resynced from authoritative state |

---

## Testing

```bash
npm test
```

**Client (Vitest, 69 tests)** — `client/src/game/`

- Every one of the 8 winning lines (3 rows, 3 columns, 2 diagonals) for **both** X and O
- Draw detection, and that a nearly-full board is not called a draw
- Move legality: occupied cells, out of turn, after a win, after a draw, out-of-range
  and non-integer indices
- `applyMove` purity (no mutation of the input board)
- AI: never picks an occupied cell, returns null on a finished game, **takes an
  immediate win**, **blocks an immediate loss**, and prefers its own win over blocking —
  each asserted 60× per difficulty because the choice is randomised
- **Ruthless is unbeatable**: an exhaustive search of every human line, from both first
  and second move, asserting the human never wins
- Thinking delay stays inside the 400–700ms budget
- `online.test.ts` drives the online store against a socket whose ack is never
  called, pinning the fix for the hang described under **Reliability** below:
  create/join give up with an error, a stalled reconnect keeps the live game,
  a submitted move releases the board, and a stale timeout cannot clear a newer
  pending cell

**Server (node:test, 50 tests)** — `server/src/`

- `rooms.test.ts`: code format and uniqueness, seating, third-player rejection, all move
  validation paths, rematch agreement and seat-swap, presence/grace/leave, sweep
- `handlers.test.ts`: real Socket.IO integration — boots a server on an ephemeral port
  and drives real client sockets through create, join, rejection, move broadcast,
  out-of-turn and occupied-cell rejection, resync-after-rejection, game completion sync,
  rematch, disconnect notification, token reconnect, deliberate leave, and `/healthz`
- edge cases: two players racing for the last seat (exactly one is seated, the
  other gets `room-full`), a code that expired while nobody was watching, an
  opponent closing their tab mid-game (board survives, remaining player cannot
  move on), a seat handed to a stranger once the dropped player's grace lapses,
  the same token opening a second tab, and a rematch request from a socket with
  no seat

---

## Reliability: the request timeout

`socket.emit(event, payload, ack)` **buffers** the packet while the socket is
disconnected and never invokes the acknowledgement. With the server unreachable
that produced three dead ends, none of them recoverable without a reload:

| Action | Old behaviour |
| --- | --- |
| Create online game | card stuck disabled on "Opening…" forever, no error |
| Open a room link | stuck on "Connecting to the game server." forever |
| Submit a move | `pending` never cleared, board locked forever |

Every request now races an 8s timer (`ACK_TIMEOUT_MS` in `useOnlineGame.ts`) and
reports the failure. One nuance worth keeping: a stalled *reconnect* only shows a
warning rather than tearing down the room, because the game is still perfectly
valid — it is only the refresh that failed.

## Deployment

**Two services (recommended).** Static-host `client/dist` anywhere; run the server on a
Node host. Set `CLIENT_ORIGIN` on the server to the frontend origin, and
`VITE_SERVER_URL` at client build time to the server origin.

```bash
npm run build
CLIENT_ORIGIN=https://your-frontend.example npm start
```

**One service.** Build the client, then let the server serve it too:

```bash
npm run build
SERVE_CLIENT=true PORT=8080 npm start
```

The SPA fallback is wired, so `/play/ABC123` resolves on a hard refresh.

| Env var | Side | Meaning |
| --- | --- | --- |
| `PORT` | server | Listen port (default 8787) |
| `CLIENT_ORIGIN` | server | Comma-separated allowed origins for CORS |
| `SERVE_CLIENT` | server | `true` to also serve `client/dist` |
| `VITE_SERVER_URL` | client (build) | Socket server origin when hosted separately |

---

## Accessibility

- Full keyboard play: Tab reaches the board in 3 stops, arrow keys move a roving focus
  (row-wrapping blocked), Enter/Space commits.
- `role="grid"` / `role="gridcell"`, with labels naming the player: "row 2, column 3, You".
- Turn, connection and result changes announce through polite live regions.
- The huge result word is `aria-hidden`; a `role="status"` paragraph carries the text.
- State is never colour-only — every stage colour is paired with a text status.
- Focus ring is 3px magenta at 3px offset and is never removed.
- Verified at 1920×1080, 1440×900, 1024×768, 768×1024, 430×932 and 375×667: no overlap,
  no horizontal scroll, smallest cell 117px against a 44px minimum.
- `prefers-reduced-motion` collapses all movement; the stage colour keeps a short fade
  so the turn signal survives. No functionality waits on an animation.

---

## Known limitations

- **Rooms live in memory.** A server restart clears them, and running more than one
  instance needs a shared adapter (e.g. `@socket.io/redis-adapter`). Fine for one
  process; deliberately not over-built.
- **Animation timings are authored, not measured.** The reference's palette, easings,
  fonts and colour-flip behaviour were read off the live site, but its durations live
  inside a WebGL bundle. `DESIGN_SPEC.md` tags every value `[observed]` or `[authored]`.
- **No component/DOM tests.** The engine, the AI and the server are covered; the React
  layer is verified by driving a real browser rather than by unit tests.
