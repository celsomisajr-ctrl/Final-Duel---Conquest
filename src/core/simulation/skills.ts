// Player commands and the skill interpreter. Every command is validated here; a rejected
// command returns false and changes nothing.
import { CFG } from '../shared/config';
import { dist } from '../shared/math';
import type { Unit, World } from '../shared/types';
import { HEROES, type SkillDef } from '../../entities/heroes';
import { ITEMS } from '../../entities/units';
import { SPAWN } from '../../maps/conquest/map';
import { add, applyCC, damage, emit, heal, heroByPid, isStruct, refreshHero } from './world';

const val = (v: [number, number] | undefined, rank: number) => (v ? v[0] + v[1] * (rank - 1) : 0);
export const skillDamage = (u: Unit, d: SkillDef, rank: number) => val(d.dmg, rank) + (d.ratio || 0) * u.atk * (d.dmg ? 1 : 0);
export const skillMana = (d: SkillDef, rank: number) => val(d.mana, Math.max(1, rank));
export const skillCd = (d: SkillDef, rank: number) => Math.max(1, val(d.cd, Math.max(1, rank)));

/** Enemy heroes, minions and monsters (never structures) whose body touches the circle. */
export function areaTargets(w: World, team: number, x: number, y: number, r: number): Unit[] {
  const out: Unit[] = [];
  for (const u of w.units.values()) if (u.alive && u.team !== team && !isStruct(u) && dist(u.x, u.y, x, y) <= r + u.r) out.push(u);
  return out;
}

export function setMove(w: World, pid: number, mx: number, my: number) {
  const u = heroByPid(w, pid); if (!u) return false;
  if (!Number.isFinite(mx) || !Number.isFinite(my)) { mx = 0; my = 0; }
  const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
  u.h!.mx = mx; u.h!.my = my; return true;
}

export function canRankUp(u: Unit, slot: number) {
  const h = u.h!; if (slot !== 0 && slot !== 1 && slot !== 2) return false;
  if (h.sp <= 0) return false;
  const r = h.ranks[slot];
  if (slot === 2) return r < CFG.ultMaxRank && h.level >= CFG.ultLevels[r];
  return r < CFG.basicMaxRank && h.level >= CFG.basicRankLevel(r + 1);
}
export function rankUp(w: World, pid: number, slot: number) {
  const u = heroByPid(w, pid); if (!u || !canRankUp(u, slot)) return false;
  u.h!.ranks[slot]++; u.h!.sp--; return true;
}

export const inSanctuary = (u: Unit) => dist(u.x, u.y, SPAWN[u.team].x, SPAWN[u.team].y) <= CFG.sanctuaryRadius;

export function startRecall(w: World, pid: number) {
  const u = heroByPid(w, pid); if (!u || !u.alive || u.stun > 0 || u.h!.dash || u.h!.recall > 0 || inSanctuary(u)) return false;
  u.h!.recall = CFG.recallTime; u.h!.mx = 0; u.h!.my = 0;
  emit(w, { e: 'recall', pid, x: u.x, y: u.y }); return true;
}

export function buyItem(w: World, pid: number, key: string) {
  const u = w.heroes[pid], it = ITEMS[key]; if (!u || !it) return false;
  const h = u.h!;
  if (u.alive && !inSanctuary(u)) return false;
  if (h.gold < it.cost || h.items.length >= CFG.maxItems || h.items.includes(key)) return false;
  h.gold -= it.cost; h.items.push(key); refreshHero(u); return true;
}

/** Casts the skill in `slot` towards the point (ax, ay). The point is clamped to the skill's range. */
export function castSkill(w: World, pid: number, slot: number, ax: number, ay: number) {
  const u = heroByPid(w, pid); if (!u || (slot !== 0 && slot !== 1 && slot !== 2)) return false;
  const h = u.h!, d = HEROES[h.cls].skills[slot], rank = h.ranks[slot];
  if (!u.alive || w.winner >= 0 || rank <= 0 || u.stun > 0 || h.dash || h.cds[slot] > 0) return false;
  const cost = skillMana(d, rank); if (h.mana < cost) return false;
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) { ax = u.x + h.fx; ay = u.y + h.fy; }
  let dx = ax - u.x, dy = ay - u.y, len = Math.hypot(dx, dy);
  if (len < 0.01) { dx = h.fx; dy = h.fy; len = Math.hypot(dx, dy) || 1; }
  const nx = dx / len, ny = dy / len, reach = Math.min(len, d.range);
  const tx = u.x + nx * reach, ty = u.y + ny * reach, dmg = skillDamage(u, d, rank);
  const slowAmt = d.slow ? d.slow[0] : 0, slowT = d.slow ? d.slow[1] : 0, stun = d.stun || 0;

  if (d.type === 'strike') {
    let best: Unit | null = null, bd = 1e9;
    for (const o of w.heroes) if (o.alive && o.team !== u.team && o.h!.invuln <= 0) { const q = dist(o.x, o.y, u.x, u.y) - o.r; if (q <= d.range && q < bd) { bd = q; best = o; } }
    if (!best) return false;
    h.fx = (best.x - u.x) / (bd + best.r || 1); h.fy = (best.y - u.y) / (bd + best.r || 1);
    emit(w, { e: 'fx', u: u.id, k: d.key, x: best.x, y: best.y, x2: u.x, y2: u.y, team: u.team });
    applyCC(best, stun, slowAmt, slowT); damage(w, u, best, dmg);
  } else if (d.type === 'nova') {
    emit(w, { e: 'fx', u: u.id, k: d.key, x: u.x, y: u.y, r: d.radius, team: u.team });
    for (const o of areaTargets(w, u.team, u.x, u.y, d.radius!)) { applyCC(o, stun, slowAmt, slowT); damage(w, u, o, dmg); }
    if (d.shield) { h.shield = val(d.shield, rank); h.shieldT = 4; }
  } else if (d.type === 'cone') {
    h.fx = nx; h.fy = ny;
    emit(w, { e: 'fx', u: u.id, k: d.key, x: u.x, y: u.y, r: d.range, a: Math.atan2(ny, nx), w: d.angle, team: u.team });
    for (const o of areaTargets(w, u.team, u.x, u.y, d.range)) {
      const ox = o.x - u.x, oy = o.y - u.y, ol = Math.hypot(ox, oy) || 1;
      if (ol < o.r + 1.5 || (ox * nx + oy * ny) / ol >= Math.cos(d.angle!)) { applyCC(o, stun, slowAmt, slowT); damage(w, u, o, dmg); }
    }
  } else if (d.type === 'shot') {
    h.fx = nx; h.fy = ny;
    emit(w, { e: 'fx', u: u.id, k: d.key + '-cast', x: u.x, y: u.y, team: u.team });
    w.projs.push({ id: w.nextId++, owner: u.id, team: u.team, k: d.key, x: u.x + nx * 1.2, y: u.y + ny * 1.2, vx: nx * d.speed!, vy: ny * d.speed!, left: d.range, r: d.radius || 1, dmg, pierce: !!d.pierce, slowAmt, slowT, stun, hit: new Set() });
  } else if (d.type === 'zone') {
    const zx = d.range > 0 ? tx : u.x, zy = d.range > 0 ? ty : u.y;
    if (d.range > 0) { h.fx = nx; h.fy = ny; }
    emit(w, { e: 'fx', u: u.id, k: d.key + '-cast', x: u.x, y: u.y, team: u.team });
    w.zones.push({ id: w.nextId++, owner: u.id, team: u.team, k: d.key, x: zx, y: zy, r: d.radius!, delay: d.delay || 0, dur: val(d.dur, rank), tick: d.tick || 0, tickCd: 0, dmg, heal: val(d.heal, rank), slowAmt, slowT, stun });
  } else if (d.type === 'dash') {
    const T = Math.max(0.12, reach / 34);
    h.fx = nx; h.fy = ny;
    h.dash = { vx: (nx * reach) / T, vy: (ny * reach) / T, t: T, hitR: d.stop ? 1.6 : 0, dmg, stun, slowAmt, slowT, stop: !!d.stop, land: d.land || 0, hit: new Set(), fx: d.key };
    if (d.buff) h.buffs[d.buff] = val(d.dur, rank);
    emit(w, { e: 'fx', u: u.id, k: d.key, x: u.x, y: u.y, x2: tx, y2: ty, team: u.team });
  } else if (d.type === 'buff') {
    h.buffs[d.buff!] = val(d.dur, rank);
    if (d.heal) heal(u, val(d.heal, rank));
    emit(w, { e: 'fx', u: u.id, k: d.key, x: u.x, y: u.y, r: 3, d: val(d.dur, rank), team: u.team });
  }
  h.mana -= cost; h.cds[slot] = skillCd(d, rank) * (1 - Math.min(0.4, add(w, u, 'cdr')));
  h.recall = 0; h.invuln = 0; h.combat = Math.max(h.combat, 1);
  return true;
}
