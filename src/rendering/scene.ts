// Turns the client's view of the match into draw calls: scenery, units, effects, and the
// 2D overlay (health bars, names, damage numbers).
import { FLAG } from '../core/networking/protocol';
import { HEROES } from '../entities/heroes';
import { MONSTERS } from '../entities/units';
import { CAMPS, CORE, LANES, OBSTACLES, RIVER, SPAWN } from '../maps/conquest/map';
import type { Fx, GameClient, RUnit, StructView } from '../modes/conquest/client';
import { hex, type Renderer } from './gl';
import { buildHero, buildMinion, drawFigure, type Figure } from './models';

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
    for (let i = 0; i < 4; i++) { const a = i * 1.5708 + 0.785, x = SPAWN[t].x + Math.cos(a) * 9, y = SPAWN[t].y + Math.sin(a) * 9; R.mesh('box', x, 0, y, 1, 3.2, 1, 0.785, STONE); R.mesh('cone', x, 3.2, y, 1.3, 1.4, 1.3, 0, TEAM[t], 0.6); R.spr(x, 3.9, y, 4, 4, TEAM[t], 0.45); }
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
    R.decal(s.x, s.y, 6, 1, c, 0.5 + 0.2 * Math.sin(t * 3), 0, 0.1); R.spr(s.x, y + 2, s.y, 13, 13, c, 0.55 + 0.1 * Math.sin(t * 3)); R.spr(s.x, y + 2, s.y, 5, 5, WHITE, 0.5);
  } else {
    R.mesh('cyl', s.x, 0, s.y, 4.4, 0.8, 4.4, 0, STONE); R.mesh('cyl', s.x, 0.8, s.y, 2.2, 3.4, 2.2, 0, mix(STONE, c, 0.18)); R.mesh('cyl', s.x, 4.2, s.y, 3, 0.5, 3, 0, DARK);
    R.mesh('cone', s.x, 4.9 + Math.sin(t * 2 + s.x) * 0.15, s.y, 1.3, 1.8, 1.3, t * 1.5, c, 0.8); R.spr(s.x, 5.8, s.y, 6.5, 6.5, c, 0.5 + 0.12 * Math.sin(t * 4 + s.x));
    if (s.tier === 2) R.mesh('cyl', s.x, 1.6, s.y, 2.6, 0.4, 2.6, 0, c, 0.3);
    if (!vulnerable) R.decal(s.x, s.y, 3.6, 1, [0.8, 0.85, 1], 0.55, 0, 0.14);
  }
}

function creature(R: Renderer, u: RUnit, t: number, now: number) {
  const f = u.face, fx = Math.cos(f), fy = Math.sin(f), rot = f + Math.PI / 2, hit = now - u.hitT < 90 ? 0.6 : 0, atk = Math.max(0, 1 - (now - u.atkT) / 200);
  const x = u.x + fx * atk * 0.4, y = u.y + fy * atk * 0.4, bob = u.moving ? Math.abs(Math.sin(t * 9 + u.id)) * 0.1 : 0;
  const s = u.r, w = (c: number[]) => mix(c, WHITE, hit);
  if (u.sub === 'mossling') { R.mesh('sph', x, bob, y, s * 2, s * 1.6, s * 2, 0, w([0.3, 0.62, 0.3]), hit); R.mesh('cone', x, s * 1.2 + bob, y, s * 0.8, s, s * 0.8, 0, w([0.5, 0.8, 0.35])); }
  else if (u.sub === 'thornback') { R.mesh('sph', x, bob, y, s * 2.1, s * 1.5, s * 2.1, 0, w([0.45, 0.33, 0.22]), hit); for (let i = 0; i < 5; i++) { const a = i * 1.256; R.mesh('cone', x + Math.cos(a) * s * 0.6, s * 1.1, y + Math.sin(a) * s * 0.6, s * 0.4, s * 0.9, s * 0.4, 0, w([0.75, 0.7, 0.55])); } }
  else if (u.sub === 'stag') { R.mesh('box', x, s * 0.5 + bob, y, s * 0.9, s * 0.9, s * 1.9, rot, w([0.72, 0.2, 0.2]), hit); R.mesh('sph', x + fx * s, s * 1.3 + bob, y + fy * s, s * 0.8, s * 0.8, s * 0.8, 0, w([0.8, 0.28, 0.25])); for (const d of [-1, 1]) R.mesh('cone', x + fx * s - fy * d * 0.4, s * 1.9 + bob, y + fy * s + fx * d * 0.4, 0.25, s * 1.1, 0.25, 0, w([1, 0.7, 0.4]), 0.5); }
  else if (u.sub === 'tortoise') { R.mesh('sph', x, -s * 0.3 + bob, y, s * 2.4, s * 1.5, s * 2.4, 0, w([0.2, 0.42, 0.75]), hit); R.mesh('sph', x + fx * s * 1.1, s * 0.3, y + fy * s * 1.1, s * 0.7, s * 0.6, s * 0.7, 0, w([0.4, 0.7, 0.6])); }
  else if (u.sub === 'lynx') { R.mesh('box', x, s * 0.4 + bob, y, s * 0.7, s * 0.7, s * 2, rot, w([0.35, 0.78, 0.72]), hit); R.mesh('sph', x + fx * s, s * 0.9 + bob, y + fy * s, s * 0.75, s * 0.7, s * 0.75, 0, w([0.5, 0.9, 0.82])); for (const d of [-1, 1]) R.mesh('cone', x + fx * s - fy * d * 0.3, s * 1.45 + bob, y + fy * s + fx * d * 0.3, 0.3, 0.5, 0.3, 0, w([0.3, 0.6, 0.6])); }
  else if (u.sub === 'colossus') {
    const st = w([0.36, 0.34, 0.44]); R.mesh('box', x, 0, y, s * 1.5, s * 1.9, s * 1.1, rot, st, hit); R.mesh('box', x, s * 1.9, y, s * 0.8, s * 0.7, s * 0.8, rot, mix(st, DARK, 0.2));
    R.mesh('sph', x + fx * s * 0.5, s * 0.9, y + fy * s * 0.5, s * 0.6, s * 0.6, s * 0.6, 0, [0.7, 0.4, 1], 0.9 + 0.1 * Math.sin(t * 4)); R.spr(x + fx * s * 0.5, s * 1.2, y + fy * s * 0.5, 7, 7, [0.7, 0.4, 1], 0.55 + 0.15 * Math.sin(t * 4));
    for (const d of [-1, 1]) R.mesh('box', x - fy * d * s * 1.1 + fx * atk * s, s * (0.3 + atk * 0.5), y + fx * d * s * 1.1 + fy * atk * s, s * 0.55, s * 1.6, s * 0.55, rot, st);
  } else if (u.sub === 'emberwyrm') {
    for (let i = 0; i < 6; i++) { const a = f + Math.PI + Math.sin(t * 2 + i * 0.7) * 0.5, d = i * s * 0.55, k = 1 - i * 0.12; R.mesh('sph', x + Math.cos(a) * d, Math.sin(t * 3 + i) * 0.2 + (i ? 0 : 0.6), y + Math.sin(a) * d, s * 1.1 * k, s * 1.0 * k, s * 1.1 * k, 0, w(mix([1, 0.45, 0.12], [0.6, 0.12, 0.08], i / 6)), i ? 0.3 : 0.55 + hit); }
    R.spr(x, 1.6, y, 9, 9, [1, 0.45, 0.12], 0.35 + 0.1 * Math.sin(t * 6)); if (Math.random() < 0.3) puff(x + rnd(-2, 2), 1.5, y + rnd(-2, 2), 0, rnd(2, 5), 0, 0, 0.7, 0.9, -0.6, [1, 0.6, 0.2], 0.8);
    for (const d of [-1, 1]) R.mesh('cone', x - fy * d * s * 0.3 + fx * s * 0.2, s * 1.3, y + fx * d * s * 0.3 + fy * s * 0.2, 0.4, 1.1, 0.4, 0, [1, 0.85, 0.4], 0.8);
  }
}


// ---- particles (the Arena's sprite puffs) ----
interface Puff { x: number; h: number; y: number; vx: number; vh: number; vy: number; g: number; t: number; dur: number; s: number; grow: number; c: number[]; a: number }
const puffs: Puff[] = [];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
function puff(x: number, h: number, y: number, vx: number, vh: number, vy: number, g: number, dur: number, s: number, grow: number, c: number[], a: number) { if (puffs.length < 500) puffs.push({ x, h, y, vx, vh, vy, g, t: 0, dur, s, grow, c, a }); }
function burst(x: number, h: number, y: number, n: number, speed: number, c: number[], size = 0.7, up = 4) { for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), v = speed * rnd(0.4, 1.1); puff(x, h, y, Math.cos(a) * v, rnd(up * 0.4, up), Math.sin(a) * v, -14, rnd(0.35, 0.7), size * rnd(0.7, 1.3), -size * 0.6, c, 0.95); } }
function dust(x: number, y: number, r: number, n: number) { for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + rnd(0, 0.4); puff(x + Math.cos(a) * r * 0.5, 0.3, y + Math.sin(a) * r * 0.5, Math.cos(a) * r * 1.6, rnd(0.5, 2), Math.sin(a) * r * 1.6, 0, rnd(0.5, 0.8), rnd(1.6, 2.6), 2.4, [0.7, 0.62, 0.5], 0.28); } }
function tickPuffs(R: Renderer, dt: number) {
  for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.t += dt; if (p.t >= p.dur) { puffs.splice(i, 1); continue; }
    p.vh += p.g * dt; p.x += p.vx * dt; p.h = Math.max(0.1, p.h + p.vh * dt); p.y += p.vy * dt; const k = p.t / p.dur, s = Math.max(0.05, p.s + p.grow * k); R.spr(p.x, p.h, p.y, s, s, p.c, p.a * (1 - k)); }
}

// ---- heroes and minions: Arena figures ----
const figures = new Map<number, Figure>();
const HS = 0.075, MS = 0.05; // model units -> world units
const SKILL_T: Record<string, number> = { whirl: 0.5, leap: 0.3, 'leap-land': 0.28, punish: 0.45, slam: 0.3, tumble: 0.22, buck: 0.25, 'grenade-cast': 0.35, bloodlust: 0.5, overclock: 0.5, 'storm-cast': 0.5, 'rain-cast': 0.5, 'well-cast': 0.5, charge: 0.25 };
const CAST_KEYS = new Set(['bolt-cast', 'storm-cast', 'well-cast']);

function figure(R: Renderer, c: GameClient, u: RUnit, t: number, now: number, dt: number) {
  let H = figures.get(u.id);
  if (!H) { H = u.kind === 'hero' ? buildHero(R, u.sub, HEROES[u.sub].color, TEAM[u.team]) : buildMinion(R, u.sub, TEAM[u.team]); figures.set(u.id, H); }
  if (u.atkT !== H.atkAt) { H.atkAt = u.atkT; H.lastAtk++; H.side = 1 - H.side; }
  const hero = u.kind === 'hero', sinceCast = (now - u.castT) / 1000, dur = SKILL_T[u.castK] || 0, aura = now < u.auraUntil ? u.auraK : '';
  let swing = Math.max(0, 0.24 - (now - u.atkT) / 1000), cast = CAST_KEYS.has(u.castK) ? Math.max(0, 0.4 - sinceCast) : 0;
  if ((u.castK === 'pierce-cast' || u.castK === 'rain-cast') && sinceCast < 0.24) swing = Math.max(swing, 0.24 - sinceCast);
  const hurt = now - u.hitT < 110, flash = hurt ? [0.55, 0.06, 0.06] : u.flags & FLAG.invuln ? [0.2, 0.2, 0.26] : aura === 'bloodlust' ? [0.3 + 0.14 * Math.sin(t * 9), 0.02, 0.05] : aura === 'overclock' ? [0.3 + 0.1 * Math.sin(t * 12), 0.12, 0.02] : null;
  const scale = hero ? HS : u.sub === 'brute' ? MS * 1.45 : MS;
  const tip = drawFigure(R, H, { x: u.x, y: u.y, face: u.face, scale, dt, t, swing, cast, skill: dur ? u.castK : '', skillK: dur ? sinceCast / dur : 1, dash: !!(u.flags & FLAG.dash), stun: !!(u.flags & FLAG.stun), shield: !!(u.flags & FLAG.shield), flash });
  u.tip = tip;
  if (!hero) { if (u.sub === 'ranged') R.spr(tip[0], tip[1], tip[2], 1.1, 1.1, TEAM[u.team], 0.7); return; }
  const col = HERO_COL[u.sub];
  if (u.sub === 'shaman') { R.spr(tip[0], tip[1], tip[2], 2.6, 2.6, col, 0.75 + 0.15 * Math.sin(t * 5)); R.spr(tip[0], tip[1], tip[2], 1, 1, WHITE, 0.6); }
  if (u.sub === 'gunner' && swing > 0.17) { R.spr(tip[0], tip[1], tip[2], 2.4, 2.4, [1, 0.8, 0.4], 0.95); R.spr(tip[0], tip[1], tip[2], 1, 1, WHITE, 0.9); }
  if (u.flags & FLAG.stun) for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.094; R.spr(u.x + Math.cos(a) * 1.05, 4.35, u.y + Math.sin(a) * 1.05, 0.7, 0.7, [1, 0.88, 0.54], 0.95); }
  if (u.flags & FLAG.slow) R.decal(u.x, u.y, 1.5, 1, [0.6, 0.85, 1], 0.5, 0, 0.3);
  if (aura === 'bloodlust') { R.spr(u.x, 1.8, u.y, 5.5, 5.5, [1, 0.1, 0.23], 0.22 + 0.08 * Math.sin(t * 8)); if (Math.random() < 0.35) puff(u.x + rnd(-1, 1), rnd(0.6, 3), u.y + rnd(-1, 1), 0, rnd(1.5, 3.5), 0, 0, 0.8, 0.6, -0.4, [1, 0.16, 0.29], 0.8); }
  if (aura === 'overclock') { R.spr(tip[0], tip[1], tip[2], 3, 3, [1, 0.48, 0.12], 0.9); R.spr(tip[0], tip[1], tip[2], 1.2, 1.2, [1, 0.9, 0.63], 0.9); R.spr(u.x, 2, u.y, 8, 8, [1, 0.42, 0.12], 0.26 + 0.08 * Math.sin(t * 10)); if (Math.random() < 0.6) puff(tip[0], tip[1], tip[2], rnd(-0.7, 0.7), rnd(3, 6), rnd(-0.7, 0.7), 0, 0.45, rnd(0.7, 1.2), -0.5, Math.random() < 0.5 ? [1, 0.48, 0.12] : [1, 0.83, 0.42], 0.9); }
  if (u.castK === 'whirl' && sinceCast < 0.5) { // the Arena's whirl glow: a sweeping blade arc
    const R0 = 4.6, n = 14, head = -t * 22; for (let i = 0; i < n; i++) { const a = head + (i / n) * 4.2, k = 1 - i / n; R.spr(u.x + Math.cos(a) * R0 * 0.8, 1.7, u.y + Math.sin(a) * R0 * 0.8, 2.2 * k + 0.6, 2.2 * k + 0.6, [1, 0.92, 0.66], 0.55 * k); }
    R.decal(u.x, u.y, R0, 1, [1, 0.9, 0.6], 0.5 * (1 - sinceCast / 0.5), 0, 0.12); }
  if ((u.castK === 'leap' || u.castK === 'charge' || u.castK === 'tumble') && u.flags & FLAG.dash && Math.random() < 0.9) puff(u.x + rnd(-0.6, 0.6), 0.3, u.y + rnd(-0.6, 0.6), rnd(-1.5, 1.5), rnd(0.7, 2.5), rnd(-1.5, 1.5), 0, 0.6, rnd(1.1, 1.8), 1.6, [0.72, 0.64, 0.52], 0.25);
  if (u.flags & FLAG.recall) for (let i = 0; i < 5; i++) { const h = (t * 2.2 + i * 0.9) % 4.5, a = t * 3 + i * 1.256; R.spr(u.x + Math.cos(a) * 1.7, h, u.y + Math.sin(a) * 1.7, 0.7, 0.7, [0.55, 0.85, 1], 0.9 * (1 - h / 4.5)); }
}

function bolt(R: Renderer, x: number, y: number, r: number, t: number) { // a jagged lightning strike
  const seed = Math.floor(t * 22); let px = x, ph = 26, py = y;
  for (let i = 1; i <= 8; i++) { const k = i / 8, j = i === 8 ? 0 : 1.6 * (1 - k * 0.35), h1 = (Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % 1, h2 = (Math.sin(seed * 39.3468 + i * 11.135) * 24634.6345) % 1;
    const nx = x + h1 * j, ny = y + h2 * j, nh = 26 * (1 - k); R.beam([px, ph, py], [nx, nh, ny], 1.5, [0.55, 0.8, 1], 0.5); R.beam([px, ph, py], [nx, nh, ny], 0.45, [1, 1, 1], 0.95); px = nx; ph = nh; py = ny; }
  R.spr(x, 0.6, y, r * 1.6, r * 1.6, [0.7, 0.88, 1], 0.7); R.decal(x, y, r * 0.5, 0, [0.8, 0.92, 1], 0.5);
}

const started = new WeakSet<Fx>();
function effects(R: Renderer, c: GameClient, t: number, now: number, dt: number) {
  for (const z of c.zones) {
    const k = z[1] as string, x = (z[2] as number) / 10, y = (z[3] as number) / 10, r = (z[4] as number) / 10, team = z[5] as number, delay = (z[6] as number) / 10, tc = team ? [1, 0.4, 0.35] : [0.4, 0.8, 1];
    if (k === 'well') { R.decal(x, y, r, 0, [0.3, 0.95, 0.6], 0.22); R.decal(x, y, r, 1, [0.5, 1, 0.7], 0.7, 0, 0.06); R.decal(x, y, r * (0.3 + 0.7 * ((t * 0.8) % 1)), 1, [0.6, 1, 0.8], 0.5 * (1 - ((t * 0.8) % 1)), 0, 0.1);
      R.mesh('cyl', x, 0, y, 0.7, 1.6, 0.7, 0, [0.42, 0.29, 0.18]); R.mesh('sph', x, 1.5, y, 1, 1, 1, 0, [0.4, 1, 0.7], 1); R.spr(x, 2, y, 4.5, 4.5, [0.4, 1, 0.65], 0.6 + 0.15 * Math.sin(t * 5));
      for (let i = 0; i < 8; i++) { const a = i * 0.785 + t * 0.7, h = (t * 1.6 + i * 0.37) % 3; R.spr(x + Math.cos(a) * r * (0.35 + 0.08 * i), h, y + Math.sin(a) * r * (0.35 + 0.08 * i), 0.55, 0.55, [0.55, 1, 0.75], 0.9 * (1 - h / 3)); }
      for (const u of c.units.values()) if (u.kind === 'hero' && u.team === team && Math.hypot(u.x - x, u.y - y) <= r + 1.1) R.beam([x, 2, y], [u.x, 1.8, u.y], 0.35, [0.45, 1, 0.7], 0.5 + 0.2 * Math.sin(t * 9)); }
    else if (k === 'grenade') { const q = 1 - delay / 0.7, h = 0.4 + 6 * q * (1 - q); R.decal(x, y, r, 1, [1, 0.5, 0.2], 0.8, 0, 0.08); R.decal(x, y, r * q, 0, [1, 0.4, 0.2], 0.3); R.mesh('sph', x, h, y, 0.6, 0.6, 0.6, 0, DARK); R.spr(x, h + 0.5, y, 1.4, 1.4, [1, 0.5, 0.2], 0.6 + 0.4 * Math.sin(t * 30)); }
    else if (k === 'storm') { R.decal(x, y, r, 0, [0.35, 0.55, 0.95], 0.18); R.decal(x, y, r, 1, [0.6, 0.85, 1], 0.75, 0, 0.05); R.decal(x, y, r * 0.62, 1, [0.6, 0.85, 1], 0.4, t * 0.6, 0.05);
      for (let i = 0; i < 2; i++) { const s = Math.floor(t * 5 + i * 0.5) * 7.13 + i * 3.7, a = (s * 2.399) % 6.283, d = ((s * 0.618) % 1) * r * 0.85, ph = (t * 5 + i * 0.5) % 1; if (ph < 0.45) bolt(R, x + Math.cos(a) * d, y + Math.sin(a) * d, 3, t); }
      R.spr(x, 22, y, r * 3.4, 9, [0.3, 0.4, 0.7], 0.35); }
    else { R.decal(x, y, r, 0, tc, 0.16); R.decal(x, y, r, 1, tc, 0.7, 0, 0.05);
      for (let i = 0; i < 12; i++) { const s = Math.floor(t * 7 + i * 0.31) * 3.91 + i * 13.7, a = (s * 2.399) % 6.283, d = ((s * 0.618) % 1) * r, ph = (t * 7 + i * 0.31) % 1, ax = x + Math.cos(a) * d, ay = y + Math.sin(a) * d, h = 13 * (1 - ph);
        R.beam([ax + 0.5, h + 2.2, ay], [ax, h, ay], 0.22, [1, 0.95, 0.75], 0.9); if (ph > 0.9) R.spr(ax, 0.3, ay, 1.3, 1.3, [1, 0.9, 0.6], 0.7); } }
  }
  const age = (now - c.projAt) / 1000;
  for (const p of c.projs) {
    const k = p[1] as string, x = (p[2] as number) / 10 + ((p[4] as number) / 10) * age, y = (p[3] as number) / 10 + ((p[5] as number) / 10) * age, a = Math.atan2(p[5] as number, p[4] as number), ca = Math.cos(a), sa = Math.sin(a);
    if (k === 'pierce') { R.mesh('box', x, 1.5, y, 0.14, 0.14, 3.4, a + Math.PI / 2, [0.85, 0.78, 0.6], 0.6); R.mesh('cone', x + ca * 1.9, 1.5, y + sa * 1.9, 0.4, 0.4, 0.4, 0, STEEL, 0.5); R.beam([x - ca * 5, 1.5, y - sa * 5], [x + ca * 1.6, 1.5, y + sa * 1.6], 0.7, [1, 0.92, 0.6], 0.55); R.spr(x + ca * 1.7, 1.5, y + sa * 1.7, 1.6, 1.6, [1, 0.95, 0.7], 0.8); }
    else { const col = [0.38, 0.94, 0.86]; R.spr(x, 1.5, y, 3.4, 3.4, col, 0.75); R.spr(x, 1.5, y, 1.5, 1.5, WHITE, 0.9); R.beam([x - ca * 3.2, 1.5, y - sa * 3.2], [x, 1.5, y], 1.1, col, 0.6);
      if (Math.random() < 0.7) puff(x + rnd(-0.3, 0.3), 1.5 + rnd(-0.3, 0.3), y + rnd(-0.3, 0.3), -ca * 2, rnd(-0.5, 1), -sa * 2, 0, 0.4, 0.7, -0.5, col, 0.8); }
    R.decal(x, y, 1.4, 3, [0.4, 0.9, 0.8], 0.35);
  }
  for (const f of c.fx) {
    const k = Math.min(1, (now - f.t) / (f.dur * 1000)), tc = f.team ? [1, 0.5, 0.4] : [0.55, 0.85, 1], first = !started.has(f); if (first) started.add(f);
    if (f.k === 'bolt' || f.k === 'beam' || f.k === 'smash') {
      const src = c.units.get(f.from), a0 = c.posOf(f.from), b = c.posOf(f.to); if (!a0 || !b) continue;
      const a = src && src.tip ? { x: src.tip[0], h: src.tip[1], y: src.tip[2] } : a0;
      if (f.k === 'beam') { R.beam([a.x, a.h + 0.6, a.y], [b.x, b.h, b.y], 1.3, tcAbs(c, f.from), 0.75 * (1 - k)); R.beam([a.x, a.h + 0.6, a.y], [b.x, b.h, b.y], 0.4, WHITE, 0.95 * (1 - k)); R.spr(a.x, a.h + 0.6, a.y, 4.5, 4.5, tcAbs(c, f.from), 0.8 * (1 - k)); R.spr(b.x, b.h, b.y, 3.2, 3.2, [1, 0.9, 0.6], 0.9 * (1 - k)); if (first) burst(b.x, b.h, b.y, 5, 3, [1, 0.85, 0.5], 0.5); }
      else if (f.k === 'smash') { R.decal(b.x, b.y, 2.6 * k + 1, 1, [1, 0.6, 0.3], 1 - k, 0, 0.2); if (first) dust(b.x, b.y, 2, 8); }
      else { const x = a.x + (b.x - a.x) * k, h = a.h + (b.h - a.h) * k, y = a.y + (b.y - a.y) * k, ang = Math.atan2(b.y - a.y, b.x - a.x), sub = src?.sub;
        if (sub === 'archer') { R.mesh('box', x, h, y, 0.1, 0.1, 1.9, ang + Math.PI / 2, [0.85, 0.78, 0.6], 0.5); R.spr(x, h, y, 1.1, 1.1, [1, 0.95, 0.7], 0.6); }
        else if (sub === 'gunner') { R.beam([x - Math.cos(ang) * 1.6, h, y - Math.sin(ang) * 1.6], [x, h, y], 0.3, [1, 0.9, 0.55], 0.95); R.spr(x, h, y, 0.9, 0.9, [1, 0.9, 0.6], 0.75); }
        else { const col = sub === 'shaman' ? [0.38, 0.94, 0.86] : src ? TEAM[src.team] : [1, 0.9, 0.6]; R.spr(x, h, y, sub === 'shaman' ? 1.9 : 1.2, sub === 'shaman' ? 1.9 : 1.2, col, 0.85); R.spr(x, h, y, 0.6, 0.6, WHITE, 0.8); }
        if (k > 0.92 && src?.kind === 'hero' && Math.random() < 0.5) puff(b.x, b.h, b.y, rnd(-2, 2), rnd(1, 3), rnd(-2, 2), -12, 0.3, 0.45, -0.3, [1, 0.9, 0.6], 0.9); }
    }
    else if (f.k === 'buck') { R.decal(f.x, f.y, f.r, 2, [1, 0.8, 0.4], 0.6 * (1 - k), f.a, f.w); if (first) for (let i = 0; i < 12; i++) { const a = f.a + rnd(-f.w, f.w), v = rnd(22, 34); puff(f.x + Math.cos(a) * 1.5, 1.7, f.y + Math.sin(a) * 1.5, Math.cos(a) * v, rnd(-0.5, 0.5), Math.sin(a) * v, 0, 0.2, 0.55, 0, [1, 0.88, 0.5], 0.95); } R.spr(f.x + Math.cos(f.a) * 1.8, 1.8, f.y + Math.sin(f.a) * 1.8, 4 * (1 - k), 4 * (1 - k), [1, 0.75, 0.35], 0.9); }
    else if (f.k === 'punish') { R.decal(f.x, f.y, 3.2 * (0.4 + k), 1, [1, 0.85, 0.4], 1 - k, 0, 0.2); R.beam([f.x2, 2, f.y2], [f.x, 2, f.y], 1.6 * (1 - k), [1, 0.9, 0.55], 0.8 * (1 - k)); for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; R.beam([f.x + Math.cos(a) * 3.2, 5 - 4 * k, f.y + Math.sin(a) * 3.2], [f.x - Math.cos(a) * 3.2, 0.6 + 2 * k, f.y - Math.sin(a) * 3.2], 0.5, WHITE, 0.9 * (1 - k)); } R.spr(f.x, 2, f.y, 7 * (1 - k), 7 * (1 - k), [1, 0.9, 0.6], 0.8); if (first) burst(f.x, 2, f.y, 14, 7, [1, 0.88, 0.5], 0.7, 7); }
    else if (f.k === 'lvl') { R.decal(f.x, f.y, f.r * (0.5 + k), 1, [1, 0.9, 0.5], 1 - k, 0, 0.15); for (let i = 0; i < 6; i++) { const a = i * 1.047 + k * 3; R.spr(f.x + Math.cos(a) * 1.5, 5 * k + i * 0.25, f.y + Math.sin(a) * 1.5, 1.2, 1.2, [1, 0.9, 0.5], 1 - k); } R.spr(f.x, 2.2, f.y, 7, 9, [1, 0.88, 0.5], 0.5 * (1 - k)); }
    else if (f.k === 'recall') R.decal(f.x, f.y, f.r, 1, [0.5, 0.8, 1], 1 - k, 0, 0.2);
    else if (f.k === 'boom' || f.k === 'grenade-boom') { const r = f.r || 4; R.decal(f.x, f.y, r * (0.3 + 0.7 * k), 1, [1, 0.6, 0.25], 0.9 * (1 - k), 0, 0.25); R.decal(f.x, f.y, r * 0.8, 0, [0.1, 0.08, 0.06], 0.35 * (1 - k)); R.spr(f.x, 1.5, f.y, r * 3 * (0.5 + k), r * 3 * (0.5 + k), [1, 0.6, 0.2], 0.85 * (1 - k)); R.spr(f.x, 1.5, f.y, r * (1 - k), r * (1 - k), WHITE, 0.9 * (1 - k));
      if (first) { burst(f.x, 1, f.y, 18, r * 2.2, [1, 0.62, 0.2], 1, 9); burst(f.x, 1, f.y, 8, r * 1.2, [1, 0.9, 0.6], 0.6, 6); dust(f.x, f.y, r * 0.8, 10); } }
    else if (f.k === 'leap-land' || f.k === 'slam') { R.decal(f.x, f.y, f.r * (0.3 + 0.7 * k), 1, f.k === 'slam' ? [1, 0.55, 0.3] : [1, 0.88, 0.55], 1 - k, 0, 0.18); R.decal(f.x, f.y, f.r * 0.9, 0, [0.08, 0.06, 0.05], 0.3 * (1 - k)); R.spr(f.x, 0.8, f.y, f.r * 2.4 * (1 - k * 0.5), f.r * 1.2, f.k === 'slam' ? [1, 0.5, 0.25] : [1, 0.85, 0.5], 0.55 * (1 - k));
      if (first) { dust(f.x, f.y, f.r * 0.7, 12); burst(f.x, 0.5, f.y, 10, f.r * 1.5, f.k === 'slam' ? [0.75, 0.55, 0.4] : [1, 0.88, 0.55], 0.6, 6); } }
    else if (f.k === 'leap' || f.k === 'charge' || f.k === 'tumble') { if (f.k !== 'tumble') R.beam([f.x, 1.6, f.y], [f.x + (f.x2 - f.x) * Math.min(1, k * 2.2), 1.6, f.y + (f.y2 - f.y) * Math.min(1, k * 2.2)], 1.6, tc, 0.4 * (1 - k)); }
    else if (f.k === 'bloodlust') { R.decal(f.x, f.y, 3.5 * k + 0.8, 1, [1, 0.15, 0.25], 1 - k, 0, 0.2); if (first) burst(f.x, 1.5, f.y, 16, 5, [1, 0.16, 0.29], 0.8, 7); }
    else if (f.k === 'overclock') { R.decal(f.x, f.y, 3.5 * k + 0.8, 1, [1, 0.55, 0.15], 1 - k, 0, 0.2); if (first) burst(f.x, 1.5, f.y, 16, 5, [1, 0.6, 0.2], 0.8, 7); }
    else if (f.k === 'whirl') { R.decal(f.x, f.y, f.r, 0, [1, 0.9, 0.6], 0.2 * (1 - k)); if (first) dust(f.x, f.y, f.r * 0.5, 8); }
    else if (f.k.endsWith('-cast')) { const src = c.units.get(f.from); if (src?.tip && k < 0.6) R.spr(src.tip[0], src.tip[1], src.tip[2], 3.5 * (1 - k), 3.5 * (1 - k), HERO_COL[src.sub] || WHITE, 0.8); }
    else if (f.r > 0) { R.decal(f.x, f.y, f.r * (0.35 + 0.65 * k), 1, tc, 1 - k, 0, 0.16); R.decal(f.x, f.y, f.r, 0, tc, 0.3 * (1 - k)); }
  }
  tickPuffs(R, dt);
}
const tcAbs = (c: GameClient, id: number) => (id >= 1 && id <= c.structs.length ? TEAM[c.structs[id - 1].team] : [1, 0.9, 0.6]);

const vulnerable = (c: GameClient, s: StructView) => s.kind === 'turret' ? s.tier === 1 || !c.structs.some((o) => o.hp > 0 && o.kind === 'turret' && o.team === s.team && o.lane === s.lane && o.tier === 1) : c.structs.some((o) => o.hp <= 0 && o.kind === 'turret' && o.team === s.team && o.tier === 2);

export function drawScene(R: Renderer, c: GameClient, cam: { x: number; y: number }, t: number, dt = 0.016) {
  const now = performance.now(), flip = c.team === 1;
  R.begin(cam.x, cam.y, flip);
  scenery(R, cam.x, cam.y);
  for (const s of c.structs) if (Math.abs(s.x - cam.x) < 70 && Math.abs(s.y - cam.y) < 70) structure(R, s, t, vulnerable(c, s));
  c.camps[0] !== undefined && CAMPS.forEach((cd, i) => { if (!(c.camps[0] & (1 << i)) && Math.abs(cd.x - cam.x) < 60 && Math.abs(cd.y - cam.y) < 60) R.decal(cd.x, cd.y, MONSTERS[cd.key].epic ? 6 : 3.5, 1, [0.9, 0.85, 0.6], 0.25, 0, 0.08); });
  for (const id of figures.keys()) if (!c.units.has(id)) figures.delete(id);
  for (const u of c.units.values()) {
    const me = u.pid === c.you, tc = TEAM[u.team];
    R.decal(u.x + 0.25, u.y - 0.2, u.r * 1.4, 3, SHADOW, 0.6);
    if (u.kind === 'hero') {
      R.decal(u.x, u.y, 1.9, 1, me ? [1, 1, 1] : tc, 0.9, 0, 0.1); R.decal(u.x, u.y, 1.7, 0, tc, 0.14);
      if (u.flags & FLAG.recall) { R.decal(u.x, u.y, 2.6, 1, [0.5, 0.85, 1], 0.6 + 0.3 * Math.sin(t * 10), 0, 0.1); R.spr(u.x, 2.2, u.y, 5, 8, [0.4, 0.7, 1], 0.35); }
      figure(R, c, u, t, now, dt);
    } else if (u.kind === 'minion') figure(R, c, u, t, now, dt);
    else creature(R, u, t, now);
  }
  effects(R, c, t, now, dt);
  R.end(t);
}

/** Health bars, names, and floating numbers, drawn on a 2D canvas over the scene. */
export function drawOverlay(g: CanvasRenderingContext2D, R: Renderer, c: GameClient) {
  const now = performance.now(), dpr = g.canvas.width / Math.max(1, R.w);
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, R.w, R.h); g.textAlign = 'center';
  const bar = (x: number, y: number, w: number, h: number, f: number, col: string) => { g.fillStyle = 'rgba(10,8,18,.8)'; g.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2); g.fillStyle = col; g.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, f)), h); };
  for (const s of c.structs) { if (s.hp <= 0) continue; const p = R.project(s.x, s.kind === 'core' ? 8.5 : 7.4, s.y); if (!p || p[0] < -60 || p[0] > R.w + 60 || p[1] < -30 || p[1] > R.h + 30) continue; bar(p[0], p[1], s.kind === 'core' ? 90 : 64, 6, s.hp / s.maxHp, TEAM_CSS[s.team]); }
  for (const u of c.units.values()) {
    const p = R.project(u.x, u.kind === 'hero' ? 4.3 : u.kind === 'minion' ? (u.sub === 'brute' ? 3.9 : 2.9) : u.r * 2 + 1.3, u.y); if (!p) continue;
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
