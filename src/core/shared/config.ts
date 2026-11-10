// Tunable match rules. Everything here is data: change numbers, not code.
export const CFG = {
  tickRate: 30,                 // simulation steps per second (fixed timestep)
  snapRate: 15,                 // snapshots per second sent to each client
  mapSize: 200,
  maxLevel: 15,
  // XP needed to go from level n to n+1 (index 0 = level 1 -> 2)
  xpToLevel: [100, 130, 165, 200, 240, 285, 330, 380, 430, 490, 550, 620, 690, 770],
  basicMaxRank: 6, ultMaxRank: 3,
  ultLevels: [4, 8, 12],        // hero level needed for ultimate rank 1, 2, 3
  basicRankLevel: (rank: number) => rank * 2 - 1, // hero level needed for basic rank n
  xpShareRadius: 16,
  passiveGold: 1.6,             // gold per second
  startGold: 300,
  waveFirst: 10, waveEvery: 28, waveMelee: 3, waveRanged: 1,
  minionGrowthPerMin: 0.07,
  sanctuaryRadius: 12, sanctuaryRegen: 0.14, sanctuaryBurn: 0.22,
  recallTime: 6, combatTime: 4,
  respawnBase: 6, respawnPerLevel: 2, respawnMax: 40, respawnInvuln: 3,
  heroKillGold: 220, assistGold: 90, heroKillXp: 110, heroKillXpPerLevel: 22,
  turretGoldTeam: 110, turretXp: 140,
  structNoMinionMult: 0.35,     // hero damage to a structure with no allied minions nearby
  turretHeatPerHit: 0.3, turretHeatMax: 1.2,
  monsterLeash: 13,
  maxItems: 6,
  roomIdleSeconds: 90,          // an empty room is discarded after this long; a seat is held for the whole match
  maxCmdPerSec: 60,
  viewRadius: 46,               // units inside this radius of a client's hero are sent in full
};
export const DT = 1 / CFG.tickRate;
