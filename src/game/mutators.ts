export type MutatorLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface MutatorDef {
  level: MutatorLevel;
  name: string;
  en: string;
  description: string;
  enemyHp: number;
  enemySpeed: number;
  bossHp: number;
  hazardInterval: number;
  eliteChance: number;
  shardBonus: number;
}

export const MUTATORS: readonly MutatorDef[] = [
  {
    level: 0,
    name: '标准',
    en: 'STANDARD',
    description: '原始规则与数值。',
    enemyHp: 1,
    enemySpeed: 1,
    bossHp: 1,
    hazardInterval: 1,
    eliteChance: 0,
    shardBonus: 1
  },
  {
    level: 1,
    name: '异变 I · 精英躁动',
    en: 'MUTATION I',
    description: '精英攻击更频繁，敌人生命 +8%。',
    enemyHp: 1.08,
    enemySpeed: 1.03,
    bossHp: 1.05,
    hazardInterval: 1,
    eliteChance: 0,
    shardBonus: 1.15
  },
  {
    level: 2,
    name: '异变 II · 危险房间',
    en: 'MUTATION II',
    description: '环境危险间隔缩短 15%，敌人生命 +12%。',
    enemyHp: 1.12,
    enemySpeed: 1.05,
    bossHp: 1.08,
    hazardInterval: 0.85,
    eliteChance: 0,
    shardBonus: 1.3
  },
  {
    level: 3,
    name: '异变 III · 审判升级',
    en: 'MUTATION III',
    description: '区域 BOSS 生命 +25%，敌人生命 +15%。',
    enemyHp: 1.15,
    enemySpeed: 1.07,
    bossHp: 1.25,
    hazardInterval: 0.85,
    eliteChance: 0,
    shardBonus: 1.5
  },
  {
    level: 4,
    name: '异变 IV · 敌人异化',
    en: 'MUTATION IV',
    description: '普通房可能出现额外精英，敌人生命 +20%。',
    enemyHp: 1.2,
    enemySpeed: 1.1,
    bossHp: 1.3,
    hazardInterval: 0.8,
    eliteChance: 0.15,
    shardBonus: 1.7
  },
  {
    level: 5,
    name: '异变 V · 终极禁令',
    en: 'MUTATION V',
    description: '敌人生命 +30%、BOSS +40%，额外精英概率 25%。',
    enemyHp: 1.3,
    enemySpeed: 1.15,
    bossHp: 1.4,
    hazardInterval: 0.75,
    eliteChance: 0.25,
    shardBonus: 2
  }
];

export function getMutator(level: number): MutatorDef {
  const index = Math.max(0, Math.min(5, Math.floor(level)));
  return MUTATORS[index];
}

export function clampMutator(level: number): MutatorLevel {
  return Math.max(0, Math.min(5, Math.floor(level))) as MutatorLevel;
}
