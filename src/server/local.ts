// Local development and test server (Bun). Serves the built client from dist/ and hosts rooms
// over real WebSockets at /ws/<CODE>, exactly as the Cloudflare Worker does in production.
//   bun src/server/local.ts            -> http://localhost:8787
import { CFG } from '../core/shared/config';
import { Room, type Conn } from '../core/networking/room';
import { ROOM_CODE } from './host';

export interface LocalServer { port: number; rooms: Map<string, Room>; stop(): void }
/** `lagMs` delays every message in both directions to simulate network latency. */
export function startServer(port = 8787, opts: { lagMs?: number; dir?: string } = {}): LocalServer {
  const rooms = new Map<string, Room>(), lag = opts.lagMs || 0, dir = opts.dir || 'dist';
  const later = (fn: () => void) => (lag ? setTimeout(fn, lag) : fn());
  const server = Bun.serve({
    port,
    async fetch(req: Request, srv: any) {
      const url = new URL(req.url), m = url.pathname.match(/^\/ws\/([A-Z0-9]+)$/);
      if (m) {
        if (!ROOM_CODE.test(m[1])) return new Response('bad room code', { status: 400 });
        return srv.upgrade(req, { data: { code: m[1] } }) ? undefined : new Response('expected websocket', { status: 426 });
      }
      let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
      if (p.includes('..')) return new Response('no', { status: 400 });
      const f = Bun.file(dir + p);
      return (await f.exists()) ? new Response(f) : new Response('not found', { status: 404 });
    },
    websocket: {
      open(ws: any) {
        let room = rooms.get(ws.data.code); if (!room) rooms.set(ws.data.code, (room = new Room(ws.data.code)));
        const conn: Conn = { send: (s) => later(() => { try { ws.send(s); } catch { /* closed */ } }), close: () => ws.close() };
        ws.data.conn = conn; ws.data.room = room;
      },
      message(ws: any, msg: string | Uint8Array) { if (typeof msg === 'string') later(() => ws.data.room.message(ws.data.conn, msg)); },
      close(ws: any) { ws.data.room.disconnect(ws.data.conn); },
    },
  });
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now(), dt = (now - last) / 1000; last = now;
    for (const [code, room] of rooms) { room.advance(dt); if (room.idleSeconds > CFG.roomIdleSeconds) rooms.delete(code); }
  }, 1000 / CFG.tickRate / 2);
  return { port: server.port, rooms, stop() { clearInterval(timer); server.stop(true); } };
}

if ((import.meta as any).main) {
  const s = startServer(+(process.env.PORT || 8787), { lagMs: +(process.env.LAG || 0) });
  console.log(`Final Duel local server: http://localhost:${s.port}`);
}
