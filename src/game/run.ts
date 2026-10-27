import { ROOMS, type RoomDef } from './rooms';
import type { PlayerBuild } from './rules';

export type EventId = 'blood-altar' | 'unstable-lab' | 'forgotten-idol' | 'cursed-chest';

export type EventEffect =
  | { kind: 'none' }
  | { kind: 'heal'; amount: number }
  | { kind: 'loseHpUpgrade'; hp: number }
  | { kind: 'upgradeAndSpeedRisk'; percent: number }
  | { kind: 'swapRuleHeal'; heal: number }
  | { kind: 'curseElite' };

export interface EventOption {
  id: string;
  label: string;
  title: string;
  description: string;
  detail: string;
  tone: 'risk' | 'safe';
  effect: EventEffect;
}

export interface EventDef {
  id: EventId;
  name: string;
  en: string;
  subtitle: string;
  options: [EventOption, EventOption];
}

export const EVENTS: Record<EventId, EventDef> = {
  'blood-altar': {
    id: 'blood-altar',
    name: '血色祭坛',
    en: 'BLOOD ALTAR',
    subtitle: '祭坛不收金币，只收生命。',
    options: [
      {
        id: 'pay',
        label: 'A',
        title: '献祭 20 生命',
        description: '随机升级一条已装备的规则。',
        detail: '没有可升级的规则时，改为回复 20 生命。',
        tone: 'risk',
        effect: { kind: 'loseHpUpgrade', hp: 20 }
      },
      {
        id: 'leave',
        label: 'B',
        title: '直接离开',
        description: '不发生任何变化。',
        detail: '保守但安全。',
        tone: 'safe',
        effect: { kind: 'none' }
      }
    ]
  },
  'unstable-lab': {
    id: 'unstable-lab',
    name: '不稳定实验',
    en: 'UNSTABLE LAB',
    subtitle: '实验记录只剩一句：样本变得更快了。',
    options: [
      {
        id: 'experiment',
        label: 'A',
        title: '升级一条规则',
        description: '随机升级一条已装备规则，但下一房敌人移速 +20%。',
        detail: '风险会持续整整一个房间，之后自动清除。',
        tone: 'risk',
        effect: { kind: 'upgradeAndSpeedRisk', percent: 20 }
      },
      {
        id: 'stabilize',
        label: 'B',
        title: '稳定样本',
        description: '回复 25 生命。',
        detail: '不碰实验，只拿能带走的恢复。',
        tone: 'safe',
        effect: { kind: 'heal', amount: 25 }
      }
    ]
  },
  'forgotten-idol': {
    id: 'forgotten-idol',
    name: '遗忘神像',
    en: 'FORGOTTEN IDOL',
    subtitle: '它记不住你的名字，但记得你的规则。',
    options: [
      {
        id: 'swap',
        label: 'A',
        title: '更换一条规则',
        description: '随机把一条已装备规则换成同槽的另一条规则（Lv.1），并回复 15 生命。',
        detail: '可能换到你更想要的组合，也可能换走关键规则。',
        tone: 'risk',
        effect: { kind: 'swapRuleHeal', heal: 15 }
      },
      {
        id: 'keep',
        label: 'B',
        title: '保留构筑',
        description: '不改变任何规则。',
        detail: '构筑稳定，但没有恢复。',
        tone: 'safe',
        effect: { kind: 'none' }
      }
    ]
  },
  'cursed-chest': {
    id: 'cursed-chest',
    name: '诅咒宝箱',
    en: 'CURSED CHEST',
    subtitle: '锁扣上刻着：打开它的人会多一个敌人。',
    options: [
      {
        id: 'open',
        label: 'A',
        title: '打开宝箱',
        description: '下一房额外出现一个精英，但该房奖励多一张。',
        detail: '精英不计入房间配额，击杀后照常结算。',
        tone: 'risk',
        effect: { kind: 'curseElite' }
      },
      {
        id: 'ignore',
        label: 'B',
        title: '不开启',
        description: '宝箱保持关闭。',
        detail: '没有风险，也没有额外奖励。',
        tone: 'safe',
        effect: { kind: 'none' }
      }
    ]
  }
};

export const EVENT_IDS: EventId[] = [
  'blood-altar',
  'unstable-lab',
  'forgotten-idol',
  'cursed-chest'
];

export function hasUpgradeableRule(build: PlayerBuild): boolean {
  return Boolean(
    (build.trajectory && build.trajectory.level < 3) ||
      (build.impact && build.impact.level < 3)
  );
}

export function eventOptionsFor(
  event: EventDef,
  build: PlayerBuild
): [EventOption, EventOption] {
  if (event.id === 'blood-altar' && !hasUpgradeableRule(build)) {
    return [
      {
        ...event.options[0],
        title: '接受祭坛的馈赠',
        description: '没有可升级的规则，祭坛转而回复 20 生命。',
        detail: '本次不会扣除生命。',
        tone: 'safe',
        effect: { kind: 'heal', amount: 20 }
      },
      event.options[1]
    ];
  }
  if (event.id === 'unstable-lab' && !hasUpgradeableRule(build)) {
    return [
      {
        ...event.options[0],
        title: '终止实验',
        description: '没有可升级的规则，实验无法进行。',
        detail: '不产生任何变化，也不会留下移速惩罚。',
        tone: 'safe',
        effect: { kind: 'none' }
      },
      event.options[1]
    ];
  }
  return event.options;
}

export type Encounter =
  | { kind: 'room'; room: RoomDef }
  | { kind: 'event'; event: EventDef };

export type RunStep =
  | { kind: 'encounter'; encounter: Encounter }
  | { kind: 'choice'; options: Encounter[] };

const BY_ID = new Map(ROOMS.map((room) => [room.id, room]));

function room(id: string): Encounter {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown room: ${id}`);
  return { kind: 'room', room: found };
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export type ChapterId = 'judgement' | 'workshop' | 'abyss';

export interface ChapterDef {
  id: ChapterId;
  index: number;
  name: string;
  en: string;
  subtitle: string;
  bossName: string;
  bossEn: string;
  buildPlan: (random: () => number) => RunStep[];
}

export const CHAPTERS: readonly ChapterDef[] = [
  {
    id: 'judgement',
    index: 0,
    name: '审判废墟',
    en: 'JUDGEMENT RUINS',
    subtitle: '掠夺规则，建立第一套基础构筑。',
    bossName: '规则审判者',
    bossEn: 'RULE ARBITER',
    buildPlan: (random) => {
      const events = shuffle(EVENT_IDS, random).slice(0, 2) as EventId[];
      return [
        { kind: 'encounter', encounter: room('antechamber') },
        { kind: 'choice', options: [room('ember-nursery'), room('spore-vault')] },
        { kind: 'choice', options: [room('echo-gallery'), room('bone-gallery')] },
        { kind: 'encounter', encounter: { kind: 'event', event: EVENTS[events[0]] } },
        { kind: 'encounter', encounter: room('mycelium-hall') },
        { kind: 'encounter', encounter: room('ember-rift') },
        { kind: 'encounter', encounter: { kind: 'event', event: EVENTS[events[1]] } },
        { kind: 'encounter', encounter: room('cinder-court') },
        { kind: 'choice', options: [room('sunder-pit'), room('frostbone-gallery')] },
        { kind: 'choice', options: [room('slag-yard'), room('frost-court')] },
        { kind: 'encounter', encounter: room('echo-vault') },
        { kind: 'choice', options: [room('thunder-altar'), room('ash-gallery')] },
        { kind: 'encounter', encounter: room('judgement-hall') }
      ];
    }
  }
];

export function buildRunPlan(random: () => number = Math.random): RunStep[] {
  return CHAPTERS[0].buildPlan(random);
}

export function buildChapterPlan(
  chapterIndex: number,
  random: () => number = Math.random
): RunStep[] {
  const chapter = CHAPTERS[chapterIndex];
  return chapter ? chapter.buildPlan(random) : [];
}

export function getChapter(chapterIndex: number): ChapterDef | undefined {
  return CHAPTERS[chapterIndex];
}

export function planNodeCount(plan: readonly RunStep[]): number {
  return plan.reduce((sum, step) => sum + (step.kind === 'choice' ? step.options.length : 1), 0);
}

export function planStepCount(plan: readonly RunStep[]): number {
  return plan.length;
}

export interface RouteChoicePayload {
  index: number;
  total: number;
  options: Encounter[];
}

export interface EventPayload {
  index: number;
  total: number;
  event: EventDef;
  options: [EventOption, EventOption];
  hp: number;
  maxHp: number;
  kills: number;
  build: PlayerBuild;
}

export function stepEncounters(step: RunStep | undefined): Encounter[] {
  if (!step) return [];
  return step.kind === 'choice' ? step.options : [step.encounter];
}
