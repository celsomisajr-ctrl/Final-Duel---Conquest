// Shared types for the Conquest simulation. No DOM or network code may be imported here.
export type Team = 0 | 1;
export const NEUTRAL = 2;
export type Kind = 'hero' | 'minion' | 'turret' | 'core' | 'monster';

export interface Dash { vx: number; vy: number; t: number; hitR: number; dmg: number; stun: number; slowAmt: number; slowT: number; stop: boolean; land: number; hit: Set<number>; fx: string }

export interface HeroState {
  pid: number; name: string; cls: string; bot: boolean;
  level: number; xp: number; gold: number; sp: number;
  mana: number; maxMana: number;
  ranks: number[]; cds: number[];
  kills: number; deaths: number; assists: number;
  respawn: number; invuln: number; recall: number; combat: number;
  buffs: Record<string, number>;
  shield: number; shieldT: number;
  mx: number; my: number; fx: number; fy: number;
  items: string[];
  dash: Dash | null;
  dmgFrom: Record<number, number>;
  think: number; mode: string; lane: number;
  connected: boolean;
}

export interface Unit {
  id: number; kind: Kind; sub: string; team: number;
  x: number; y: number; r: number;
  hp: number; maxHp: number; atk: number; armor: number; range: number; speed: number;
  atkInt: number; atkCd: number;
  alive: boolean; stun: number; slow: number; slowAmt: number;
  lane: number; wp: number; tier: number; heat: number; heatTgt: number;
  camp: number; hx: number; hy: number; aggro: number; lastHit: number;
  xp: number; gold: number;
  h: HeroState | null;
}

export interface Proj { id: number; owner: number; team: number; k: string; x: number; y: number; vx: number; vy: number; left: number; r: number; dmg: number; pierce: boolean; slowAmt: number; slowT: number; stun: number; hit: Set<number> }
export interface Zone { id: number; owner: number; team: number; k: string; x: number; y: number; r: number; delay: number; dur: number; tick: number; tickCd: number; dmg: number; heal: number; slowAmt: number; slowT: number; stun: number }
export interface Pending { t: number; src: number; tgt: number; dmg: number }
export interface CampState { def: number; alive: number; timer: number; ids: number[] }
export interface TeamState { kills: number; buffs: Record<string, number>; siegeWaves: number }

export interface GameEvent { e: string; g?: 1; x?: number; y?: number; [k: string]: unknown }

export interface RosterEntry { pid: number; name: string; cls: string; team: Team; bot: boolean }

export interface World {
  t: number; tick: number; seed: number; nextId: number;
  units: Map<number, Unit>; heroes: Unit[]; structures: Unit[];
  projs: Proj[]; zones: Zone[]; pending: Pending[];
  camps: CampState[]; teams: TeamState[];
  nextWave: number; waveNo: number;
  winner: number; events: GameEvent[];
}
