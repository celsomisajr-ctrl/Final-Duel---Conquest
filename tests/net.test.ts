// Real multiplayer tests: a real server process loop, real WebSocket connections over localhost.
// Nothing here is mocked. What it does not cover: the Cloudflare runtime and the public internet.
import { test, expect, beforeAll, afterAll } from 'bun:test';
import { CFG } from '../src/core/shared/config';
import { startServer, type LocalServer } from '../src/server/local';
import type { Snapshot } from '../src/core/networking/protocol';
import { heroByPid } from '../src/core/simulation/world';

let srv: LocalServer, lagSrv: LocalServer;
beforeAll(() => { srv = startServer(0); lagSrv = startServer(0, { lagMs: 120 }); });
afterAll(() => { srv.stop(); lagSrv.stop(); });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Bot {
  ws!: WebSocket; msgs: any[] = []; snap: Snapshot | null = null; snaps = 0; bytes = 0; id = 0; token = ''; you = -1; seq = 0; lobby: any = null; ended: any = null; errs: string[] = []; roster: any[] = []; open = false;
  constructor(public port: number, public code: string, public name: string) {}
  connect(token?: string) {
    return new Promise<void>((res, rej) => {
      this.ws = new WebSocket(`ws://localhost:${this.port}/ws/${this.code}`);
      this.ws.onopen = () => { this.open = true; this.raw({ t: 'join', v: 1, name: this.name, token }); };
      this.ws.onerror = () => rej(new Error('socket error'));
      this.ws.onclose = () => { this.open = false; };
      this.ws.onmessage = (e) => {
        const m = JSON.parse(e.data as string); this.bytes += (e.data as string).length;
        if (m.t === 's') { this.snap = m; this.snaps++; } else this.msgs.push(m);
        if (m.t === 'joined') { this.id = m.id; this.token = m.token; res(); }
        if (m.t === 'lobby') this.lobby = m; if (m.t === 'start') { this.you = m.you; this.roster = m.roster; }
        if (m.t === 'end') this.ended = m; if (m.t === 'err') { this.errs.push(m.m); res(); }
      };
    });
  }
  raw(m: any) { this.ws.send(typeof m === 'string' ? m : JSON.stringify(m)); }
  cmd(m: any) { this.raw({ ...m, s: ++this.seq }); }
}
async function until(fn: () => unknown, ms = 5000) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timed out waiting'); await sleep(15); } }

async function fullRoom(s: LocalServer, code: string) {
  const bots = Array.from({ length: 10 }, (_, i) => new Bot(s.port, code, 'Player' + i));
  for (const b of bots) await b.connect();
  await until(() => bots[9].lobby?.players.length === 10);
  return bots;
}

test('lobby: room codes, ten seats, balanced teams, hero pick, ready and host start', async () => {
  const bad = await fetch(`http://localhost:${srv.port}/ws/bad!`); expect(bad.status).toBe(404);
  const bots = await fullRoom(srv, 'AAAAA');
  const lob = bots[0].lobby;
  expect(lob.players.filter((p: any) => p.team === 0).length).toBe(5);
  expect(lob.players.filter((p: any) => p.team === 1).length).toBe(5);
  expect(new Set(bots.map((b) => b.token)).size).toBe(10);
  const extra = new Bot(srv.port, 'AAAAA', 'Eleven'); await extra.connect(); expect(extra.errs).toContain('full');
  bots[3].raw({ t: 'hero', v: 'gunner' }); bots[3].raw({ t: 'hero', v: 'dragon' }); bots[2].raw({ t: 'team', v: 1 }); // full team: refused
  await until(() => bots[0].lobby.players.find((p: any) => p.id === bots[3].id).cls === 'gunner');
  expect(bots[0].lobby.players.find((p: any) => p.id === bots[2].id).team).toBe(0);
  bots[5].raw({ t: 'start' }); await sleep(100); expect(bots[0].you).toBe(-1);          // only the host can start
  bots[0].raw({ t: 'start' }); await until(() => bots[0].msgs.some((m) => m.t === 'err' && m.m === 'not-ready'));
  for (const b of bots) b.raw({ t: 'ready', v: true });
  await until(() => bots[0].lobby.players.every((p: any) => p.ready));
  bots[0].raw({ t: 'start' }); await until(() => bots.every((b) => b.you >= 0 && b.snap));
  expect(new Set(bots.map((b) => b.you)).size).toBe(10);
  expect(bots[0].roster.length).toBe(10); expect(bots[0].roster.some((r) => r.bot)).toBe(false);
  for (const b of bots) b.ws.close();
}, 30000);

test('ten real clients: synchronized state, server authority, and command validation', async () => {
  const bots = await fullRoom(srv, 'BBBBB');
  for (const b of bots) b.raw({ t: 'ready', v: true });
  await until(() => bots[0].lobby.players.every((p: any) => p.ready));
  bots[0].raw({ t: 'start' }); await until(() => bots.every((b) => b.snap));
  const room = srv.rooms.get('BBBBB')!, w = room.world!;
  // everyone walks toward the middle of the map and ranks up a skill
  for (const b of bots) { const blue = b.roster.find((r) => r.pid === b.you).team === 0; b.cmd({ t: 'in', x: blue ? 0.7 : -0.7, y: blue ? 0.7 : -0.7 }); b.cmd({ t: 'up', k: 0 }); }
  await sleep(2500);
  for (const b of bots) {
    const u = heroByPid(w, b.you)!, me = b.snap!.me;
    expect(me.p).toBe(b.you); expect(me.r[0]).toBe(1); expect(me.sp).toBe(0);
    expect(Math.hypot(me.x - u.x, me.y - u.y)).toBeLessThan(3);        // client view tracks the server
    expect(Math.hypot(u.x - (u.team ? 189 : 11), u.y - (u.team ? 189 : 11))).toBeGreaterThan(10);
  }
  // all clients agree on shared state
  await sleep(200);
  const times = bots.map((b) => b.snap!.n); expect(Math.max(...times) - Math.min(...times)).toBeLessThanOrEqual(CFG.tickRate / CFG.snapRate);
  expect(new Set(bots.map((b) => b.snap!.sc.join())).size).toBe(1);
  // --- integrity ---
  const a = bots[0], ua = heroByPid(w, a.you)!, rej = () => room.stats.rejected;
  let r0 = rej();
  a.cmd({ t: 'in', x: 50, y: 0 }); await sleep(120); expect(Math.hypot(ua.h!.mx, ua.h!.my)).toBeLessThanOrEqual(1.0001); // speed hack clamped
  const p0 = { x: ua.x, y: ua.y }; await sleep(500);
  expect(Math.hypot(ua.x - p0.x, ua.y - p0.y)).toBeLessThan(ua.speed * 1.4 * 0.7);
  a.raw({ t: 'in', s: 1, x: -1, y: 0 }); await sleep(100); expect(ua.h!.mx).toBeGreaterThan(0); expect(rej()).toBe(r0 + 1); // replayed sequence number
  r0 = rej(); a.cmd({ t: 'up', k: 2 }); a.cmd({ t: 'up', k: 0 }); a.cmd({ t: 'cast', k: 2, x: 0, y: 0 }); a.cmd({ t: 'buy', k: 'heart' });
  await sleep(120); expect(rej()).toBe(r0 + 4); expect(ua.h!.ranks.join()).toBe('1,0,0'); expect(ua.h!.items.length).toBe(0);
  r0 = rej(); const gold = ua.h!.gold, hpB = heroByPid(w, bots[1].you)!.hp;
  a.raw({ t: 'dmg', target: bots[1].you, amount: 9999 }); a.raw({ t: 'gold', v: 99999 }); a.raw('not json'); a.raw('x'.repeat(2000)); a.raw({ t: 'in', s: 'NaN', x: 0, y: 0 });
  await sleep(120); expect(rej()).toBe(r0 + 5);
  expect(heroByPid(w, bots[1].you)!.hp).toBeGreaterThanOrEqual(hpB - 1); expect(ua.h!.gold - gold).toBeLessThan(5);
  const stranger = new Bot(srv.port, 'BBBBB', 'Late'); await stranger.connect(); expect(stranger.errs).toContain('in-progress');
  stranger.raw({ t: 'in', s: 1, x: 1, y: 0 }); stranger.ws.close();
  // flooding is rate limited
  r0 = rej(); for (let i = 0; i < 400; i++) a.cmd({ t: 'in', x: 1, y: 0 }); await sleep(200); expect(rej() - r0).toBeGreaterThan(250);
  // bandwidth per client
  const b0 = bots.map((b) => b.bytes), s0 = bots[0].snaps; await sleep(3000);
  const kbps = bots.map((b, i) => (b.bytes - b0[i]) / 3 / 1024), rate = (bots[0].snaps - s0) / 3;
  console.log(`  ten clients: ${rate.toFixed(1)} snapshots/s each, ${Math.min(...kbps).toFixed(1)}-${Math.max(...kbps).toFixed(1)} KB/s per client (uncompressed JSON)`);
  expect(rate).toBeGreaterThan(CFG.snapRate - 2); expect(Math.max(...kbps)).toBeLessThan(40);
  for (const b of bots) b.ws.close();
}, 40000);

test('disconnect and reconnect: the seat is held, a bot covers, and the token restores control', async () => {
  const a = new Bot(srv.port, 'CCCCC', 'Ann'), b = new Bot(srv.port, 'CCCCC', 'Ben');
  await a.connect(); await b.connect();
  a.raw({ t: 'ready', v: true }); b.raw({ t: 'ready', v: true }); await until(() => a.lobby?.players.length === 2 && a.lobby.players.every((p: any) => p.ready));
  a.raw({ t: 'start' }); await until(() => a.snap && b.snap);
  expect(a.roster.length).toBe(10); expect(a.roster.filter((r) => r.bot).length).toBe(8); // bots fill empty seats
  const room = srv.rooms.get('CCCCC')!, w = room.world!, ub = heroByPid(w, b.you)!;
  b.cmd({ t: 'up', k: 0 }); await sleep(100);
  b.ws.close(); await until(() => !ub.h!.connected);
  await until(() => a.snap!.ev.some((e) => e.e === 'net' && e.on === 0) || a.msgs.length > 0, 2000).catch(() => {});
  const p0 = { x: ub.x, y: ub.y }; await sleep(2500);
  expect(Math.hypot(ub.x - p0.x, ub.y - p0.y)).toBeGreaterThan(2);     // the stand-in bot is playing the hero
  const b2 = new Bot(srv.port, 'CCCCC', 'Ben'); await b2.connect(b.token); await until(() => b2.snap);
  expect(b2.you).toBe(b.you); expect(ub.h!.connected).toBe(true); expect(b2.snap!.me.r[0]).toBe(1); // progress kept
  b2.seq = 1000; b2.cmd({ t: 'in', x: 0, y: 0 }); await sleep(300); const p1 = { x: ub.x, y: ub.y }; await sleep(600);
  expect(Math.hypot(ub.x - p1.x, ub.y - p1.y)).toBeLessThan(0.5);      // the player is back in control
  const thief = new Bot(srv.port, 'CCCCC', 'Thief'); await thief.connect('x'.repeat(24)); expect(thief.errs).toContain('in-progress');
  a.ws.close(); b2.ws.close(); thief.ws.close();
}, 30000);

test('120 ms of added latency each way: play stays in sync and commands still land', async () => {
  const a = new Bot(lagSrv.port, 'DDDDD', 'Lag'); await a.connect();
  a.raw({ t: 'ready', v: true }); await until(() => a.lobby?.players[0]?.ready); a.raw({ t: 'start' }); await until(() => a.snap);
  const w = lagSrv.rooms.get('DDDDD')!.world!, u = heroByPid(w, a.you)!;
  const t0 = performance.now(); let rtt = 0; a.raw({ t: 'ping', c: 7 }); await until(() => a.msgs.some((m) => m.t === 'pong' && m.c === 7)); rtt = performance.now() - t0;
  expect(rtt).toBeGreaterThan(230);
  a.cmd({ t: 'in', x: 0.7, y: 0.7 }); await sleep(2000);
  const lead = Math.hypot(u.x - a.snap!.me.x, u.y - a.snap!.me.y);
  console.log(`  latency test: round trip ${rtt.toFixed(0)} ms, client view trails the server by ${lead.toFixed(2)} units`);
  expect(lead).toBeLessThan(u.speed * 0.3); expect(a.snap!.a).toBe(a.seq);
  a.ws.close();
}, 30000);

test('a match played over the network ends for every client with the same winner', async () => {
  const a = new Bot(srv.port, 'EEEEE', 'Ann'), b = new Bot(srv.port, 'EEEEE', 'Ben');
  await a.connect(); await b.connect();
  a.raw({ t: 'ready', v: true }); b.raw({ t: 'ready', v: true }); await until(() => a.lobby?.players.length === 2 && a.lobby.players.every((p: any) => p.ready));
  a.raw({ t: 'start' }); await until(() => a.snap && b.snap);
  const room = srv.rooms.get('EEEEE')!, w = room.world!;
  for (const s of w.structures) if (s.team === 1 && s.kind === 'turret') { s.alive = false; s.hp = 0; }   // test shortcut: open Red's base
  w.structures.find((s) => s.kind === 'core' && s.team === 1)!.hp = 1;
  const blue = heroByPid(w, a.you)!; blue.x = 172.5; blue.y = 172.5; blue.h!.invuln = 0; blue.maxHp = blue.hp = 1e6; // then let the server play it out
  await until(() => a.ended && b.ended, 20000);
  expect(a.ended.winner).toBe(0); expect(b.ended.winner).toBe(0); expect(a.ended.stats.length).toBe(10);
  await until(() => a.lobby.phase === 'lobby'); expect(room.world).toBe(null);                               // back to the lobby, progress cleared
  a.ws.close(); b.ws.close();
}, 40000);
