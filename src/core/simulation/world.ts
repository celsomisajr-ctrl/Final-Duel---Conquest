// World state, stats, damage and reward rules. This is the only place hit points, XP and gold change.
import { CFG } from '../shared/config';
import { dist } from '../shared/math';
import { NEUTRAL, type GameEvent, type HeroState, type Kind, type RosterEntry, type Unit, type World } from '../shared/types';
import { BUFFS, HEROES, type BuffDef } from '../../entities/heroes';
import { ITEMS, MONSTERS, STRUCTS, type UnitDef } from '../../entities/units';
import { CAMPS, CORE, SPAWN, TURRETS } from '../../maps/conquest/map';

export const isStruct = (u: Unit) => u.kind === 'turret' || u.kind === 'core';
export const emit = (w: World, ev: GameEvent) => { w.events.push(ev); };

export function newUnit(w: World, kind: Kind, sub: string, team: number, x: number, y: number, d: UnitDef, scale = 1): Unit {
  const u: Unit = {
    id: w.nextId++, kind, sub, team, x, y, r: d.r,
    hp: d.hp * scale, maxHp: d.hp * scale, atk: d.atk * scale, armor: d.armor, range: d.range, speed: d.speed,
    atkInt: d.atkInt, atkCd: 0.5, alive: true, stun: 0, slow: 0, slowAmt: 0,
    lane: 0, wp: 0, tier: 0, heat: 0, heatTgt: 0, camp: -1, hx: x, hy: y, aggro: 0, lastHit: 0,
    xp: d.xp, gold: d.gold, h: null,
  };
  w.units.set(u.id, u);
  return u;
}

export function spawnPoint(team: number, pid: number) {
  const a = (pid % 5) * ((Math.PI * 2) / 5);
  return { x: SPAWN[team].x + Math.cos(a) * 3.5, y: SPAWN[team].y + Math.sin(a) * 3.5 };
}

export function createWorld(roster: RosterEntry[], seed = 1): World {
  const w: World = {
    t: 0, tick: 0, seed, nextId: 1, units: new Map(), heroes: [], structures: [], projs: [], zones: [], pending: [],
    camps: CAMPS.map((c, i) => ({ def: i, alive: 0, timer: c.first, ids: [] })),
    teams: [{ kills: 0, buffs: {}, siegeWaves: 0 }, { kills: 0, buffs: {}, siegeWaves: 0 }],
    nextWave: CFG.waveFirst, waveNo: 0, winner: -1, events: [],
  };
  for (const team of [0, 1]) {
    const c = newUnit(w, 'core', 'core', team, CORE[team].x, CORE[team].y, STRUCTS.core);
    w.structures.push(c);
  }
  for (const t of TURRETS) {
    const u = newUnit(w, 'turret', 'turret', t.team, t.x, t.y, STRUCTS.turret);
    u.lane = t.lane; u.tier = t.tier; w.structures.push(u);
  }
  const laneOrder = [1, 0, 2, 0, 2], seat = [0, 0];
  for (const r of roster) {
    const d = HEROES[r.cls] || HEROES.swordsman, p = spawnPoint(r.team, r.pid);
    const u = newUnit(w, 'hero', d.key, r.team, p.x, p.y, { name: d.name, hp: d.hp[0], atk: d.atk[0], armor: d.armor[0], range: d.range, speed: d.speed, atkInt: d.atkInt, r: 1.1, xp: 0, gold: 0 });
    const h: HeroState = {
      pid: r.pid, name: r.name, cls: d.key, bot: r.bot, level: 1, xp: 0, gold: CFG.startGold, sp: 1,
      mana: d.mana[0], maxMana: d.mana[0], ranks: [0, 0, 0], cds: [0, 0, 0], kills: 0, deaths: 0, assists: 0,
      respawn: 0, invuln: 0, recall: 0, combat: 0, buffs: {}, shield: 0, shieldT: 0, mx: 0, my: 0,
      fx: r.team === 0 ? 0.7 : -0.7, fy: r.team === 0 ? 0.7 : -0.7, items: [], dash: null, dmgFrom: {},
      think: 0, mode: 'lane', lane: laneOrder[seat[r.team]++ % 5], connected: true,
    };
    u.h = h; w.heroes.push(u);
  }
  w.heroes.sort((a, b) => a.h!.pid - b.h!.pid);
  return w;
}

export const heroByPid = (w: World, pid: number) => w.heroes.find((u) => u.h!.pid === pid) || null;

/** Recomputes a hero's level- and item-based stats, keeping the current health and mana fractions' absolute values. */
export function refreshHero(u: Unit) {
  const h = u.h!, d = HEROES[h.cls], L = h.level - 1;
  let hp = d.hp[0] + d.hp[1] * L, mana = d.mana[0] + d.mana[1] * L, atk = d.atk[0] + d.atk[1] * L, armor = d.armor[0] + d.armor[1] * L;
  for (const k of h.items) { const it = ITEMS[k]; if (!it) continue; hp += it.hp || 0; mana += it.mana || 0; atk += it.atk || 0; armor += it.armor || 0; }
  const dh = hp - u.maxHp, dm = mana - h.maxMana;
  u.maxHp = hp; h.maxMana = mana; u.atk = atk; u.armor = armor;
  if (u.alive) { if (dh > 0) u.hp += dh; if (dm > 0) h.mana += dm; }
  u.hp = Math.min(u.hp, u.maxHp); h.mana = Math.min(h.mana, h.maxMana);
}

function eachBuff(w: World, u: Unit, fn: (b: BuffDef) => void) {
  const h = u.h; if (!h) return;
  for (const k in h.buffs) if (h.buffs[k] > 0 && BUFFS[k]) fn(BUFFS[k]);
  const tb = w.teams[u.team]?.buffs; if (tb) for (const k in tb) if (tb[k] > 0 && BUFFS[k]) fn(BUFFS[k]);
}
type MulField = 'dmg' | 'as' | 'ms' | 'taken' | 'struct';
type AddField = 'lifesteal' | 'manaRegen' | 'hpRegen' | 'cdr';
export function mult(w: World, u: Unit, f: MulField) {
  let m = 1; eachBuff(w, u, (b) => { if (b[f]) m *= b[f]!; });
  if (u.h) for (const k of u.h.items) { const it = ITEMS[k]; if (!it) continue; if (f === 'ms' && it.ms) m *= 1 + it.ms; if (f === 'as' && it.as) m *= 1 + it.as; }
  return m;
}
export function add(w: World, u: Unit, f: AddField) {
  let s = 0; eachBuff(w, u, (b) => { if (b[f]) s += b[f]!; });
  if (u.h && f === 'cdr') for (const k of u.h.items) s += ITEMS[k]?.cdr || 0;
  return s;
}
export const moveSpeed = (w: World, u: Unit) => u.speed * (u.h ? mult(w, u, 'ms') : 1) * (u.slow > 0 ? 1 - u.slowAmt : 1);

export function structVulnerable(w: World, s: Unit) {
  if (s.kind === 'turret') return s.tier === 1 || !w.structures.some((o) => o.alive && o.kind === 'turret' && o.team === s.team && o.lane === s.lane && o.tier === 1);
  if (s.kind === 'core') return w.structures.some((o) => !o.alive && o.kind === 'turret' && o.team === s.team && o.tier === 2);
  return true;
}
function minionNear(w: World, team: number, s: Unit) {
  for (const u of w.units.values()) if (u.kind === 'minion' && u.team === team && u.alive && dist(u.x, u.y, s.x, s.y) < 13) return true;
  return false;
}

export function applyCC(u: Unit, stun: number, slowAmt: number, slowT: number) {
  if (!u.alive || isStruct(u) || (u.h && u.h.invuln > 0)) return;
  const epic = u.kind === 'monster' && MONSTERS[u.sub]?.epic;
  if (stun > 0 && !epic) { u.stun = Math.max(u.stun, stun); if (u.h) { u.h.recall = 0; u.h.dash = null; } }
  if (slowAmt > 0 && slowT > 0) { if (slowAmt >= u.slowAmt || u.slow <= 0) u.slowAmt = epic ? slowAmt * 0.4 : slowAmt; u.slow = Math.max(u.slow, slowT); }
}

export function heal(u: Unit, amt: number) { if (u.alive && amt > 0) u.hp = Math.min(u.maxHp, u.hp + amt); }

/** Applies damage from `src` to `t` after all rules. Returns the health actually removed. */
export function damage(w: World, src: Unit | null, t: Unit, amt: number, basic = false): number {
  if (!t.alive || w.winner >= 0 || !(amt > 0)) return 0;
  if (src && src.team === t.team) return 0;
  if (t.h && t.h.invuln > 0) return 0;
  const sh = src && src.h ? src : null;
  if (isStruct(t)) {
    if (!structVulnerable(w, t)) return 0;
    if (sh) { if (!minionNear(w, sh.team, t)) amt *= CFG.structNoMinionMult; amt *= mult(w, sh, 'struct'); }
  }
  if (sh) amt *= mult(w, sh, 'dmg');
  if (src && src.kind === 'minion' && w.teams[src.team].buffs.siege > 0) amt *= 1.35;
  if (t.h) amt *= mult(w, t, 'taken');
  amt *= 100 / (100 + t.armor);
  if (t.h && t.h.shield > 0) { const a = Math.min(t.h.shield, amt); t.h.shield -= a; amt -= a; }
  t.hp -= amt;
  if (t.h) {
    t.h.combat = CFG.combatTime; t.h.recall = 0;
    if (sh) {
      t.h.dmgFrom[sh.h!.pid] = w.t;
      // A hero who hurts an enemy hero under that hero's turret draws the turret's fire.
      for (const s of w.structures) if (s.alive && s.team === t.team && dist(s.x, s.y, sh.x, sh.y) - sh.r <= s.range && dist(s.x, s.y, t.x, t.y) <= s.range + 4) s.aggro = sh.id;
    }
  }
  if (sh) { sh.h!.combat = CFG.combatTime; if (basic) { const ls = add(w, sh, 'lifesteal'); if (ls > 0) heal(sh, amt * ls); } }
  if (t.kind === 'monster' && sh && sh.alive && !w.units.get(t.aggro)?.alive) t.aggro = sh.id;
  if (src) t.lastHit = src.id;
  if (t.hp <= 0) kill(w, t, src);
  return amt;
}

export function giveXp(w: World, u: Unit, amt: number) {
  const h = u.h!; if (h.level >= CFG.maxLevel || !(amt > 0)) return;
  h.xp += amt;
  while (h.level < CFG.maxLevel && h.xp >= CFG.xpToLevel[h.level - 1]) {
    h.xp -= CFG.xpToLevel[h.level - 1]; h.level++; h.sp++; refreshHero(u);
    emit(w, { e: 'lvl', pid: h.pid, lv: h.level, x: u.x, y: u.y });
  }
  if (h.level >= CFG.maxLevel) h.xp = 0;
}
const enemyHeroesNear = (w: World, team: number, x: number, y: number, r: number) => w.heroes.filter((o) => o.alive && o.team !== team && dist(o.x, o.y, x, y) <= r);
function shareXp(w: World, list: Unit[], xp: number) {
  if (!list.length) return; const each = (xp / list.length) * (list.length > 1 ? 1.2 : 1);
  for (const o of list) giveXp(w, o, each);
}

/** Removes a unit from play and pays out its rewards exactly once. */
export function kill(w: World, u: Unit, src: Unit | null) {
  if (!u.alive && u.hp <= -1e8) return;
  u.alive = false; u.hp = -1e9; // sentinel so a second call can never pay again
  let killer: Unit | null = src && src.h ? src : null;
  if (!killer && u.h) {
    let best = -1, bt = w.t - 10;
    for (const k in u.h.dmgFrom) if (u.h.dmgFrom[k] > bt) { bt = u.h.dmgFrom[k]; best = +k; }
    if (best >= 0) killer = heroByPid(w, best);
  }
  if (u.h) {
    const h = u.h; h.deaths++;
    h.respawn = Math.min(CFG.respawnMax, CFG.respawnBase + CFG.respawnPerLevel * h.level);
    h.buffs = {}; h.dash = null; h.recall = 0; h.shield = 0; h.mx = 0; h.my = 0; u.stun = 0; u.slow = 0;
    const helpers: Unit[] = [];
    for (const k in h.dmgFrom) if (h.dmgFrom[k] > w.t - 10 && (!killer || +k !== killer.h!.pid)) { const a = heroByPid(w, +k); if (a) helpers.push(a); }
    h.dmgFrom = {};
    if (killer) {
      killer.h!.kills++; killer.h!.gold += CFG.heroKillGold; w.teams[killer.team].kills++;
      for (const a of helpers) { a.h!.assists++; a.h!.gold += CFG.assistGold; }
      shareXp(w, [killer, ...helpers].filter((o) => o.alive || o === killer), CFG.heroKillXp + CFG.heroKillXpPerLevel * h.level);
    }
    emit(w, { e: 'kill', g: 1, killer: killer ? killer.h!.pid : -1, victim: h.pid, as: helpers.map((a) => a.h!.pid), x: u.x, y: u.y });
  } else if (u.kind === 'minion') {
    shareXp(w, enemyHeroesNear(w, u.team, u.x, u.y, CFG.xpShareRadius), u.xp);
    if (killer) killer.h!.gold += u.gold;
    else { const near = enemyHeroesNear(w, u.team, u.x, u.y, 10)[0]; if (near) near.h!.gold += Math.round(u.gold * 0.4); }
    w.units.delete(u.id);
  } else if (u.kind === 'monster') {
    const d = MONSTERS[u.sub], camp = w.camps[u.camp];
    if (camp) { camp.ids = camp.ids.filter((i) => i !== u.id); camp.alive = camp.ids.length; if (!camp.alive) camp.timer = CAMPS[camp.def].respawn; }
    if (killer) {
      const team = killer.team;
      if (d.epic) {
        for (const o of w.heroes) if (o.team === team) { o.h!.gold += d.teamGold || 0; giveXp(w, o, d.teamXp || 0); }
        if (d.buff) w.teams[team].buffs[d.buff] = d.buffDur || 60;
        if (u.sub === 'colossus') w.teams[team].siegeWaves = 3;
        emit(w, { e: 'obj', g: 1, k: u.sub, team, pid: killer.h!.pid, x: u.x, y: u.y });
      } else {
        killer.h!.gold += u.gold;
        shareXp(w, w.heroes.filter((o) => o.alive && o.team === team && dist(o.x, o.y, u.x, u.y) <= CFG.xpShareRadius), u.xp);
        if (d.buff && !camp?.alive) { killer.h!.buffs[d.buff] = d.buffDur || 60; emit(w, { e: 'buff', k: d.buff, pid: killer.h!.pid, x: u.x, y: u.y }); }
      }
    }
    w.units.delete(u.id);
  } else if (u.kind === 'turret') {
    for (const o of w.heroes) if (o.team !== u.team) { o.h!.gold += CFG.turretGoldTeam; giveXp(w, o, CFG.turretXp); }
    emit(w, { e: 'tower', g: 1, team: u.team, lane: u.lane, tier: u.tier, x: u.x, y: u.y });
  } else if (u.kind === 'core') {
    w.winner = 1 - u.team;
    emit(w, { e: 'end', g: 1, winner: w.winner });
  }
}

export const isNeutral = (u: Unit) => u.team === NEUTRAL;
