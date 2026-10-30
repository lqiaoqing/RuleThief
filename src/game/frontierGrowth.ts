import type { PlayerBuild } from './rules';

export type FrontierGrowthId =
  | 'blood-pact'
  | 'glass-cannon'
  | 'phase-dash'
  | 'frost-shatter'
  | 'ember-bloom'
  | 'overkill'
  | 'core-awaken'
  | 'waste-echo';

export interface FrontierGrowthDef {
  id: FrontierGrowthId;
  name: string;
  en: string;
  icon: string;
  color: string;
  description: string;
  detail: string;
  repeatable?: boolean;
  requires?: (build: PlayerBuild) => boolean;
}

const hasBurn = (build: PlayerBuild): boolean =>
  build.impact?.key === 'burn' || build.secondary?.key === 'burn';
const hasFrost = (build: PlayerBuild): boolean =>
  build.impact?.key === 'frost' || build.secondary?.key === 'frost';

export const FRONTIER_GROWTH: Record<FrontierGrowthId, FrontierGrowthDef> = {
  'blood-pact': {
    id: 'blood-pact',
    name: '血契',
    en: 'BLOOD PACT',
    icon: '#i-heart',
    color: '#ff7186',
    description: '伤害 +30%，受到伤害 +15%。',
    detail: '荒原把代价写进契约：更快结束战斗，也更怕一次失误。'
  },
  'glass-cannon': {
    id: 'glass-cannon',
    name: '玻璃大炮',
    en: 'GLASS CANNON',
    icon: '#i-blast',
    color: '#ffac68',
    description: '伤害 +35%，生命上限 -25%，立即生效。',
    detail: '把护壳换成火力。生命上限降低后会立刻重算当前生命。'
  },
  'phase-dash': {
    id: 'phase-dash',
    name: '相位引爆',
    en: 'PHASE BLAST',
    icon: '#i-dash',
    color: '#65dcf0',
    description: '闪避冷却 -15%，闪避起点引爆一次范围伤害。',
    detail: '闪避不只是位移，也是清开贴身怪群的手段。'
  },
  'frost-shatter': {
    id: 'frost-shatter',
    name: '霜碎',
    en: 'FROST SHATTER',
    icon: '#i-frost',
    color: '#8ceafa',
    description: '被冰霜减速的敌人死亡时爆炸 24 伤害。',
    detail: '先控住，再让它们一起碎掉。只在你拥有冰霜规则时出现。',
    requires: hasFrost
  },
  'ember-bloom': {
    id: 'ember-bloom',
    name: '余烬绽放',
    en: 'EMBER BLOOM',
    icon: '#i-burn',
    color: '#ffac68',
    description: '燃烧中的敌人死亡时留下火焰地面。',
    detail: '把火从尸体上继续烧向下一群敌人。只在你拥有燃烧规则时出现。',
    requires: hasBurn
  },
  overkill: {
    id: 'overkill',
    name: '溢出',
    en: 'OVERKILL',
    icon: '#i-shard',
    color: '#b69bff',
    description: '击杀时有 25% 概率引爆周围敌人，造成 18 范围伤害。',
    detail: '怪潮越密，溢出越值钱；单体首领不会触发额外连锁。'
  },
  'core-awaken': {
    id: 'core-awaken',
    name: '律核觉醒',
    en: 'CORE AWAKEN',
    icon: '#i-chain',
    color: '#ffd27a',
    description: '律核达到 Lv.3 后，其效果等级额外 +1。',
    detail: '觉醒不是第五个槽，而是让已有律核跨过数值上限。',
    requires: (build) => Boolean(build.core && build.core.level >= 3)
  },
  'waste-echo': {
    id: 'waste-echo',
    name: '荒原余响',
    en: 'WASTE ECHO',
    icon: '#i-shard',
    color: '#ffd27a',
    description: '伤害 +6%，可重复获取并叠加。',
    detail: '当荒原的所有刻印都被拿走，剩下的只有回声。',
    repeatable: true
  }
};

export const FRONTIER_IDS = Object.keys(FRONTIER_GROWTH) as FrontierGrowthId[];

export function frontierStacks(owned: readonly FrontierGrowthId[], id: FrontierGrowthId): number {
  return owned.filter((item) => item === id).length;
}

export function frontierGrowthPool(
  build: PlayerBuild,
  owned: readonly FrontierGrowthId[]
): FrontierGrowthDef[] {
  return FRONTIER_IDS.map((id) => FRONTIER_GROWTH[id]).filter((def) => {
    if (def.repeatable) return frontierStacks(owned, def.id) < 3;
    if (owned.includes(def.id)) return false;
    return !def.requires || def.requires(build);
  });
}

export function pickFrontierGrowth(
  build: PlayerBuild,
  owned: readonly FrontierGrowthId[],
  random: () => number = Math.random
): FrontierGrowthDef | null {
  const pool = frontierGrowthPool(build, owned);
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

export function frontierDamageMultiplier(owned: readonly FrontierGrowthId[]): number {
  return (
    1 +
    0.3 * Number(owned.includes('blood-pact')) +
    0.35 * Number(owned.includes('glass-cannon')) +
    0.06 * frontierStacks(owned, 'waste-echo')
  );
}

export function frontierDamageTakenMultiplier(owned: readonly FrontierGrowthId[]): number {
  return owned.includes('blood-pact') ? 1.15 : 1;
}

export function frontierDashCooldownMultiplier(owned: readonly FrontierGrowthId[]): number {
  return owned.includes('phase-dash') ? 0.85 : 1;
}
