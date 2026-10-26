import { describe, expect, it } from 'vitest';
import { EVENTS, EVENT_IDS, buildRunPlan, planNodeCount, planStepCount, stepEncounters } from './run';
import { ROOMS } from './rooms';

const random = () => 0.37;

describe('event definitions', () => {
  it('ships four events with two options each', () => {
    expect(EVENT_IDS).toHaveLength(4);
    for (const id of EVENT_IDS) {
      const event = EVENTS[id];
      expect(event.options).toHaveLength(2);
      expect(event.options[0].tone).toBe('risk');
      expect(event.options[1].tone).toBe('safe');
      expect(event.subtitle.length).toBeGreaterThan(0);
    }
  });

  it('every event offers a no-risk branch', () => {
    for (const id of EVENT_IDS) {
      const safe = EVENTS[id].options[1];
      expect(['none', 'heal']).toContain(safe.effect.kind);
    }
  });

  it('risk branches carry real costs or modifiers', () => {
    expect(EVENTS['blood-altar'].options[0].effect).toEqual({ kind: 'loseHpUpgrade', hp: 20 });
    expect(EVENTS['unstable-lab'].options[0].effect).toEqual({
      kind: 'upgradeAndSpeedRisk',
      percent: 20
    });
    expect(EVENTS['forgotten-idol'].options[0].effect).toEqual({ kind: 'swapRuleHeal', heal: 15 });
    expect(EVENTS['cursed-chest'].options[0].effect).toEqual({ kind: 'curseElite' });
  });
});

describe('run plan', () => {
  it('builds a thirteen-step path through eighteen nodes', () => {
    const plan = buildRunPlan(random);
    expect(planStepCount(plan)).toBe(13);
    expect(planNodeCount(plan)).toBe(18);
  });

  it('has five branching steps with two options each', () => {
    const plan = buildRunPlan(random);
    const choices = plan.filter((step) => step.kind === 'choice');
    expect(choices).toHaveLength(5);
    for (const choice of choices) {
      expect(choice.options).toHaveLength(2);
    }
  });

  it('always contains exactly two event steps', () => {
    const plan = buildRunPlan(random);
    const events = plan
      .flatMap((step) => stepEncounters(step))
      .filter((encounter) => encounter.kind === 'event');
    expect(events).toHaveLength(2);
    expect(new Set(events.map((item) => item.kind === 'event' && item.event.id)).size).toBe(2);
  });

  it('never repeats a room within a single plan', () => {
    const plan = buildRunPlan(random);
    const ids = plan
      .flatMap((step) => stepEncounters(step))
      .filter((encounter) => encounter.kind === 'room')
      .map((encounter) => (encounter.kind === 'room' ? encounter.room.id : ''));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only references rooms that exist in the catalogue', () => {
    const known = new Set(ROOMS.map((room) => room.id));
    const plan = buildRunPlan(random);
    for (const encounter of plan.flatMap((step) => stepEncounters(step))) {
      if (encounter.kind === 'room') {
        expect(known.has(encounter.room.id)).toBe(true);
      }
    }
  });

  it('ends with the arbiter boss room', () => {
    const plan = buildRunPlan(random);
    const last = plan[plan.length - 1];
    expect(last.kind).toBe('encounter');
    if (last.kind === 'encounter' && last.encounter.kind === 'room') {
      expect(last.encounter.room.boss).toBe('arbiter');
    }
  });

  it('starts with a single fixed room', () => {
    const plan = buildRunPlan(random);
    expect(plan[0].kind).toBe('encounter');
  });

  it('is deterministic for a fixed random source', () => {
    const a = buildRunPlan(random);
    const b = buildRunPlan(random);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('varies event order with a different random source', () => {
    const plans = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      let seed = i / 12;
      const plan = buildRunPlan(() => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      });
      const events = plan
        .flatMap((step) => stepEncounters(step))
        .filter((encounter) => encounter.kind === 'event')
        .map((encounter) => (encounter.kind === 'event' ? encounter.event.id : ''));
      plans.add(events.join('|'));
    }
    expect(plans.size).toBeGreaterThan(1);
  });
});
