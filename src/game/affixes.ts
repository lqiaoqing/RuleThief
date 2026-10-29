export type AffixId =
  | 'volatile'
  | 'shielded'
  | 'summoner'
  | 'vampiric'
  | 'frenzied'
  | 'linked'
  | 'teleporter'
  | 'toxic';

export interface AffixDef {
  id: AffixId;
  name: string;
  en: string;
  description: string;
}

export const AFFIXES: Record<AffixId, AffixDef> = {
  volatile: { id: 'volatile', name: '自爆', en: 'VOLATILE', description: '死亡时爆炸并伤害附近玩家。' },
  shielded: { id: 'shielded', name: '护盾', en: 'SHIELDED', description: '开场获得短暂减伤护盾。' },
  summoner: { id: 'summoner', name: '召唤', en: 'SUMMONER', description: '死亡时分裂出两只巢群幼体。' },
  vampiric: { id: 'vampiric', name: '吸血', en: 'VAMPIRIC', description: '存活时持续缓慢回复自身。' },
  frenzied: { id: 'frenzied', name: '狂暴', en: 'FRENZIED', description: '移动速度更快，低血量时攻击更凶。' },
  linked: { id: 'linked', name: '链接', en: 'LINKED', description: '受到伤害降低 20%，但移动更慢。' },
  teleporter: { id: 'teleporter', name: '传送', en: 'TELEPORTER', description: '受击后短距离换位。' },
  toxic: { id: 'toxic', name: '毒地', en: 'TOXIC', description: '死亡后留下持续伤害地面。' }
};

export const AFFIX_IDS: readonly AffixId[] = [
  'volatile',
  'shielded',
  'summoner',
  'vampiric',
  'frenzied',
  'linked',
  'teleporter',
  'toxic'
];

export function pickAffix(random: () => number = Math.random): AffixDef {
  return AFFIXES[AFFIX_IDS[Math.floor(random() * AFFIX_IDS.length)]];
}
