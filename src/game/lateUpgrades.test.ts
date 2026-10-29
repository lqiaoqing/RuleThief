import { describe, expect, it } from 'vitest';
import {
  LATE_UPGRADE_IDS,
  LATE_UPGRADES,
  MAX_LATE_UPGRADES,
  lateUpgradeEligible,
  pickResonance
} from './lateUpgrades';
import { ROOMS, buildChapterRewards, buildRoomRewards } from './rooms';
import type { PlayerBuild } from './rules';

const random = () => 0.37;
const maxed: PlayerBuild = {
  trajectory: { key: 'chain', level: 3, ascended: true },
  impact: { key: 'burn', level: 3, ascended: true }
};

describe('late upgrades', () => {
  it('ships four unique late upgrades', () => {
    expect(LATE_UPGRADE_IDS).toHaveLength(4);
    expect(new Set(LATE_UPGRADE_IDS.map((id) => LATE_UPGRADES[id].name)).size).toBe(4);
    expect(MAX_LATE_UPGRADES).toBe(2);
  });

  it('is only eligible with two maxed rules and two relics', () => {
    expect(lateUpgradeEligible(maxed, 2)).toBe(true);
    expect(lateUpgradeEligible(maxed, 1)).toBe(false);
    expect(
      lateUpgradeEligible({ trajectory: { level: 2 }, impact: { level: 3 } }, 2)
    ).toBe(false);
  });

  it('offers a late upgrade in rooms once eligible', () => {
    const rewards = buildRoomRewards(maxed, ROOMS[0], random, {
      lateEligible: true,
      lateUpgrades: []
    });
    expect(rewards.some((reward) => reward.kind === 'late')).toBe(true);
    expect(rewards).toHaveLength(3);
  });

  it('stops offering late upgrades at the cap', () => {
    const rewards = buildRoomRewards(maxed, ROOMS[0], random, {
      lateEligible: true,
      lateUpgrades: ['ember-spread', 'rift-echo']
    });
    expect(rewards.some((reward) => reward.kind === 'late')).toBe(false);
  });

  it('picks a mid-run resonance that matches the equipped rules', () => {
    const build: PlayerBuild = {
      trajectory: { key: 'pierce', level: 2 },
      impact: { key: 'burn', level: 2 }
    };
    const resonance = pickResonance(build, [], random);
    expect(['ember-spread', 'pierce-momentum']).toContain(resonance?.id);
    expect(pickResonance({ trajectory: { key: 'spread', level: 2 }, impact: { key: 'blast', level: 2 } }, [], random)).toBeNull();
    expect(pickResonance(build, ['ember-spread', 'pierce-momentum'], random)).toBeNull();
  });

  it('offers late upgrades in chapter rewards after ascensions and relics are full', () => {
    const rewards = buildChapterRewards(maxed, ['prism', 'frost-crown'], random, {
      lateEligible: true,
      lateUpgrades: []
    });
    expect(rewards.some((reward) => reward.kind === 'late')).toBe(true);
    expect(rewards.every((reward) => reward.kind !== 'relic')).toBe(true);
    expect(rewards).toHaveLength(3);
  });
});
