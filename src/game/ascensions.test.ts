import { describe, expect, it } from 'vitest';
import { ASCENSION_IDS, ASCENSIONS, getAscensionForRule } from './ascensions';
import { MAX_RELICS, RELIC_IDS, RELICS } from './relics';
import { ascendRule, canAscend, createEmptyBuild, type PlayerBuild } from './rules';
import { buildChapterRewards } from './rooms';

const random = () => 0.37;

const maxed: PlayerBuild = {
  trajectory: { key: 'chain', level: 3 },
  impact: { key: 'burn', level: 3 }
};

describe('ascensions', () => {
  it('ships three ascensions mapped to chain, burn and frost', () => {
    expect(ASCENSION_IDS).toHaveLength(3);
    expect(getAscensionForRule('chain')?.id).toBe('thunder-domain');
    expect(getAscensionForRule('burn')?.id).toBe('flame-detonation');
    expect(getAscensionForRule('frost')?.id).toBe('absolute-zero');
    expect(getAscensionForRule('pierce')).toBeNull();
  });

  it('only ascends a level-three rule and marks it once', () => {
    expect(canAscend(maxed, 'chain')).toBe(true);
    expect(canAscend(maxed, 'pierce')).toBe(false);
    const ascended = ascendRule(maxed, 'chain');
    expect(ascended.trajectory?.ascended).toBe(true);
    expect(ascended.impact?.ascended).toBeUndefined();
    expect(canAscend(ascended, 'chain')).toBe(false);
    expect(maxed.trajectory?.ascended).toBeUndefined();
  });

  it('does not mutate or ascend a missing rule', () => {
    const empty = createEmptyBuild();
    expect(canAscend(empty, 'chain')).toBe(false);
    expect(ascendRule(empty, 'chain')).toEqual(empty);
  });

  it('keeps every ascension definition distinct', () => {
    const names = new Set(ASCENSION_IDS.map((id) => ASCENSIONS[id].name));
    expect(names.size).toBe(3);
  });
});

describe('relics', () => {
  it('ships four relics with unique names and icons', () => {
    expect(RELIC_IDS).toHaveLength(4);
    expect(new Set(RELIC_IDS.map((id) => RELICS[id].name)).size).toBe(4);
    expect(MAX_RELICS).toBe(2);
  });

  it('chapter rewards prefer ascension and relic over supports', () => {
    const rewards = buildChapterRewards(maxed, [], random);
    expect(rewards).toHaveLength(3);
    expect(rewards.some((reward) => reward.kind === 'ascension')).toBe(true);
    expect(rewards.some((reward) => reward.kind === 'relic')).toBe(true);
    expect(new Set(rewards.map((reward) => reward.kind)).size).toBe(rewards.length);
  });

  it('stops offering relics once two are equipped', () => {
    const rewards = buildChapterRewards(maxed, ['prism', 'frost-crown'], random);
    expect(rewards.some((reward) => reward.kind === 'relic')).toBe(false);
    expect(rewards.some((reward) => reward.kind === 'ascension')).toBe(true);
    expect(rewards).toHaveLength(3);
  });

  it('falls back to supports when nothing else is available', () => {
    const done: PlayerBuild = {
      trajectory: { key: 'chain', level: 3, ascended: true },
      impact: { key: 'burn', level: 3, ascended: true }
    };
    const rewards = buildChapterRewards(done, ['prism', 'frost-crown'], random);
    expect(rewards.every((reward) => reward.kind === 'support')).toBe(true);
    expect(rewards).toHaveLength(3);
  });

  it('respects meta unlock pools', () => {
    const rewards = buildChapterRewards(maxed, [], random, {
      unlockedRelics: ['thunder-emblem'],
      unlockedAscensions: ['thunder-domain']
    });
    expect(
      rewards.some((reward) => reward.kind === 'relic' && reward.relic.id === 'thunder-emblem')
    ).toBe(true);
    expect(
      rewards.some((reward) => reward.kind === 'relic' && reward.relic.id === 'frost-crown')
    ).toBe(false);
    expect(
      rewards.some(
        (reward) =>
          reward.kind === 'ascension' && reward.ascension.id === 'thunder-domain'
      )
    ).toBe(true);
    expect(
      rewards.some(
        (reward) =>
          reward.kind === 'ascension' && reward.ascension.id === 'flame-detonation'
      )
    ).toBe(false);
  });
});
