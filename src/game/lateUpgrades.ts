import type { PlayerBuild, RuleKey } from './rules';

export type LateUpgradeId =
  | 'ember-spread'
  | 'rift-echo'
  | 'frost-ring'
  | 'pierce-momentum'
  | 'spread-resonance'
  | 'blast-resonance';

export interface LateUpgradeDef {
  id: LateUpgradeId;
  name: string;
  en: string;
  icon: string;
  color: string;
  description: string;
  detail: string;
}

export const LATE_UPGRADES: Record<LateUpgradeId, LateUpgradeDef> = {
  'ember-spread': {
    id: 'ember-spread',
    name: '余烬蔓延',
    en: 'EMBER SPREAD',
    icon: '#i-burn',
    color: '#ffac68',
    description: '燃烧中的敌人死亡时，把剩余燃烧的 50% / 65% / 80% 传给最近的敌人。',
    detail: '传播不触发新的命中效果，不递归。'
  },
  'rift-echo': {
    id: 'rift-echo',
    name: '裂隙回响',
    en: 'RIFT ECHO',
    icon: '#i-chain',
    color: '#65dcf0',
    description: '弹射终点产生二段冲击，伤害 12 / 18 / 24。',
    detail: '每次攻击最多触发一次，计入触发预算。'
  },
  'frost-ring': {
    id: 'frost-ring',
    name: '霜环驻留',
    en: 'FROST RING',
    icon: '#i-frost',
    color: '#8ceafa',
    description: '冰霜命中后留下减速圈，冷却 1.2 / 1.0 / 0.8 秒，范围逐级扩大。',
    detail: '圈内敌人持续减速。'
  },
  'pierce-momentum': {
    id: 'pierce-momentum',
    name: '穿透蓄势',
    en: 'PIERCE MOMENTUM',
    icon: '#i-pierce',
    color: '#b69bff',
    description: '贯穿命中额外目标时积累势能，下一轮攻击获得额外穿透。',
    detail: '最多积累 3 / 4 / 5 层，触发后清空。'
  },
  'spread-resonance': {
    id: 'spread-resonance',
    name: '散华共鸣',
    en: 'SPREAD RESONANCE',
    icon: '#i-spread',
    color: '#ffb3d9',
    description: '散射每轮额外发射 1 枚弹体，每级再 +1 枚。',
    detail: '与规则等级叠加，不改变散射角。'
  },
  'blast-resonance': {
    id: 'blast-resonance',
    name: '爆裂共鸣',
    en: 'BLAST RESONANCE',
    icon: '#i-blast',
    color: '#ffd27a',
    description: '爆裂范围与伤害各提升 25%，每级再 +25%。',
    detail: '只放大爆裂本身，不触发新的规则效果。'
  }
};

export const LATE_UPGRADE_IDS: readonly LateUpgradeId[] = [
  'ember-spread',
  'rift-echo',
  'frost-ring',
  'pierce-momentum',
  'spread-resonance',
  'blast-resonance'
];

export const MAX_LATE_LEVEL = 3;
// 3 rule slots, each with one matching late upgrade.
export const MAX_LATE_UPGRADES = MAX_LATE_LEVEL * 3;

export function getLateUpgrade(id: LateUpgradeId): LateUpgradeDef {
  return LATE_UPGRADES[id];
}

export function lateLevel(owned: readonly LateUpgradeId[], id: LateUpgradeId): number {
  return owned.reduce((count, item) => (item === id ? count + 1 : count), 0);
}

const RESONANCE_RULES: { id: LateUpgradeId; rules: RuleKey[] }[] = [
  { id: 'ember-spread', rules: ['burn'] },
  { id: 'rift-echo', rules: ['chain'] },
  { id: 'frost-ring', rules: ['frost'] },
  { id: 'pierce-momentum', rules: ['pierce'] },
  { id: 'spread-resonance', rules: ['spread'] },
  { id: 'blast-resonance', rules: ['blast'] }
];

const RULE_TO_LATE = Object.fromEntries(
  RESONANCE_RULES.flatMap((entry) => entry.rules.map((rule) => [rule, entry.id]))
) as Record<RuleKey, LateUpgradeId>;

export function lateUpgradeForRule(rule: RuleKey): LateUpgradeId {
  return RULE_TO_LATE[rule];
}

export function lateUpgradePool(
  build: PlayerBuild,
  owned: readonly LateUpgradeId[]
): LateUpgradeDef[] {
  const keys = new Set(
    [build.trajectory, build.impact, build.secondary]
      .filter((ref): ref is NonNullable<typeof ref> => Boolean(ref))
      .map((ref) => ref.key)
  );
  return RESONANCE_RULES.filter(
    (entry) =>
      entry.rules.some((key) => keys.has(key)) &&
      lateLevel(owned, entry.id) < MAX_LATE_LEVEL
  ).map((entry) => LATE_UPGRADES[entry.id]);
}

export function pickResonance(
  build: PlayerBuild,
  owned: readonly LateUpgradeId[],
  random: () => number = Math.random
): LateUpgradeDef | null {
  const pool = lateUpgradePool(build, owned);
  if (pool.length === 0) return null;
  const lowest = Math.min(...pool.map((def) => lateLevel(owned, def.id)));
  const fresh = pool.filter((def) => lateLevel(owned, def.id) === lowest);
  return fresh[Math.floor(random() * fresh.length)];
}

export function lateUpgradeEligible(
  build: { trajectory: { level: number } | null; impact: { level: number } | null },
  relicCount: number
): boolean {
  return Boolean(
    build.trajectory?.level === 3 && build.impact?.level === 3 && relicCount >= 2
  );
}
