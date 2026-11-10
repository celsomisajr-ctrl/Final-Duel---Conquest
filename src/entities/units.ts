// Non-hero unit definitions: minions, structures, jungle monsters, and shop items.
export interface UnitDef { name: string; hp: number; atk: number; armor: number; range: number; speed: number; atkInt: number; r: number; xp: number; gold: number }
export const MINIONS: Record<string, UnitDef> = {
  melee: { name: 'Footman', hp: 450, atk: 22, armor: 0, range: 2.0, speed: 5.6, atkInt: 1.1, r: 0.9, xp: 32, gold: 20 },
  ranged: { name: 'Caster', hp: 280, atk: 30, armor: 0, range: 6.5, speed: 5.6, atkInt: 1.3, r: 0.8, xp: 26, gold: 16 },
  brute: { name: 'Siege Brute', hp: 1100, atk: 60, armor: 20, range: 2.4, speed: 5.2, atkInt: 1.4, r: 1.4, xp: 60, gold: 40 },
};
export const STRUCTS: Record<string, UnitDef> = {
  turret: { name: 'Turret', hp: 2300, atk: 165, armor: 30, range: 10, speed: 0, atkInt: 1.0, r: 2.2, xp: 0, gold: 0 },
  core: { name: 'Core', hp: 4200, atk: 120, armor: 40, range: 9, speed: 0, atkInt: 1.0, r: 3.4, xp: 0, gold: 0 },
};
export interface MonsterDef extends UnitDef { count: number; epic?: boolean; buff?: string; buffDur?: number; teamGold?: number; teamXp?: number; title?: string }
export const MONSTERS: Record<string, MonsterDef> = {
  mossling: { name: 'Mossling', count: 3, hp: 480, atk: 20, armor: 0, range: 2, speed: 6, atkInt: 1.2, r: 0.9, xp: 45, gold: 22 },
  thornback: { name: 'Thornback', count: 1, hp: 1350, atk: 44, armor: 10, range: 2.4, speed: 6, atkInt: 1.3, r: 1.5, xp: 120, gold: 60 },
  stag: { name: 'Crimson Stag', count: 1, hp: 1700, atk: 54, armor: 12, range: 2.6, speed: 6.4, atkInt: 1.2, r: 1.6, xp: 150, gold: 70, buff: 'fury', buffDur: 75 },
  tortoise: { name: 'Azure Tortoise', count: 1, hp: 1900, atk: 46, armor: 22, range: 2.4, speed: 5.4, atkInt: 1.4, r: 1.7, xp: 150, gold: 70, buff: 'tide', buffDur: 75 },
  lynx: { name: 'Gale Lynx', count: 1, hp: 1500, atk: 58, armor: 8, range: 2.4, speed: 7.2, atkInt: 1.0, r: 1.4, xp: 150, gold: 70, buff: 'gale', buffDur: 75 },
  colossus: { name: 'Hollow Colossus', title: 'the Hollow Colossus', count: 1, epic: true, hp: 7200, atk: 140, armor: 30, range: 3.6, speed: 5, atkInt: 1.5, r: 3.2, xp: 0, gold: 0, buff: 'siege', buffDur: 110, teamGold: 160, teamXp: 260 },
  emberwyrm: { name: 'Emberwyrm', title: 'the Emberwyrm', count: 1, epic: true, hp: 5200, atk: 112, armor: 22, range: 4, speed: 5.4, atkInt: 1.3, r: 2.8, xp: 0, gold: 0, buff: 'ember', buffDur: 100, teamGold: 110, teamXp: 180 },
};
export interface ItemDef { key: string; name: string; cost: number; desc: string; atk?: number; hp?: number; armor?: number; mana?: number; ms?: number; cdr?: number; as?: number }
/** Starter equipment. The shop is deliberately small; add entries here to extend it. */
export const ITEMS: Record<string, ItemDef> = {
  blade: { key: 'blade', name: 'Tempered Blade', cost: 450, desc: '+18 attack', atk: 18 },
  plate: { key: 'plate', name: 'Warden Plate', cost: 450, desc: '+20 armor, +150 health', armor: 20, hp: 150 },
  heart: { key: 'heart', name: 'Vale Heart', cost: 500, desc: '+320 health', hp: 320 },
  boots: { key: 'boots', name: 'Swift Boots', cost: 350, desc: '+8% move speed', ms: 0.08 },
  focus: { key: 'focus', name: 'Spirit Focus', cost: 450, desc: '+200 mana, 10% faster cooldowns', mana: 200, cdr: 0.1 },
  quiver: { key: 'quiver', name: 'Hunter’s Quiver', cost: 500, desc: '+20% attack speed', as: 0.2 },
};
