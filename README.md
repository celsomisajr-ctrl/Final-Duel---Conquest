# Final Duel: Conquest

Final Duel with two modes in one site:

- **Arena** (`/arena/`): the original 1v1 duel, carried over unchanged.
- **Conquest**: an original 5v5 mode on a three-lane map with minions, turrets, jungle monsters, hero levels, skill ranks, gold, recall, and two Cores. Destroy the enemy Core to win.

## Run it locally

You need [Bun](https://bun.sh) (build, tests, local server). No packages are installed.

```sh
bun run dev          # builds, then serves http://localhost:8787 with real WebSocket rooms
bun test             # simulation tests and real-network tests
bun run typecheck    # needs TypeScript (tsc) on your PATH
```

Open the page, enter a name, and choose **Play against bots** (the match runs in your browser, no server needed), or **Create a room** and share the 5-character code or invite link. Empty seats are filled by bots unless the host turns that off.

`LAG=120 bun src/server/local.ts` adds 120 ms of delay each way to try the game under latency.

## Controls

| | Desktop | Touch |
|---|---|---|
| Move | WASD or arrow keys | Drag on the left half of the screen |
| Skills | Q, E, R (or 1, 2, 3), aimed at the mouse | Tap a skill button (aims at the nearest enemy) |
| Rank up a skill | Shift + skill key, or the + button | The + button |
| Recall | B | Recall button |
| Shop / Scoreboard | P / hold Tab | Shop / Score buttons |

Basic attacks fire on their own at the nearest valid target. Stand still next to a jungle camp to attack it.

## Deploy

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#deployment). In short: `npx wrangler deploy` on a Cloudflare account with Durable Objects. `dist/` is committed, so no build step is needed.
