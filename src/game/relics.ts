export type RelicId = 'thunder-emblem' | 'bloodflame-heart' | 'frost-crown' | 'prism';

export interface RelicDef {
  id: RelicId;
  name: string;
  en: string;
  icon: string;
  color: string;
  description: string;
  detail: string;
}

export const RELICS: Record<RelicId, RelicDef> = {
  'thunder-emblem': {
    id: 'thunder-emblem',
    name: '雷鸣徽章',
    en: 'THUNDER EMBLEM',
    icon: '#i-chain',
    color: '#65dcf0',
    description: '单次攻击命中 2 个以上目标时，获得 1 层「雷鸣」，最多 3 层。',
    detail: '下一轮攻击每层提高 12% 伤害，触发后清空。'
  },
  'bloodflame-heart': {
    id: 'bloodflame-heart',
    name: '血焰之心',
    en: 'BLOODFLAME HEART',
    icon: '#i-heart',
    color: '#ff8a5c',
    description: '击败燃烧中的敌人回复 4 点生命。',
    detail: '每 2 秒最多触发一次，避免群体燃烧无限回血。'
  },
  'frost-crown': {
    id: 'frost-crown',
    name: '寒霜王冠',
    en: 'FROST CROWN',
    icon: '#i-frost',
    color: '#8ceafa',
    description: '来自减速敌人的伤害降低 25%。',
    detail: '只对处于冰霜减速状态的敌人的攻击生效。'
  },
  prism: {
    id: 'prism',
    name: '破裂棱镜',
    en: 'RUPTURE PRISM',
    icon: '#i-blast',
    color: '#ffd27a',
    description: '范围伤害同时命中 2 个以上目标后，获得 4 秒 +20% 伤害。',
    detail: '触发期间不叠加，重复触发只刷新持续时间。'
  }
};

export const RELIC_IDS: readonly RelicId[] = [
  'thunder-emblem',
  'bloodflame-heart',
  'frost-crown',
  'prism'
];

export const MAX_RELICS = 2;

export function getRelic(id: RelicId): RelicDef {
  return RELICS[id];
}
