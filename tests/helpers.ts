import { CFG } from '../src/core/shared/config';
import type { RosterEntry, World } from '../src/core/shared/types';
import { step } from '../src/core/simulation/systems';
import { HERO_KEYS } from '../src/entities/heroes';

export function roster(n = 10, bots = true): RosterEntry[] {
  return Array.from({ length: n }, (_, i) => ({ pid: i, name: 'P' + i, cls: HERO_KEYS[i % 5], team: (i % 2) as 0 | 1, bot: bots }));
}
/** Runs the simulation for `secs` of game time, discarding events. */
export function run(w: World, secs: number) { const n = Math.round(secs * CFG.tickRate); for (let i = 0; i < n && w.winner < 0; i++) { step(w); w.events.length = 0; } }
