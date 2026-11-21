# Taash — card games with friends

Next.js (App Router) + Tailwind, mobile-first. No sign-up: pick a guest name, share the table link, play in real time with friends or computer players (F1, F2…).

**Games**
- **Teen Patti**: Classic or **Joker** mode (a turned-up card's rank is wild).
- **Bluff**: claim cards face down, call out the liars.
- **Color Rush**: an original color-matching shedding game (skip, reverse, +2, wilds, "Last card!").

## Run

```bash
bun install      # or npm install
bun dev          # http://localhost:3000
```

For friends on the same Wi-Fi, share the `Network:` URL that `next dev` prints (e.g. `http://192.168.x.x:3000/room/ABC123`).

## How it works

- `src/lib/core.ts`: shared types (players, rooms, the `Engine` interface every game implements).
- `src/lib/rooms.ts`: in-memory room store, join/leave, host actions, computer players, timers.
- `src/lib/games/teenpatti.ts`, `bluff.ts`, `colorrush.ts`: one module per game (rules, bots, per-player views).
- `src/lib/cards.ts`: standard deck + Teen Patti hand ranking (with joker/wild scoring).
- `src/app/api/rooms/**`: route handlers (create, join, poll state, act). Each guest has a secret token in `localStorage`; hidden cards never reach other browsers.
- `src/components/game/*Table.tsx`: one table UI per game; `src/app/room/[id]/RoomClient.tsx` is the shared room shell. Clients poll every second.

**Adding a game**: write an `Engine` in `src/lib/games/`, register it in `ENGINES` (`rooms.ts`), add it to `src/lib/catalog.ts`, and render its table in `RoomClient.tsx`.

## Settings (environment variables)

| Variable | What it does |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Your public address, e.g. `https://teenpatti.yourdomain.com`. Used for link previews on WhatsApp etc. |
| `NEXT_PUBLIC_BMC_USERNAME` | Your buymeacoffee.com username. Shows the "☕ Buy me a coffee" button; hidden when unset. |

Locally, put them in `.env.local`. On Railway, add them under **Variables** and redeploy. Both are baked in at build time, so a change needs a new build.

## Logo

All icons (favicon, Apple touch icon, PWA icons, share preview) are generated from one SVG: `node scripts/logo.mjs`.

## Deploying

Game state lives in the server's memory, so run it as a single long-lived Node process (`bun run build && bun run start`, a VPS, Railway, Render, Fly…). Serverless hosts like Vercel run many short-lived instances, so tables won't be shared reliably there; you'd need Redis or similar for that.
