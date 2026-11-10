// Hero and minion models, ported from the Arena (Final Duel 1v1) renderer: jointed figures built
// from primitive meshes as a small scene graph, posed every frame for walking, attacking and
// skills. Model space is the Arena's: the figure faces +x, y is up, about 43 units tall.
import type { Geo, Renderer } from './gl';

const TAU = Math.PI * 2;
type M4 = Float32Array;
interface GB { p: number[]; n: number[] | null }
const tri = (g: GB, a: number[], b: number[], c: number[]) => { g.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };
const quad = (g: GB, a: number[], b: number[], c: number[], d: number[]) => { tri(g, a, b, c); tri(g, a, c, d); };
function gmap(g: GB, f: (v: number[]) => number[]) { for (let i = 0; i < g.p.length; i += 3) { const v = f([g.p[i], g.p[i + 1], g.p[i + 2]]); g.p[i] = v[0]; g.p[i + 1] = v[1]; g.p[i + 2] = v[2]; } return g; }
const gT = (g: GB, x: number, y: number, z: number) => gmap(g, (v) => [v[0] + x, v[1] + y, v[2] + z]);
function boxS(w: number, h: number, d: number): GB { const g: GB = { p: [], n: null }, v = (x: number, y: number, z: number) => [(x * w) / 2, (y * h) / 2, (z * d) / 2];
  [[v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)], [v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1)], [v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1), v(-1, 1, -1)], [v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1)], [v(1, -1, 1), v(1, -1, -1), v(1, 1, -1), v(1, 1, 1)], [v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1)]].forEach((q) => quad(g, q[0], q[1], q[2], q[3])); return g; }
function cylG(rt: number, rb: number, h: number, seg: number): GB { const g: GB = { p: [], n: null };
  for (let i = 0; i < seg; i++) { const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const b0 = [c0 * rb, -h / 2, s0 * rb], b1 = [c1 * rb, -h / 2, s1 * rb], t0 = [c0 * rt, h / 2, s0 * rt], t1 = [c1 * rt, h / 2, s1 * rt];
    if (rt > 0) { quad(g, b0, b1, t1, t0); tri(g, [0, h / 2, 0], t0, t1); } else tri(g, b0, b1, [0, h / 2, 0]);
    if (rb > 0) tri(g, [0, -h / 2, 0], b1, b0); } return g; }
function sphG(r: number, ws: number, hs: number, tl = Math.PI): GB { const g: GB = { p: [], n: null }, P = (i: number, j: number) => { const th = (j / hs) * tl, ph = (i / ws) * TAU; return [r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), r * Math.sin(th) * Math.sin(ph)]; };
  for (let j = 0; j < hs; j++) for (let i = 0; i < ws; i++) { const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1); if (j === 0) tri(g, a, c, d); else if (j === hs - 1 && tl >= Math.PI - 1e-6) tri(g, a, b, c); else quad(g, a, b, c, d); } return g; }
function torusG(R: number, r: number, rs: number, ts: number, arc: number): GB { const g: GB = { p: [], n: [] }, P = (i: number, j: number) => { const u = (i / ts) * arc, v = (j / rs) * TAU; return [[(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v)], [Math.cos(v) * Math.cos(u), Math.cos(v) * Math.sin(u), Math.sin(v)]]; };
  for (let i = 0; i < ts; i++) for (let j = 0; j < rs; j++) { const A = P(i, j), B = P(i + 1, j), C = P(i + 1, j + 1), D = P(i, j + 1); for (const v of [A, B, C, A, C, D]) { g.p.push(v[0][0], v[0][1], v[0][2]); g.n!.push(v[1][0], v[1][1], v[1][2]); } } return g; }

function mul(a: M4, b: M4): M4 { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
/** Translate, rotate (Euler XYZ), scale: the Arena's matrix convention. */
export function trs(x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number): M4 {
  const cx = Math.cos(rx), snx = Math.sin(rx), cy = Math.cos(ry), sny = Math.sin(ry), cz = Math.cos(rz), snz = Math.sin(rz), o = new Float32Array(16);
  o[0] = cy * cz * sx; o[1] = (snx * sny * cz + cx * snz) * sx; o[2] = (snx * snz - cx * sny * cz) * sx;
  o[4] = -cy * snz * sy; o[5] = (cx * cz - snx * sny * snz) * sy; o[6] = (snx * cz + cx * sny * snz) * sy;
  o[8] = sny * sz; o[9] = -snx * cy * sz; o[10] = cx * cy * sz; o[12] = x; o[13] = y; o[14] = z; o[15] = 1; return o;
}
const IDENT = trs(0, 0, 0, 0, 0, 0, 1, 1, 1);

export interface Node { G: Geo | null; col: number[]; emi: number[]; x: number; y: number; z: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number; kids: Node[]; hidden?: boolean; a?: number }
const rgb = (c: string | number[]) => (Array.isArray(c) ? c : [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255]);
function N(G: Geo | null, col?: string | number[] | null, o?: Partial<Node>): Node { return Object.assign({ G, col: col ? rgb(col) : [1, 1, 1], emi: [0, 0, 0], x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, kids: [] }, o || {}); }
const add = (par: Node, n: Node) => { par.kids.push(n); return n; };
const nodeM = (n: Node) => trs(n.x, n.y, n.z, n.rx, n.ry, n.rz, n.sx, n.sy, n.sz);
function drawNode(R: Renderer, n: Node, PM: M4, ex: number[] | null) {
  if (n.hidden) return; const M = mul(PM, nodeM(n));
  if (n.G) R.node(n.G, M, n.col, ex ? [n.emi[0] + ex[0], n.emi[1] + ex[1], n.emi[2] + ex[2]] : n.emi, n.a ?? 1);
  for (const k of n.kids) drawNode(R, k, M, ex);
}

export interface Figure { root: Node; body: Node; armR: Node; armL: Node; legL: Node; legR: Node; key: string; sw?: Node[]; staff?: Node; tip?: Node[]; shield?: Node; walk: number; face: number; px: number; py: number; side: number; lastAtk: number; atkAt: number; init: boolean }
const D = '#2b2440', S = '#e6c3a0', MT = '#cfd3dc', WD = '#6b4a2f';

/** The Arena's five hero figures. `color` is the hero's signature colour, `trim` the team colour. */
export function buildHero(R: Renderer, key: string, color: string, trim: number[]): Figure {
  const geo = (k: string, f: () => GB) => R.geo(k, f);
  const root = N(null), body = add(root, N(null)), big = key === 'brawler', robe = key === 'shaman';
  const legG = geo('leg', () => gT(boxS(5.5, 14, 5.5), 0, -7, 0));
  const legL = add(body, N(legG, D, { y: 14, z: -4.5 })), legR = add(body, N(legG, D, { y: 14, z: 4.5 }));
  if (robe) { add(body, N(geo('robe', () => cylG(3, 13, 30, 7)), color, { y: 15 })); legL.hidden = legR.hidden = true; }
  else { const r = big ? 12 : 9.5; add(body, N(geo('torso' + r, () => cylG(r * 0.82, r, 17, 8)), color, { y: 22 })); add(body, N(geo('belt' + r, () => cylG(r * 1.04, r * 1.04, 2.6, 8)), trim, { y: 14.5 })); }
  const hy = robe ? 32 : 36; add(body, N(geo('head', () => sphG(7, 10, 8)), S, { y: hy }));
  const sh = big ? 13.5 : 11, ay = robe ? 27 : 29, armG = big ? geo('armB', () => gT(boxS(6.2, 13, 6.2), 0, -6, 0)) : geo('arm', () => gT(boxS(4.2, 13, 4.2), 0, -6, 0));
  const armR = add(body, N(null, null, { y: ay, z: sh })); add(armR, N(armG, color));
  const armL = add(body, N(null, null, { y: ay, z: -sh })); add(armL, N(armG, color));
  const H: Figure = { root, body, armR, armL, legL, legR, key, walk: 0, face: 0, px: 0, py: 0, side: 0, lastAtk: 0, atkAt: 0, init: false };
  const sph = geo('usph', () => sphG(1, 14, 10));
  if (key === 'swordsman') {
    add(body, N(geo('helm', () => sphG(7.7, 10, 5, Math.PI / 2)), MT, { y: hy }));
    H.sw = [add(armR, N(geo('blade', () => boxS(30, 2.6, 1.3)), MT, { x: 17, y: -12 })), add(armR, N(geo('guard', () => boxS(1.8, 1.8, 9)), '#f2b64b', { x: 2.5, y: -12 }))];
    add(armL, N(geo('shieldb', () => boxS(2.6, 15, 12)), trim, { x: 3, y: -8 }));
    H.tip = [armR, N(null, null, { x: 30, y: -12 })];
  } else if (key === 'shaman') {
    add(body, N(geo('hood', () => cylG(0, 8.8, 14, 7)), '#1f5c58', { y: hy + 6 }));
    const st = add(body, N(null, null, { x: 5, y: 24, z: 13 })); add(st, N(geo('staff', () => cylG(1.3, 1.5, 54, 6)), WD, { y: 2 }));
    const c = rgb(color), orb = add(st, N(sph, [0, 0, 0], { y: 31, sx: 4.6, sy: 4.6, sz: 4.6, emi: c })); H.tip = [st, orb]; H.staff = st;
    add(body, N(geo('sash', () => cylG(9.6, 11.2, 3, 7)), trim, { y: 9 }));
  } else if (key === 'archer') {
    add(body, N(geo('ahood', () => sphG(7.9, 10, 6, Math.PI / 1.8)), '#3d6b2a', { y: hy }));
    const bow = add(body, N(null, null, { x: 11, y: 27, z: -8 })); add(bow, N(geo('bow', () => torusG(14, 1.1, 5, 18, Math.PI)), WD, { rz: -Math.PI / 2 })); add(bow, N(geo('string', () => boxS(0.5, 28, 0.5)), '#eeeeee'));
    H.tip = [bow, N(null, null, { x: 14 })];
    add(body, N(geo('quiver', () => cylG(3, 3, 17, 6)), WD, { x: -7, y: 29, z: 3, rz: 0.45 }));
  } else if (key === 'gunner') {
    add(body, N(geo('brim', () => cylG(11.5, 11.5, 1.3, 12)), '#4a3426', { y: hy + 5 })); add(body, N(geo('crown', () => cylG(6.5, 7, 8, 10)), '#4a3426', { y: hy + 9 }));
    const pistol = add(armR, N(geo('gunR', () => boxS(4.5, 20, 5)), '#3a3a44', { y: -20 })); H.tip = [armR, pistol, N(null, null, { y: -10 })]; add(armL, N(geo('gunL', () => boxS(3.4, 14, 4)), '#3a3a44', { y: -17 }));
  } else if (key === 'brawler') {
    const c = rgb(color), gem = [c[0] * 0.35, c[1] * 0.35, c[2] * 0.35], fist = geo('fistB', () => sphG(6.8, 10, 8)), wrap = geo('wrap', () => boxS(7, 3.2, 7)), pad = geo('pad', () => sphG(7, 10, 8));
    add(armR, N(fist, color, { y: -13, emi: gem })); add(armL, N(fist, color, { y: -13, emi: gem })); add(armR, N(wrap, '#f2f2f2', { y: -8.5 })); add(armL, N(wrap, '#f2f2f2', { y: -8.5 }));
    add(body, N(pad, color, { y: ay + 1.5, z: sh, sy: 0.75 })); add(body, N(pad, color, { y: ay + 1.5, z: -sh, sy: 0.75 })); add(body, N(geo('shorts', () => cylG(11.5, 10.5, 7, 8)), '#2a2238', { y: 12 }));
    add(body, N(geo('band', () => torusG(7.3, 1.1, 4, 16, TAU)), trim, { y: hy + 1.5, rx: Math.PI / 2 }));
    H.tip = [armR, N(null, null, { y: -15 })];
  }
  H.shield = add(root, N(sph, '#9fd0ff', { y: 22, sx: 30, sy: 30, sz: 30, a: 0.2, hidden: true }));
  return H;
}

/** Lane minions in the same style: a small soldier with a spear, a caster with a glowing staff, or a heavy brute. */
export function buildMinion(R: Renderer, kind: string, team: number[]): Figure {
  const geo = (k: string, f: () => GB) => R.geo(k, f), dark = [team[0] * 0.45, team[1] * 0.45, team[2] * 0.45];
  const root = N(null), body = add(root, N(null)), brute = kind === 'brute';
  const legG = geo('leg', () => gT(boxS(5.5, 14, 5.5), 0, -7, 0));
  const legL = add(body, N(legG, D, { y: 14, z: -4.5 })), legR = add(body, N(legG, D, { y: 14, z: 4.5 }));
  const r = brute ? 12.5 : 9;
  add(body, N(geo('torso' + r, () => cylG(r * 0.82, r, 17, 8)), team, { y: 22 }));
  add(body, N(geo('head', () => sphG(7, 10, 8)), brute ? dark : S, { y: 36 }));
  add(body, N(kind === 'ranged' ? geo('hood', () => cylG(0, 8.8, 14, 7)) : geo('helm', () => sphG(7.7, 10, 5, Math.PI / 2)), kind === 'ranged' ? dark : MT, { y: kind === 'ranged' ? 42 : 36 }));
  const armG = geo('arm', () => gT(boxS(4.2, 13, 4.2), 0, -6, 0)), sh = brute ? 14 : 10.5;
  const armR = add(body, N(null, null, { y: 29, z: sh })); add(armR, N(armG, dark));
  const armL = add(body, N(null, null, { y: 29, z: -sh })); add(armL, N(armG, dark));
  const H: Figure = { root, body, armR, armL, legL, legR, key: kind, walk: 0, face: 0, px: 0, py: 0, side: 0, lastAtk: 0, atkAt: 0, init: false };
  if (kind === 'ranged') { const st = add(armR, N(null, null, { x: 2, y: -10 })); add(st, N(geo('wand', () => cylG(1.1, 1.3, 30, 6)), WD, { rz: -Math.PI / 2, x: 8 })); const orb = add(st, N(geo('usph', () => sphG(1, 14, 10)), [0, 0, 0], { x: 24, sx: 3.6, sy: 3.6, sz: 3.6, emi: team })); H.tip = [armR, st, orb]; }
  else if (brute) { add(armR, N(geo('club', () => cylG(4.6, 2.2, 26, 7)), '#5a4634', { x: 14, y: -12, rz: -Math.PI / 2 })); add(body, N(geo('pad', () => sphG(7, 10, 8)), MT, { y: 30.5, z: sh, sy: 0.75 })); add(body, N(geo('pad', () => sphG(7, 10, 8)), MT, { y: 30.5, z: -sh, sy: 0.75 })); }
  else { add(armR, N(geo('spear', () => boxS(34, 1.4, 1.4)), WD, { x: 14, y: -12 })); add(armR, N(geo('spearT', () => cylG(0, 2.2, 7, 5)), MT, { x: 33, y: -12, rz: -Math.PI / 2 })); add(armL, N(geo('buckler', () => boxS(2.2, 11, 10)), team, { x: 3, y: -8 })); }
  return H;
}

export interface Pose {
  x: number; y: number; face: number; scale: number; dt: number; t: number; lift?: number;
  swing: number;        // seconds left of a 0.24 s basic-attack swing
  cast: number;         // seconds left of a 0.4 s casting gesture
  skill: string; skillK: number; // active skill animation and its progress 0..1 (1 = finished)
  dash: boolean; stun: boolean; shield: boolean; flash: number[] | null;
}

/** Idle and basic-attack arm poses per class (the Arena's poseHero). */
function arms(H: Figure, swing: number, cast: number, hook: boolean) {
  const k = swing > 0 ? swing / 0.24 : 0, ph = 1 - k, c = cast > 0 ? cast / 0.4 : 0, A = H.armR, L = H.armL, hit = k ? Math.sin(ph * Math.PI) : 0;
  A.rx = A.ry = A.rz = 0; L.rx = L.ry = L.rz = 0; A.x = 0; L.x = 0;
  switch (H.key) {
    case 'swordsman': case 'melee': case 'brute': A.rz = 1.0; if (k) A.ry = 1.3 - 2.6 * ph; L.rz = 0.5; break;
    case 'brawler': { A.rz = 1.25; A.ry = 0.35; L.rz = 1.25; L.ry = -0.35; if (k) { const P = H.side === 1 ? L : A, sg = P === L ? -1 : 1; if (hook) { P.rz = 1.45; P.ry = sg * (1 - 2 * ph); P.x = hit * 6; } else { P.rz = 1.25 + hit * 0.4; P.ry = sg * 0.35 * (1 - hit); P.x = hit * 10; } } break; }
    case 'archer': A.rz = 1.35; A.x = -hit * 5; L.rz = 1.45; break;
    case 'gunner': A.rz = 1.5 - k * 0.35; L.rz = 1.35; break;
    case 'ranged': A.rz = 1.1 + hit * 0.5; L.rz = 0.3; break;
    case 'shaman': A.rz = 0.45 + hit * 0.6; L.rz = 0.3; break;
  }
  if (c) L.rz = Math.max(L.rz, 2.5 * c);
  if (H.staff) H.staff.rz = -hit * 0.5;
}

/** Poses and queues a figure. Returns the world position [x, height, y] of its weapon tip. */
export function drawFigure(R: Renderer, H: Figure, p: Pose): number[] {
  if (!H.init) { H.init = true; H.px = p.x; H.py = p.y; H.face = p.face; }
  const mv = Math.hypot(p.x - H.px, p.y - H.py) / Math.max(p.dt, 1e-3); H.px = p.x; H.py = p.y;
  const moving = Math.min(1, mv / 5.5); H.walk += p.dt * Math.min(mv, 18) * 1.5;
  H.face += Math.atan2(Math.sin(p.face - H.face), Math.cos(p.face - H.face)) * Math.min(1, p.dt * 14);
  const B = H.body, A = H.armR, L = H.armL, sw = Math.sin(H.walk) * moving, s = p.skill, k = p.skillK;
  let lift = p.lift || 0;
  H.legL.rz = sw * 0.7; H.legR.rz = -sw * 0.7; H.legL.x = H.legR.x = 0; B.x = 0; B.y = Math.abs(Math.sin(H.walk)) * 2.2 * moving; B.ry = 0; B.rz = H.key === 'brawler' ? -0.14 : 0;
  arms(H, p.swing, p.cast, H.key === 'brawler' && H.lastAtk % 3 === 2);
  if (H.key === 'brawler' && moving < 0.2 && !(p.swing > 0)) B.y += Math.abs(Math.sin(p.t * 7)) * 1.6; // boxer's bounce
  if (s === 'whirl' && k < 1) { B.ry = p.t * 22; A.rz = 1.5; A.ry = 0; }
  else if (s === 'leap' && (p.dash || k < 1)) { const u = Math.min(1, k); lift += Math.sin(u * Math.PI) * 34 * p.scale; A.rz = 2.9 - 1.7 * u * u; L.rz = 2.6 - 1.6 * u * u; A.ry = L.ry = 0; B.rz = -0.3 + 0.5 * u; H.legL.rz = 0.9 - 0.5 * u; H.legR.rz = -0.5; }
  else if (s === 'leap-land' && k < 1) { const c = 1 - k; B.y = -7 * c; H.legL.rz = 0.7 * c; H.legR.rz = -0.5 * c; A.rz = 0.6 + 0.5 * k; A.ry = 0; }
  else if (s === 'punish' && k < 1) { if (k < 0.35) { const u = k / 0.35; A.rz = 1 + 1.9 * u; A.ry = 0.4; B.rz = 0.15 * u; } else { const u = (k - 0.35) / 0.65; A.rz = 2.9 - 2.6 * u; A.ry = 0.4 - 0.8 * u; B.rz = 0.15 - 0.55 * u; H.legL.rz = 0.7 * (1 - u); H.legR.rz = -0.5 * (1 - u); } }
  else if (s === 'slam' && k < 1) { if (k < 0.55) { const u = k / 0.55; lift += Math.sin((u * Math.PI) / 2) * 20 * p.scale; A.rz = L.rz = 1.2 + 1.7 * u; A.ry = L.ry = 0; B.rz = 0.15 * u; H.legL.rz = H.legR.rz = 0.4 * u; } else { const u = (k - 0.55) / 0.45; lift += 20 * (1 - u) * p.scale; A.rz = L.rz = 2.9 - 2.3 * u; A.ry = L.ry = 0; B.rz = -0.5 * u; H.legL.rz = 0.5; H.legR.rz = -0.3; } }
  else if (s === 'tumble' && (p.dash || k < 1)) { const th = -Math.min(1, k) * TAU; B.rz = th; B.x = 17 * Math.sin(-th); B.y = 17 - 17 * Math.cos(th); H.legL.rz = H.legR.rz = 1.5; A.rz = L.rz = 2.3; A.ry = L.ry = 0; }
  else if (s === 'buck' && k < 1) { const c = 1 - k; A.rz = 1.5 - 0.6 * c; L.rz = 1.5 - 0.6 * c; L.ry = 0; B.rz = 0.12 * c; B.x = -3 * c; }
  else if (s === 'grenade-cast' && k < 1) { L.rz = 2.9 * Math.sin(k * Math.PI); L.ry = 0; B.rz = -0.15 * Math.sin(k * Math.PI); }
  else if ((s === 'bloodlust' || s === 'overclock') && k < 1) { const c = Math.sin(k * Math.PI); A.rz = 1.25 + 1.4 * c; L.rz = 1.25 + 1.4 * c; A.ry = 0.5 * c; L.ry = -0.5 * c; B.rz = 0.2 * c; }
  else if ((s === 'storm-cast' || s === 'rain-cast' || s === 'well-cast') && k < 1) { const c = Math.sin(k * Math.PI); A.rz = Math.max(A.rz, 2.6 * c); if (H.staff) H.staff.rz = -0.4 * c; lift += c * 2 * p.scale; }
  else if (p.dash) { B.rz = -0.45; B.y = -1; A.rz = 1.6; A.ry = 0; H.legL.rz = 0.7; H.legR.rz = -0.6; if (H.key === 'brawler') { A.x = 8; A.rz = 1.65; } }
  if (p.stun) { B.rz = 0.12 * Math.sin(p.t * 9); A.rz = 0.3; L.rz = 0.3; A.ry = L.ry = 0; }
  if (H.sw) for (const n of H.sw) n.hidden = false;
  if (H.shield) H.shield.hidden = !p.shield;
  const root = H.root; root.x = p.x; root.y = lift; root.z = -p.y; root.sx = root.sy = root.sz = p.scale; root.ry = H.face;
  drawNode(R, root, IDENT, p.flash);
  let m = mul(nodeM(root), nodeM(B)); if (H.tip) for (const n of H.tip) m = mul(m, nodeM(n)); else m = mul(m, trs(8, 28, 0, 0, 0, 0, 1, 1, 1));
  return [m[12], m[13], -m[14]];
}
