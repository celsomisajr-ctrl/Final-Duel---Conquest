// Builds the per-client view of the world. Only units near the client's hero are sent in full.
import { CFG } from '../shared/config';
import { dist2 } from '../shared/math';
import type { GameEvent, Unit, World } from '../shared/types';
import { moveSpeed } from '../simulation/world';
import { FLAG, SUB_CODE, type MeWire, type Snapshot } from './protocol';

const q = (v: number) => Math.round(v * 10);
const r1 = (v: number) => Math.round(v * 10) / 10;

export function buildSnapshot(w: World, me: Unit, ack: number, events: GameEvent[], withStructs: boolean, withBoard: boolean): Snapshot {
  const h = me.h!, V2 = CFG.viewRadius * CFG.viewRadius, u: number[][] = [], far: number[][] = [];
  for (const o of w.units.values()) {
    if (o.kind === 'turret' || o.kind === 'core') continue;
    const near = dist2(o.x, o.y, me.x, me.y) <= V2;
    if (o.h) {
      if (!near || !o.alive) { far.push([o.h.pid, q(o.x), q(o.y), o.alive ? 1 : 0]); continue; }
      const f = (o.stun > 0 ? FLAG.stun : 0) | (o.h.invuln > 0 ? FLAG.invuln : 0) | (o.h.recall > 0 ? FLAG.recall : 0) | (o.h.dash ? FLAG.dash : 0) | (o.h.shield > 0 ? FLAG.shield : 0) | (o.slow > 0 ? FLAG.slow : 0);
      u.push([o.id, SUB_CODE[o.sub], o.team, q(o.x), q(o.y), Math.ceil(o.hp), Math.round(o.maxHp), f, o.h.pid, o.h.level, Math.round((Math.atan2(o.h.fy, o.h.fx) * 180) / Math.PI)]);
    } else if (near && o.alive) {
      u.push([o.id, SUB_CODE[o.sub], o.team, q(o.x), q(o.y), Math.ceil(o.hp), Math.round(o.maxHp), (o.stun > 0 ? FLAG.stun : 0) | (o.slow > 0 ? FLAG.slow : 0)]);
    }
  }
  const b: Record<string, number> = {};
  for (const k in h.buffs) if (h.buffs[k] > 0) b[k] = Math.ceil(h.buffs[k]);
  const meW: MeWire = {
    p: h.pid, x: r1(me.x), y: r1(me.y), hp: Math.max(0, Math.ceil(me.hp)), mh: Math.round(me.maxHp), mp: Math.floor(h.mana), mm: Math.round(h.maxMana),
    lv: h.level, xp: Math.floor(h.xp), g: Math.floor(h.gold), sp: h.sp, r: h.ranks, cd: h.cds.map(r1), rs: r1(Math.max(0, h.respawn)), rc: r1(h.recall),
    sh: Math.round(h.shield), st: r1(Math.max(0, me.stun)), spd: r1(moveSpeed(w, me)), atk: Math.round(me.atk), ar: Math.round(me.armor), it: h.items, b,
    al: me.alive ? 1 : 0, dx: h.dash ? r1(h.dash.vx) : 0, dy: h.dash ? r1(h.dash.vy) : 0,
  };
  let cp = 0; w.camps.forEach((c, i) => { if (c.alive > 0) cp |= 1 << i; });
  const s: Snapshot = {
    t: 's', n: w.tick, tm: r1(w.t), a: ack, me: meW, u, far,
    pr: w.projs.filter((p) => dist2(p.x, p.y, me.x, me.y) <= V2).map((p) => [p.id, p.k, q(p.x), q(p.y), q(p.vx), q(p.vy), p.team]),
    zn: w.zones.filter((z) => dist2(z.x, z.y, me.x, me.y) <= V2).map((z) => [z.id, z.k, q(z.x), q(z.y), q(z.r), z.team, q(Math.max(0, z.delay)), q(z.dur)]),
    cp: [cp, ...w.camps.slice(-2).map((c) => (c.alive ? 0 : Math.ceil(c.timer)))],
    tb: w.teams.map((t) => Object.keys(t.buffs).filter((k) => t.buffs[k] > 0)),
    sc: [w.teams[0].kills, w.teams[1].kills],
    ev: events.filter((e) => e.g || e.pid === h.pid || (e.x !== undefined && dist2(e.x as number, e.y as number, me.x, me.y) <= V2)) as Record<string, unknown>[],
  };
  if (withStructs) s.st = w.structures.map((x) => Math.max(0, Math.ceil(x.hp)));
  if (withBoard) s.sb = w.heroes.map((o) => [o.h!.pid, o.h!.kills, o.h!.deaths, o.h!.assists, o.h!.level, Math.floor(o.h!.gold), Math.ceil(Math.max(0, o.h!.respawn)), o.h!.connected ? 1 : 0]);
  return s;
}
