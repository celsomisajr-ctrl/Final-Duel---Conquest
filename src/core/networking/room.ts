// One Conquest room: lobby, match and result. The room is transport-agnostic: a host (Cloudflare
// Durable Object, local dev server, or the in-browser solo loop) feeds it connections, messages
// and elapsed time. All game state lives here; clients only ever send commands.
import { CFG, DT } from '../shared/config';
import type { GameEvent, RosterEntry, Team, World } from '../shared/types';
import { HEROES, HERO_KEYS } from '../../entities/heroes';
import { createWorld, heroByPid } from '../simulation/world';
import { step } from '../simulation/systems';
import { buyItem, castSkill, rankUp, setMove, startRecall } from '../simulation/skills';
import { MAX_MSG_BYTES, PROTOCOL, type LobbyPlayer, type ServerMsg } from './protocol';
import { buildSnapshot } from './snapshot';

export interface Conn { send(data: string): void; close(): void }
interface Player {
  id: number; name: string; team: Team; cls: string; ready: boolean; token: string;
  conn: Conn | null; pid: number; lastSeq: number; goneFor: number; budget: number; dropped: number;
}
const BOT_NAMES = ['Ashen', 'Brindle', 'Corvid', 'Dusk', 'Ember', 'Flint', 'Gale', 'Harrow', 'Ivory', 'Juniper'];

export class Room {
  phase: 'lobby' | 'match' = 'lobby';
  players: Player[] = [];
  world: World | null = null;
  fill = true;
  stats = { rejected: 0, bytesOut: 0, msgsOut: 0, snaps: 0 };
  private nextId = 1; private acc = 0; private snapTick = 0; private events: GameEvent[] = []; private lastStruct = ''; private idle = 0;
  constructor(public code: string, private rand: () => number = Math.random) {}

  /** True when nobody is connected and the room can be discarded. */
  get empty() { return !this.players.some((p) => p.conn); }
  get idleSeconds() { return this.idle; }

  private tx(p: Player, m: ServerMsg) { if (!p.conn) return; const s = JSON.stringify(m); this.stats.bytesOut += s.length; this.stats.msgsOut++; try { p.conn.send(s); } catch { /* socket already gone */ } }
  private all(m: ServerMsg) { for (const p of this.players) this.tx(p, m); }
  private err(c: Conn, m: string) { try { c.send(JSON.stringify({ t: 'err', m })); } catch { /* ignore */ } }
  private lobby() {
    const host = this.players.find((p) => p.conn) || this.players[0];
    const players: LobbyPlayer[] = this.players.map((p) => ({ id: p.id, name: p.name, team: p.team, cls: p.cls, ready: p.ready, host: p === host, on: !!p.conn }));
    this.all({ t: 'lobby', players, fill: this.fill, phase: this.phase });
  }
  private host() { return this.players.find((p) => p.conn) || null; }
  private token() { let s = ''; for (let i = 0; i < 24; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(this.rand() * 36)]; return s; }

  disconnect(c: Conn) {
    const p = this.players.find((x) => x.conn === c); if (!p) return;
    p.conn = null; p.goneFor = 0;
    if (this.phase === 'lobby') { this.players = this.players.filter((x) => x !== p); this.lobby(); return; }
    const u = this.world && heroByPid(this.world, p.pid); if (u) { u.h!.connected = false; u.h!.mx = 0; u.h!.my = 0; }
    this.events.push({ e: 'net', g: 1, pid: p.pid, on: 0 });
  }

  message(c: Conn, raw: string) {
    if (typeof raw !== 'string' || raw.length > MAX_MSG_BYTES) { this.stats.rejected++; return; }
    let m: any; try { m = JSON.parse(raw); } catch { this.stats.rejected++; return; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') { this.stats.rejected++; return; }
    let p = this.players.find((x) => x.conn === c);
    if (m.t === 'join') { if (!p) this.join(c, m); return; }
    if (!p) { this.stats.rejected++; return; }
    if (p.budget <= 0) { p.dropped++; this.stats.rejected++; if (p.dropped > 600) { try { c.close(); } catch { /* ignore */ } this.disconnect(c); } return; }
    p.budget--;
    if (m.t === 'ping') { this.tx(p, { t: 'pong', c: +m.c || 0 }); return; }
    if (this.phase === 'lobby') this.lobbyCmd(p, m); else this.matchCmd(p, m);
  }

  private join(c: Conn, m: any) {
    if (m.v !== PROTOCOL) return this.err(c, 'version');
    const back = typeof m.token === 'string' && m.token.length === 24 ? this.players.find((x) => x.token === m.token) : undefined;
    if (back) {
      if (back.conn && back.conn !== c) { try { back.conn.close(); } catch { /* ignore */ } }
      back.conn = c; back.goneFor = 0; back.budget = CFG.maxCmdPerSec;
      this.tx(back, { t: 'joined', id: back.id, token: back.token, code: this.code });
      if (this.phase === 'match' && this.world) {
        const u = heroByPid(this.world, back.pid); if (u) u.h!.connected = true;
        this.sendStart(back); this.events.push({ e: 'net', g: 1, pid: back.pid, on: 1 }); this.lastStruct = '';
      }
      this.lobby(); return;
    }
    if (this.phase !== 'lobby') return this.err(c, 'in-progress');
    if (this.players.length >= 10) return this.err(c, 'full');
    const name = String(m.name ?? '').replace(/[^\w \-]/g, '').trim().slice(0, 14) || 'Player';
    const n0 = this.players.filter((x) => x.team === 0).length, n1 = this.players.length - n0;
    const team: Team = n0 <= n1 ? 0 : 1, taken = this.players.filter((x) => x.team === team).map((x) => x.cls);
    const p: Player = { id: this.nextId++, name, team, cls: HERO_KEYS.find((k) => !taken.includes(k)) || HERO_KEYS[0], ready: false, token: this.token(), conn: c, pid: -1, lastSeq: 0, goneFor: 0, budget: CFG.maxCmdPerSec, dropped: 0 };
    this.players.push(p);
    this.tx(p, { t: 'joined', id: p.id, token: p.token, code: this.code });
    this.lobby();
  }

  private lobbyCmd(p: Player, m: any) {
    if (m.t === 'team' && (m.v === 0 || m.v === 1)) { if (m.v !== p.team && this.players.filter((x) => x.team === m.v).length < 5) { p.team = m.v; p.ready = false; } }
    else if (m.t === 'hero' && typeof m.v === 'string' && HEROES[m.v]) { p.cls = m.v; p.ready = false; }
    else if (m.t === 'ready') p.ready = !!m.v;
    else if (m.t === 'fill' && p === this.host()) this.fill = !!m.v;
    else if (m.t === 'start' && p === this.host()) { if (this.players.every((x) => x.ready || x === p)) return this.start(); return this.tx(p, { t: 'err', m: 'not-ready' }); }
    else { this.stats.rejected++; return; }
    this.lobby();
  }

  private start() {
    const roster: RosterEntry[] = []; let pid = 0, bot = 0;
    for (const team of [0, 1] as Team[]) {
      const mine = this.players.filter((x) => x.team === team).slice(0, 5);
      for (const p of mine) { p.pid = pid; p.lastSeq = 0; roster.push({ pid: pid++, name: p.name, cls: p.cls, team, bot: false }); }
      if (this.fill) for (let i = mine.length; i < 5; i++) {
        const used = roster.filter((r) => r.team === team).map((r) => r.cls);
        roster.push({ pid: pid++, name: BOT_NAMES[bot++ % 10] + ' (bot)', cls: HERO_KEYS.find((k) => !used.includes(k)) || HERO_KEYS[i % 5], team, bot: true });
      }
    }
    this.world = createWorld(roster, Math.floor(this.rand() * 1e9));
    this.phase = 'match'; this.acc = 0; this.snapTick = 0; this.events = []; this.lastStruct = '';
    for (const p of this.players) this.sendStart(p);
    this.lobby();
  }
  private sendStart(p: Player) {
    const w = this.world!;
    this.tx(p, { t: 'start', you: p.pid, tick: CFG.tickRate, snap: CFG.snapRate, roster: w.heroes.map((u) => ({ pid: u.h!.pid, name: u.h!.name, cls: u.h!.cls, team: u.team, bot: u.h!.bot })) });
  }

  private matchCmd(p: Player, m: any) {
    const w = this.world; if (!w || p.pid < 0) return;
    if (m.t === 'in' || m.t === 'cast' || m.t === 'up' || m.t === 'recall' || m.t === 'buy') {
      // Sequence numbers must strictly increase, so a captured command cannot be replayed.
      if (!Number.isInteger(m.s) || m.s <= p.lastSeq || m.s > p.lastSeq + 100000) { this.stats.rejected++; return; }
      p.lastSeq = m.s;
      let ok = false;
      if (m.t === 'in') ok = typeof m.x === 'number' && typeof m.y === 'number' && setMove(w, p.pid, m.x, m.y);
      else if (m.t === 'cast') ok = Number.isInteger(m.k) && typeof m.x === 'number' && typeof m.y === 'number' && castSkill(w, p.pid, m.k, m.x, m.y);
      else if (m.t === 'up') ok = Number.isInteger(m.k) && rankUp(w, p.pid, m.k);
      else if (m.t === 'recall') ok = startRecall(w, p.pid);
      else if (m.t === 'buy') ok = typeof m.k === 'string' && buyItem(w, p.pid, m.k);
      if (!ok) this.stats.rejected++;
    } else this.stats.rejected++;
  }

  /** Advances real time. Runs as many fixed simulation steps as have elapsed and sends snapshots. */
  advance(seconds: number) {
    for (const p of this.players) p.budget = Math.min(CFG.maxCmdPerSec * 1.5, p.budget + CFG.maxCmdPerSec * seconds);
    this.idle = this.empty ? this.idle + seconds : 0;
    if (this.phase !== 'match' || !this.world) return;
    const w = this.world;
    for (const p of this.players) if (!p.conn) p.goneFor += seconds;
    this.acc = Math.min(this.acc + seconds, 0.25); // never try to catch up more than a quarter second
    while (this.acc >= DT) {
      this.acc -= DT; step(w);
      if (w.events.length) { this.events.push(...w.events); w.events.length = 0; }
      if (++this.snapTick >= CFG.tickRate / CFG.snapRate) { this.snapTick = 0; this.snapshot(); }
      if (w.winner >= 0) { this.finish(); return; }
    }
  }

  private snapshot() {
    const w = this.world!; this.stats.snaps++;
    const st = w.structures.map((s) => Math.ceil(s.hp)).join(','), withStructs = st !== this.lastStruct || this.stats.snaps % CFG.snapRate === 0;
    this.lastStruct = st;
    const board = this.stats.snaps % CFG.snapRate === 0;
    for (const p of this.players) { if (!p.conn) continue; const u = heroByPid(w, p.pid); if (u) this.tx(p, buildSnapshot(w, u, p.lastSeq, this.events, withStructs, board)); }
    this.events = [];
  }

  private finish() {
    const w = this.world!;
    this.all({ t: 'end', winner: w.winner, secs: Math.round(w.t), stats: w.heroes.map((u) => [u.h!.pid, u.h!.kills, u.h!.deaths, u.h!.assists, u.h!.level, Math.floor(u.h!.gold)]) });
    this.phase = 'lobby'; this.world = null;
    this.players = this.players.filter((p) => p.conn);
    for (const p of this.players) { p.ready = false; p.pid = -1; }
    this.lobby();
  }
}
