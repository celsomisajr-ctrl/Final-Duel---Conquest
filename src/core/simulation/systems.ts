// The fixed-timestep simulation step. Call step(w) exactly CFG.tickRate times per second of game time.
import { CFG, DT } from '../shared/config';
import { dist } from '../shared/math';
import { NEUTRAL, type Unit, type World } from '../shared/types';
import { MINIONS, MONSTERS } from '../../entities/units';
import { CAMPS, SPAWN, lanePath, moveCircle } from '../../maps/conquest/map';
import { add, applyCC, damage, emit, heal, isStruct, kill, moveSpeed, mult, newUnit, refreshHero, spawnPoint, structVulnerable } from './world';
import { areaTargets } from './skills';
import { botThink } from './bots';

const PATHS = [0, 1].map((t) => [0, 1, 2].map((l) => lanePath(t, l)));
const hitRange = (a: Unit, b: Unit) => dist(a.x, a.y, b.x, b.y) - b.r;

function strike(w: World, a: Unit, t: Unit, dmg: number, delay: number, kind: number) {
  w.pending.push({ t: delay, src: a.id, tgt: t.id, dmg });
  emit(w, { e: 'atk', a: a.id, b: t.id, k: kind, x: a.x, y: a.y });
}

function moveUnit(w: World, u: Unit, tx: number, ty: number, blockers: Unit[]) {
  const dx = tx - u.x, dy = ty - u.y, l = Math.hypot(dx, dy); if (l < 0.05) return;
  const s = Math.min(l, moveSpeed(w, u) * DT), p = moveCircle(u.x, u.y, (dx / l) * s, (dy / l) * s, u.r, blockers);
  u.x = p.x; u.y = p.y;
}

function respawn(w: World, u: Unit) {
  const h = u.h!, p = spawnPoint(u.team, h.pid);
  u.x = p.x; u.y = p.y; u.alive = true; refreshHero(u); u.hp = u.maxHp; h.mana = h.maxMana;
  h.invuln = CFG.respawnInvuln; h.respawn = 0; h.combat = 0; u.atkCd = 0.4;
  emit(w, { e: 'respawn', pid: h.pid, x: u.x, y: u.y });
}

function heroTarget(w: World, u: Unit): Unit | null {
  const moving = u.h!.mx !== 0 || u.h!.my !== 0;
  let best: Unit | null = null, bs = 1e9;
  for (const t of w.units.values()) {
    if (!t.alive || t.team === u.team) continue;
    const d = hitRange(u, t); if (d > u.range) continue;
    let cls = 1;
    if (t.kind === 'hero') { if (t.h!.invuln > 0) continue; cls = 0; }
    else if (isStruct(t)) { if (!structVulnerable(w, t)) continue; cls = 2; }
    else if (t.kind === 'monster') { if (moving && t.aggro !== u.id) continue; cls = 3; }
    const s = cls * 1000 + d; if (s < bs) { bs = s; best = t; }
  }
  return best;
}

function tickHero(w: World, u: Unit, structs: Unit[]) {
  const h = u.h!;
  h.gold += CFG.passiveGold * DT;
  for (let i = 0; i < 3; i++) if (h.cds[i] > 0) h.cds[i] = Math.max(0, h.cds[i] - DT);
  if (!u.alive) { h.respawn -= DT; if (h.respawn <= 0) respawn(w, u); return; }
  for (const k in h.buffs) if (h.buffs[k] > 0) h.buffs[k] = Math.max(0, h.buffs[k] - DT);
  if (h.invuln > 0) h.invuln -= DT;
  if (h.combat > 0) h.combat -= DT;
  if (h.shieldT > 0) { h.shieldT -= DT; if (h.shieldT <= 0) h.shield = 0; }
  if (u.slow > 0) u.slow -= DT;
  heal(u, (3 + 0.5 * h.level + u.maxHp * add(w, u, 'hpRegen')) * DT);
  h.mana = Math.min(h.maxMana, h.mana + (4 + 0.4 * h.level + h.maxMana * add(w, u, 'manaRegen')) * DT);
  if (dist(u.x, u.y, SPAWN[u.team].x, SPAWN[u.team].y) <= CFG.sanctuaryRadius) {
    heal(u, u.maxHp * CFG.sanctuaryRegen * DT); h.mana = Math.min(h.maxMana, h.mana + h.maxMana * CFG.sanctuaryRegen * DT);
  } else if (dist(u.x, u.y, SPAWN[1 - u.team].x, SPAWN[1 - u.team].y) <= CFG.sanctuaryRadius && h.invuln <= 0) {
    // The enemy Sanctuary burns intruders so spawn-camping is not possible.
    u.hp -= u.maxHp * CFG.sanctuaryBurn * DT; h.combat = CFG.combatTime; h.recall = 0;
    if (u.hp <= 0) { kill(w, u, null); return; }
  }
  if (u.stun > 0) { u.stun -= DT; return; }
  if (h.dash) {
    const d = h.dash, p = moveCircle(u.x, u.y, d.vx * DT, d.vy * DT, u.r, structs);
    u.x = p.x; u.y = p.y; d.t -= DT;
    let done = d.t <= 0;
    if (d.hitR > 0) for (const o of areaTargets(w, u.team, u.x, u.y, d.hitR)) {
      if (d.hit.has(o.id)) continue; d.hit.add(o.id);
      if (o.kind === 'hero') { applyCC(o, d.stun, d.slowAmt, d.slowT); if (d.stop) done = true; }
      damage(w, u, o, d.dmg);
    }
    if (done) {
      if (d.land > 0) {
        emit(w, { e: 'fx', u: u.id, k: d.fx + '-land', x: u.x, y: u.y, r: d.land, team: u.team });
        for (const o of areaTargets(w, u.team, u.x, u.y, d.land)) { applyCC(o, d.stun, d.slowAmt, d.slowT); damage(w, u, o, d.dmg); }
      }
      h.dash = null;
    }
    return;
  }
  const moving = h.mx !== 0 || h.my !== 0;
  if (h.recall > 0) {
    if (moving) h.recall = 0;
    else { h.recall -= DT; if (h.recall <= 0) { const p = spawnPoint(u.team, h.pid); u.x = p.x; u.y = p.y; h.recall = 0; emit(w, { e: 'recalled', pid: h.pid, x: u.x, y: u.y }); } return; }
  }
  if (moving) {
    const s = moveSpeed(w, u) * DT, p = moveCircle(u.x, u.y, h.mx * s, h.my * s, u.r, structs);
    u.x = p.x; u.y = p.y; const l = Math.hypot(h.mx, h.my); h.fx = h.mx / l; h.fy = h.my / l;
  }
  u.atkCd -= DT;
  if (u.atkCd <= 0) {
    const t = heroTarget(w, u);
    if (t) {
      const d = dist(u.x, u.y, t.x, t.y) || 1; h.fx = (t.x - u.x) / d; h.fy = (t.y - u.y) / d;
      u.atkCd = u.atkInt / mult(w, u, 'as'); h.invuln = 0;
      strike(w, u, t, u.atk, u.range > 4 ? 0.1 + d / 40 : 0.12, u.range > 4 ? 1 : 0);
    } else u.atkCd = 0;
  }
}

function tickMinion(w: World, u: Unit, minions: Unit[]) {
  if (u.slow > 0) u.slow -= DT;
  if (u.stun > 0) { u.stun -= DT; return; }
  u.atkCd -= DT;
  let t = w.units.get(u.aggro) || null;
  if (t && (!t.alive || hitRange(u, t) > 10 || (isStruct(t) && !structVulnerable(w, t)))) t = null;
  if (!t || w.tick % 10 === u.id % 10) {
    let bd = t ? hitRange(u, t) - 1 : 9;
    for (const o of w.units.values()) {
      if (!o.alive || o.team === u.team || o.team === NEUTRAL) continue;
      if (o.h && o.h.invuln > 0) continue;
      if (isStruct(o) && !structVulnerable(w, o)) continue;
      const d = hitRange(u, o) + (o.kind === 'hero' ? 2 : 0);
      if (d < bd) { bd = d; t = o; }
    }
    u.aggro = t ? t.id : 0;
  }
  if (t) {
    if (hitRange(u, t) <= u.range) { if (u.atkCd <= 0) { u.atkCd = u.atkInt; strike(w, u, t, u.atk, u.range > 4 ? 0.3 : 0.15, u.range > 4 ? 1 : 0); } }
    else moveUnit(w, u, t.x, t.y, []);
  } else {
    const path = PATHS[u.team][u.lane], p = path[Math.min(u.wp, path.length - 1)];
    if (dist(u.x, u.y, p.x, p.y) < 2 && u.wp < path.length - 1) u.wp++;
    moveUnit(w, u, p.x, p.y, []);
  }
  for (const o of minions) if (o !== u && o.alive) { // keep minions from stacking on one spot
    const dx = u.x - o.x, dy = u.y - o.y, d2 = dx * dx + dy * dy, m = u.r + o.r;
    if (d2 < m * m && d2 > 1e-6) { const d = Math.sqrt(d2), push = (m - d) * 0.25; u.x += (dx / d) * push; u.y += (dy / d) * push; }
  }
}

function tickStruct(w: World, s: Unit) {
  s.atkCd -= DT;
  if (s.atkCd > 0) return;
  let t = w.units.get(s.aggro) || null;
  if (t && (!t.alive || hitRange(s, t) > s.range || (t.h && t.h.invuln > 0))) t = null;
  if (!t) {
    let bd = 1e9;
    for (const o of w.units.values()) {
      if (!o.alive || o.team === s.team || o.team === NEUTRAL || isStruct(o)) continue;
      if (o.h && o.h.invuln > 0) continue;
      const d = hitRange(s, o); if (d > s.range) continue;
      const sc = d + (o.kind === 'hero' ? 1000 : 0); // minions first, heroes only when no minion is in range
      if (sc < bd) { bd = sc; t = o; }
    }
  }
  if (!t) { s.aggro = 0; s.heat = 0; s.heatTgt = 0; s.atkCd = 0.1; return; }
  s.aggro = t.id;
  if (t.kind === 'hero') { if (s.heatTgt === t.id) s.heat = Math.min(CFG.turretHeatMax, s.heat + CFG.turretHeatPerHit); else { s.heat = 0; s.heatTgt = t.id; } }
  else { s.heat = 0; s.heatTgt = 0; }
  s.atkCd = s.atkInt;
  strike(w, s, t, s.atk * (1 + s.heat), 0.25, 2);
}

function tickMonster(w: World, u: Unit) {
  if (u.slow > 0) u.slow -= DT;
  if (u.stun > 0) { u.stun -= DT; return; }
  u.atkCd -= DT;
  const t = w.units.get(u.aggro);
  const home = dist(u.x, u.y, u.hx, u.hy);
  if (!t || !t.alive || home > CFG.monsterLeash || dist(t.x, t.y, u.hx, u.hy) > CFG.monsterLeash + 3) {
    u.aggro = 0;
    if (home > 0.4) moveUnit(w, u, u.hx, u.hy, []);
    if (u.hp < u.maxHp) heal(u, u.maxHp * 0.2 * DT);
    return;
  }
  if (hitRange(u, t) <= u.range) { if (u.atkCd <= 0) { u.atkCd = u.atkInt; strike(w, u, t, u.atk, 0.2, MONSTERS[u.sub].epic ? 3 : 0); } }
  else moveUnit(w, u, t.x, t.y, []);
}

function spawnWave(w: World) {
  w.waveNo++;
  let count = 0; for (const u of w.units.values()) if (u.kind === 'minion') count++;
  if (count > 150) return;
  const scale = 1 + CFG.minionGrowthPerMin * (w.t / 60);
  for (const team of [0, 1]) {
    const brute = w.teams[team].siegeWaves > 0; if (brute) w.teams[team].siegeWaves--;
    for (let lane = 0; lane < 3; lane++) {
      const path = PATHS[team][lane], a = path[1], b = path[2], l = dist(a.x, a.y, b.x, b.y) || 1, nx = (b.x - a.x) / l, ny = (b.y - a.y) / l;
      const kinds = [...Array(CFG.waveMelee).fill('melee'), ...Array(CFG.waveRanged + (w.t > 480 ? 1 : 0)).fill('ranged'), ...(brute ? ['brute'] : [])];
      kinds.forEach((k, i) => {
        const m = newUnit(w, 'minion', k, team, a.x - nx * i * 2.2 + ny * ((i % 2) - 0.5), a.y - ny * i * 2.2 - nx * ((i % 2) - 0.5), MINIONS[k], scale);
        m.lane = lane; m.wp = 2;
      });
    }
  }
}

function tickCamps(w: World) {
  for (const c of w.camps) {
    if (c.alive > 0) continue;
    c.timer -= DT; if (c.timer > 0) continue;
    const cd = CAMPS[c.def], md = MONSTERS[cd.key], scale = md.epic ? 1 + 0.06 * (w.t / 60) : 1 + 0.03 * (w.t / 60);
    for (let i = 0; i < md.count; i++) {
      const a = (i / md.count) * Math.PI * 2, off = md.count > 1 ? 2.2 : 0;
      const m = newUnit(w, 'monster', cd.key, NEUTRAL, cd.x + Math.cos(a) * off, cd.y + Math.sin(a) * off, md, scale);
      m.camp = c.def; c.ids.push(m.id);
    }
    c.alive = c.ids.length;
    if (md.epic) emit(w, { e: 'spawn', g: 1, k: cd.key, x: cd.x, y: cd.y });
  }
}

function tickProjs(w: World) {
  for (let i = w.projs.length - 1; i >= 0; i--) {
    const p = w.projs[i], sp = Math.hypot(p.vx, p.vy) * DT;
    p.x += p.vx * DT; p.y += p.vy * DT; p.left -= sp;
    let dead = p.left <= 0 || p.x < 0 || p.y < 0 || p.x > CFG.mapSize || p.y > CFG.mapSize;
    const owner = w.units.get(p.owner) || null;
    for (const o of areaTargets(w, p.team, p.x, p.y, p.r)) {
      if (p.hit.has(o.id) || (o.h && o.h.invuln > 0)) continue;
      p.hit.add(o.id); applyCC(o, p.stun, p.slowAmt, p.slowT); damage(w, owner, o, p.dmg);
      if (!p.pierce) { dead = true; break; }
    }
    if (dead) w.projs.splice(i, 1);
  }
}

function tickZones(w: World) {
  for (let i = w.zones.length - 1; i >= 0; i--) {
    const z = w.zones[i], owner = w.units.get(z.owner) || null;
    if (z.delay > 0) { z.delay -= DT; if (z.delay > 0) continue; }
    const hitAll = () => {
      if (z.dmg > 0) for (const o of areaTargets(w, z.team, z.x, z.y, z.r)) { applyCC(o, z.stun, z.slowAmt, z.slowT); damage(w, owner, o, z.dmg); }
      if (z.heal > 0) for (const o of w.heroes) if (o.alive && o.team === z.team && dist(o.x, o.y, z.x, z.y) <= z.r + o.r) heal(o, z.heal);
    };
    if (z.dur <= 0) { emit(w, { e: 'fx', k: z.k + '-boom', x: z.x, y: z.y, r: z.r, team: z.team }); hitAll(); w.zones.splice(i, 1); continue; }
    z.dur -= DT; z.tickCd -= DT;
    if (z.tickCd <= 0) { z.tickCd += z.tick || 0.5; hitAll(); }
    if (z.dur <= 0) w.zones.splice(i, 1);
  }
}

export function step(w: World) {
  if (w.winner >= 0) return;
  w.t += DT; w.tick++;
  for (const tm of w.teams) for (const k in tm.buffs) if (tm.buffs[k] > 0) tm.buffs[k] = Math.max(0, tm.buffs[k] - DT);
  if (w.t >= w.nextWave) { w.nextWave += CFG.waveEvery; spawnWave(w); }
  tickCamps(w);
  const structs = w.structures.filter((s) => s.alive);
  for (const u of w.heroes) { const h = u.h!; if (h.bot || !h.connected) { h.think -= DT; if (h.think <= 0) { h.think = 0.2; botThink(w, u); } } }
  for (const u of w.heroes) tickHero(w, u, structs);
  const minions: Unit[] = [], monsters: Unit[] = [];
  for (const u of w.units.values()) if (u.alive) { if (u.kind === 'minion') minions.push(u); else if (u.kind === 'monster') monsters.push(u); }
  for (const u of minions) if (u.alive) tickMinion(w, u, minions);
  for (const s of structs) if (s.alive) tickStruct(w, s);
  for (const u of monsters) if (u.alive) tickMonster(w, u);
  for (let i = w.pending.length - 1; i >= 0; i--) {
    const p = w.pending[i]; p.t -= DT; if (p.t > 0) continue;
    w.pending.splice(i, 1);
    const t = w.units.get(p.tgt); if (t && t.alive) damage(w, w.units.get(p.src) || null, t, p.dmg, true);
  }
  tickProjs(w); tickZones(w);
}
