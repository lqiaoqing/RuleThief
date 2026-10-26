import { getRuleOffers, type PlayerBuild, type RuleKey, type RuleOffer } from './rules';

export type EnemyKind = 'beetle' | 'bat';

export interface RoomDef {
  id: string;
  name: string;
  en: string;
  subtitle: string;
  quota: number;
  maxAlive: number;
  spawnInterval: number;
  mix: { kind: EnemyKind; weight: number }[];
}

export const ENEMY_RULES: Record<EnemyKind, RuleKey> = {
  beetle: 'blast',
  bat: 'chain'
};

export const ENEMY_LABELS: Record<EnemyKind, { name: string; rule: string; hint: string }> = {
  beetle: { name: '铁刺甲虫', rule: '爆裂', hint: '预警冲锋 · 接触伤害' },
  bat: { name: '雷光蝠', rule: '弹射', hint: '远程雷击 · 保持距离' }
};

export const ROOMS: readonly RoomDef[] = [
  {
    id: 'antechamber',
    name: '训戒前庭',
    en: 'ANTECHAMBER',
    subtitle: '规则在这里第一次被教导，也第一次被夺走。',
    quota: 8,
    maxAlive: 5,
    spawnInterval: 3.0,
    mix: [{ kind: 'beetle', weight: 1 }]
  },
  {
    id: 'echo-gallery',
    name: '回声回廊',
    en: 'ECHO GALLERY',
    subtitle: '雷光在长廊里反复弹射，每一步都要算清落点。',
    quota: 12,
    maxAlive: 7,
    spawnInterval: 2.6,
    mix: [
      { kind: 'beetle', weight: 35 },
      { kind: 'bat', weight: 65 }
    ]
  },
  {
    id: 'rift-sanctum',
    name: '裂痕圣所',
    en: 'RIFT SANCTUM',
    subtitle: '圣所不欢迎访客，它只会加快节奏直到你出错。',
    quota: 16,
    maxAlive: 9,
    spawnInterval: 2.1,
    mix: [
      { kind: 'beetle', weight: 5 },
      { kind: 'bat', weight: 5 }
    ]
  }
] as const;

export function getRoomRuleKeys(room: RoomDef): RuleKey[] {
  const keys = new Set<RuleKey>();
  for (const entry of room.mix) {
    keys.add(ENEMY_RULES[entry.kind]);
  }
  return [...keys];
}

export function pickSpawnKind(room: RoomDef, random: () => number = Math.random): EnemyKind {
  const total = room.mix.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;
  for (const entry of room.mix) {
    roll -= entry.weight;
    if (roll <= 0) return entry.kind;
  }
  return room.mix[room.mix.length - 1].kind;
}

export type SupportId = 'max-hp' | 'heal' | 'dash' | 'speed';

export interface SupportDef {
  id: SupportId;
  name: string;
  icon: string;
  description: string;
  detail: string;
}

export const SUPPORTS: Record<SupportId, SupportDef> = {
  'max-hp': {
    id: 'max-hp',
    name: '规则韧性',
    icon: '#i-heart',
    description: '生命上限 +20，并立即回复 20 生命。',
    detail: '上限提高后，后续恢复也会更值钱。'
  },
  heal: {
    id: 'heal',
    name: '碎片缝合',
    icon: '#i-shard',
    description: '立即回复 45 生命，不占用规则槽。',
    detail: '在房间之间补状态，比多一条规则更能救急。'
  },
  dash: {
    id: 'dash',
    name: '瞬时折叠',
    icon: '#i-dash',
    description: '闪避冷却 -0.8 秒（最低 1.5 秒）。',
    detail: '更频繁的位移，等于更少的硬吃伤害。'
  },
  speed: {
    id: 'speed',
    name: '轻装疾行',
    icon: '#i-arrow',
    description: '移动速度 +8%（可叠加）。',
    detail: '走位空间本身也是一种防御。'
  }
};

const SUPPORT_IDS: SupportId[] = ['max-hp', 'heal', 'dash', 'speed'];

export type Reward =
  | { kind: 'rule'; offer: RuleOffer }
  | { kind: 'support'; support: SupportDef };

export interface RoomPreview {
  index: number;
  total: number;
  room: RoomDef;
  hp: number;
  maxHp: number;
  kills: number;
  elapsed: number;
  build: PlayerBuild;
}

export interface RoomCleared {
  index: number;
  total: number;
  room: RoomDef;
  kills: number;
  elapsed: number;
  rewards: Reward[];
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildRoomRewards(
  build: PlayerBuild,
  room: RoomDef,
  random: () => number = Math.random
): Reward[] {
  const pool = getRoomRuleKeys(room);
  const ruleOffers = getRuleOffers(build, random, pool).slice(0, 2);
  const rewards: Reward[] = ruleOffers.map((offer) => ({ kind: 'rule', offer }));

  const supports = shuffle(SUPPORT_IDS, random).map((id) => SUPPORTS[id]);
  let cursor = 0;
  while (rewards.length < 3 && cursor < supports.length) {
    rewards.push({ kind: 'support', support: supports[cursor] });
    cursor += 1;
  }
  return rewards;
}
