import { getRuleOffers, type PlayerBuild, type RuleKey, type RuleOffer } from './rules';

export type EnemyKind =
  | 'beetle'
  | 'bat'
  | 'spore'
  | 'slime'
  | 'wisp'
  | 'bomber'
  | 'sunder'
  | 'thunder';

export interface EnemySpec {
  name: string;
  rule: RuleKey;
  ruleName: string;
  hint: string;
  hp: number;
  radius: number;
  speed: number;
  sprite: string;
  displaySize: number;
  elite?: boolean;
}

export const ENEMY_SPECS: Record<EnemyKind, EnemySpec> = {
  beetle: {
    name: '铁刺甲虫',
    rule: 'pierce',
    ruleName: '贯穿',
    hint: '预警冲锋 · 接触伤害',
    hp: 72,
    radius: 34,
    speed: 68,
    sprite: 'beetle',
    displaySize: 96
  },
  bat: {
    name: '雷光蝠',
    rule: 'chain',
    ruleName: '弹射',
    hint: '远程雷击 · 保持距离',
    hp: 46,
    radius: 24,
    speed: 58,
    sprite: 'bat',
    displaySize: 150
  },
  spore: {
    name: '孢子花',
    rule: 'spread',
    ruleName: '散射',
    hint: '固定不动 · 扇形孢子弹幕',
    hp: 58,
    radius: 30,
    speed: 22,
    sprite: 'spore',
    displaySize: 104
  },
  slime: {
    name: '灼焰史莱姆',
    rule: 'burn',
    ruleName: '燃烧',
    hint: '贴身追击 · 灼烧地面',
    hp: 64,
    radius: 30,
    speed: 54,
    sprite: 'slime',
    displaySize: 100
  },
  wisp: {
    name: '寒霜浮灵',
    rule: 'frost',
    ruleName: '冰霜',
    hint: '远程减速弹 · 保持距离',
    hp: 40,
    radius: 24,
    speed: 64,
    sprite: 'wisp',
    displaySize: 104
  },
  bomber: {
    name: '爆裂甲虫',
    rule: 'blast',
    ruleName: '爆裂',
    hint: '贴身自爆 · 死亡爆炸',
    hp: 52,
    radius: 28,
    speed: 82,
    sprite: 'bomber',
    displaySize: 92
  },
  sunder: {
    name: '裂甲精英',
    rule: 'pierce',
    ruleName: '贯穿',
    hint: '精英 · 连续两次冲锋',
    hp: 320,
    radius: 46,
    speed: 76,
    sprite: 'beetle',
    displaySize: 136,
    elite: true
  },
  thunder: {
    name: '雷暴精英',
    rule: 'chain',
    ruleName: '弹射',
    hint: '精英 · 三道锁定雷击',
    hp: 260,
    radius: 34,
    speed: 62,
    sprite: 'bat',
    displaySize: 200,
    elite: true
  }
};

export const ENEMY_LABELS: Record<EnemyKind, { name: string; rule: string; hint: string }> =
  Object.fromEntries(
    (Object.keys(ENEMY_SPECS) as EnemyKind[]).map((kind) => [
      kind,
      {
        name: ENEMY_SPECS[kind].name,
        rule: ENEMY_SPECS[kind].ruleName,
        hint: ENEMY_SPECS[kind].hint
      }
    ])
  ) as Record<EnemyKind, { name: string; rule: string; hint: string }>;

export const ENEMY_RULES: Record<EnemyKind, RuleKey> = Object.fromEntries(
  (Object.keys(ENEMY_SPECS) as EnemyKind[]).map((kind) => [kind, ENEMY_SPECS[kind].rule])
) as Record<EnemyKind, RuleKey>;

export interface RoomDef {
  id: string;
  name: string;
  en: string;
  subtitle: string;
  quota: number;
  maxAlive: number;
  spawnInterval: number;
  mix: { kind: EnemyKind; weight: number }[];
  leader?: EnemyKind;
  rewardCount?: number;
  elite?: boolean;
}

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
    id: 'ember-nursery',
    name: '余烬苗圃',
    en: 'EMBER NURSERY',
    subtitle: '史莱姆走过的地方会留下火焰，别把自己逼进角落。',
    quota: 10,
    maxAlive: 6,
    spawnInterval: 2.8,
    mix: [
      { kind: 'slime', weight: 7 },
      { kind: 'beetle', weight: 3 }
    ]
  },
  {
    id: 'spore-vault',
    name: '孢子温室',
    en: 'SPORE VAULT',
    subtitle: '孢子花不会追你，但它的扇形弹幕会封死正面。',
    quota: 12,
    maxAlive: 7,
    spawnInterval: 2.6,
    mix: [
      { kind: 'spore', weight: 6 },
      { kind: 'slime', weight: 4 }
    ]
  },
  {
    id: 'echo-gallery',
    name: '回声回廊',
    en: 'ECHO GALLERY',
    subtitle: '雷光与霜冻交替，被减速时就很难再躲开雷击。',
    quota: 14,
    maxAlive: 8,
    spawnInterval: 2.4,
    mix: [
      { kind: 'bat', weight: 6 },
      { kind: 'wisp', weight: 4 }
    ]
  },
  {
    id: 'sunder-pit',
    name: '裂甲竞技场',
    en: 'SUNDER PIT',
    subtitle: '裂甲精英会连续冲锋两次，第二次还会追着你的方向。',
    quota: 9,
    maxAlive: 6,
    spawnInterval: 2.6,
    mix: [
      { kind: 'beetle', weight: 4 },
      { kind: 'bomber', weight: 3 }
    ],
    leader: 'sunder',
    rewardCount: 4,
    elite: true
  },
  {
    id: 'thunder-altar',
    name: '雷暴祭坛',
    en: 'THUNDER ALTAR',
    subtitle: '雷暴精英锁定你之后会连开三道雷击，别停在原地。',
    quota: 10,
    maxAlive: 7,
    spawnInterval: 2.3,
    mix: [
      { kind: 'bat', weight: 4 },
      { kind: 'wisp', weight: 3 }
    ],
    leader: 'thunder',
    rewardCount: 4,
    elite: true
  }
] as const;

export function getRoomRuleKeys(room: RoomDef): RuleKey[] {
  const keys = new Set<RuleKey>();
  for (const entry of room.mix) {
    keys.add(ENEMY_SPECS[entry.kind].rule);
  }
  if (room.leader) keys.add(ENEMY_SPECS[room.leader].rule);
  return [...keys];
}

export function getRoomEnemyKinds(room: RoomDef): EnemyKind[] {
  const kinds = room.mix.map((entry) => entry.kind);
  if (room.leader && !kinds.includes(room.leader)) kinds.push(room.leader);
  return kinds;
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
  const count = room.rewardCount ?? 3;
  const ruleOffers = getRuleOffers(build, random, pool).slice(0, 2);
  const rewards: Reward[] = ruleOffers.map((offer) => ({ kind: 'rule', offer }));

  const supports = shuffle(SUPPORT_IDS, random).map((id) => SUPPORTS[id]);
  let cursor = 0;
  while (rewards.length < count && cursor < supports.length) {
    rewards.push({ kind: 'support', support: supports[cursor] });
    cursor += 1;
  }
  return rewards;
}
