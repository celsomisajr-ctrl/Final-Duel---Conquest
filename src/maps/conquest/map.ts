// The Conquest battlefield ("Sundered Vale"). Blue (team 0) holds the south-west base, Red (team 1)
// the north-east. Red's side is the point mirror of Blue's: (x, y) -> (200 - x, 200 - y).
import { rng, dist } from '../../core/shared/math';

export interface Pt { x: number; y: number }
export const SIZE = 200;
export const mirror = (p: Pt): Pt => ({ x: SIZE - p.x, y: SIZE - p.y });

export const CORE: Pt[] = [{ x: 24, y: 24 }, { x: 176, y: 176 }];
export const SPAWN: Pt[] = [{ x: 11, y: 11 }, { x: 189, y: 189 }];
export const LANE_NAMES = ['Top', 'Mid', 'Bottom'];

// Lane centre lines, written from Blue's base to Red's base. Lane 0 = Top, 1 = Mid, 2 = Bottom.
export const LANES: Pt[][] = [
  [{ x: 24, y: 40 }, { x: 24, y: 150 }, { x: 50, y: 176 }, { x: 160, y: 176 }],
  [{ x: 36, y: 36 }, { x: 164, y: 164 }],
  [{ x: 40, y: 24 }, { x: 150, y: 24 }, { x: 176, y: 50 }, { x: 176, y: 160 }],
];

function densify(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.round(dist(a.x, a.y, b.x, b.y) / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  out.push(pts[pts.length - 1]);
  return out;
}
const DENSE = LANES.map((l) => densify(l, 6));
/** Waypoints a unit of `team` walks along `lane`, from its own base to the enemy Core. */
export function lanePath(team: number, lane: number): Pt[] {
  const mid = team === 0 ? DENSE[lane] : [...DENSE[lane]].reverse();
  return [CORE[team], ...mid, CORE[1 - team]];
}

export interface TurretDef { team: number; lane: number; tier: number; x: number; y: number }
const BLUE_TURRETS: TurretDef[] = [
  { team: 0, lane: 0, tier: 1, x: 24, y: 112 }, { team: 0, lane: 0, tier: 2, x: 24, y: 64 },
  { team: 0, lane: 1, tier: 1, x: 82, y: 82 }, { team: 0, lane: 1, tier: 2, x: 54, y: 54 },
  { team: 0, lane: 2, tier: 1, x: 112, y: 24 }, { team: 0, lane: 2, tier: 2, x: 64, y: 24 },
];
export const TURRETS: TurretDef[] = [
  ...BLUE_TURRETS,
  ...BLUE_TURRETS.map((t) => ({ team: 1, lane: 2 - t.lane, tier: t.tier, ...mirror(t) })),
];

export interface CampDef { key: string; x: number; y: number; side: number; first: number; respawn: number }
const BLUE_CAMPS: CampDef[] = [
  { key: 'stag', x: 48, y: 94, side: 0, first: 30, respawn: 90 },
  { key: 'mossling', x: 60, y: 122, side: 0, first: 20, respawn: 60 },
  { key: 'thornback', x: 42, y: 70, side: 0, first: 20, respawn: 70 },
  { key: 'tortoise', x: 94, y: 48, side: 0, first: 30, respawn: 90 },
  { key: 'mossling', x: 122, y: 60, side: 0, first: 20, respawn: 60 },
  { key: 'lynx', x: 72, y: 40, side: 0, first: 30, respawn: 90 },
];
export const CAMPS: CampDef[] = [
  ...BLUE_CAMPS,
  ...BLUE_CAMPS.map((c) => ({ ...c, ...mirror(c), side: 1 })),
  { key: 'colossus', x: 66, y: 134, side: 2, first: 150, respawn: 210 },
  { key: 'emberwyrm', x: 134, y: 66, side: 2, first: 90, respawn: 180 },
];

// The river runs along the anti-diagonal between the two lane corners.
export const RIVER: Pt[] = [{ x: 30, y: 170 }, { x: 170, y: 30 }];

function segDist(px: number, py: number, a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2)) : 0;
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
}
export function laneDist(x: number, y: number) {
  let m = 1e9;
  for (const l of LANES) for (let i = 0; i < l.length - 1; i++) m = Math.min(m, segDist(x, y, l[i], l[i + 1]));
  return m;
}

export interface Obstacle { x: number; y: number; r: number; k: number }
/** Rocks and tree clumps in the jungle. Generated once from a fixed seed so client and server agree. */
export const OBSTACLES: Obstacle[] = (() => {
  const R = rng(20261110), out: Obstacle[] = [];
  let guard = 0;
  while (out.length < 22 && guard++ < 4000) {
    const x = 14 + R() * 86, y = 14 + R() * 172, r = 2.4 + R() * 2.6;
    if (x + y > 196) continue; // Blue half only; mirrored below
    if (laneDist(x, y) < r + 9) continue;
    if (segDist(x, y, RIVER[0], RIVER[1]) < r + 7) continue;
    if (dist(x, y, CORE[0].x, CORE[0].y) < 36) continue;
    if (CAMPS.some((c) => dist(x, y, c.x, c.y) < r + (c.side === 2 ? 15 : 10))) continue;
    if (out.some((o) => dist(x, y, o.x, o.y) < r + o.r + 5.5)) continue;
    out.push({ x, y, r, k: R() < 0.45 ? 0 : 1 });
  }
  return [...out, ...out.map((o) => ({ ...o, ...mirror(o) }))];
})();

/** Moves a circle of radius r from (x, y) by (dx, dy), sliding along obstacles and the map edge. */
export function moveCircle(x: number, y: number, dx: number, dy: number, r: number, blockers: { x: number; y: number; r: number }[] = []): Pt {
  let nx = x + dx, ny = y + dy;
  for (let pass = 0; pass < 2; pass++) {
    for (const list of [OBSTACLES, blockers]) for (const o of list) {
      const d = Math.hypot(nx - o.x, ny - o.y), m = o.r + r;
      if (d < m && d > 1e-6) { nx = o.x + ((nx - o.x) / d) * m; ny = o.y + ((ny - o.y) / d) * m; }
    }
  }
  nx = Math.max(r, Math.min(SIZE - r, nx)); ny = Math.max(r, Math.min(SIZE - r, ny));
  return { x: nx, y: ny };
}
