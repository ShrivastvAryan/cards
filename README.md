# Teen Patti — multiplayer with friends

Next.js (App Router) + Tailwind. No sign-up: players pick a guest name, the host shares the table link, everyone plays in real time.

## Run

```bash
bun install      # or npm install
bun dev          # http://localhost:3000
```

For friends on the same Wi-Fi, share the `Network:` URL that `next dev` prints (e.g. `http://192.168.x.x:3000/room/ABC123`).

## How it works

- `src/lib/cards.ts` — deck, shuffling, hand ranking (Trail › Pure sequence › Sequence › Color › Pair › High card; A-K-Q top, A-2-3 second).
- `src/lib/game.ts` — in-memory room/game engine: boot, blind/seen chaal, raise, pack, show, side show, 30s turn timer, auto next hand, rebuy.
- `src/app/api/rooms/**` — Route Handlers (create, join, poll state, act). Each guest gets a secret token kept in `localStorage`; other players' cards are never sent to the browser until showdown.
- `src/app/room/[id]` — the table UI. It polls the server every second.

## Deploying

Game state lives in the server's memory, so run it as a single long-lived Node process (`bun run build && bun run start`, a VPS, Railway, Render, Fly…). Serverless hosts like Vercel run many short-lived instances, so tables won't be shared reliably there; you'd need Redis or similar for that.
