import { describe, expect, it } from 'vitest';
import {
  EVENTS,
  EVENT_IDS,
  CHAPTERS,
  buildRunPlan,
  buildChapterPlan,
  getChapter,
  eventOptionsFor,
  hasUpgradeableRule,
  planNodeCount,
  planStepCount,
  stepEncounters,
  totalStepsFrom
} from './run';
import { ROOMS } from './rooms';
import { buildRoomRewards } from './rooms';
import { createEmptyBuild, type PlayerBuild } from './rules';

const random = () => 0.37;

const maxedBuild: PlayerBuild = {
  trajectory: { key: 'spread', level: 3 },
  impact: { key: 'burn', level: 3 }
};
const midBuild: PlayerBuild = {
  trajectory: { key: 'pierce', level: 2 },
  impact: { key: 'frost', level: 1 }
};

describe('event definitions', () => {
  it('ships six events with two options each', () => {
    expect(EVENT_IDS).toHaveLength(12);
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
    expect(EVENTS['rule-fountain'].options[0].effect).toEqual({
      kind: 'loseHpUpgrade',
      hp: 10
    });
    expect(EVENTS['void-bargain'].options[0].effect).toEqual({
      kind: 'relicOrHeal',
      hp: 15,
      heal: 30
    });
  });

  it('detects whether any rule can still be upgraded', () => {
    expect(hasUpgradeableRule(createEmptyBuild())).toBe(false);
    expect(hasUpgradeableRule(maxedBuild)).toBe(false);
    expect(hasUpgradeableRule(midBuild)).toBe(true);
  });

  it('turns the blood altar into a heal when nothing can be upgraded', () => {
    const options = eventOptionsFor(EVENTS['blood-altar'], maxedBuild);
    expect(options[0].title).toContain('馈赠');
    expect(options[0].tone).toBe('safe');
    expect(options[0].effect).toEqual({ kind: 'heal', amount: 20 });
    expect(options[1]).toEqual(EVENTS['blood-altar'].options[1]);
    expect(EVENTS['blood-altar'].options[0].effect).toEqual({ kind: 'loseHpUpgrade', hp: 20 });
  });

  it('refuses the unstable experiment when nothing can be upgraded', () => {
    const options = eventOptionsFor(EVENTS['unstable-lab'], maxedBuild);
    expect(options[0].title).toContain('终止');
    expect(options[0].tone).toBe('safe');
    expect(options[0].effect).toEqual({ kind: 'none' });
  });

  it('turns the rule fountain into a heal when nothing can be upgraded', () => {
    const options = eventOptionsFor(EVENTS['rule-fountain'], maxedBuild);
    expect(options[0].title).toContain('馈赠');
    expect(options[0].tone).toBe('safe');
    expect(options[0].effect).toEqual({ kind: 'heal', amount: 15 });
  });

  it('keeps the original risky options while an upgrade exists', () => {
    expect(eventOptionsFor(EVENTS['blood-altar'], midBuild)).toEqual(
      EVENTS['blood-altar'].options
    );
    expect(eventOptionsFor(EVENTS['unstable-lab'], midBuild)).toEqual(
      EVENTS['unstable-lab'].options
    );
  });
});

describe('run plan', () => {
  it('exposes the first chapter as the judgement ruins', () => {
    expect(CHAPTERS.length).toBe(4);
    const first = CHAPTERS[0];
    expect(first.id).toBe('judgement');
    expect(first.name).toBe('审判废墟');
    expect(first.bossName.length).toBeGreaterThan(0);
  });

  it('builds the same plan through the chapter API', () => {
    expect(JSON.stringify(buildChapterPlan(0, random))).toBe(
      JSON.stringify(buildRunPlan(random))
    );
    expect(getChapter(0)).toBe(CHAPTERS[0]);
  });

  it('builds a workshop chapter that ends at the disorder core', () => {
    const plan = buildChapterPlan(1, random);
    expect(planStepCount(plan)).toBe(13);
    const last = plan[plan.length - 1];
    expect(last.kind).toBe('encounter');
    if (last.kind === 'encounter' && last.encounter.kind === 'room') {
      expect(last.encounter.room.boss).toBe('core');
    }
    const rooms = plan
      .flatMap((step) => stepEncounters(step))
      .filter((encounter) => encounter.kind === 'room')
      .map((encounter) => (encounter.kind === 'room' ? encounter.room.id : ''));
    expect(new Set(rooms).size).toBe(rooms.length);
    const events = plan
      .flatMap((step) => stepEncounters(step))
      .filter((encounter) => encounter.kind === 'event');
    expect(events).toHaveLength(2);
  });

  it('builds an abyss chapter that ends at the source of rules', () => {
    const plan = buildChapterPlan(2, random);
    expect(planStepCount(plan)).toBe(13);
    const last = plan[plan.length - 1];
    expect(last.kind).toBe('encounter');
    if (last.kind === 'encounter' && last.encounter.kind === 'room') {
      expect(last.encounter.room.boss).toBe('source');
    }
    const rooms = plan
      .flatMap((step) => stepEncounters(step))
      .filter((encounter) => encounter.kind === 'room')
      .map((encounter) => (encounter.kind === 'room' ? encounter.room.id : ''));
    expect(new Set(rooms).size).toBe(rooms.length);
    expect(rooms).toContain('seer-arena');
    const events = plan
      .flatMap((step) => stepEncounters(step))
      .filter((encounter) => encounter.kind === 'event');
    expect(events).toHaveLength(2);
  });


  it('counts the full staircase from each start world', () => {
    expect(totalStepsFrom(0)).toBe(58);
    expect(totalStepsFrom(1)).toBe(48);
    expect(totalStepsFrom(2)).toBe(35);
    expect(totalStepsFrom(3)).toBe(22);
  });

  it('builds a boundless waste chapter of 22 steps on large maps', () => {
    const plan = buildChapterPlan(3, random);
    expect(planStepCount(plan)).toBe(22);
    const rooms = plan
      .flatMap((step) => stepEncounters(step))
      .filter((encounter) => encounter.kind === 'room')
      .map((encounter) => (encounter.kind === 'room' ? encounter.room : null))
      .filter((room): room is NonNullable<typeof room> => Boolean(room));
    expect(rooms.every((room) => room.arenaSize === 2400)).toBe(true);
    const last = plan[plan.length - 1];
    expect(last.kind).toBe('encounter');
    if (last.kind === 'encounter' && last.encounter.kind === 'room') {
      expect(last.encounter.room.boss).toBe('worldEater');
      expect(last.encounter.room.arenaSize).toBe(2400);
    }
    const events = plan
      .flatMap((step) => stepEncounters(step))
      .filter((encounter) => encounter.kind === 'event');
    expect(events).toHaveLength(3);
  });

  it('returns an empty plan for an unknown chapter', () => {
    expect(buildChapterPlan(CHAPTERS.length, random)).toEqual([]);
    expect(getChapter(CHAPTERS.length)).toBeUndefined();
  });

  it('builds a ten-step path through thirteen nodes', () => {
    const plan = buildRunPlan(random);
    expect(planStepCount(plan)).toBe(10);
    expect(planNodeCount(plan)).toBe(13);
  });

  it('has three branching steps with two options each', () => {
    const plan = buildRunPlan(random);
    const choices = plan.filter((step) => step.kind === 'choice');
    expect(choices).toHaveLength(3);
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

  it('guarantees a trajectory rule then an impact rule in the first two rooms', () => {
    const plan = buildRunPlan(random);
    const first = plan[0];
    const firstRoom =
      first.kind === 'encounter' && first.encounter.kind === 'room' ? first.encounter.room : null;
    expect(firstRoom).not.toBeNull();
    const firstRewards = buildRoomRewards(createEmptyBuild(), firstRoom!, random);
    expect(
      firstRewards.some(
        (reward) =>
          reward.kind === 'rule' &&
          ['pierce', 'chain', 'spread'].includes(reward.offer.key)
      )
    ).toBe(true);

    const trajectoryOnly = {
      trajectory: { key: 'pierce' as const, level: 1 as const },
      impact: null
    };
    const second = plan[1];
    const options = second.kind === 'choice' ? second.options : [second.encounter];
    for (const option of options) {
      if (option.kind !== 'room') continue;
      const rewards = buildRoomRewards(trajectoryOnly, option.room, random);
      expect(
        rewards.some(
          (reward) =>
            reward.kind === 'rule' &&
            ['burn', 'frost', 'blast'].includes(reward.offer.key)
        )
      ).toBe(true);
    }
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
