// The Conquest game client: connection, lobby state, snapshot interpolation, and prediction of
// the local hero's movement. It never decides game outcomes; it sends commands and draws what
// the server reports.
import { CFG } from '../../core/shared/config';
import { Room, type Conn } from '../../core/networking/room';
import { FLAG, PROTOCOL, SUBS, type ClientMsg, type LobbyPlayer, type MeWire, type RosterWire, type ServerMsg, type Snapshot } from '../../core/networking/protocol';
import { CORE, TURRETS, moveCircle } from '../../maps/conquest/map';
import { HEROES } from '../../entities/heroes';
import { MONSTERS, STRUCTS } from '../../entities/units';

export interface Transport { send(s: string): void; close(): void; onmsg: (s: string) => void; onclose: () => void; onopen: () => void }

export function wsTransport(url: string): Transport {
  const t: Transport = { send: (s) => { if (ws.readyState === 1) ws.send(s); }, close: () => ws.close(), onmsg: () => {}, onclose: () => {}, onopen: () => {} };
  const ws = new WebSocket(url);
  ws.onopen = () => t.onopen(); ws.onmessage = (e) => t.onmsg(e.data as string); ws.onclose = () => t.onclose(); ws.onerror = () => {};
  return t;
}
/** Runs a whole room inside the page so a match against bots needs no server. Same code path as online play. */
export function localTransport(): Transport {
  const room = new Room('SOLO');
  let open = true, last = performance.now();
  const conn: Conn = { send: (s) => { if (open) queueMicrotask(() => open && t.onmsg(s)); }, close: () => {} };
  const timer = setInterval(() => { const now = performance.now(); room.advance(Math.min(0.25, (now - last) / 1000)); last = now; }, 1000 / CFG.tickRate / 2);
  const t: Transport = { send: (s) => { if (open) room.message(conn, s); }, close: () => { open = false; clearInterval(timer); room.disconnect(conn); }, onmsg: () => {}, onclose: () => {}, onopen: () => {} };
  queueMicrotask(() => t.onopen());
  return t;
}

export interface RUnit { id: number; sub: string; kind: string; team: number; x: number; y: number; px: number; py: number; tx: number; ty: number; t0: number; hp: number; maxHp: number; flags: number; pid: number; level: number; face: number; seen: number; atkT: number; hitT: number; moving: boolean; r: number; castT: number; castK: string; auraK: string; auraUntil: number; tip: number[] | null }
export interface Fx { k: string; x: number; y: number; x2: number; y2: number; r: number; a: number; w: number; team: number; t: number; dur: number; from: number; to: number }
export interface FloatText { x: number; y: number; h: number; text: string; color: string; t: number }
export interface StructView { id: number; kind: string; team: number; lane: number; tier: number; x: number; y: number; hp: number; maxHp: number; r: number; range: number }

export class GameClient {
  status: 'idle' | 'connecting' | 'lobby' | 'match' | 'reconnecting' = 'idle';
  solo = false; code = ''; myId = 0; token = ''; name = 'Player';
  lobby: { players: LobbyPlayer[]; fill: boolean } = { players: [], fill: true };
  roster: RosterWire[] = []; you = -1; team = 0;
  me: MeWire | null = null; units = new Map<number, RUnit>(); far: number[][] = []; structs: StructView[] = [];
  projs: (number | string)[][] = []; zones: (number | string)[][] = []; projAt = 0;
  camps = [0, 0, 0]; teamBuffs: string[][] = [[], []]; score = [0, 0]; board: number[][] = []; time = 0; snapN = 0;
  pred = { x: 0, y: 0 }; private hist: { t: number; x: number; y: number }[] = [];
  rtt = 0; private pingAt = 0; private pingC = 0; lastSnapAt = 0;
  input = { mx: 0, my: 0 }; private sent = { mx: 0, my: 0, at: 0 }; private seq = 0;
  fx: Fx[] = []; floats: FloatText[] = []; feed: { text: string; cls: string; t: number }[] = []; banner: { text: string; t: number } | null = null;
  result: { winner: number; secs: number; stats: number[][] } | null = null;
  onChange: () => void = () => {}; onError: (m: string) => void = () => {};
  private tr: Transport | null = null; private url = ''; private retries = 0; private wantClose = false; private retryTimer = 0;

  /** `url` is the WebSocket address of a room, or null for a solo match against bots. */
  connect(url: string | null, code: string, name: string) {
    this.leave(); this.wantClose = false; this.solo = !url; this.url = url || ''; this.code = code; this.name = name; this.retries = 0; this.result = null;
    try { this.token = (!this.solo && sessionStorage.getItem('fdc.token.' + code)) || ''; } catch { this.token = ''; }
    this.status = 'connecting'; this.open(); this.onChange();
  }
  private open() {
    const tr = this.solo ? localTransport() : wsTransport(this.url); this.tr = tr;
    tr.onopen = () => { this.raw({ t: 'join', v: PROTOCOL, name: this.name, token: this.token || undefined }); if (this.solo) { this.raw({ t: 'ready', v: true }); } };
    tr.onmsg = (s) => { let m: ServerMsg; try { m = JSON.parse(s); } catch { return; } this.handle(m); };
    tr.onclose = () => {
      if (this.tr !== tr || this.wantClose) return; this.tr = null;
      if (this.token && this.status !== 'connecting' && this.retries < 40) { this.status = 'reconnecting'; this.retries++; this.retryTimer = window.setTimeout(() => this.open(), 1500); this.onChange(); }
      else { this.status = 'idle'; this.onError(this.retries ? 'Connection lost.' : 'Could not reach the game server.'); this.onChange(); }
    };
  }
  leave() { this.wantClose = true; clearTimeout(this.retryTimer); if (this.tr) { const t = this.tr; this.tr = null; t.close(); } this.status = 'idle'; this.me = null; this.units.clear(); this.you = -1; this.fx = []; this.floats = []; this.feed = []; }
  private raw(m: ClientMsg) { this.tr?.send(JSON.stringify(m)); }
  private cmd(m: Record<string, unknown>) { this.tr?.send(JSON.stringify({ ...m, s: ++this.seq })); }

  setTeam(v: number) { this.raw({ t: 'team', v }); } setHero(v: string) { this.raw({ t: 'hero', v }); } setReady(v: boolean) { this.raw({ t: 'ready', v }); } setFill(v: boolean) { this.raw({ t: 'fill', v }); } start() { this.raw({ t: 'start' }); }
  cast(slot: number, x: number, y: number) { if (this.status === 'match') this.cmd({ t: 'cast', k: slot, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }); }
  rankUp(slot: number) { if (this.status === 'match') this.cmd({ t: 'up', k: slot }); }
  recall() { if (this.status === 'match') this.cmd({ t: 'recall' }); }
  buy(k: string) { if (this.status === 'match') this.cmd({ t: 'buy', k }); }

  get isHost() { return !!this.lobby.players.find((p) => p.id === this.myId)?.host; }
  nameOf(pid: number) { return this.roster.find((r) => r.pid === pid)?.name || 'Someone'; }
  teamOf(pid: number) { return this.roster.find((r) => r.pid === pid)?.team ?? 0; }

  private handle(m: ServerMsg) {
    if (m.t === 'joined') { this.myId = m.id; this.token = m.token; this.retries = 0; if (!this.solo) try { sessionStorage.setItem('fdc.token.' + this.code, m.token); } catch { /* private mode */ } if (this.status !== 'match') this.status = 'lobby'; }
    else if (m.t === 'lobby') { this.lobby = { players: m.players, fill: m.fill }; if (m.phase === 'lobby' && this.status !== 'match') this.status = 'lobby'; if (this.solo && m.phase === 'lobby' && !this.result && m.players[0]?.ready && this.you < 0) this.start(); }
    else if (m.t === 'start') this.begin(m.you, m.roster);
    else if (m.t === 's') this.snapshot(m);
    else if (m.t === 'end') { this.result = { winner: m.winner, secs: m.secs, stats: m.stats }; this.status = 'lobby'; this.you = -1; this.input.mx = this.input.my = 0; }
    else if (m.t === 'pong') { if (m.c === this.pingC) { const r = performance.now() - this.pingAt; this.rtt = this.rtt ? this.rtt * 0.7 + r * 0.3 : r; } }
    else if (m.t === 'err') { const text: Record<string, string> = { full: 'That room is full.', 'in-progress': 'That match has already started.', 'not-ready': 'Everyone must be ready first.', version: 'This page is out of date. Reload it.' }; this.onError(text[m.m] || 'The server refused that.'); if (m.m === 'full' || m.m === 'in-progress' || m.m === 'version') { this.token = ''; this.leave(); } }
    this.onChange();
  }

  private begin(you: number, roster: RosterWire[]) {
    this.status = 'match'; this.you = you; this.roster = roster; this.team = roster.find((r) => r.pid === you)?.team ?? 0; this.result = null;
    this.units.clear(); this.fx = []; this.floats = []; this.feed = []; this.me = null; this.seq = Math.max(this.seq, 0); this.board = []; this.hist = [];
    this.sent = { mx: 0, my: 0, at: 0 };
    this.structs = [
      ...[0, 1].map((t) => ({ id: 1 + t, kind: 'core', team: t, lane: -1, tier: 0, x: CORE[t].x, y: CORE[t].y, hp: STRUCTS.core.hp, maxHp: STRUCTS.core.hp, r: STRUCTS.core.r, range: STRUCTS.core.range })),
      ...TURRETS.map((t, i) => ({ id: 3 + i, kind: 'turret', team: t.team, lane: t.lane, tier: t.tier, x: t.x, y: t.y, hp: STRUCTS.turret.hp, maxHp: STRUCTS.turret.hp, r: STRUCTS.turret.r, range: STRUCTS.turret.range })),
    ];
    this.say('The battle for the Vale begins. Destroy the enemy Core.', 'sys');
  }
  say(text: string, cls = '') { this.feed.push({ text, cls, t: performance.now() }); if (this.feed.length > 5) this.feed.shift(); }

  private snapshot(s: Snapshot) {
    const now = performance.now(), first = !this.me; this.lastSnapAt = now;
    if (this.status !== 'match') return;
    const prevHp = this.me?.hp ?? s.me.hp;
    if (s.a > this.seq) this.seq = s.a; // after a page reload, continue above the server's last accepted sequence number
    this.me = s.me; this.time = s.tm; this.snapN = s.n; this.far = s.far; this.projs = s.pr; this.zones = s.zn; this.projAt = now; this.camps = s.cp; this.teamBuffs = s.tb; this.score = s.sc;
    if (s.sb) this.board = s.sb;
    if (s.st) s.st.forEach((hp, i) => { if (this.structs[i]) this.structs[i].hp = hp; });
    for (const row of s.u) {
      const [id, code, team, qx, qy, hp, maxHp, flags, pid, level, face] = row, x = qx / 10, y = qy / 10, sub = SUBS[code];
      let u = this.units.get(id);
      if (!u) { const kind = HEROES[sub] ? 'hero' : MONSTERS[sub] ? 'monster' : 'minion'; u = { id, sub, kind, team, x, y, px: x, py: y, tx: x, ty: y, t0: now, hp, maxHp, flags, pid: pid ?? -1, level: level ?? 0, face: 0, seen: s.n, atkT: 0, hitT: 0, moving: false, castT: 0, castK: '', auraK: '', auraUntil: 0, tip: null, r: kind === 'hero' ? 1.1 : MONSTERS[sub]?.r || 0.9 }; this.units.set(id, u); }
      if (hp < u.hp - 0.5 && (u.kind !== 'minion' || u.team !== this.team)) { u.hitT = now; if (u.kind !== 'minion' || Math.hypot(u.x - this.pred.x, u.y - this.pred.y) < 14) this.float(u.x, u.y, 2.4, String(Math.round(u.hp - hp)), u.pid === this.you ? '#ff8a7a' : '#ffe9a8'); }
      const d = Math.hypot(x - u.tx, y - u.ty); u.moving = d > 0.05;
      if (d > 0.05 && u.kind !== 'hero') u.face = Math.atan2(y - u.ty, x - u.tx);
      if (face !== undefined) u.face = (face * Math.PI) / 180;
      u.px = d > 12 ? x : u.x; u.py = d > 12 ? y : u.y; u.tx = x; u.ty = y; u.t0 = now; u.hp = hp; u.maxHp = maxHp; u.flags = flags; u.seen = s.n; if (level !== undefined) u.level = level;
    }
    for (const [id, u] of this.units) if (u.seen !== s.n) this.units.delete(id);
    if (s.me.hp > prevHp + 25 && s.me.al) this.float(s.me.x, s.me.y, 2.6, '+' + Math.round(s.me.hp - prevHp), '#8df0a0');
    // Reconcile the predicted position with where the server had us one round trip ago.
    const m = s.me, free = m.al && m.st <= 0 && m.rc <= 0 && !m.dx && !m.dy;
    if (first || !free) { this.pred.x += (m.x - this.pred.x) * (first || !m.al ? 1 : 0.6); this.pred.y += (m.y - this.pred.y) * (first || !m.al ? 1 : 0.6); this.hist.length = 0; }
    else {
      const at = now - Math.min(400, this.rtt); let h = this.hist[0];
      for (const q of this.hist) { if (q.t <= at) h = q; else break; }
      const ex = m.x - (h ? h.x : this.pred.x), ey = m.y - (h ? h.y : this.pred.y), e = Math.hypot(ex, ey);
      if (e > 6) { this.pred.x = m.x; this.pred.y = m.y; this.hist.length = 0; }
      else if (e > 0.05) { const k = 0.18; this.pred.x += ex * k; this.pred.y += ey * k; for (const q of this.hist) { q.x += ex * k; q.y += ey * k; } }
    }
    for (const e of s.ev) this.event(e as any, now);
  }

  private float(x: number, y: number, h: number, text: string, color: string) { if (this.floats.length < 40) this.floats.push({ x: x + (Math.random() - 0.5), y, h, text, color, t: performance.now() }); }
  posOf(id: number): { x: number; y: number; h: number } | null {
    if (id >= 1 && id <= this.structs.length) { const s = this.structs[id - 1]; return { x: s.x, y: s.y, h: s.kind === 'core' ? 4 : 5.2 }; }
    const u = this.units.get(id); if (!u) return null;
    return u.pid === this.you ? { x: this.pred.x, y: this.pred.y, h: 1.6 } : { x: u.x, y: u.y, h: u.kind === 'hero' ? 1.6 : 1.1 };
  }
  private event(e: any, now: number) {
    const base = { x: e.x ?? 0, y: e.y ?? 0, x2: e.x2 ?? 0, y2: e.y2 ?? 0, r: e.r ?? 0, a: e.a ?? 0, w: e.w ?? 0, team: e.team ?? 0, t: now, from: 0, to: 0 };
    const mine = (pid: number) => this.teamOf(pid) === this.team;
    if (e.e === 'atk') { const a = this.units.get(e.a); if (a) { a.atkT = now; const b = this.posOf(e.b); if (b && a.kind !== 'hero') a.face = Math.atan2(b.y - a.y, b.x - a.x); } if (e.k) this.fx.push({ ...base, k: e.k === 2 ? 'beam' : e.k === 3 ? 'smash' : 'bolt', dur: e.k === 2 ? 0.25 : 0.16, from: e.a, to: e.b }); }
    else if (e.e === 'fx') { const u = this.units.get(e.u); if (u) { u.castT = now; u.castK = e.k; if (e.d) { u.auraK = e.k; u.auraUntil = now + e.d * 1000; } } this.fx.push({ ...base, k: e.k, dur: 0.45, from: e.u || 0 }); }
    else if (e.e === 'kill') {
      const v = this.nameOf(e.victim);
      this.say(e.killer >= 0 ? `${this.nameOf(e.killer)} defeated ${v}` : `${v} was slain`, e.killer >= 0 ? (mine(e.killer) ? 'ally' : 'foe') : mine(e.victim) ? 'foe' : 'ally');
      if (e.victim === this.you) this.banner = { text: 'You were defeated', t: now }; else if (e.killer === this.you) this.banner = { text: `You defeated ${v}`, t: now };
    }
    else if (e.e === 'tower') { const ours = e.team === this.team; this.say(`${ours ? 'Your' : 'An enemy'} ${e.tier === 2 ? 'inner' : 'outer'} turret has fallen`, ours ? 'foe' : 'ally'); this.fx.push({ ...base, k: 'boom', r: 6, dur: 0.7 }); }
    else if (e.e === 'obj') { const ours = e.team === this.team, md = MONSTERS[e.k]; this.say(`${ours ? 'Your team' : 'The enemy'} has slain ${md.title}`, ours ? 'ally' : 'foe'); this.banner = { text: `${ours ? 'Your team' : 'The enemy'} claimed ${md.name}`, t: now }; }
    else if (e.e === 'spawn') this.say(`${MONSTERS[e.k].name} has awakened`, 'sys');
    else if (e.e === 'lvl') { this.fx.push({ ...base, k: 'lvl', r: 3, dur: 0.8 }); if (e.pid === this.you) this.banner = { text: `Level ${e.lv}`, t: now }; }
    else if (e.e === 'net') this.say(`${this.nameOf(e.pid)} ${e.on ? 'reconnected' : 'disconnected; a bot is covering'}`, 'sys');
    else if (e.e === 'recalled' || e.e === 'respawn') this.fx.push({ ...base, k: 'lvl', r: 3, dur: 0.6 });
    else if (e.e === 'recall') this.fx.push({ ...base, k: 'recall', r: 2.4, dur: 0.6 });
  }

  /** Per-frame update: interpolate remote units, predict the local hero, send input and pings. */
  update(dt: number) {
    const now = performance.now();
    if (this.status !== 'match' || !this.me) return;
    const span = 1000 / CFG.snapRate;
    for (const u of this.units.values()) { const k = Math.min(1.25, (now - u.t0) / span); u.x = u.px + (u.tx - u.px) * k; u.y = u.py + (u.ty - u.py) * k; }
    const m = this.me, free = m.al && m.st <= 0 && m.rc <= 0 && !m.dx && !m.dy;
    if (free && (this.input.mx || this.input.my)) {
      const s = m.spd * dt, p = moveCircle(this.pred.x, this.pred.y, this.input.mx * s, this.input.my * s, 1.1, this.structs.filter((x) => x.hp > 0));
      this.pred.x = p.x; this.pred.y = p.y;
    }
    this.hist.push({ t: now, x: this.pred.x, y: this.pred.y }); while (this.hist.length > 90) this.hist.shift();
    const mine = [...this.units.values()].find((u) => u.pid === this.you); if (mine) { mine.x = this.pred.x; mine.y = this.pred.y; }
    const i = this.input, changed = Math.abs(i.mx - this.sent.mx) > 0.02 || Math.abs(i.my - this.sent.my) > 0.02;
    if ((changed && now - this.sent.at > 33) || ((i.mx || i.my) && now - this.sent.at > 250)) { this.sent = { mx: i.mx, my: i.my, at: now }; this.cmd({ t: 'in', x: Math.round(i.mx * 100) / 100, y: Math.round(i.my * 100) / 100 }); }
    if (now - this.pingAt > 2000) { this.pingAt = now; this.raw({ t: 'ping', c: ++this.pingC }); }
    this.fx = this.fx.filter((f) => now - f.t < f.dur * 1000); this.floats = this.floats.filter((f) => now - f.t < 900); this.feed = this.feed.filter((f) => now - f.t < 7000);
    if (this.banner && now - this.banner.t > 2600) this.banner = null;
  }

  /** The best target for an auto-aimed skill: the nearest enemy hero in reach, else the nearest enemy unit. */
  autoAim(range: number): { x: number; y: number } {
    let best: RUnit | null = null, bs = 1e9;
    for (const u of this.units.values()) { if (u.team === this.team || u.pid === this.you || u.flags & FLAG.invuln) continue; const d = Math.hypot(u.x - this.pred.x, u.y - this.pred.y); if (d > Math.max(range, 6) + 3) continue; const s = d + (u.kind === 'hero' ? 0 : 100); if (s < bs) { bs = s; best = u; } }
    if (best) return { x: best.x, y: best.y };
    const mine = [...this.units.values()].find((u) => u.pid === this.you), f = mine ? mine.face : 0;
    return { x: this.pred.x + Math.cos(f) * Math.max(range, 4), y: this.pred.y + Math.sin(f) * Math.max(range, 4) };
  }
}
