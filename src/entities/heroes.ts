// Hero and skill definitions. Skills are pure data interpreted by core/simulation/skills.ts.
// Values written [base, perRank] grow with the skill's rank.
export type SkillType = 'dash' | 'nova' | 'cone' | 'shot' | 'zone' | 'strike' | 'buff';
export interface SkillDef {
  key: string; name: string; desc: string; type: SkillType; ult?: boolean;
  mana: [number, number]; cd: [number, number]; range: number;
  dmg?: [number, number]; ratio?: number; radius?: number; angle?: number;
  stun?: number; slow?: [number, number]; // [amount 0..1, seconds]
  speed?: number; pierce?: boolean;
  delay?: number; dur?: [number, number]; tick?: number; heal?: [number, number];
  buff?: string; shield?: [number, number]; stop?: boolean; land?: number;
}
export interface HeroDef {
  key: string; name: string; role: string; color: string; ranged: boolean;
  hp: [number, number]; mana: [number, number]; atk: [number, number]; armor: [number, number];
  range: number; speed: number; atkInt: number; skills: [SkillDef, SkillDef, SkillDef];
}

export const HEROES: Record<string, HeroDef> = {
  swordsman: {
    key: 'swordsman', name: 'Swordsman', role: 'Fighter', color: '#e8b04a', ranged: false,
    hp: [720, 86], mana: [260, 30], atk: [62, 5], armor: [28, 3], range: 2.5, speed: 8.2, atkInt: 0.85,
    skills: [
      { key: 'leap', name: 'Leap Strike', desc: 'Leap to a spot, damaging and slowing enemies where you land.', type: 'dash', mana: [45, 5], cd: [9, -0.6], range: 9, dmg: [70, 38], ratio: 0.5, land: 3.4, slow: [0.3, 1.5] },
      { key: 'whirl', name: 'Whirlwind', desc: 'Spin your blade, damaging everything around you and gaining a shield.', type: 'nova', mana: [50, 5], cd: [8, -0.5], range: 0, radius: 4.6, dmg: [60, 34], ratio: 0.6, shield: [60, 40] },
      { key: 'punish', name: 'Blade Punishment', desc: 'Strike the nearest enemy hero for heavy damage and stun them.', type: 'strike', ult: true, mana: [90, 15], cd: [48, -7], range: 6.5, dmg: [240, 150], ratio: 1.1, stun: 1.2 },
    ],
  },
  brawler: {
    key: 'brawler', name: 'Brawler', role: 'Tank', color: '#e2603e', ranged: false,
    hp: [820, 98], mana: [240, 28], atk: [58, 4.5], armor: [32, 3.6], range: 2.5, speed: 8.0, atkInt: 0.9,
    skills: [
      { key: 'charge', name: 'Charge Punch', desc: 'Charge forward and stun the first enemy hero you hit.', type: 'dash', mana: [45, 5], cd: [10, -0.6], range: 8.5, dmg: [65, 34], ratio: 0.5, stun: 0.9, stop: true },
      { key: 'slam', name: 'Ground Slam', desc: 'Slam the ground, damaging and slowing nearby enemies.', type: 'nova', mana: [50, 5], cd: [9, -0.5], range: 0, radius: 5.2, dmg: [70, 36], ratio: 0.5, slow: [0.4, 2] },
      { key: 'bloodlust', name: 'Bloodlust', desc: 'Heal at once, then take less damage and heal from your hits.', type: 'buff', ult: true, mana: [80, 10], cd: [52, -7], range: 0, buff: 'bloodlust', dur: [5, 1], heal: [140, 110] },
    ],
  },
  shaman: {
    key: 'shaman', name: 'Shaman', role: 'Mage', color: '#62f0dc', ranged: true,
    hp: [560, 66], mana: [380, 46], atk: [50, 4], armor: [16, 2], range: 7.5, speed: 7.8, atkInt: 1.0,
    skills: [
      { key: 'bolt', name: 'Spirit Bolt', desc: 'Fire a bolt that damages the first enemy it hits.', type: 'shot', mana: [40, 5], cd: [5.5, -0.35], range: 15, speed: 30, radius: 1.1, dmg: [85, 48], ratio: 0.4 },
      { key: 'well', name: 'Healing Well', desc: 'Raise a well that heals you and nearby allied heroes.', type: 'zone', mana: [70, 8], cd: [16, -1], range: 0, radius: 5.2, dur: [4, 0], tick: 0.5, heal: [14, 9] },
      { key: 'storm', name: 'Ancestral Storm', desc: 'Call a storm on an area that strikes and slows enemies inside it.', type: 'zone', ult: true, mana: [100, 15], cd: [50, -6], range: 11, radius: 6.2, dur: [4, 0], tick: 0.5, dmg: [44, 30], ratio: 0.12, slow: [0.35, 0.8] },
    ],
  },
  archer: {
    key: 'archer', name: 'Archer', role: 'Marksman', color: '#9be36a', ranged: true,
    hp: [540, 62], mana: [300, 32], atk: [58, 5.6], armor: [15, 2], range: 8.6, speed: 7.9, atkInt: 0.85,
    skills: [
      { key: 'pierce', name: 'Piercing Arrow', desc: 'Loose a long arrow that passes through every enemy in its path.', type: 'shot', mana: [45, 5], cd: [7, -0.4], range: 19, speed: 40, radius: 1.0, dmg: [75, 42], ratio: 0.7, pierce: true },
      { key: 'tumble', name: 'Tumble', desc: 'Roll a short way and attack faster for a few seconds.', type: 'dash', mana: [35, 3], cd: [9, -0.6], range: 6.5, buff: 'tumble', dur: [3, 0.2] },
      { key: 'rain', name: 'Arrow Rain', desc: 'Rain arrows on an area, damaging and slowing enemies inside it.', type: 'zone', ult: true, mana: [95, 15], cd: [46, -6], range: 12, radius: 5.6, dur: [3, 0], tick: 0.5, dmg: [52, 34], ratio: 0.2, slow: [0.3, 0.8] },
    ],
  },
  gunner: {
    key: 'gunner', name: 'Gunner', role: 'Marksman', color: '#b79bff', ranged: true,
    hp: [580, 66], mana: [300, 32], atk: [60, 5.2], armor: [17, 2], range: 7.8, speed: 7.8, atkInt: 0.9,
    skills: [
      { key: 'buck', name: 'Buckshot', desc: 'Blast a cone in front of you.', type: 'cone', mana: [45, 5], cd: [6.5, -0.4], range: 7.5, angle: 0.5, dmg: [90, 46], ratio: 0.6 },
      { key: 'grenade', name: 'Frag Grenade', desc: 'Throw a grenade that explodes after a moment, damaging and stunning.', type: 'zone', mana: [55, 5], cd: [11, -0.6], range: 10, radius: 4.2, delay: 0.7, dmg: [95, 50], ratio: 0.4, stun: 0.6 },
      { key: 'overclock', name: 'Overclock', desc: 'Attack and move much faster for a short time.', type: 'buff', ult: true, mana: [80, 10], cd: [45, -6], range: 0, buff: 'overclock', dur: [5, 1] },
    ],
  },
};
export const HERO_KEYS = Object.keys(HEROES);

export interface BuffDef { name: string; dmg?: number; as?: number; ms?: number; taken?: number; lifesteal?: number; manaRegen?: number; hpRegen?: number; cdr?: number; struct?: number }
/** Timed effects on heroes. Multipliers are 1 = no change. hpRegen and manaRegen are fractions of the maximum per second. */
export const BUFFS: Record<string, BuffDef> = {
  overclock: { name: 'Overclock', as: 1.8, ms: 1.2 },
  bloodlust: { name: 'Bloodlust', taken: 0.7, lifesteal: 0.4 },
  tumble: { name: 'Tumble', as: 1.5 },
  fury: { name: 'Fury Sigil', dmg: 1.15 },
  tide: { name: 'Tide Sigil', manaRegen: 0.025, cdr: 0.15 },
  gale: { name: 'Gale Sigil', ms: 1.18 },
  ember: { name: 'Emberwyrm’s Blessing', dmg: 1.12, hpRegen: 0.012 },
  siege: { name: 'Colossus’ Banner', struct: 1.3 },
};
