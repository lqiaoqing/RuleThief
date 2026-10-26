export type MutationId = 'overload' | 'dashfire' | 'lastStand';

export interface MutationDef {
  id: MutationId;
  name: string;
  icon: string;
  color: string;
  description: string;
  detail: string;
}

export const MUTATIONS: Record<MutationId, MutationDef> = {
  overload: {
    id: 'overload',
    name: '过载核心',
    icon: '#i-mutation',
    color: '#b69bff',
    description: '累计 10 次有效命中后，下一轮普通攻击伤害 ×1.8。',
    detail: '多段攻击（散射 / 弹射 / 贯穿多目标）会更快充满。'
  },
  dashfire: {
    id: 'dashfire',
    name: '疾行强化',
    icon: '#i-dash',
    color: '#65dcf0',
    description: '闪避后 2 秒内攻击间隔缩短 45%。',
    detail: '用闪避换取输出窗口，适合贴身游走。'
  },
  lastStand: {
    id: 'lastStand',
    name: '绝境斗志',
    icon: '#i-heart',
    color: '#ff7186',
    description: '生命低于 35% 时，所有伤害 ×1.35。',
    detail: '越接近死亡越危险，也越强。'
  }
};

export const MUTATION_IDS: MutationId[] = ['overload', 'dashfire', 'lastStand'];

export const OVERLOAD_HITS = 10;
export const OVERLOAD_MULTIPLIER = 1.8;
export const DASHFIRE_DURATION = 2;
export const DASHFIRE_ATTACK_SCALE = 0.55;
export const LAST_STAND_THRESHOLD = 0.35;
export const LAST_STAND_MULTIPLIER = 1.35;

export interface MutationState {
  id: MutationId | null;
  overloadHits: number;
  overloadReady: boolean;
  dashfireTime: number;
}

export function createMutationState(): MutationState {
  return { id: null, overloadHits: 0, overloadReady: false, dashfireTime: 0 };
}

export function equipMutation(state: MutationState, id: MutationId): MutationState {
  return { ...state, id, overloadHits: 0, overloadReady: false, dashfireTime: 0 };
}

export function registerHit(state: MutationState, count = 1): boolean {
  if (state.id !== 'overload' || state.overloadReady) return false;
  state.overloadHits += count;
  if (state.overloadHits >= OVERLOAD_HITS) {
    state.overloadHits = 0;
    state.overloadReady = true;
    return true;
  }
  return false;
}

export function consumeOverload(state: MutationState): boolean {
  if (!state.overloadReady) return false;
  state.overloadReady = false;
  return true;
}

export function triggerDashfire(state: MutationState): void {
  if (state.id !== 'dashfire') return;
  state.dashfireTime = DASHFIRE_DURATION;
}

export function tickMutation(state: MutationState, dt: number): void {
  if (state.dashfireTime > 0) {
    state.dashfireTime = Math.max(0, state.dashfireTime - dt);
  }
}

export function getAttackIntervalMultiplier(state: MutationState): number {
  return state.id === 'dashfire' && state.dashfireTime > 0 ? DASHFIRE_ATTACK_SCALE : 1;
}

export function getDamageMultiplier(
  state: MutationState,
  hp: number,
  maxHp: number,
  overloaded = false
): number {
  let multiplier = 1;
  if (state.id === 'lastStand' && maxHp > 0 && hp / maxHp < LAST_STAND_THRESHOLD) {
    multiplier *= LAST_STAND_MULTIPLIER;
  }
  if (overloaded) multiplier *= OVERLOAD_MULTIPLIER;
  return multiplier;
}

export function getOverloadProgress(state: MutationState): number {
  if (state.id !== 'overload') return 0;
  if (state.overloadReady) return 1;
  return Math.min(1, state.overloadHits / OVERLOAD_HITS);
}
