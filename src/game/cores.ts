export type CoreId =
  | 'orbit'
  | 'storm'
  | 'nova'
  | 'trail'
  | 'mark'
  | 'aegis'
  | 'fold'
  | 'leech'
  | 'echo';

export interface CoreDef {
  id: CoreId;
  name: string;
  en: string;
  icon: string;
  color: string;
  descriptions: readonly [string, string, string];
  detail: string;
}

export interface CoreRef {
  key: CoreId;
  level: 1 | 2 | 3;
}

export const MAX_CORE_LEVEL = 3;

export const CORES: Record<CoreId, CoreDef> = {
  orbit: {
    id: 'orbit',
    name: '轨道刃',
    en: 'ORBIT BLADES',
    icon: '#i-pierce',
    color: '#b69bff',
    descriptions: [
      '每 0.7 秒斩击附近最多 3 名敌人，造成 6 伤害。',
      '每 0.65 秒斩击附近最多 4 名敌人，造成 10 伤害。',
      '每 0.6 秒斩击附近最多 5 名敌人，造成 14 伤害。'
    ],
    detail: '自动运转，不占用规则槽。'
  },
  storm: {
    id: 'storm',
    name: '雷暴云',
    en: 'STORM CLOUD',
    icon: '#i-chain',
    color: '#65dcf0',
    descriptions: [
      '每 2.4 秒对最近敌人降下 18 雷击。',
      '每 2.2 秒对最近 2 名敌人降下 28 雷击。',
      '每 2.0 秒对最近 3 名敌人降下 40 雷击。'
    ],
    detail: '雷击不触发新的规则效果。'
  },
  nova: {
    id: 'nova',
    name: '霜新星',
    en: 'FROST NOVA',
    icon: '#i-frost',
    color: '#8ceafa',
    descriptions: [
      '每 3.2 秒对周围 160 范围造成 8 伤害并减速。',
      '每 3.0 秒对周围 190 范围造成 13 伤害并减速。',
      '每 2.8 秒对周围 220 范围造成 18 伤害并减速。'
    ],
    detail: '与冰霜规则叠加，不递归触发。'
  },
  trail: {
    id: 'trail',
    name: '火焰尾迹',
    en: 'FIRE TRAIL',
    icon: '#i-burn',
    color: '#ffac68',
    descriptions: [
      '移动时每 0.9 秒留下火焰，造成持续伤害。',
      '移动时每 0.8 秒留下更大火焰。',
      '移动时每 0.7 秒留下大范围火焰。'
    ],
    detail: '站立不动时不会生成。'
  },
  mark: {
    id: 'mark',
    name: '猎杀标记',
    en: 'HUNT MARK',
    icon: '#i-blast',
    color: '#ffd27a',
    descriptions: [
      '所有伤害 +4%，对生命低于 30% 的敌人额外 +8%。',
      '所有伤害 +7%，对生命低于 30% 的敌人额外 +14%。',
      '所有伤害 +10%，对生命低于 30% 的敌人额外 +20%。'
    ],
    detail: '对 BOSS 同样生效。'
  },
  aegis: {
    id: 'aegis',
    name: '护盾回响',
    en: 'AEGIS ECHO',
    icon: '#i-heart',
    color: '#7edca9',
    descriptions: [
      '闪避无敌 +0.15 秒，受到伤害 -5%。',
      '闪避无敌 +0.25 秒，受到伤害 -8%。',
      '闪避无敌 +0.35 秒，受到伤害 -12%。'
    ],
    detail: '与遗物/突变减伤乘算。'
  },
  fold: {
    id: 'fold',
    name: '时间褶皱',
    en: 'TIME FOLD',
    icon: '#i-dash',
    color: '#9fe8c8',
    descriptions: [
      '每次击杀减少闪避冷却 0.2 秒。',
      '每次击杀减少闪避冷却 0.35 秒。',
      '每次击杀减少闪避冷却 0.5 秒。'
    ],
    detail: '闪避冷却最低为 0.8 秒。'
  },
  echo: {
    id: 'echo',
    name: '余响',
    en: 'ECHO',
    icon: '#i-shard',
    color: '#b69bff',
    descriptions: [
      '所有伤害 +3%。',
      '所有伤害 +6%。',
      '所有伤害 +9%。'
    ],
    detail: '可与其他增伤乘区叠加。'
  },
  leech: {
    id: 'leech',
    name: '血偿',
    en: 'BLOOD LEECH',
    icon: '#i-heart',
    color: '#ff7186',
    descriptions: [
      '每次击杀恢复 1 生命。',
      '每次击杀恢复 2 生命。',
      '每次击杀恢复 3 生命。'
    ],
    detail: '击杀回血有 0.12 秒合并窗口。'
  }
};

export const CORE_IDS: readonly CoreId[] = [
  'orbit',
  'storm',
  'nova',
  'trail',
  'mark',
  'aegis',
  'fold',
  'leech',
  'echo'
];

export function coreLevel(core: CoreRef | null | undefined): number {
  return core?.level ?? 0;
}

export function nextCoreLevel(core: CoreRef | null | undefined): 1 | 2 | 3 {
  return Math.min(MAX_CORE_LEVEL, (core?.level ?? 0) + 1) as 1 | 2 | 3;
}

export function pickCoreOffer(
  core: CoreRef | null | undefined,
  random: () => number = Math.random
): { core: CoreDef; nextLevel: 1 | 2 | 3 } | null {
  if (core && core.level >= MAX_CORE_LEVEL) return null;
  const def = core
    ? CORES[core.key]
    : CORES[CORE_IDS[Math.floor(random() * CORE_IDS.length)]];
  return def ? { core: def, nextLevel: nextCoreLevel(core) } : null;
}
