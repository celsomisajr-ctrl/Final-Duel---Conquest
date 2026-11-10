// Turns the client's view of the match into draw calls: scenery, units, effects, and the
// 2D overlay (health bars, names, damage numbers).
import { FLAG } from '../core/networking/protocol';
import { HEROES } from '../entities/heroes';
import { MONSTERS } from '../entities/units';
import { CAMPS, CORE, LANES, OBSTACLES, RIVER, SPAWN } from '../maps/conquest/map';
import type { GameClient, RUnit, StructView } from '../modes/conquest/client';
import { hex, type Renderer } from './gl';

const TEAM = [[0.31, 0.69, 1], [1, 0.36, 0.36], [0.85, 0.8, 0.6]];
const TEAM_CSS = ['#4fb0ff', '#ff5c5c', '#d9cc99'];
const STONE = [0.42, 0.41, 0.5], DARK = [0.2, 0.19, 0.26], WOOD = [0.36, 0.25, 0.16], LEAF = [0.16, 0.42, 0.22], LEAF2 = [0.22, 0.5, 0.25], ROCK = [0.4, 0.4, 0.44], SKIN = [0.93, 0.76, 0.6], STEEL = [0.78, 0.8, 0.86], WHITE = [1, 1, 1], SHADOW = [0, 0, 0];
const mix = (a: number[], b: number[], k: number) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const HERO_COL: Record<string, number[]> = Object.fromEntries(Object.values(HEROES).map((h) => [h.key, hex(h.color)]));

export function initMap(R: Renderer) {
  const segs: number[][] = []; for (const l of LANES) for (let i = 0; i < l.length - 1; i++) segs.push([l[i].x, l[i].y, l[i + 1].x, l[i + 1].y]);
  R.setMap(segs, [RIVER[0].x, RIVER[0].y, RIVER[1].x, RIVER[1].y], [CORE[0].x, CORE[0].y, CORE[1].x, CORE[1].y], [SPAWN[0].x, SPAWN[0].y, SPAWN[1].x, SPAWN[1].y]);
}

function scenery(R: Renderer, cx: number, cy: number) {
  for (const o of OBSTACLES) {
    if (Math.abs(o.x - cx) > 62 || Math.abs(o.y - cy) > 62) continue;
    R.decal(o.x, o.y, o.r * 1.25, 3, SHADOW, 0.5);
    if (o.k === 0) { R.mesh('sph', o.x, -o.r * 0.35, o.y, o.r * 2, o.r * 1.5, o.r * 2, o.x, ROCK); R.mesh('sph', o.x + o.r * 0.6, -0.2, o.y - o.r * 0.5, o.r, o.r * 0.9, o.r, 1, mix(ROCK, DARK, 0.3)); }
    else for (let i = 0; i < 3; i++) { const a = i * 2.1 + o.x, d = i ? o.r * 0.55 : 0, x = o.x + Math.cos(a) * d, y = o.y + Math.sin(a) * d, s = (i ? 0.75 : 1) * o.r;
      R.mesh('cyl', x, 0, y, s * 0.3, s * 0.9, s * 0.3, 0, WOOD); R.mesh('cone', x, s * 0.6, y, s * 1.5, s * 1.5, s * 1.5, 0, i % 2 ? LEAF2 : LEAF); R.mesh('cone', x, s * 1.4, y, s * 1.05, s * 1.3, s * 1.05, 0, i % 2 ? LEAF : LEAF2); }
  }
  for (const t of [0, 1]) { // Sanctuary obelisks
    for (let i = 0; i < 4; i++) { const a = i * 1.5708 + 0.785, x = SPAWN[t].x + Math.cos(a) * 9, y = SPAWN[t].y + Math.sin(a) * 9; R.mesh('box', x, 0, y, 1, 3.2, 1, 0.785, STONE); R.mesh('cone', x, 3.2, y, 1.3, 1.4, 1.3, 0, TEAM[t], 0.6); }
  }
}

function structure(R: Renderer, s: StructView, t: number, vulnerable: boolean) {
  const c = TEAM[s.team];
  R.decal(s.x, s.y, s.r * 1.6, 3, SHADOW, 0.55);
  if (s.hp <= 0) { R.mesh('cyl', s.x, 0, s.y, s.r * 2, 0.5, s.r * 2, 0, DARK); R.mesh('box', s.x + 0.6, 0.3, s.y, 1.3, 0.9, 1, 0.5, STONE); R.mesh('box', s.x - 0.7, 0.3, s.y + 0.5, 1, 0.6, 1.2, 1.2, DARK); return; }
  if (s.kind === 'core') {
    R.mesh('cyl', s.x, 0, s.y, 7, 1, 7, 0, STONE); R.mesh('cyl', s.x, 1, s.y, 5, 0.6, 5, 0, DARK);
    const y = 3.2 + Math.sin(t * 1.6) * 0.3; R.mesh('cone', s.x, y + 1.6, s.y, 2.6, 3, 2.6, t, c, 0.75); R.mesh('cone', s.x, y + 1.6, s.y, 2.6, -1.8, 2.6, t, mix(c, WHITE, 0.2), 0.75);
    for (let i = 0; i < 4; i++) { const a = t * 0.6 + i * 1.5708; R.mesh('box', s.x + Math.cos(a) * 3, 1.6, s.y + Math.sin(a) * 3, 0.5, 2.2, 0.5, a, STONE); }
    R.decal(s.x, s.y, 6, 1, c, 0.5 + 0.2 * Math.sin(t * 3), 0, 0.1);
  } else {
    R.mesh('cyl', s.x, 0, s.y, 4.4, 0.8, 4.4, 0, STONE); R.mesh('cyl', s.x, 0.8, s.y, 2.2, 3.4, 2.2, 0, mix(STONE, c, 0.18)); R.mesh('cyl', s.x, 4.2, s.y, 3, 0.5, 3, 0, DARK);
    R.mesh('cone', s.x, 4.9 + Math.sin(t * 2 + s.x) * 0.15, s.y, 1.3, 1.8, 1.3, t * 1.5, c, 0.8);
    if (s.tier === 2) R.mesh('cyl', s.x, 1.6, s.y, 2.6, 0.4, 2.6, 0, c, 0.3);
    if (!vulnerable) R.decal(s.x, s.y, 3.6, 1, [0.8, 0.85, 1], 0.55, 0, 0.14);
  }
}

function hero(R: Renderer, u: RUnit, t: number, now: number) {
  const c = HERO_COL[u.sub], tc = TEAM[u.team], f = u.face, fx = Math.cos(f), fy = Math.sin(f), rot = f + Math.PI / 2;
  const atk = Math.max(0, 1 - (now - u.atkT) / 180), bob = u.moving ? Math.abs(Math.sin(t * 11)) * 0.14 : 0, lunge = atk * 0.5;
  const x = u.x + fx * lunge, y = u.y + fy * lunge, hit = now - u.hitT < 90 ? 0.55 : 0, body = mix(c, WHITE, hit);
  const sx = -fy, sy = fx; // sideways
  R.mesh('cyl', x, 0.05 + bob, y, 1.25, 1.25, 1.25, rot, mix(body, DARK, 0.35), hit);
  R.mesh('cyl', x, 1.1 + bob, y, 1.45, 0.85, 1.2, rot, body, hit);
  R.mesh('box', x, 1.25 + bob, y, 1.9, 0.5, 0.8, rot, mix(tc, WHITE, 0.1), 0.25);
  R.mesh('sph', x, 1.9 + bob, y, 0.85, 0.85, 0.85, 0, SKIN);
  const hx = x + sx * 0.95 + fx * 0.3, hy = y + sy * 0.95 + fy * 0.3, sw = atk * 1.2;
  if (u.sub === 'swordsman') { R.mesh('box', hx + fx * (0.6 + sw * 0.5), 1.0 + bob + sw * 0.3, hy + fy * (0.6 + sw * 0.5), 0.16, 2.1, 0.34, rot + sw, STEEL, 0.25); R.mesh('box', x - sx * 0.95, 0.7 + bob, y - sy * 0.95, 0.2, 1.1, 0.9, rot, mix(tc, STEEL, 0.5)); }
  else if (u.sub === 'brawler') { R.mesh('sph', hx + fx * (0.5 + sw), 0.9 + bob, hy + fy * (0.5 + sw), 0.75, 0.75, 0.75, 0, [0.75, 0.2, 0.15]); R.mesh('sph', x - sx * 0.95 + fx * 0.5, 0.9 + bob, y - sy * 0.95 + fy * 0.5, 0.75, 0.75, 0.75, 0, [0.75, 0.2, 0.15]); }
  else if (u.sub === 'shaman') { R.mesh('cyl', hx, 0.1 + bob, hy, 0.14, 2.9, 0.14, 0, WOOD); R.mesh('sph', hx, 2.9 + bob, hy, 0.6, 0.6, 0.6, 0, c, 0.85); R.mesh('cone', x, 2.5 + bob, y, 1.0, 0.9, 1.0, 0, mix(c, DARK, 0.4)); }
  else if (u.sub === 'archer') { R.mesh('box', hx + fx * 0.5, 0.5 + bob, hy + fy * 0.5, 0.12, 2.2, 0.2, rot, WOOD); R.mesh('cone', x, 2.4 + bob, y, 0.95, 0.75, 0.95, 0, LEAF); }
  else if (u.sub === 'gunner') { R.mesh('box', hx + fx * (0.7 - atk * 0.3), 1.15 + bob, hy + fy * (0.7 - atk * 0.3), 0.22, 0.26, 1.7, rot, DARK); if (atk > 0.5) R.mesh('sph', hx + fx * 1.8, 1.1 + bob, hy + fy * 1.8, 0.6, 0.6, 0.6, 0, [1, 0.85, 0.4], 1); R.mesh('cyl', x, 2.45 + bob, y, 1.05, 0.2, 1.05, 0, DARK); }
  if (u.flags & FLAG.shield) R.mesh('sph', x, 0.1, y, 3, 3, 3, 0, [0.6, 0.8, 1], 0.2);
  if (u.flags & FLAG.stun) for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.09; R.mesh('sph', x + Math.cos(a) * 0.8, 3 + bob, y + Math.sin(a) * 0.8, 0.3, 0.3, 0.3, 0, [1, 0.9, 0.4], 1); }
}

function creature(R: Renderer, u: RUnit, t: number, now: number) {
  const f = u.face, fx = Math.cos(f), fy = Math.sin(f), rot = f + Math.PI / 2, hit = now - u.hitT < 90 ? 0.6 : 0, atk = Math.max(0, 1 - (now - u.atkT) / 200);
  const x = u.x + fx * atk * 0.4, y = u.y + fy * atk * 0.4, bob = u.moving ? Math.abs(Math.sin(t * 9 + u.id)) * 0.1 : 0;
  if (u.kind === 'minion') {
    const tc = mix(TEAM[u.team], WHITE, hit), big = u.sub === 'brute' ? 1.7 : 1;
    R.mesh('box', x, 0.05 + bob, y, 0.85 * big, 0.95 * big, 0.7 * big, rot, mix(tc, DARK, 0.3), hit); R.mesh('sph', x, 0.95 * big + bob, y, 0.6 * big, 0.6 * big, 0.6 * big, 0, tc, hit);
    if (u.sub === 'ranged') R.mesh('cone', x, 1.4 + bob, y, 0.7, 0.7, 0.7, 0, mix(tc, WHITE, 0.3)); else R.mesh('box', x + fx * 0.6 * big, 0.5 * big + bob, y + fy * 0.6 * big, 0.12 * big, 0.2 * big, 0.9 * big, rot, STEEL);
    return;
  }
  const s = u.r, w = (c: number[]) => mix(c, WHITE, hit);
  if (u.sub === 'mossling') { R.mesh('sph', x, bob, y, s * 2, s * 1.6, s * 2, 0, w([0.3, 0.62, 0.3]), hit); R.mesh('cone', x, s * 1.2 + bob, y, s * 0.8, s, s * 0.8, 0, w([0.5, 0.8, 0.35])); }
  else if (u.sub === 'thornback') { R.mesh('sph', x, bob, y, s * 2.1, s * 1.5, s * 2.1, 0, w([0.45, 0.33, 0.22]), hit); for (let i = 0; i < 5; i++) { const a = i * 1.256; R.mesh('cone', x + Math.cos(a) * s * 0.6, s * 1.1, y + Math.sin(a) * s * 0.6, s * 0.4, s * 0.9, s * 0.4, 0, w([0.75, 0.7, 0.55])); } }
  else if (u.sub === 'stag') { R.mesh('box', x, s * 0.5 + bob, y, s * 0.9, s * 0.9, s * 1.9, rot, w([0.72, 0.2, 0.2]), hit); R.mesh('sph', x + fx * s, s * 1.3 + bob, y + fy * s, s * 0.8, s * 0.8, s * 0.8, 0, w([0.8, 0.28, 0.25])); for (const d of [-1, 1]) R.mesh('cone', x + fx * s - fy * d * 0.4, s * 1.9 + bob, y + fy * s + fx * d * 0.4, 0.25, s * 1.1, 0.25, 0, w([1, 0.7, 0.4]), 0.5); }
  else if (u.sub === 'tortoise') { R.mesh('sph', x, -s * 0.3 + bob, y, s * 2.4, s * 1.5, s * 2.4, 0, w([0.2, 0.42, 0.75]), hit); R.mesh('sph', x + fx * s * 1.1, s * 0.3, y + fy * s * 1.1, s * 0.7, s * 0.6, s * 0.7, 0, w([0.4, 0.7, 0.6])); }
  else if (u.sub === 'lynx') { R.mesh('box', x, s * 0.4 + bob, y, s * 0.7, s * 0.7, s * 2, rot, w([0.35, 0.78, 0.72]), hit); R.mesh('sph', x + fx * s, s * 0.9 + bob, y + fy * s, s * 0.75, s * 0.7, s * 0.75, 0, w([0.5, 0.9, 0.82])); for (const d of [-1, 1]) R.mesh('cone', x + fx * s - fy * d * 0.3, s * 1.45 + bob, y + fy * s + fx * d * 0.3, 0.3, 0.5, 0.3, 0, w([0.3, 0.6, 0.6])); }
  else if (u.sub === 'colossus') {
    const st = w([0.36, 0.34, 0.44]); R.mesh('box', x, 0, y, s * 1.5, s * 1.9, s * 1.1, rot, st, hit); R.mesh('box', x, s * 1.9, y, s * 0.8, s * 0.7, s * 0.8, rot, mix(st, DARK, 0.2));
    R.mesh('sph', x + fx * s * 0.5, s * 0.9, y + fy * s * 0.5, s * 0.6, s * 0.6, s * 0.6, 0, [0.7, 0.4, 1], 0.9 + 0.1 * Math.sin(t * 4));
    for (const d of [-1, 1]) R.mesh('box', x - fy * d * s * 1.1 + fx * atk * s, s * (0.3 + atk * 0.5), y + fx * d * s * 1.1 + fy * atk * s, s * 0.55, s * 1.6, s * 0.55, rot, st);
  } else if (u.sub === 'emberwyrm') {
    for (let i = 0; i < 6; i++) { const a = f + Math.PI + Math.sin(t * 2 + i * 0.7) * 0.5, d = i * s * 0.55, k = 1 - i * 0.12; R.mesh('sph', x + Math.cos(a) * d, Math.sin(t * 3 + i) * 0.2 + (i ? 0 : 0.6), y + Math.sin(a) * d, s * 1.1 * k, s * 1.0 * k, s * 1.1 * k, 0, w(mix([1, 0.45, 0.12], [0.6, 0.12, 0.08], i / 6)), i ? 0.3 : 0.55 + hit); }
    for (const d of [-1, 1]) R.mesh('cone', x - fy * d * s * 0.3 + fx * s * 0.2, s * 1.3, y + fx * d * s * 0.3 + fy * s * 0.2, 0.4, 1.1, 0.4, 0, [1, 0.85, 0.4], 0.8);
  }
}

function effects(R: Renderer, c: GameClient, t: number, now: number) {
  for (const z of c.zones) {
    const k = z[1] as string, x = (z[2] as number) / 10, y = (z[3] as number) / 10, r = (z[4] as number) / 10, team = z[5] as number, delay = (z[6] as number) / 10, tc = team ? [1, 0.4, 0.35] : [0.4, 0.8, 1];
    if (k === 'well') { R.decal(x, y, r, 0, [0.3, 0.95, 0.6], 0.3); R.decal(x, y, r, 1, [0.5, 1, 0.7], 0.7, 0, 0.06); for (let i = 0; i < 6; i++) { const a = i * 1.05 + t, h = (t * 1.5 + i * 0.37) % 2.4; R.mesh('sph', x + Math.cos(a) * r * 0.6, h, y + Math.sin(a) * r * 0.6, 0.3, 0.3, 0.3, 0, [0.5, 1, 0.7], 1); } }
    else if (k === 'grenade') { R.decal(x, y, r, 1, [1, 0.5, 0.2], 0.8, 0, 0.08); R.decal(x, y, r * (1 - delay / 0.7), 0, [1, 0.4, 0.2], 0.35); R.mesh('sph', x, 0.2 + delay * 6 * (0.7 - delay), y, 0.6, 0.6, 0.6, 0, DARK); }
    else { R.decal(x, y, r, 0, tc, 0.22); R.decal(x, y, r, 1, tc, 0.7, 0, 0.05);
      for (let i = 0; i < 7; i++) { const s = Math.floor(t * 6) + i * 13.7, a = (s * 2.399) % 6.283, d = ((s * 0.618) % 1) * r, ph = (t * 6) % 1;
        if (k === 'storm') { if (i < 3) R.mesh('box', x + Math.cos(a) * d, 0, y + Math.sin(a) * d, 0.25, 14, 0.25, a, [0.75, 0.9, 1], 1); }
        else R.mesh('box', x + Math.cos(a) * d, 5 * (1 - ph), y + Math.sin(a) * d, 0.08, 1.6, 0.08, 0, [0.95, 0.9, 0.7], 0.7); } }
  }
  const age = (now - c.projAt) / 1000;
  for (const p of c.projs) {
    const k = p[1] as string, x = (p[2] as number) / 10 + ((p[4] as number) / 10) * age, y = (p[3] as number) / 10 + ((p[5] as number) / 10) * age, col = k === 'bolt' ? [0.4, 1, 0.9] : [1, 0.92, 0.6], a = Math.atan2(p[5] as number, p[4] as number);
    if (k === 'pierce') R.mesh('box', x, 1.2, y, 0.16, 0.16, 3.2, a + Math.PI / 2, col, 0.9); else { R.mesh('sph', x, 0.9, y, 1.1, 1.1, 1.1, 0, col, 1); R.mesh('sph', x - Math.cos(a) * 0.9, 1.0, y - Math.sin(a) * 0.9, 0.7, 0.7, 0.7, 0, col, 0.8); }
    R.decal(x, y, 1.6, 3, col, 0.5);
  }
  for (const f of c.fx) {
    const k = Math.min(1, (now - f.t) / (f.dur * 1000)), tc = f.team ? [1, 0.5, 0.4] : [0.55, 0.85, 1];
    if (f.k === 'bolt' || f.k === 'beam' || f.k === 'smash') {
      const a = c.posOf(f.from), b = c.posOf(f.to); if (!a || !b) continue;
      if (f.k === 'beam') { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy), n = Math.max(2, Math.round(l / 1.2)); for (let i = 0; i <= n; i++) { const q = i / n; R.mesh('sph', a.x + dx * q, a.h + (b.h - a.h) * q, a.y + dy * q, 0.45, 0.45, 0.45, 0, [1, 0.95, 0.7], 1); } R.decal(b.x, b.y, 1.8, 0, [1, 0.9, 0.5], 0.6 * (1 - k)); }
      else if (f.k === 'smash') R.decal(b.x, b.y, 2.6 * k + 1, 1, [1, 0.6, 0.3], 1 - k, 0, 0.2);
      else R.mesh('sph', a.x + (b.x - a.x) * k, a.h + (b.h - a.h) * k, a.y + (b.y - a.y) * k, 0.4, 0.4, 0.4, 0, [1, 0.95, 0.75], 1);
    }
    else if (f.k === 'buck') R.decal(f.x, f.y, f.r, 2, [1, 0.8, 0.4], 0.75 * (1 - k), f.a, f.w);
    else if (f.k === 'punish') { R.decal(f.x, f.y, 3.2 * (0.4 + k), 1, [1, 0.85, 0.4], 1 - k, 0, 0.2); R.mesh('box', f.x, 6 * (1 - k), f.y, 0.3, 5, 0.6, 0.4, STEEL, 0.8); }
    else if (f.k === 'lvl') { R.decal(f.x, f.y, f.r * (0.5 + k), 1, [1, 0.9, 0.5], 1 - k, 0, 0.15); R.mesh('cyl', f.x, 0, f.y, 2.2, 5 * k, 2.2, 0, [1, 0.9, 0.5], 1 - k * 0.5); }
    else if (f.k === 'recall') R.decal(f.x, f.y, f.r, 1, [0.5, 0.8, 1], 1 - k, 0, 0.2);
    else if (f.k === 'boom') { R.decal(f.x, f.y, f.r * k, 0, [1, 0.6, 0.25], 0.8 * (1 - k)); R.mesh('sph', f.x, 1, f.y, 6 * k, 6 * k, 6 * k, 0, [1, 0.7, 0.3], 1 - k); }
    else if (f.k === 'leap' || f.k === 'charge' || f.k === 'tumble') { for (let i = 0; i < 5; i++) { const q = i / 5; R.decal(f.x + (f.x2 - f.x) * q, f.y + (f.y2 - f.y) * q, 1.2, 0, tc, 0.4 * (1 - k)); } }
    else if (f.r > 0) { R.decal(f.x, f.y, f.r * (0.35 + 0.65 * k), 1, tc, 1 - k, 0, 0.16); R.decal(f.x, f.y, f.r, 0, tc, 0.3 * (1 - k)); }
  }
}

const vulnerable = (c: GameClient, s: StructView) => s.kind === 'turret' ? s.tier === 1 || !c.structs.some((o) => o.hp > 0 && o.kind === 'turret' && o.team === s.team && o.lane === s.lane && o.tier === 1) : c.structs.some((o) => o.hp <= 0 && o.kind === 'turret' && o.team === s.team && o.tier === 2);

export function drawScene(R: Renderer, c: GameClient, cam: { x: number; y: number }, t: number) {
  const now = performance.now(), flip = c.team === 1;
  R.begin(cam.x, cam.y, flip);
  scenery(R, cam.x, cam.y);
  for (const s of c.structs) if (Math.abs(s.x - cam.x) < 70 && Math.abs(s.y - cam.y) < 70) structure(R, s, t, vulnerable(c, s));
  c.camps[0] !== undefined && CAMPS.forEach((cd, i) => { if (!(c.camps[0] & (1 << i)) && Math.abs(cd.x - cam.x) < 60 && Math.abs(cd.y - cam.y) < 60) R.decal(cd.x, cd.y, MONSTERS[cd.key].epic ? 6 : 3.5, 1, [0.9, 0.85, 0.6], 0.25, 0, 0.08); });
  for (const u of c.units.values()) {
    const me = u.pid === c.you, tc = TEAM[u.team];
    R.decal(u.x, u.y, u.r * 1.5, 3, SHADOW, 0.6);
    if (u.kind === 'hero') {
      R.decal(u.x, u.y, 1.9, 1, me ? [1, 1, 1] : tc, 0.9, 0, 0.16); R.decal(u.x, u.y, 1.7, 0, tc, 0.18);
      if (u.flags & FLAG.recall) { R.decal(u.x, u.y, 2.6, 1, [0.5, 0.85, 1], 0.6 + 0.3 * Math.sin(t * 10), 0, 0.1); R.mesh('cyl', u.x, 0, u.y, 3.4, 6, 3.4, t, [0.5, 0.85, 1], 0.15); }
      if (u.flags & FLAG.invuln) R.mesh('sph', u.x, 0, u.y, 3.2, 3.4, 3.2, 0, [1, 0.95, 0.7], 0.18);
      hero(R, u, t, now);
    } else creature(R, u, t, now);
  }
  effects(R, c, t, now);
  R.end(t);
}

/** Health bars, names, and floating numbers, drawn on a 2D canvas over the scene. */
export function drawOverlay(g: CanvasRenderingContext2D, R: Renderer, c: GameClient) {
  const now = performance.now(), dpr = g.canvas.width / Math.max(1, R.w);
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, R.w, R.h); g.textAlign = 'center';
  const bar = (x: number, y: number, w: number, h: number, f: number, col: string) => { g.fillStyle = 'rgba(10,8,18,.8)'; g.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2); g.fillStyle = col; g.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, f)), h); };
  for (const s of c.structs) { if (s.hp <= 0) continue; const p = R.project(s.x, s.kind === 'core' ? 8.5 : 7.4, s.y); if (!p || p[0] < -60 || p[0] > R.w + 60 || p[1] < -30 || p[1] > R.h + 30) continue; bar(p[0], p[1], s.kind === 'core' ? 90 : 64, 6, s.hp / s.maxHp, TEAM_CSS[s.team]); }
  for (const u of c.units.values()) {
    const p = R.project(u.x, u.kind === 'hero' ? 3.3 : u.r * 2 + 1.3, u.y); if (!p) continue;
    const col = u.team === 2 ? '#e9c86a' : u.pid === c.you ? '#5fe08a' : TEAM_CSS[u.team];
    if (u.kind === 'hero') {
      bar(p[0], p[1], 62, 7, u.hp / u.maxHp, col);
      g.font = '600 11px system-ui,sans-serif'; g.lineWidth = 3; g.strokeStyle = 'rgba(10,8,18,.85)'; const label = `${u.level} · ${c.nameOf(u.pid)}`; g.strokeText(label, p[0], p[1] - 5); g.fillStyle = '#fff'; g.fillText(label, p[0], p[1] - 5);
    } else if (u.hp < u.maxHp || u.kind === 'monster') bar(p[0], p[1], u.kind === 'monster' ? Math.min(90, 26 + u.r * 20) : 30, 4, u.hp / u.maxHp, col);
  }
  g.font = '700 15px system-ui,sans-serif';
  for (const f of c.floats) { const k = (now - f.t) / 900, p = R.project(f.x, f.h + k * 2.2, f.y); if (!p) continue; g.globalAlpha = 1 - k * k; g.lineWidth = 3; g.strokeStyle = 'rgba(10,8,18,.9)'; g.strokeText(f.text, p[0], p[1]); g.fillStyle = f.color; g.fillText(f.text, p[0], p[1]); }
  g.globalAlpha = 1;
}
