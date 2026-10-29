import { describe, expect, it } from 'vitest';
import {
  LATE_UPGRADE_IDS,
  LATE_UPGRADES,
  MAX_LATE_LEVEL,
  MAX_LATE_UPGRADES,
  lateLevel,
  lateUpgradeEligible,
  lateUpgradeForRule,
  lateUpgradePool,
  pickResonance,
  type LateUpgradeId
} from './lateUpgrades';
import { ROOMS, buildChapterRewards, buildRoomRewards } from './rooms';
import type { PlayerBuild } from './rules';

const random = () => 0.37;
const maxed: PlayerBuild = {
  trajectory: { key: 'chain', level: 3, ascended: true },
  impact: { key: 'burn', level: 3, ascended: true }
};

describe('late upgrades', () => {
  it('ships six late upgrades with three levels each', () => {
    expect(LATE_UPGRADE_IDS).toHaveLength(6);
    expect(new Set(LATE_UPGRADE_IDS.map((id) => LATE_UPGRADES[id].name)).size).toBe(6);
    expect(MAX_LATE_LEVEL).toBe(3);
    expect(MAX_LATE_UPGRADES).toBe(9);
  });

  it('is only eligible with two maxed rules and two relics', () => {
    expect(lateUpgradeEligible(maxed, 2)).toBe(true);
    expect(lateUpgradeEligible(maxed, 1)).toBe(false);
    expect(
      lateUpgradeEligible({ trajectory: { level: 2 }, impact: { level: 3 } }, 2)
    ).toBe(false);
  });

  it('maps each rule to its matching late upgrade', () => {
    expect(lateUpgradeForRule('pierce')).toBe('pierce-momentum');
    expect(lateUpgradeForRule('chain')).toBe('rift-echo');
    expect(lateUpgradeForRule('spread')).toBe('spread-resonance');
    expect(lateUpgradeForRule('burn')).toBe('ember-spread');
    expect(lateUpgradeForRule('frost')).toBe('frost-ring');
    expect(lateUpgradeForRule('blast')).toBe('blast-resonance');
  });

  it('pools only upgrades that match the equipped rules', () => {
    expect(
      lateUpgradePool(maxed, [])
        .map((def) => def.id)
        .sort()
    ).toEqual(['ember-spread', 'rift-echo']);
    expect(
      lateUpgradePool(
        {
          trajectory: { key: 'spread', level: 3 },
          impact: { key: 'blast', level: 3 },
          secondary: { key: 'pierce', level: 3 }
        },
        []
      )
        .map((def) => def.id)
        .sort()
    ).toEqual(['blast-resonance', 'pierce-momentum', 'spread-resonance']);
  });

  it('stops pooling an upgrade once it reaches level 3', () => {
    expect(
      lateUpgradePool(maxed, ['ember-spread', 'ember-spread', 'ember-spread']).map(
        (def) => def.id
      )
    ).toEqual(['rift-echo']);
    expect(
      lateLevel(['ember-spread', 'ember-spread', 'rift-echo'], 'ember-spread')
    ).toBe(2);
  });

  it('cycles resonance levels before raising the same one again', () => {
    const build: PlayerBuild = {
      trajectory: { key: 'pierce', level: 2 },
      impact: { key: 'burn', level: 2 },
      secondary: { key: 'spread', level: 2 }
    };
    expect(pickResonance(build, [], () => 0)?.id).toBe('ember-spread');
    expect(pickResonance(build, ['ember-spread', 'ember-spread'], () => 0)?.id).toBe(
      'pierce-momentum'
    );
    const filled: LateUpgradeId[] = [
      'ember-spread',
      'ember-spread',
      'pierce-momentum',
      'pierce-momentum',
      'pierce-momentum',
      'spread-resonance',
      'spread-resonance',
      'spread-resonance'
    ];
    expect(pickResonance(build, filled, () => 0)?.id).toBe('ember-spread');
    expect(
      pickResonance(build, [...filled, 'ember-spread'], () => 0)
    ).toBeNull();
  });

  it('keeps late upgrades out of regular room rewards', () => {
    const rewards = buildRoomRewards(maxed, ROOMS[0], random);
    expect(rewards.some((reward) => reward.kind === 'late')).toBe(false);
    expect(rewards).toHaveLength(3);
  });

  it('offers rule-matched late upgrades in chapter rewards', () => {
    const rewards = buildChapterRewards(maxed, ['prism', 'frost-crown'], random, {
      lateEligible: true,
      lateUpgrades: []
    });
    expect(rewards.some((reward) => reward.kind === 'late')).toBe(true);
    expect(rewards.every((reward) => reward.kind !== 'relic')).toBe(true);
    expect(rewards).toHaveLength(3);
  });

  it('stops chapter late offers once the matching pool is maxed', () => {
    const rewards = buildChapterRewards(maxed, ['prism', 'frost-crown'], random, {
      lateEligible: true,
      lateUpgrades: [
        'ember-spread',
        'ember-spread',
        'ember-spread',
        'rift-echo',
        'rift-echo',
        'rift-echo'
      ]
    });
    expect(rewards.some((reward) => reward.kind === 'late')).toBe(false);
  });
});
