// Cloudflare Worker entry. Static files come from the ASSETS binding; each room is one
// Durable Object instance (addressed by room code) that runs the authoritative simulation
// in memory and talks to players over WebSockets.
import { DurableObject } from 'cloudflare:workers';
import { CFG } from '../core/shared/config';
import { Room, type Conn } from '../core/networking/room';
import { ROOM_CODE } from './host';

interface Env { ROOMS: any; ASSETS: { fetch(r: Request): Promise<Response> }; TURN?: { fetch(url: string, init?: RequestInit): Promise<Response> } }

export class ConquestRoom extends DurableObject<Env> {
  private room: Room | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const code = new URL(req.url).pathname.split('/').pop() || '';
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    server.accept();
    const room = this.room || (this.room = new Room(code));
    const conn: Conn = { send: (s) => server.send(s), close: () => server.close() };
    server.addEventListener('message', (e: MessageEvent) => { if (typeof e.data === 'string') room.message(conn, e.data); });
    const gone = () => room.disconnect(conn);
    server.addEventListener('close', gone); server.addEventListener('error', gone);
    this.loop();
    return new Response(null, { status: 101, webSocket: client });
  }

  private loop() {
    if (this.timer) return;
    this.last = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now(), room = this.room;
      if (room) room.advance((now - this.last) / 1000);
      this.last = now;
      if (!room || room.idleSeconds > CFG.roomIdleSeconds) { clearInterval(this.timer!); this.timer = null; this.room = null; }
    }, 1000 / CFG.tickRate);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url), m = url.pathname.match(/^\/ws\/([A-Z0-9]+)$/);
    if (m) {
      if (!ROOM_CODE.test(m[1])) return new Response('bad room code', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);
    }
    if (url.pathname === '/turn') { // relay credentials for the Arena (1v1) mode
      const json = { 'content-type': 'application/json', 'cache-control': 'no-store' };
      if (!env.TURN) return new Response('{"iceServers":[]}', { status: 503, headers: json });
      try { const r = await env.TURN.fetch('https://final-gate-turn/', { headers: { Origin: 'https://celsomisajr-ctrl.github.io' } }); return new Response(r.body, { status: r.status, headers: json }); }
      catch { return new Response('{"iceServers":[]}', { status: 502, headers: json }); }
    }
    return env.ASSETS.fetch(req);
  },
};
