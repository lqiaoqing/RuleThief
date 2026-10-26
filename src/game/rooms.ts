import { getRuleOffers, type PlayerBuild, type RuleKey, type RuleOffer } from './rules';
import { MUTATIONS, MUTATION_IDS, type MutationDef } from './mutations';

export type EnemyKind =
  | 'beetle'
  | 'bat'
  | 'spore'
  | 'slime'
  | 'wisp'
  | 'bomber'
  | 'sunder'
  | 'thunder'
  | 'arbiter';

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
  boss?: boolean;
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
  },
  arbiter: {
    name: '规则审判者',
    rule: 'blast',
    ruleName: '审判',
    hint: '最终 BOSS · 三阶段',
    hp: 1800,
    radius: 62,
    speed: 74,
    sprite: 'boss',
    displaySize: 300,
    elite: true,
    boss: true
  }
};

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
  boss?: EnemyKind;
  rewardCount?: number;
  elite?: boolean;
}

export const ROOMS: readonly RoomDef[] = [
  {
    id: 'antechamber',
    name: '训戒前庭',
    en: 'ANTECHAMBER',
    subtitle: '规则在这里第一次被教导，也第一次被夺走。',
    quota: 12,
    maxAlive: 5,
    spawnInterval: 3.0,
    mix: [{ kind: 'beetle', weight: 1 }]
  },
  {
    id: 'ember-nursery',
    name: '余烬苗圃',
    en: 'EMBER NURSERY',
    subtitle: '史莱姆走过的地方会留下火焰，别把自己逼进角落。',
    quota: 18,
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
    quota: 20,
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
    quota: 22,
    maxAlive: 8,
    spawnInterval: 2.4,
    mix: [
      { kind: 'bat', weight: 6 },
      { kind: 'wisp', weight: 4 }
    ]
  },
  {
    id: 'bone-gallery',
    name: '蚀骨回廊',
    en: 'BONE GALLERY',
    subtitle: '骨梁上挂着会爆炸的茧，别在下面停留。',
    quota: 20,
    maxAlive: 8,
    spawnInterval: 2.4,
    mix: [
      { kind: 'bat', weight: 6 },
      { kind: 'bomber', weight: 4 }
    ]
  },
  {
    id: 'ember-rift',
    name: '灼热裂隙',
    en: 'EMBER RIFT',
    subtitle: '地面在缓慢燃烧，站得越久越危险。',
    quota: 20,
    maxAlive: 7,
    spawnInterval: 2.5,
    mix: [
      { kind: 'slime', weight: 6 },
      { kind: 'bomber', weight: 4 }
    ]
  },
  {
    id: 'mycelium-hall',
    name: '菌毯回廊',
    en: 'MYCELIUM HALL',
    subtitle: '孢子与霜冻一起飘，正面推进会付出代价。',
    quota: 20,
    maxAlive: 8,
    spawnInterval: 2.5,
    mix: [
      { kind: 'spore', weight: 7 },
      { kind: 'wisp', weight: 3 }
    ]
  },
  {
    id: 'cinder-court',
    name: '焦土庭院',
    en: 'CINDER COURT',
    subtitle: '霜灵在焦土上徘徊，甲虫在等你露出破绽。',
    quota: 20,
    maxAlive: 7,
    spawnInterval: 2.4,
    mix: [
      { kind: 'beetle', weight: 4 },
      { kind: 'wisp', weight: 6 }
    ]
  },
  {
    id: 'frostbone-gallery',
    name: '霜骨回廊',
    en: 'FROSTBONE GALLERY',
    subtitle: '霜灵在骨柱间穿行，爆裂甲虫负责把你逼出掩体。',
    quota: 20,
    maxAlive: 8,
    spawnInterval: 2.4,
    mix: [
      { kind: 'wisp', weight: 6 },
      { kind: 'bomber', weight: 4 }
    ]
  },
  {
    id: 'slag-yard',
    name: '熔渣庭院',
    en: 'SLAG YARD',
    subtitle: '熔渣没过脚踝，史莱姆与甲虫都不打算让你停下。',
    quota: 20,
    maxAlive: 8,
    spawnInterval: 2.3,
    mix: [
      { kind: 'slime', weight: 6 },
      { kind: 'beetle', weight: 6 }
    ]
  },
  {
    id: 'echo-vault',
    name: '残响回廊',
    en: 'ECHO VAULT',
    subtitle: '雷光在穹顶反弹，史莱姆在下方慢慢逼近。',
    quota: 20,
    maxAlive: 8,
    spawnInterval: 2.3,
    mix: [
      { kind: 'bat', weight: 6 },
      { kind: 'slime', weight: 4 }
    ]
  },
  {
    id: 'frost-court',
    name: '凛冬庭院',
    en: 'FROST COURT',
    subtitle: '霜灵与史莱姆共享这片冻土，减速之后就是灼烧。',
    quota: 20,
    maxAlive: 8,
    spawnInterval: 2.3,
    mix: [
      { kind: 'wisp', weight: 6 },
      { kind: 'slime', weight: 6 }
    ]
  },
  {
    id: 'ash-gallery',
    name: '灰烬回廊',
    en: 'ASH GALLERY',
    subtitle: '焦黑的梁柱下，爆裂甲虫与铁刺甲虫轮番逼近。',
    quota: 20,
    maxAlive: 8,
    spawnInterval: 2.3,
    mix: [
      { kind: 'bomber', weight: 6 },
      { kind: 'beetle', weight: 6 }
    ]
  },
  {
    id: 'sunder-pit',
    name: '裂甲竞技场',
    en: 'SUNDER PIT',
    subtitle: '裂甲精英会连续冲锋两次，第二次还会追着你的方向。',
    quota: 14,
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
    quota: 15,
    maxAlive: 7,
    spawnInterval: 2.3,
    mix: [
      { kind: 'bat', weight: 4 },
      { kind: 'wisp', weight: 3 }
    ],
    leader: 'thunder',
    rewardCount: 4,
    elite: true
  },
  {
    id: 'judgement-hall',
    name: '审判庭',
    en: 'JUDGEMENT HALL',
    subtitle: '规则审判者不会抢夺你的规则，它会审判你如何使用它们。',
    quota: 1,
    maxAlive: 2,
    spawnInterval: 99,
    mix: [],
    boss: 'arbiter',
    rewardCount: 0
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
  if (room.boss && !kinds.includes(room.boss)) kinds.push(room.boss);
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
  | { kind: 'support'; support: SupportDef }
  | { kind: 'mutation'; mutation: MutationDef };

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
  random: () => number = Math.random,
  options: { hasMutation?: boolean; bonusCards?: number } = {}
): Reward[] {
  const pool = getRoomRuleKeys(room);
  const count = (room.rewardCount ?? 3) + (options.bonusCards ?? 0);
  const rewards: Reward[] = [];

  if (room.elite && !options.hasMutation) {
    const mutationId = MUTATION_IDS[Math.floor(random() * MUTATION_IDS.length)] ?? 'overload';
    rewards.push({ kind: 'mutation', mutation: MUTATIONS[mutationId] });
  }

  const ruleOffers = getRuleOffers(build, random, pool).slice(0, 2);
  for (const offer of ruleOffers) {
    if (rewards.length >= count) break;
    rewards.push({ kind: 'rule', offer });
  }

  const supports = shuffle(SUPPORT_IDS, random).map((id) => SUPPORTS[id]);
  let cursor = 0;
  while (rewards.length < count && cursor < supports.length) {
    rewards.push({ kind: 'support', support: supports[cursor] });
    cursor += 1;
  }
  return rewards;
}
