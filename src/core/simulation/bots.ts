// Computer-controlled heroes. A bot issues the same commands a player can (move, cast, rank up,
// recall, buy), so it can never do anything a client could not.
import { dist } from '../shared/math';
import type { Unit, World } from '../shared/types';
import { HEROES } from '../../entities/heroes';
import { ITEMS } from '../../entities/units';
import { SPAWN, lanePath, type Pt } from '../../maps/conquest/map';
import { isStruct, structVulnerable } from './world';
import { buyItem, canRankUp, castSkill, inSanctuary, rankUp, skillMana, startRecall } from './skills';

const BUILD: Record<string, string[]> = {
  swordsman: ['blade', 'boots', 'plate', 'heart', 'quiver', 'focus'],
  brawler: ['plate', 'boots', 'heart', 'blade', 'focus', 'quiver'],
  shaman: ['focus', 'boots', 'blade', 'heart', 'plate', 'quiver'],
  archer: ['blade', 'quiver', 'boots', 'heart', 'focus', 'plate'],
  gunner: ['blade', 'quiver', 'boots', 'heart', 'focus', 'plate'],
};
const PATHS = [0, 1].map((t) => [0, 1, 2].map((l) => lanePath(t, l)));

function nearestIdx(path: Pt[], x: number, y: number) {
  let b = 0, bd = 1e9;
  for (let i = 0; i < path.length; i++) { const d = dist(path[i].x, path[i].y, x, y); if (d < bd) { bd = d; b = i; } }
  return b;
}
function go(u: Unit, x: number, y: number, stopAt = 0.6) {
  const h = u.h!, dx = x - u.x, dy = y - u.y, l = Math.hypot(dx, dy);
  if (l <= stopAt) { h.mx = 0; h.my = 0; } else { h.mx = dx / l; h.my = dy / l; }
}
/** Walks towards a point, following the bot's lane when the point is far away. */
function travel(u: Unit, path: Pt[], x: number, y: number, stopAt = 0.6) {
  if (dist(u.x, u.y, x, y) < 12) return go(u, x, y, stopAt);
  const i = nearestIdx(path, u.x, u.y), j = nearestIdx(path, x, y);
  if (i === j) return go(u, x, y, stopAt);
  const n = path[i + Math.sign(j - i)]; go(u, n.x, n.y, 0.2);
}
function unsafe(w: World, team: number, x: number, y: number, self: Unit | null) {
  for (const s of w.structures) {
    if (!s.alive || s.team === team || dist(s.x, s.y, x, y) > s.range + 2.5) continue;
    if (self && s.aggro === self.id) return true;
    let cover = 0;
    for (const m of w.units.values()) if (m.alive && m.kind === 'minion' && m.team === team && dist(m.x, m.y, s.x, s.y) <= s.range) cover++;
    if (cover < 2) return true;
  }
  return false;
}

export function botThink(w: World, u: Unit) {
  const h = u.h!, d = HEROES[h.cls], pid = h.pid;
  while (h.sp > 0) {
    const pick = canRankUp(u, 2) ? 2 : h.ranks[0] <= h.ranks[1] ? (canRankUp(u, 0) ? 0 : 1) : canRankUp(u, 1) ? 1 : 0;
    if (!rankUp(w, pid, pick)) break;
  }
  if (!u.alive || inSanctuary(u)) for (const k of BUILD[h.cls] || []) if (!h.items.includes(k)) { if (h.gold >= ITEMS[k].cost) buyItem(w, pid, k); break; }
  if (!u.alive) return;
  const path = PATHS[u.team][h.lane], hpF = u.hp / u.maxHp;

  let foe: Unit | null = null, fd = 14;
  for (const o of w.heroes) if (o.alive && o.team !== u.team && o.h!.invuln <= 0) { const q = dist(o.x, o.y, u.x, u.y); if (q < fd) { fd = q; foe = o; } }

  if (h.mode === 'retreat') {
    if (inSanctuary(u)) { if (hpF > 0.9) h.mode = 'lane'; h.mx = 0; h.my = 0; return; }
    if (h.recall > 0) return;
    let threat = !!foe && fd < 13;
    if (!threat) for (const o of w.units.values()) if (o.alive && o.team !== u.team && (o.aggro === u.id || (isStruct(o) && dist(o.x, o.y, u.x, u.y) < o.range + 1))) { threat = true; break; }
    if (!threat && h.combat <= 0) { h.mx = 0; h.my = 0; startRecall(w, pid); return; }
    travel(u, path, SPAWN[u.team].x, SPAWN[u.team].y);
    return;
  }
  if (hpF < 0.3) { h.mode = 'retreat'; return; }

  // Where the lane's fight is: just behind the allied minion that has pushed furthest.
  let front = 0;
  for (const m of w.units.values()) if (m.alive && m.kind === 'minion' && m.team === u.team && m.lane === h.lane) front = Math.max(front, m.wp);
  let gi: number;
  if (front > 0) gi = front - 1 - (d.ranged ? 1 : 0);
  else {
    gi = 1;
    for (const s of w.structures) if (s.alive && s.team === u.team && s.kind === 'turret' && s.lane === h.lane) gi = Math.max(gi, nearestIdx(path, s.x, s.y) - 1);
  }
  gi = Math.max(1, Math.min(path.length - 2, gi));
  while (gi > 1 && unsafe(w, u.team, path[gi].x, path[gi].y, null)) gi--;
  const G = path[gi];

  if (unsafe(w, u.team, u.x, u.y, u)) { const i = nearestIdx(path, u.x, u.y); const b = path[Math.max(0, i - 2)]; go(u, b.x, b.y, 0.2); return; }

  if (foe && hpF > 0.35) {
    for (const slot of [2, 0, 1]) {
      const s = d.skills[slot], rank = h.ranks[slot];
      if (!rank || h.cds[slot] > 0 || h.mana < skillMana(s, rank)) continue;
      let ok = false, ax = foe.x, ay = foe.y;
      if (s.type === 'strike') ok = fd - foe.r <= s.range;
      else if (s.type === 'nova') ok = fd <= s.radius! + foe.r - 0.4;
      else if (s.type === 'cone') ok = fd <= s.range - 0.8;
      else if (s.type === 'shot') ok = fd <= s.range * 0.8;
      else if (s.type === 'zone') ok = s.heal ? hpF < 0.65 : fd <= s.range + s.radius! * 0.4;
      else if (s.type === 'buff') ok = s.heal ? hpF < 0.55 : fd <= u.range + 1.5;
      else if (s.type === 'dash') {
        if (s.dmg) ok = fd <= s.range && hpF > 0.5 && !unsafe(w, u.team, foe.x, foe.y, null);
        else { ok = fd <= u.range; ax = u.x + (u.x - foe.x); ay = u.y + (u.y - foe.y); if (unsafe(w, u.team, ax, ay, null)) ok = false; }
      }
      if (ok && castSkill(w, pid, slot, ax, ay)) break;
    }
    const want = d.ranged ? u.range - 1.2 : u.range * 0.8;
    if (dist(foe.x, foe.y, G.x, G.y) < 16 && !unsafe(w, u.team, foe.x, foe.y, null)) {
      if (d.ranged && fd < want - 2.2) go(u, u.x + (u.x - foe.x), u.y + (u.y - foe.y), 0);
      else if (fd - foe.r > want) go(u, foe.x, foe.y, 0);
      else { h.mx = 0; h.my = 0; }
      return;
    }
  }

  // No hero to fight: hit minions, or a structure the wave is already on.
  let tgt: Unit | null = null, td = 11;
  for (const o of w.units.values()) {
    if (!o.alive || o.team === u.team || o.kind === 'hero' || o.kind === 'monster') continue;
    if (isStruct(o) && (!structVulnerable(w, o) || unsafe(w, u.team, o.x, o.y, null))) continue;
    const q = dist(o.x, o.y, u.x, u.y) - o.r; if (q < td && dist(o.x, o.y, G.x, G.y) < 14) { td = q; tgt = o; }
  }
  if (tgt && !unsafe(w, u.team, tgt.x, tgt.y, null)) { if (td > u.range * 0.9) go(u, tgt.x, tgt.y, 0); else { h.mx = 0; h.my = 0; } return; }
  travel(u, path, G.x, G.y, 1.5);
}
