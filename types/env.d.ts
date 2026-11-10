// Minimal ambient declarations so the project type-checks without installing @types packages.
declare module 'bun:test' {
  export const test: (name: string, fn: () => unknown | Promise<unknown>, timeout?: number) => void;
  export const describe: (name: string, fn: () => void) => void;
  export const expect: (v: unknown) => any;
  export const beforeAll: (fn: () => unknown | Promise<unknown>) => void;
  export const afterAll: (fn: () => unknown | Promise<unknown>) => void;
}
declare const Bun: any;
declare const process: any;
declare module 'node:fs' { const x: any; export = x; }
declare module 'node:path' { const x: any; export = x; }
declare module 'cloudflare:workers' { export class DurableObject<E = unknown> { ctx: any; env: E; constructor(ctx: any, env: E); } }
declare class WebSocketPair { 0: WebSocket; 1: WebSocket }
interface ResponseInit { webSocket?: WebSocket }
interface WebSocket { accept(): void }
