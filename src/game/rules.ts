export type TrajectoryKey = 'pierce' | 'chain' | 'spread';
export type ImpactKey = 'burn' | 'frost' | 'blast';
export type RuleKey = TrajectoryKey | ImpactKey;
export type RuleSlot = 'trajectory' | 'impact';
export type RuleLevel = 1 | 2 | 3;

export interface RuleRef<K extends RuleKey = RuleKey> {
  key: K;
  level: RuleLevel;
}

export interface PlayerBuild {
  trajectory: RuleRef<TrajectoryKey> | null;
  impact: RuleRef<ImpactKey> | null;
}

export interface RuleDefinition {
  key: RuleKey;
  slot: RuleSlot;
  name: string;
  icon: string;
  descriptions: readonly [string, string, string];
}

export const TRAJECTORY_KEYS: readonly TrajectoryKey[] = ['pierce', 'chain', 'spread'];
export const IMPACT_KEYS: readonly ImpactKey[] = ['burn', 'frost', 'blast'];
export const ALL_RULE_KEYS: readonly RuleKey[] = [...TRAJECTORY_KEYS, ...IMPACT_KEYS];

export const RULE_DEFS: Record<RuleKey, RuleDefinition> = {
  pierce: {
    key: 'pierce',
    slot: 'trajectory',
    name: '贯穿',
    icon: '#i-pierce',
    descriptions: ['魔弹贯穿最多 3 个目标', '魔弹贯穿最多 4 个目标', '魔弹贯穿最多 5 个目标']
  },
  chain: {
    key: 'chain',
    slot: 'trajectory',
    name: '弹射',
    icon: '#i-chain',
    descriptions: [
      '命中后跳跃最多 2 个目标（范围 255）',
      '命中后跳跃最多 3 个目标（范围 280）',
      '命中后跳跃最多 4 个目标（范围 305）'
    ]
  },
  spread: {
    key: 'spread',
    slot: 'trajectory',
    name: '散射',
    icon: '#i-spread',
    descriptions: ['扇形发射 3 枚小型魔弹', '扇形发射 4 枚小型魔弹', '扇形发射 5 枚小型魔弹']
  },
  burn: {
    key: 'burn',
    slot: 'impact',
    name: '燃烧',
    icon: '#i-burn',
    descriptions: [
      '燃烧 3 秒，每秒 4 伤害',
      '燃烧 4 秒，每秒 5 伤害',
      '燃烧 5 秒，每秒 6 伤害'
    ]
  },
  frost: {
    key: 'frost',
    slot: 'impact',
    name: '冰霜',
    icon: '#i-frost',
    descriptions: [
      '减速 30%，持续 1.2 秒',
      '减速 40%，持续 1.6 秒',
      '减速 50%，持续 2.0 秒'
    ]
  },
  blast: {
    key: 'blast',
    slot: 'impact',
    name: '爆裂',
    icon: '#i-blast',
    descriptions: [
      '命中点半径 65，范围伤害 6',
      '命中点半径 80，范围伤害 8',
      '命中点半径 95，范围伤害 10'
    ]
  }
};

export const TRAJECTORY_STATS = {
  pierce: { targets: [3, 4, 5], speed: 640, range: 900 },
  chain: { jumps: [2, 3, 4], range: [255, 280, 305], speed: 620, damageMultiplier: 0.86 },
  spread: { bolts: [3, 4, 5], spreadDeg: [22, 28, 34], speed: 540, range: 330, damage: 10 }
} as const;

export const IMPACT_STATS = {
  burn: { duration: [3, 4, 5], dps: [4, 5, 6], tick: 0.5 },
  frost: { slow: [0.3, 0.4, 0.5], duration: [1.2, 1.6, 2.0] },
  blast: { radius: [65, 80, 95], damage: [6, 8, 10] }
} as const;

export type TrajectoryProfile =
  | { kind: 'pierce'; targets: number; speed: number; range: number }
  | {
      kind: 'chain';
      jumps: number;
      range: number;
      speed: number;
      damageMultiplier: number;
    }
  | {
      kind: 'spread';
      bolts: number;
      spreadDeg: number;
      speed: number;
      range: number;
      damage: number;
    };

export type ImpactProfile =
  | { kind: 'burn'; duration: number; dps: number; tick: number }
  | { kind: 'frost'; slow: number; duration: number }
  | { kind: 'blast'; radius: number; damage: number };

export interface ComboView {
  name: string;
  description: string;
  complete: boolean;
}

export type RuleAction = 'equip' | 'upgrade' | 'replace';

export interface RuleOffer {
  key: RuleKey;
  slot: RuleSlot;
  name: string;
  icon: string;
  action: RuleAction;
  currentLevel: number;
  nextLevel: RuleLevel;
  description: string;
  nextDescription: string;
  comboName: string | null;
  comboDescription: string | null;
  replacesRule: string | null;
}

export const COMBO_NAMES: Record<TrajectoryKey, Record<ImpactKey, string>> = {
  pierce: {
    burn: '赤焰穿心',
    frost: '极寒贯穿',
    blast: '爆破穿甲'
  },
  chain: {
    burn: '连锁焚烧',
    frost: '霜雷网络',
    blast: '雷暴连锁'
  },
  spread: {
    burn: '火焰弹幕',
    frost: '冰晶散华',
    blast: '裂爆风暴'
  }
};

const COMBO_DESCRIPTIONS: Record<TrajectoryKey, Record<ImpactKey, string>> = {
  pierce: {
    burn: '魔弹贯穿敌阵，沿途目标燃烧。',
    frost: '贯穿多个敌人，沿线目标减速。',
    blast: '贯穿多个目标，并在命中点产生有限爆炸。'
  },
  chain: {
    burn: '魔弹在敌人之间跳跃，并分别施加燃烧。',
    frost: '连锁攻击多名敌人并减速，为走位创造空间。',
    blast: '魔弹连续跳跃，每个有效命中点都会爆炸。'
  },
  spread: {
    burn: '扇形散弹近距离引燃大范围目标。',
    frost: '三枚扇形冰晶减速前方敌人。',
    blast: '扇形散弹在多个落点产生有限爆炸。'
  }
};

const PARTIAL_NAMES: Record<RuleKey, string> = {
  pierce: '贯穿魔弹',
  chain: '链式魔弹',
  spread: '散射魔弹',
  burn: '燃烧魔弹',
  frost: '冰霜魔弹',
  blast: '爆裂魔弹'
};

export function isTrajectoryKey(key: RuleKey): key is TrajectoryKey {
  return (TRAJECTORY_KEYS as readonly string[]).includes(key);
}

export function isImpactKey(key: RuleKey): key is ImpactKey {
  return (IMPACT_KEYS as readonly string[]).includes(key);
}

export function getRuleDef(key: RuleKey): RuleDefinition {
  return RULE_DEFS[key];
}

export function getRuleName(key: RuleKey): string {
  return RULE_DEFS[key].name;
}

export function getRuleSlotLabel(slot: RuleSlot): string {
  return slot === 'trajectory' ? '弹道规则 · TRAJECTORY' : '命中规则 · IMPACT';
}

export function getRuleLevelDescription(key: RuleKey, level: RuleLevel): string {
  return RULE_DEFS[key].descriptions[level - 1];
}

export function getTrajectoryProfile(
  key: TrajectoryKey,
  level: RuleLevel
): TrajectoryProfile {
  const index = level - 1;
  if (key === 'pierce') {
    return {
      kind: 'pierce',
      targets: TRAJECTORY_STATS.pierce.targets[index],
      speed: TRAJECTORY_STATS.pierce.speed,
      range: TRAJECTORY_STATS.pierce.range
    };
  }
  if (key === 'chain') {
    return {
      kind: 'chain',
      jumps: TRAJECTORY_STATS.chain.jumps[index],
      range: TRAJECTORY_STATS.chain.range[index],
      speed: TRAJECTORY_STATS.chain.speed,
      damageMultiplier: TRAJECTORY_STATS.chain.damageMultiplier
    };
  }
  return {
    kind: 'spread',
    bolts: TRAJECTORY_STATS.spread.bolts[index],
    spreadDeg: TRAJECTORY_STATS.spread.spreadDeg[index],
    speed: TRAJECTORY_STATS.spread.speed,
    range: TRAJECTORY_STATS.spread.range,
    damage: TRAJECTORY_STATS.spread.damage
  };
}

export function getImpactProfile(key: ImpactKey, level: RuleLevel): ImpactProfile {
  const index = level - 1;
  if (key === 'burn') {
    return {
      kind: 'burn',
      duration: IMPACT_STATS.burn.duration[index],
      dps: IMPACT_STATS.burn.dps[index],
      tick: IMPACT_STATS.burn.tick
    };
  }
  if (key === 'frost') {
    return {
      kind: 'frost',
      slow: IMPACT_STATS.frost.slow[index],
      duration: IMPACT_STATS.frost.duration[index]
    };
  }
  return {
    kind: 'blast',
    radius: IMPACT_STATS.blast.radius[index],
    damage: IMPACT_STATS.blast.damage[index]
  };
}

export function getComboName(
  trajectory: TrajectoryKey | null,
  impact: ImpactKey | null
): string | null {
  if (!trajectory || !impact) return null;
  return COMBO_NAMES[trajectory][impact];
}

export function getBuildCombo(build: PlayerBuild): ComboView {
  const trajectory = build.trajectory;
  const impact = build.impact;
  if (trajectory && impact) {
    return {
      name: COMBO_NAMES[trajectory.key][impact.key],
      description: COMBO_DESCRIPTIONS[trajectory.key][impact.key],
      complete: true
    };
  }
  if (trajectory) {
    return {
      name: PARTIAL_NAMES[trajectory.key],
      description: getRuleLevelDescription(trajectory.key, trajectory.level),
      complete: false
    };
  }
  if (impact) {
    return {
      name: PARTIAL_NAMES[impact.key],
      description: getRuleLevelDescription(impact.key, impact.level),
      complete: false
    };
  }
  return {
    name: '基础魔弹',
    description: '尚未掠夺规则 · 自动锁定最近目标',
    complete: false
  };
}

export function buildLevelSum(build: PlayerBuild): number {
  return (build.trajectory?.level ?? 0) + (build.impact?.level ?? 0);
}

export function createEmptyBuild(): PlayerBuild {
  return { trajectory: null, impact: null };
}

export function cloneBuild(build: PlayerBuild): PlayerBuild {
  return {
    trajectory: build.trajectory ? { ...build.trajectory } : null,
    impact: build.impact ? { ...build.impact } : null
  };
}

function buildOffer(build: PlayerBuild, key: RuleKey): RuleOffer | null {
  const def = RULE_DEFS[key];
  const current = def.slot === 'trajectory' ? build.trajectory : build.impact;
  let action: RuleAction;
  let nextLevel: RuleLevel;
  let currentLevel = 0;

  if (!current) {
    action = 'equip';
    nextLevel = 1;
  } else if (current.key === key) {
    if (current.level >= 3) return null;
    action = 'upgrade';
    nextLevel = (current.level + 1) as RuleLevel;
    currentLevel = current.level;
  } else {
    action = 'replace';
    nextLevel = 1;
    currentLevel = current.level;
  }

  const offerTrajectory = isTrajectoryKey(key) ? key : build.trajectory?.key ?? null;
  const offerImpact = isImpactKey(key) ? key : build.impact?.key ?? null;
  const comboName = getComboName(offerTrajectory, offerImpact);
  const comboDescription =
    offerTrajectory && offerImpact
      ? COMBO_DESCRIPTIONS[offerTrajectory][offerImpact]
      : null;

  return {
    key,
    slot: def.slot,
    name: def.name,
    icon: def.icon,
    action,
    currentLevel,
    nextLevel,
    description:
      current && current.key === key
        ? getRuleLevelDescription(key, current.level)
        : current
          ? `当前槽位：${RULE_DEFS[current.key].name} Lv.${current.level}`
          : '当前槽位为空',
    nextDescription: getRuleLevelDescription(key, nextLevel),
    comboName,
    comboDescription,
    replacesRule: action === 'replace' && current ? RULE_DEFS[current.key].name : null
  };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function getRuleOffers(
  build: PlayerBuild,
  random: () => number = Math.random,
  pool?: readonly RuleKey[]
): RuleOffer[] {
  const keys = pool && pool.length ? ALL_RULE_KEYS.filter((key) => pool.includes(key)) : ALL_RULE_KEYS;
  const candidates = keys.map((key) => buildOffer(build, key)).filter(
    (offer): offer is RuleOffer => Boolean(offer)
  );
  if (!candidates.length) return [];

  const picked: RuleOffer[] = [];
  const used = new Set<RuleKey>();

  const upgrades = shuffle(
    candidates.filter((offer) => offer.action === 'upgrade'),
    random
  );
  for (const upgrade of upgrades) {
    if (picked.length >= 3) break;
    picked.push(upgrade);
    used.add(upgrade.key);
  }

  const emptySlots: RuleSlot[] = [];
  if (!build.trajectory) emptySlots.push('trajectory');
  if (!build.impact) emptySlots.push('impact');
  for (const slot of emptySlots) {
    if (picked.length >= 3) break;
    const pool = shuffle(
      candidates.filter(
        (offer) => offer.slot === slot && !used.has(offer.key)
      ),
      random
    );
    if (pool.length) {
      picked.push(pool[0]);
      used.add(pool[0].key);
    }
  }

  const rest = shuffle(
    candidates.filter((offer) => !used.has(offer.key)),
    random
  );
  while (picked.length < 3 && rest.length) {
    const offer = rest.shift()!;
    picked.push(offer);
    used.add(offer.key);
  }

  return picked.slice(0, 3);
}

export function applyRuleOffer(build: PlayerBuild, offer: RuleOffer): PlayerBuild {
  const next = cloneBuild(build);
  if (offer.slot === 'trajectory' && isTrajectoryKey(offer.key)) {
    next.trajectory = { key: offer.key, level: offer.nextLevel };
  } else if (offer.slot === 'impact' && isImpactKey(offer.key)) {
    next.impact = { key: offer.key, level: offer.nextLevel };
  }
  return next;
}

export class TriggerBudget {
  private used = 0;

  constructor(readonly max = 3) {}

  tryConsume(): boolean {
    if (this.used >= this.max) return false;
    this.used += 1;
    return true;
  }

  get remaining(): number {
    return Math.max(0, this.max - this.used);
  }
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface ChainCandidate extends Vec2 {
  id: number;
  active: boolean;
}

export function selectChainTargets(
  from: Vec2,
  candidates: readonly ChainCandidate[],
  maxJumps: number,
  range: number,
  excludeIds: Iterable<number> = []
): ChainCandidate[] {
  const excluded = new Set(excludeIds);
  return candidates
    .filter((candidate) => candidate.active && !excluded.has(candidate.id))
    .map((candidate) => ({
      candidate,
      distance: Math.hypot(candidate.x - from.x, candidate.y - from.y)
    }))
    .filter((item) => item.distance <= range)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.max(0, maxJumps))
    .map((item) => item.candidate);
}

export function getSpreadAngles(
  baseAngle: number,
  bolts: number,
  spreadDegrees: number
): number[] {
  if (bolts <= 1) return [baseAngle];
  const half = (spreadDegrees * Math.PI) / 360;
  const step = (half * 2) / (bolts - 1);
  return Array.from({ length: bolts }, (_, index) => baseAngle - half + step * index);
}

export interface BurnState {
  time: number;
  dps: number;
}

export interface FrostState {
  time: number;
  slow: number;
}

export function mergeBurn(
  current: BurnState | undefined,
  duration: number,
  dps: number
): BurnState {
  return {
    time: Math.max(current?.time ?? 0, duration),
    dps: Math.max(current?.dps ?? 0, dps)
  };
}

export function mergeFrost(
  current: FrostState | undefined,
  slow: number,
  duration: number
): FrostState {
  return {
    time: Math.max(current?.time ?? 0, duration),
    slow: Math.min(0.8, Math.max(current?.slow ?? 0, slow))
  };
}
