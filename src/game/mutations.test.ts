import { describe, expect, it } from 'vitest';
import {
  DASHFIRE_ATTACK_SCALE,
  OVERLOAD_HITS,
  OVERLOAD_MULTIPLIER,
  createMutationState,
  consumeOverload,
  equipMutation,
  getAttackIntervalMultiplier,
  getDamageMultiplier,
  getOverloadProgress,
  registerHit,
  tickMutation,
  triggerDashfire
} from './mutations';

describe('mutation definitions', () => {
  it('starts with no mutation equipped', () => {
    const state = createMutationState();
    expect(state.id).toBeNull();
    expect(getDamageMultiplier(state, 100, 100)).toBe(1);
    expect(getAttackIntervalMultiplier(state)).toBe(1);
  });

  it('equipping resets accumulated progress', () => {
    const state = createMutationState();
    registerHit(state, 5);
    const next = equipMutation(state, 'overload');
    expect(next.id).toBe('overload');
    expect(next.overloadHits).toBe(0);
    expect(next.overloadReady).toBe(false);
  });
});

describe('overload core', () => {
  it('charges after ten valid hits', () => {
    const state = equipMutation(createMutationState(), 'overload');
    for (let i = 0; i < OVERLOAD_HITS - 1; i += 1) {
      expect(registerHit(state)).toBe(false);
    }
    expect(getOverloadProgress(state)).toBeCloseTo(0.9);
    expect(registerHit(state)).toBe(true);
    expect(state.overloadReady).toBe(true);
    expect(getOverloadProgress(state)).toBe(1);
  });

  it('multi-hit attacks charge faster', () => {
    const state = equipMutation(createMutationState(), 'overload');
    expect(registerHit(state, 4)).toBe(false);
    expect(state.overloadHits).toBe(4);
    expect(registerHit(state, 6)).toBe(true);
  });

  it('does not charge while already ready', () => {
    const state = equipMutation(createMutationState(), 'overload');
    registerHit(state, OVERLOAD_HITS);
    expect(registerHit(state, 5)).toBe(false);
    expect(state.overloadHits).toBe(0);
  });

  it('consumes once and boosts exactly one volley', () => {
    const state = equipMutation(createMutationState(), 'overload');
    registerHit(state, OVERLOAD_HITS);
    expect(getDamageMultiplier(state, 100, 100, state.overloadReady)).toBe(OVERLOAD_MULTIPLIER);
    expect(consumeOverload(state)).toBe(true);
    expect(state.overloadReady).toBe(false);
    expect(consumeOverload(state)).toBe(false);
    expect(getDamageMultiplier(state, 100, 100, state.overloadReady)).toBe(1);
  });

  it('only the overload mutation charges', () => {
    const state = equipMutation(createMutationState(), 'dashfire');
    for (let i = 0; i < 20; i += 1) registerHit(state);
    expect(state.overloadHits).toBe(0);
    expect(state.overloadReady).toBe(false);
  });
});

describe('dashfire', () => {
  it('shortens the attack interval for two seconds after a dash', () => {
    const state = equipMutation(createMutationState(), 'dashfire');
    expect(getAttackIntervalMultiplier(state)).toBe(1);
    triggerDashfire(state);
    expect(getAttackIntervalMultiplier(state)).toBe(DASHFIRE_ATTACK_SCALE);
    tickMutation(state, 1.9);
    expect(getAttackIntervalMultiplier(state)).toBe(DASHFIRE_ATTACK_SCALE);
    tickMutation(state, 0.2);
    expect(getAttackIntervalMultiplier(state)).toBe(1);
  });

  it('does nothing without the mutation', () => {
    const state = createMutationState();
    triggerDashfire(state);
    expect(state.dashfireTime).toBe(0);
    expect(getAttackIntervalMultiplier(state)).toBe(1);
  });
});

describe('last stand', () => {
  it('boosts damage below 35% hp', () => {
    const state = equipMutation(createMutationState(), 'lastStand');
    expect(getDamageMultiplier(state, 36, 100)).toBe(1);
    expect(getDamageMultiplier(state, 34, 100)).toBeCloseTo(1.35);
    expect(getDamageMultiplier(state, 1, 100)).toBeCloseTo(1.35);
  });

  it('never divides by zero on an empty hp pool', () => {
    const state = equipMutation(createMutationState(), 'lastStand');
    expect(getDamageMultiplier(state, 0, 0)).toBe(1);
  });

  it('stacks with an overloaded volley', () => {
    const state = equipMutation(createMutationState(), 'lastStand');
    expect(getDamageMultiplier(state, 10, 100, true)).toBeCloseTo(1.35 * OVERLOAD_MULTIPLIER);
  });
});
