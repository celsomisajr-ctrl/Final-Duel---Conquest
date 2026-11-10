import { test, expect } from 'bun:test';
import { CFG } from '../src/core/shared/config';
import { NEUTRAL } from '../src/core/shared/types';
import { createWorld, damage, giveXp, heroByPid, kill, structVulnerable } from '../src/core/simulation/world';
import { step } from '../src/core/simulation/systems';
import { buyItem, castSkill, rankUp, setMove, startRecall } from '../src/core/simulation/skills';
import { SPAWN, CORE, CAMPS } from '../src/maps/conquest/map';
import { roster, run } from './helpers';

const solo = () => createWorld(roster(2, false), 1); // pid 0 = Blue swordsman, pid 1 = Red brawler, no bots

test('Phase 1: waves spawn on three lanes and walk toward the enemy Core', () => {
  const w = solo(); run(w, CFG.waveFirst + 1);
  const m = [...w.units.values()].filter((u) => u.kind === 'minion');
  expect(m.length).toBe(2 * 3 * (CFG.waveMelee + CFG.waveRanged));
  expect(new Set(m.map((u) => u.lane)).size).toBe(3);
  const d0 = m.filter((u) => u.team === 0).map((u) => Math.hypot(u.x - CORE[1].x, u.y - CORE[1].y));
  run(w, 10);
  const d1 = m.filter((u) => u.team === 0).map((u) => Math.hypot(u.x - CORE[1].x, u.y - CORE[1].y));
  expect(d1.every((d, i) => d < d0[i])).toBe(true);
});

test('Phase 1: turret and Core protection rules, and Core destruction ends the match', () => {
  const w = solo(), hero = heroByPid(w, 0)!;
  const core = w.structures.find((s) => s.kind === 'core' && s.team === 1)!;
  const outer = w.structures.find((s) => s.kind === 'turret' && s.team === 1 && s.lane === 1 && s.tier === 1)!;
  const inner = w.structures.find((s) => s.kind === 'turret' && s.team === 1 && s.lane === 1 && s.tier === 2)!;
  expect(structVulnerable(w, core)).toBe(false);
  expect(structVulnerable(w, inner)).toBe(false);
  expect(damage(w, hero, inner, 500)).toBe(0);
  expect(damage(w, hero, core, 500)).toBe(0);
  expect(damage(w, hero, outer, 500)).toBeGreaterThan(0);
  expect(damage(w, heroByPid(w, 1)!, outer, 500)).toBe(0); // own team cannot damage it
  kill(w, outer, hero); expect(structVulnerable(w, inner)).toBe(true);
  kill(w, inner, hero); expect(structVulnerable(w, core)).toBe(true);
  expect(w.winner).toBe(-1);
  kill(w, core, hero); expect(w.winner).toBe(0);
  const t = w.tick; step(w); expect(w.tick).toBe(t); // the world stops
});

test('Phase 1: turrets shoot minions before heroes, and ramp damage on a hero', () => {
  const w = solo(), hero = heroByPid(w, 0)!;
  const t = w.structures.find((s) => s.kind === 'turret' && s.team === 1 && s.lane === 1 && s.tier === 1)!;
  hero.x = t.x - 6; hero.y = t.y - 6; hero.h!.invuln = 0;
  const hp0 = hero.hp; run(w, 1.5); const first = hp0 - hero.hp; expect(first).toBeGreaterThan(0);
  const hp1 = hero.hp; hero.maxHp = hero.hp = 99999; run(w, 3); expect(t.heat).toBeGreaterThan(0.5);
});

test('Phase 2: XP, levels, skill points and rank requirements', () => {
  const w = solo(), u = heroByPid(w, 0)!, h = u.h!;
  expect(h.level).toBe(1); expect(h.sp).toBe(1);
  expect(rankUp(w, 0, 2)).toBe(false);             // ultimate is locked before level 4
  expect(rankUp(w, 0, 0)).toBe(true);
  expect(rankUp(w, 0, 1)).toBe(false);             // no points left
  const hp = u.maxHp; giveXp(w, u, CFG.xpToLevel[0] + CFG.xpToLevel[1] + CFG.xpToLevel[2]);
  expect(h.level).toBe(4); expect(h.sp).toBe(3); expect(u.maxHp).toBeGreaterThan(hp);
  expect(rankUp(w, 0, 2)).toBe(true);              // ultimate unlocks at level 4
  expect(rankUp(w, 0, 2)).toBe(false);             // rank 2 needs level 8
  expect(rankUp(w, 0, 0)).toBe(true);              // basic rank 2 needs level 3
  expect(rankUp(w, 0, 0)).toBe(false);             // basic rank 3 needs level 5
  giveXp(w, u, 1e9); expect(h.level).toBe(CFG.maxLevel);
  expect(rankUp(w, 0, 7 as number)).toBe(false);
});

test('Phase 2: skills cost mana, respect cooldowns and scale with rank', () => {
  const w = solo(), a = heroByPid(w, 0)!, b = heroByPid(w, 1)!;
  expect(castSkill(w, 0, 1, a.x, a.y)).toBe(false); // rank 0
  rankUp(w, 0, 1); b.x = a.x + 2; b.y = a.y; b.h!.invuln = 0; b.team = 1;
  const mana = a.h!.mana, hp = b.hp;
  expect(castSkill(w, 0, 1, b.x, b.y)).toBe(true);
  expect(a.h!.mana).toBeLessThan(mana); expect(b.hp).toBeLessThan(hp);
  expect(castSkill(w, 0, 1, b.x, b.y)).toBe(false); // on cooldown
  const d1 = hp - b.hp; a.h!.cds[1] = 0; a.h!.ranks[1] = 4; b.hp = b.maxHp; a.h!.mana = 999;
  castSkill(w, 0, 1, b.x, b.y); expect(b.maxHp - b.hp).toBeGreaterThan(d1);
  a.h!.mana = 0; a.h!.cds[1] = 0; expect(castSkill(w, 0, 1, b.x, b.y)).toBe(false);
});

test('Phase 2: death, respawn timer, respawn protection, sanctuary healing and recall', () => {
  const w = solo(), a = heroByPid(w, 0)!, b = heroByPid(w, 1)!;
  a.x = 100; a.y = 100; b.x = 102; b.y = 100; a.h!.invuln = 0;
  damage(w, b, a, 1e6);
  expect(a.alive).toBe(false); expect(a.h!.deaths).toBe(1); expect(b.h!.kills).toBe(1); expect(w.teams[1].kills).toBe(1);
  expect(a.h!.respawn).toBe(CFG.respawnBase + CFG.respawnPerLevel);
  expect(castSkill(w, 0, 0, 0, 0)).toBe(false); expect(startRecall(w, 0)).toBe(false);
  b.x = 150; b.y = 150; run(w, a.h!.respawn + 0.2);
  expect(a.alive).toBe(true); expect(a.hp).toBe(a.maxHp);
  expect(Math.hypot(a.x - SPAWN[0].x, a.y - SPAWN[0].y)).toBeLessThan(CFG.sanctuaryRadius);
  expect(a.h!.invuln).toBeGreaterThan(0); expect(damage(w, b, a, 100)).toBe(0);
  // recall: channel completes when undisturbed, and is interrupted by damage or movement
  a.x = 100; a.y = 100; a.h!.invuln = 0; a.hp = a.maxHp * 0.5;
  expect(startRecall(w, 0)).toBe(true); run(w, 2); damage(w, b, a, 10); expect(a.h!.recall).toBe(0);
  run(w, CFG.combatTime); expect(startRecall(w, 0)).toBe(true); setMove(w, 0, 1, 0); run(w, 0.2); expect(a.h!.recall).toBe(0);
  setMove(w, 0, 0, 0); expect(startRecall(w, 0)).toBe(true); run(w, CFG.recallTime + 0.2);
  expect(Math.hypot(a.x - SPAWN[0].x, a.y - SPAWN[0].y)).toBeLessThan(CFG.sanctuaryRadius);
  const hp = a.hp; run(w, 2); expect(a.hp).toBeGreaterThan(hp + a.maxHp * 0.2);
});

test('Phase 2: gold, shop validation, and progression resets between matches', () => {
  const w = solo(), a = heroByPid(w, 0)!;
  a.h!.gold = 100; expect(buyItem(w, 0, 'blade')).toBe(false);
  a.h!.gold = 1000; const atk = a.atk;
  expect(buyItem(w, 0, 'nope')).toBe(false);
  expect(buyItem(w, 0, 'blade')).toBe(true); expect(a.atk).toBe(atk + 18); expect(a.h!.gold).toBe(550);
  expect(buyItem(w, 0, 'blade')).toBe(false);       // one of each
  a.x = 100; a.y = 100; expect(buyItem(w, 0, 'boots')).toBe(false); // only in the Sanctuary
  giveXp(w, a, 5000);
  const w2 = solo(), a2 = heroByPid(w2, 0)!;
  expect(a2.h!.level).toBe(1); expect(a2.h!.gold).toBe(CFG.startGold); expect(a2.h!.items.length).toBe(0);
});

test('Phase 3: camps spawn, leash, reset, respawn, and grant a buff once', () => {
  const w = solo(), a = heroByPid(w, 0)!; a.h!.invuln = 0;
  run(w, 31);
  const ci = CAMPS.findIndex((c) => c.key === 'stag' && c.side === 0), camp = w.camps[ci];
  expect(camp.alive).toBe(1);
  const stag = w.units.get(camp.ids[0])!; expect(stag.team).toBe(NEUTRAL);
  a.x = stag.x + 2; a.y = stag.y; a.maxHp = a.hp = 50000;
  damage(w, a, stag, 50); expect(stag.aggro).toBe(a.id);
  const hp = a.hp; run(w, 3); expect(a.hp).toBeLessThan(hp);            // it fights back
  a.x = stag.hx + 40; a.y = stag.hy; run(w, 6);                          // walk away: it leashes and heals
  expect(stag.aggro).toBe(0); expect(stag.hp).toBe(stag.maxHp); expect(Math.hypot(stag.x - stag.hx, stag.y - stag.hy)).toBeLessThan(1);
  const gold = a.h!.gold, lv = a.h!.xp + a.h!.level * 1e6;
  a.x = stag.x + 2; damage(w, a, stag, 1e6);
  expect(a.h!.buffs.fury).toBeGreaterThan(0); expect(a.h!.gold).toBeGreaterThan(gold); expect(a.h!.xp + a.h!.level * 1e6).toBeGreaterThan(lv);
  const g2 = a.h!.gold; kill(w, stag, a); damage(w, a, stag, 1e6); expect(a.h!.gold).toBe(g2); // no duplicate reward
  expect(camp.alive).toBe(0); run(w, CAMPS[ci].respawn + 1); expect(camp.alive).toBe(1);
  run(w, 80); expect(a.h!.buffs.fury || 0).toBe(0);                      // the buff expires
});

test('Phase 3: epic monsters give the whole team a reward and a timed team buff', () => {
  const w = createWorld(roster(4, false), 1), a = heroByPid(w, 0)!;
  run(w, 151);
  const ev: string[] = [];
  const wyrm = [...w.units.values()].find((u) => u.sub === 'emberwyrm')!, col = [...w.units.values()].find((u) => u.sub === 'colossus')!;
  expect(wyrm).toBeTruthy(); expect(col).toBeTruthy();
  const gold = w.heroes.map((u) => u.h!.gold);
  a.x = wyrm.x; a.y = wyrm.y + 3; damage(w, a, wyrm, 1e6);
  ev.push(...w.events.map((e) => e.e));
  expect(w.teams[0].buffs.ember).toBeGreaterThan(0); expect(w.teams[1].buffs.ember || 0).toBe(0);
  w.heroes.forEach((u, i) => { if (u.team === 0) expect(u.h!.gold).toBeGreaterThan(gold[i]); else expect(u.h!.gold).toBe(gold[i]); });
  expect(ev).toContain('obj');
  a.x = col.x; a.y = col.y + 3; damage(w, a, col, 1e6);
  expect(w.teams[0].buffs.siege).toBeGreaterThan(0); expect(w.teams[0].siegeWaves).toBe(3);
  w.events.length = 0; run(w, 30);
  expect([...w.units.values()].some((u) => u.sub === 'brute' && u.team === 0)).toBe(true);
  expect([...w.units.values()].some((u) => u.sub === 'brute' && u.team === 1)).toBe(false);
  run(w, 120); expect(w.teams[0].buffs.siege).toBe(0); expect(w.teams[0].buffs.ember).toBe(0);
});

test('Full 5v5 bot match reaches a Core kill within the tick budget', () => {
  const w = createWorld(roster(), 7), t0 = performance.now(); let peak = 0;
  for (let m = 0; m < 60 && w.winner < 0; m++) { run(w, 60); peak = Math.max(peak, w.units.size); }
  const ms = (performance.now() - t0) / w.tick;
  console.log(`  bot match: winner team ${w.winner} at ${(w.t / 60).toFixed(1)} min, peak ${peak} units, ${ms.toFixed(3)} ms per tick, levels ${w.heroes.map((u) => u.h!.level).join(',')}`);
  expect(w.winner).toBeGreaterThanOrEqual(0); expect(ms).toBeLessThan(4);
  expect(w.heroes.every((u) => u.h!.level >= 6)).toBe(true);
}, 120000);
