import type { PlayerBuild, RuleKey } from './rules';

export type LateUpgradeId =
  | 'ember-spread'
  | 'rift-echo'
  | 'frost-ring'
  | 'pierce-momentum';

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
    description: '燃烧中的敌人死亡时，把一半剩余燃烧传给最近的敌人。',
    detail: '传播不触发新的命中效果，不递归。'
  },
  'rift-echo': {
    id: 'rift-echo',
    name: '裂隙回响',
    en: 'RIFT ECHO',
    icon: '#i-chain',
    color: '#65dcf0',
    description: '弹射的最后一次命中后，在终点产生一次小范围二段冲击。',
    detail: '每次攻击最多触发一次，计入触发预算。'
  },
  'frost-ring': {
    id: 'frost-ring',
    name: '霜环驻留',
    en: 'FROST RING',
    icon: '#i-frost',
    color: '#8ceafa',
    description: '冰霜命中后在地面留下短暂减速圈。',
    detail: '每 1.2 秒最多生成一个，圈内敌人持续减速。'
  },
  'pierce-momentum': {
    id: 'pierce-momentum',
    name: '穿透蓄势',
    en: 'PIERCE MOMENTUM',
    icon: '#i-pierce',
    color: '#b69bff',
    description: '贯穿命中额外目标时积累势能，下一轮攻击获得额外穿透。',
    detail: '最多积累 3 层，触发后清空。'
  }
};

export const LATE_UPGRADE_IDS: readonly LateUpgradeId[] = [
  'ember-spread',
  'rift-echo',
  'frost-ring',
  'pierce-momentum'
];

export const MAX_LATE_UPGRADES = 2;

export function getLateUpgrade(id: LateUpgradeId): LateUpgradeDef {
  return LATE_UPGRADES[id];
}

const RESONANCE_RULES: { id: LateUpgradeId; rules: RuleKey[] }[] = [
  { id: 'ember-spread', rules: ['burn'] },
  { id: 'rift-echo', rules: ['chain'] },
  { id: 'frost-ring', rules: ['frost'] },
  { id: 'pierce-momentum', rules: ['pierce'] }
];

export function pickResonance(
  build: PlayerBuild,
  owned: readonly LateUpgradeId[],
  random: () => number = Math.random
): LateUpgradeDef | null {
  const keys = new Set(
    [build.trajectory, build.impact, build.secondary]
      .filter((ref): ref is NonNullable<typeof ref> => Boolean(ref))
      .map((ref) => ref.key)
  );
  const pool = RESONANCE_RULES.filter(
    (entry) => !owned.includes(entry.id) && entry.rules.some((key) => keys.has(key))
  );
  if (pool.length === 0) return null;
  const pick = pool[Math.floor(random() * pool.length)];
  return LATE_UPGRADES[pick.id];
}

export function lateUpgradeEligible(
  build: { trajectory: { level: number } | null; impact: { level: number } | null },
  relicCount: number
): boolean {
  return Boolean(
    build.trajectory?.level === 3 && build.impact?.level === 3 && relicCount >= 2
  );
}
