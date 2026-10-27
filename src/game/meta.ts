import { ASCENSION_IDS, ASCENSIONS, type AscensionId } from './ascensions';
import { RELIC_IDS, RELICS, type RelicId } from './relics';
import { clampMutator, getMutator } from './mutators';
import { ALL_RULE_KEYS, type RuleKey } from './rules';

export const META_KEY = 'rulethief.meta.v1';

export interface MetaState {
  version: 1;
  shards: number;
  runs: number;
  chaptersCleared: number;
  victories: number;
  maxMutator: number;
  selectedMutator: number;
  dailyBest: string | null;
  unlockedRelics: RelicId[];
  unlockedAscensions: AscensionId[];
  seenRules: RuleKey[];
  ascendedRules: RuleKey[];
  achievements: string[];
}

export interface MetaRunInput {
  victory: boolean;
  stageOnly: boolean;
  chapterIndex: number;
  chaptersTotal: number;
  kills: number;
  seconds: number;
  relics: string[];
  ascensions: string[];
  rulesSeen?: string[];
  rulesAscended?: string[];
  mutatorLevel?: number;
  daily?: boolean;
  date?: string;
}

export interface UnlockDef {
  id: RelicId | AscensionId;
  kind: 'relic' | 'ascension';
  name: string;
  description: string;
  cost: number;
}

export interface RunMetaResult {
  state: MetaState;
  gained: number;
  unlocked: string[];
  newMutator: number | null;
}

export const ACHIEVEMENTS: Record<string, { name: string; description: string }> = {
  'first-run': { name: '第一次掠夺', description: '完成任意一局。' },
  'chapter-one': { name: '审判之后', description: '通过第一世界。' },
  'two-chapters': { name: '工坊深处', description: '通关两个世界。' },
  'ascended': { name: '形态变化', description: '完成一次规则升阶。' },
  'two-relics': { name: '两手准备', description: '单局装备两件遗物。' },
  'speedrun': { name: '二十分钟', description: '在 20 分钟内通关两个世界。' },
  'mutator-iii': { name: '审判升级', description: '在异变 III 或更高难度通关。' },
  'mutator-v': { name: '终极禁令', description: '在异变 V 通关。' },
  'daily-clear': { name: '今日法则', description: '完成一次每日种子挑战。' }
};

export const UNLOCKS: readonly UnlockDef[] = [
  {
    id: 'frost-crown',
    kind: 'relic',
    name: RELICS['frost-crown'].name,
    description: RELICS['frost-crown'].description,
    cost: 80
  },
  {
    id: 'prism',
    kind: 'relic',
    name: RELICS.prism.name,
    description: RELICS.prism.description,
    cost: 120
  },
  {
    id: 'flame-detonation',
    kind: 'ascension',
    name: ASCENSIONS['flame-detonation'].name,
    description: ASCENSIONS['flame-detonation'].description,
    cost: 100
  },
  {
    id: 'absolute-zero',
    kind: 'ascension',
    name: ASCENSIONS['absolute-zero'].name,
    description: ASCENSIONS['absolute-zero'].description,
    cost: 140
  },
  {
    id: 'feather',
    kind: 'relic',
    name: RELICS.feather.name,
    description: RELICS.feather.description,
    cost: 150
  },
  {
    id: 'greed',
    kind: 'relic',
    name: RELICS.greed.name,
    description: RELICS.greed.description,
    cost: 180
  }
];

export function defaultMeta(): MetaState {
  return {
    version: 1,
    shards: 0,
    runs: 0,
    chaptersCleared: 0,
    victories: 0,
    maxMutator: 0,
    selectedMutator: 0,
    dailyBest: null,
    unlockedRelics: ['thunder-emblem', 'bloodflame-heart'],
    unlockedAscensions: ['thunder-domain'],
    seenRules: [],
    ascendedRules: [],
    achievements: []
  };
}

function sanitize(value: unknown): MetaState {
  const base = defaultMeta();
  if (!value || typeof value !== 'object') return base;
  const source = value as Partial<MetaState>;
  const relics = Array.isArray(source.unlockedRelics)
    ? source.unlockedRelics.filter((id): id is RelicId => RELIC_IDS.includes(id as RelicId))
    : [];
  const ascensions = Array.isArray(source.unlockedAscensions)
    ? source.unlockedAscensions.filter((id): id is AscensionId =>
        ASCENSION_IDS.includes(id as AscensionId)
      )
    : [];
  const achievements = Array.isArray(source.achievements)
    ? source.achievements.filter((id): id is string => typeof id === 'string')
    : [];
  const seenRules = Array.isArray(source.seenRules)
    ? source.seenRules.filter((id): id is RuleKey => ALL_RULE_KEYS.includes(id as RuleKey))
    : [];
  const ascendedRules = Array.isArray(source.ascendedRules)
    ? source.ascendedRules.filter((id): id is RuleKey => ALL_RULE_KEYS.includes(id as RuleKey))
    : [];
  return {
    version: 1,
    shards: Math.max(0, Math.floor(Number(source.shards) || 0)),
    runs: Math.max(0, Math.floor(Number(source.runs) || 0)),
    chaptersCleared: Math.max(0, Math.floor(Number(source.chaptersCleared) || 0)),
    victories: Math.max(0, Math.floor(Number(source.victories) || 0)),
    maxMutator: clampMutator(Number(source.maxMutator) || 0),
    selectedMutator: clampMutator(Number(source.selectedMutator) || 0),
    dailyBest: typeof source.dailyBest === 'string' ? source.dailyBest : null,
    unlockedRelics: [...new Set([...base.unlockedRelics, ...relics])],
    unlockedAscensions: [...new Set([...base.unlockedAscensions, ...ascensions])],
    seenRules: [...new Set(seenRules)],
    ascendedRules: [...new Set(ascendedRules)],
    achievements: [...new Set(achievements)]
  };
}

export function loadMeta(storage: Storage | null = safeStorage()): MetaState {
  if (!storage) return defaultMeta();
  try {
    const raw = storage.getItem(META_KEY);
    if (!raw) return defaultMeta();
    return sanitize(JSON.parse(raw));
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(state: MetaState, storage: Storage | null = safeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(META_KEY, JSON.stringify(state));
  } catch {
    /* storage disabled */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function shardsForRun(input: MetaRunInput): number {
  const clearedChapters = input.victory
    ? input.chaptersTotal
    : input.chapterIndex + (input.stageOnly ? 1 : 0);
  const depth = 15 * Math.max(0, clearedChapters);
  const victoryBonus = input.victory ? 20 : 0;
  const killBonus = Math.floor(Math.max(0, input.kills) / 10);
  const base = depth + victoryBonus + killBonus;
  return Math.floor(base * getMutator(input.mutatorLevel ?? 0).shardBonus);
}

export function applyRunToMeta(state: MetaState, input: MetaRunInput): RunMetaResult {
  const gained = shardsForRun(input);
  const clearedChapters = input.victory
    ? input.chaptersTotal
    : input.chapterIndex + (input.stageOnly ? 1 : 0);
  const mutatorLevel = clampMutator(input.mutatorLevel ?? 0);
  const next: MetaState = {
    ...state,
    shards: state.shards + gained,
    runs: state.runs + 1,
    chaptersCleared: Math.max(state.chaptersCleared, clearedChapters),
    victories: state.victories + (input.victory ? 1 : 0),
    maxMutator: input.victory
      ? Math.max(state.maxMutator, Math.min(5, mutatorLevel + 1))
      : state.maxMutator,
    dailyBest:
      input.daily && input.victory && input.date ? input.date : state.dailyBest,
    unlockedRelics: [...state.unlockedRelics],
    unlockedAscensions: [...state.unlockedAscensions],
    seenRules: [
      ...new Set([
        ...state.seenRules,
        ...(input.rulesSeen ?? []).filter((id): id is RuleKey =>
          ALL_RULE_KEYS.includes(id as RuleKey)
        )
      ])
    ],
    ascendedRules: [
      ...new Set([
        ...state.ascendedRules,
        ...(input.rulesAscended ?? []).filter((id): id is RuleKey =>
          ALL_RULE_KEYS.includes(id as RuleKey)
        )
      ])
    ],
    achievements: [...state.achievements]
  };

  const newlyUnlocked: string[] = [];
  const award = (id: string) => {
    if (next.achievements.includes(id)) return;
    next.achievements.push(id);
    newlyUnlocked.push(id);
  };
  award('first-run');
  if (next.chaptersCleared >= 1) award('chapter-one');
  if (next.victories >= 1) award('two-chapters');
  if (input.ascensions.length > 0) award('ascended');
  if (input.relics.length >= 2) award('two-relics');
  if (input.victory && input.seconds <= 20 * 60) award('speedrun');
  if (input.victory && mutatorLevel >= 3) award('mutator-iii');
  if (input.victory && mutatorLevel >= 5) award('mutator-v');
  if (input.victory && input.daily) award('daily-clear');

  return {
    state: next,
    gained,
    unlocked: newlyUnlocked,
    newMutator: next.maxMutator > state.maxMutator ? next.maxMutator : null
  };
}

export function canUnlock(state: MetaState, unlock: UnlockDef): boolean {
  if (unlock.kind === 'relic' && state.unlockedRelics.includes(unlock.id as RelicId)) {
    return false;
  }
  if (
    unlock.kind === 'ascension' &&
    state.unlockedAscensions.includes(unlock.id as AscensionId)
  ) {
    return false;
  }
  return state.shards >= unlock.cost;
}

export function unlockMeta(state: MetaState, id: RelicId | AscensionId): MetaState {
  const unlock = UNLOCKS.find((entry) => entry.id === id);
  if (!unlock || !canUnlock(state, unlock)) return state;
  const next: MetaState = {
    ...state,
    shards: state.shards - unlock.cost,
    unlockedRelics: [...state.unlockedRelics],
    unlockedAscensions: [...state.unlockedAscensions]
  };
  if (unlock.kind === 'relic') {
    next.unlockedRelics.push(id as RelicId);
  } else {
    next.unlockedAscensions.push(id as AscensionId);
  }
  return next;
}
