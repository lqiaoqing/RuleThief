import type { RuleKey } from './rules';

export type AscensionId = 'thunder-domain' | 'flame-detonation' | 'absolute-zero';

export interface AscensionDef {
  id: AscensionId;
  rule: RuleKey;
  name: string;
  en: string;
  icon: string;
  color: string;
  description: string;
  detail: string;
}

export const ASCENSIONS: Record<AscensionId, AscensionDef> = {
  'thunder-domain': {
    id: 'thunder-domain',
    rule: 'chain',
    name: '雷霆领域',
    en: 'THUNDER DOMAIN',
    icon: '#i-chain',
    color: '#65dcf0',
    description: '弹射跳跃累计 6 次后，下一轮攻击额外释放 3 道范围雷击。',
    detail: '雷击计入触发预算，不递归触发新规则。'
  },
  'flame-detonation': {
    id: 'flame-detonation',
    rule: 'burn',
    name: '烈焰引爆',
    en: 'FLAME DETONATION',
    icon: '#i-burn',
    color: '#ffac68',
    description: '燃烧中的敌人死亡时爆炸，对周围敌人造成伤害。',
    detail: '爆炸不附加燃烧，避免无限链式触发。'
  },
  'absolute-zero': {
    id: 'absolute-zero',
    rule: 'frost',
    name: '极寒禁锢',
    en: 'ABSOLUTE ZERO',
    icon: '#i-frost',
    color: '#8ceafa',
    description: '每第 4 次冰霜命中会将目标禁锢 1.5 秒。',
    detail: '禁锢只停止移动，不延长减速叠加。'
  }
};

export const ASCENSION_IDS: readonly AscensionId[] = [
  'thunder-domain',
  'flame-detonation',
  'absolute-zero'
];

export function getAscensionForRule(rule: RuleKey): AscensionDef | null {
  return ASCENSION_IDS.map((id) => ASCENSIONS[id]).find((entry) => entry.rule === rule) ?? null;
}

export function getAscension(id: AscensionId): AscensionDef {
  return ASCENSIONS[id];
}
