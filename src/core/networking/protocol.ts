// Wire format shared by client and server. Messages are JSON text; snapshots use short keys
// and integer-quantised arrays to keep them small.
export const PROTOCOL = 1;
export const MAX_MSG_BYTES = 512;
/** Unit sub-types by wire code. Append only; never reorder. */
export const SUBS = ['swordsman', 'brawler', 'shaman', 'archer', 'gunner', 'melee', 'ranged', 'brute', 'turret', 'core', 'mossling', 'thornback', 'stag', 'tortoise', 'lynx', 'colossus', 'emberwyrm'];
export const SUB_CODE: Record<string, number> = Object.fromEntries(SUBS.map((s, i) => [s, i]));
export const FLAG = { stun: 1, invuln: 2, recall: 4, dash: 8, shield: 16, slow: 32, bot: 64 };

export interface LobbyPlayer { id: number; name: string; team: number; cls: string; ready: boolean; host: boolean; on: boolean }
export interface RosterWire { pid: number; name: string; cls: string; team: number; bot: boolean }

export type ClientMsg =
  | { t: 'join'; v: number; name: string; token?: string }
  | { t: 'team'; v: number } | { t: 'hero'; v: string } | { t: 'ready'; v: boolean } | { t: 'fill'; v: boolean } | { t: 'start' }
  | { t: 'in'; s: number; x: number; y: number }
  | { t: 'cast'; s: number; k: number; x: number; y: number }
  | { t: 'up'; s: number; k: number } | { t: 'recall'; s: number } | { t: 'buy'; s: number; k: string }
  | { t: 'ping'; c: number };

// Snapshot unit row: [id, subCode, team, x*10, y*10, hp, maxHp, flags, pid, level, facingDeg]
export type UnitRow = number[];
export interface MeWire { p: number; x: number; y: number; hp: number; mh: number; mp: number; mm: number; lv: number; xp: number; g: number; sp: number; r: number[]; cd: number[]; rs: number; rc: number; sh: number; st: number; spd: number; atk: number; ar: number; it: string[]; b: Record<string, number>; al: number; dx: number; dy: number }
export interface Snapshot {
  t: 's'; n: number; tm: number; a: number; me: MeWire; u: UnitRow[];
  far: number[][]; st?: number[]; pr: (number | string)[][]; zn: (number | string)[][];
  cp: number[]; tb: string[][]; sc: number[]; sb?: number[][]; ev: Record<string, unknown>[];
}
export type ServerMsg =
  | { t: 'joined'; id: number; token: string; code: string }
  | { t: 'lobby'; players: LobbyPlayer[]; fill: boolean; phase: string }
  | { t: 'start'; you: number; roster: RosterWire[]; tick: number; snap: number }
  | { t: 'end'; winner: number; secs: number; stats: number[][] }
  | { t: 'pong'; c: number } | { t: 'err'; m: string } | Snapshot;
