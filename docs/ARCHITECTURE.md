# Architecture

## Layers

```
src/core/shared/        types, tunable rules (config.ts), math. No DOM, no network.
src/entities/           data: heroes and skills, buffs, minions, structures, monsters, items
src/maps/conquest/      the battlefield: lanes, turrets, camps, obstacles, collision
src/core/simulation/    world.ts (state, damage, rewards), systems.ts (the tick),
                        skills.ts (commands + skill interpreter), bots.ts
src/core/networking/    protocol.ts (wire format), snapshot.ts (per-client view), room.ts (lobby + match)
src/server/             worker.ts (Cloudflare Worker + Durable Object), local.ts (Bun dev/test server)
src/modes/conquest/     client.ts (connection, interpolation, prediction)
src/rendering/          gl.ts (WebGL2 renderer), models.ts (hero and minion figures ported from the Arena),
                        scene.ts (what to draw: units, effects, particles, overlay)
src/ui/                 hud.ts, input.ts, app.css
public/arena/           the 1v1 game, unchanged
```

The simulation never imports rendering, UI or network code. The same `Room` class runs in three hosts: a Cloudflare Durable Object (production), the Bun server (local play and tests), and inside the browser for solo matches against bots.

## Simulation

- Fixed timestep, 30 ticks per second (`CFG.tickRate`). `step(world)` advances exactly one tick.
- Gameplay only changes through five validated commands: move, cast, rank up, recall, buy. Bots use the same commands.
- All hit points, XP and gold change in `world.ts` (`damage`, `kill`, `giveXp`). `kill` pays rewards once; a second call on the same unit does nothing.
- Heroes, skills, buffs, units, items, camps and all match rules are data (`src/entities`, `src/maps`, `config.ts`).

Rules worth knowing: an inner turret cannot be damaged while its lane's outer turret stands; a Core cannot be damaged until one of its team's inner turrets has fallen; heroes deal 35% damage to structures with no allied minions nearby; turrets shoot minions first and ramp damage on a hero; a hero who hurts an enemy hero under that hero's turret draws its fire; the enemy Sanctuary burns intruders.

## Multiplayer

Server-authoritative. Clients send commands and render snapshots; they never report positions, damage, XP or gold.

- **Transport:** JSON over WebSocket, one socket per player, `/ws/<ROOM CODE>`.
- **Snapshots:** 15 per second. Each client receives full rows only for units within 46 units of its hero, plus hero positions for the minimap, quantised integers, structure health only when it changes, scoreboard once a second. Measured at about 9 KB/s per client with ten clients.
- **Client:** remote units are interpolated between snapshots. The local hero's movement is predicted with the same collision code as the server and blended toward the server's position from one round trip earlier (it snaps if the error is large). There is no full input replay.
- **Validation:** message size cap, JSON shape checks, per-player sequence numbers that must increase (replays are dropped), 60 commands/second rate limit, movement vector clamped to length 1, and every command checked against server state (cooldown, mana, rank, level, alive, gold, location).
- **Seats:** a player's seat is tied to a secret token. On disconnect a bot plays the hero; rejoining with the token restores control and all progress. A room with nobody connected is discarded after 90 seconds.
- **Lobby:** private rooms by 5-character code, up to ten players, balanced team assignment, team switch, hero pick, ready state, host start, optional bot fill. After a match the room returns to the lobby with progression cleared.

## Deployment

`wrangler.jsonc` deploys one Worker: static files from `dist/`, `/ws/*` routed to a `ConquestRoom` Durable Object named by the room code, and `/turn` (Arena's relay) forwarded to the existing `final-gate-turn` Worker through a service binding.

- Static hosting alone (GitHub Pages) can serve Arena and solo Conquest, but not online Conquest rooms. Those need the Durable Object.
- Durable Objects on the Workers Free plan require the SQLite-backed class used here (`new_sqlite_classes`). A room keeps its Durable Object active for the whole match, which counts against the plan's daily Durable Object duration and request allowances. Check current limits and pricing before opening it to many players.
- Match state is held in memory. If Cloudflare restarts the object (for example on a new deploy), matches in progress are lost.
- The `final-gate-turn` service binding must exist in the account or the deploy fails; remove the `services` entry if you do not need Arena's relay here.

Build: `bun run build` writes `dist/` (committed). Deploy: `npx wrangler deploy`.

## Tests

- `tests/sim.test.ts`: lanes and waves, structure protection, turret targeting, XP and ranks, skills, death and respawn, sanctuary, recall, shop, jungle leash and respawn, buffs, epic rewards, duplicate-reward prevention, and a full bot match to a Core kill.
- `tests/net.test.ts`: a real server and real WebSocket clients on localhost. Ten-player lobby and start, state agreement, command validation and forged messages, replay rejection, flood limiting, bandwidth, disconnect and reconnect, 120 ms added latency, and match end.

## Known limitations

- Not yet run on Cloudflare; the Durable Object host is type-checked and shares the tested `Room`, but the deploy itself is unverified.
- No fog of war: enemy heroes always show on the minimap.
- Bots lane, fight, retreat, recall and shop, but do not jungle or contest epic monsters.
- No matchmaking, accounts, spectators or chat. No sound in Conquest.
- Skills are quick-cast with no range preview. Touch casting auto-aims.
- Heroes use the Arena's jointed figures and poses. Skill animations are driven by server events and are shorter and simpler than the Arena's hand-timed sequences (for example Blade Punishment and Leap Strike). Jungle monsters are still simple shapes.
- Rendering performance has only been measured with a software renderer.
