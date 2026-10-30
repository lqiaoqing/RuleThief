import { describe, expect, it } from 'vitest';
import {
  COMBO_NAMES,
  TriggerBudget,
  applyRuleOffer,
  ascendRule,
  buildLevelSum,
  canAscend,
  createEmptyBuild,
  duplicateRuleKeys,
  getBuildCombo,
  getComboName,
  getImpactProfile,
  getRuleOffers,
  getSpreadAngles,
  getTrajectoryProfile,
  mergeBurn,
  mergeFrost,
  preserveBuildCore,
  reforgeRule,
  reforgeSlot,
  removeDuplicateSecondary,
  selectChainTargets,
  swapRandomRuleBuild,
  upgradeRandomRuleBuild,
  type ChainCandidate,
  type PlayerBuild,
  type RuleOffer
} from './rules';

const random = () => 0.37;

function chainOffer(offers: RuleOffer[]): RuleOffer {
  const offer = offers.find((item) => item.key === 'chain');
  expect(offer).toBeDefined();
  return offer!;
}

describe('rule definitions and builds', () => {
  it('maps all nine trajectory × impact combos', () => {
    const names = new Set<string>();
    for (const trajectory of ['pierce', 'chain', 'spread'] as const) {
      for (const impact of ['burn', 'frost', 'blast'] as const) {
        names.add(COMBO_NAMES[trajectory][impact]);
      }
    }
    expect(names.size).toBe(9);
    expect(getComboName('chain', 'blast')).toBe('雷暴连锁');
    expect(getComboName('pierce', 'burn')).toBe('赤焰穿心');
    expect(getComboName('chain', null)).toBeNull();
  });

  it('reports partial and complete build combos', () => {
    expect(getBuildCombo(createEmptyBuild()).name).toBe('基础魔弹');
    expect(
      getBuildCombo({ trajectory: { key: 'spread', level: 1 }, impact: null }).name
    ).toBe('散射魔弹');
    const full = getBuildCombo({
      trajectory: { key: 'chain', level: 2 },
      impact: { key: 'blast', level: 1 }
    });
    expect(full.name).toBe('雷暴连锁');
    expect(full.complete).toBe(true);
  });

  it('scales trajectory behavior by level', () => {
    expect(getTrajectoryProfile('pierce', 1)).toMatchObject({ targets: 3 });
    expect(getTrajectoryProfile('pierce', 3)).toMatchObject({ targets: 5 });
    expect(getTrajectoryProfile('chain', 1)).toMatchObject({ jumps: 2 });
    expect(getTrajectoryProfile('chain', 3)).toMatchObject({ jumps: 4, range: 305 });
    expect(getTrajectoryProfile('spread', 1)).toMatchObject({ bolts: 3 });
    expect(getTrajectoryProfile('spread', 3)).toMatchObject({ bolts: 5 });
  });

  it('scales impact behavior by level', () => {
    expect(getImpactProfile('burn', 1)).toMatchObject({ duration: 3, dps: 4 });
    expect(getImpactProfile('burn', 3)).toMatchObject({ duration: 5, dps: 6 });
    expect(getImpactProfile('frost', 3)).toMatchObject({ slow: 0.5, duration: 2 });
    expect(getImpactProfile('blast', 2)).toMatchObject({ radius: 80, damage: 8 });
  });
});

describe('rule offers and build mutation', () => {
  it('fills an empty build with both slots', () => {
    const offers = getRuleOffers(createEmptyBuild(), random);
    expect(offers).toHaveLength(3);
    expect(new Set(offers.map((offer) => offer.key)).size).toBe(3);
    expect(offers.some((offer) => offer.slot === 'trajectory')).toBe(true);
    expect(offers.some((offer) => offer.slot === 'impact')).toBe(true);
    expect(offers.every((offer) => offer.action === 'equip')).toBe(true);
  });

  it('always includes an upgrade when a rule can level', () => {
    const build: PlayerBuild = {
      trajectory: { key: 'chain', level: 1 },
      impact: { key: 'blast', level: 1 }
    };
    const offers = getRuleOffers(build, random);
    expect(offers.some((offer) => offer.action === 'upgrade')).toBe(true);
  });

  it('upgrades a duplicate rule and keeps the other slot', () => {
    const build: PlayerBuild = {
      trajectory: { key: 'chain', level: 1 },
      impact: { key: 'blast', level: 2 }
    };
    const offers = getRuleOffers(build, random);
    const upgrade = offers.find(
      (offer) => offer.key === 'chain' && offer.action === 'upgrade'
    );
    expect(upgrade).toBeDefined();
    expect(upgrade?.nextLevel).toBe(2);
    const next = applyRuleOffer(build, upgrade!);
    expect(next.trajectory).toEqual({ key: 'chain', level: 2 });
    expect(next.impact).toEqual({ key: 'blast', level: 2 });
  });

  it('fills the secondary slot instead of replacing a maxed main slot', () => {
    const build: PlayerBuild = {
      trajectory: { key: 'chain', level: 3 },
      impact: { key: 'frost', level: 3 }
    };
    const offers = getRuleOffers(build, random);
    const secondary = offers.find((offer) => offer.slot === 'secondary');
    expect(secondary).toBeDefined();
    expect(secondary?.action).toBe('equip');
    const next = applyRuleOffer(build, secondary!);
    expect(next.secondary).toEqual({ key: secondary!.key, level: 1 });
    expect(next.trajectory).toEqual({ key: 'chain', level: 3 });
    expect(next.impact).toEqual({ key: 'frost', level: 3 });
  });

  it('only offers secondary equips when both main slots are maxed', () => {
    const build: PlayerBuild = {
      trajectory: { key: 'spread', level: 3 },
      impact: { key: 'burn', level: 3 }
    };
    const offers = getRuleOffers(build, random);
    expect(offers).toHaveLength(3);
    expect(offers.every((offer) => offer.action === 'equip')).toBe(true);
    expect(offers.every((offer) => offer.slot === 'secondary')).toBe(true);
    expect(offers.some((offer) => offer.key === 'spread')).toBe(false);
    expect(offers.some((offer) => offer.key === 'burn')).toBe(false);
  });

  it('stops offering new rules once all three slots are filled', () => {
    const build: PlayerBuild = {
      trajectory: { key: 'spread', level: 3 },
      impact: { key: 'burn', level: 3 },
      secondary: { key: 'frost', level: 3 }
    };
    expect(getRuleOffers(build, random)).toEqual([]);
  });

  it('computes future combo previews for offers', () => {
    const build: PlayerBuild = {
      trajectory: null,
      impact: { key: 'blast', level: 1 }
    };
    const offers = getRuleOffers(build, random);
    const trajectoryOffer = offers.find((offer) => offer.slot === 'trajectory');
    expect(trajectoryOffer?.comboName).toBe(
      COMBO_NAMES[trajectoryOffer!.key as 'pierce' | 'chain' | 'spread']['blast']
    );
  });

  it('reforges the lowest non-ascended slot and keeps the other two rules', () => {
    const build: PlayerBuild = {
      trajectory: { key: 'pierce', level: 3 },
      impact: { key: 'burn', level: 2 },
      secondary: { key: 'frost', level: 1 }
    };
    expect(reforgeSlot(build)).toBe('secondary');
    const next = reforgeRule(build, 'secondary', 'blast');
    expect(next.secondary).toEqual({ key: 'blast', level: 1 });
    expect(next.trajectory).toEqual(build.trajectory);
    expect(next.impact).toEqual(build.impact);
  });

  it('never reforges an ascended rule', () => {
    const build: PlayerBuild = {
      trajectory: { key: 'pierce', level: 3, ascended: true },
      impact: { key: 'burn', level: 3 },
      secondary: { key: 'frost', level: 3, ascended: true }
    };
    expect(reforgeSlot(build)).toBe('impact');
  });

  it('keeps trajectory and impact slot typing on reforge', () => {
    const build: PlayerBuild = {
      trajectory: { key: 'pierce', level: 2 },
      impact: { key: 'burn', level: 2 },
      secondary: { key: 'frost', level: 2 }
    };
    expect(reforgeRule(build, 'trajectory', 'burn').trajectory?.key).toBe('pierce');
    expect(reforgeRule(build, 'impact', 'chain').impact?.key).toBe('burn');
    expect(reforgeRule(build, 'secondary', 'chain').secondary).toEqual({
      key: 'chain',
      level: 1
    });
  });

  it('sums current rule levels', () => {
    expect(
      buildLevelSum({
        trajectory: { key: 'pierce', level: 2 },
        impact: { key: 'burn', level: 3 }
      })
    ).toBe(5);
    expect(
      buildLevelSum({
        trajectory: { key: 'pierce', level: 2 },
        impact: { key: 'burn', level: 3 },
        secondary: { key: 'frost', level: 3 }
      })
    ).toBe(8);
  });

  it('can ascend and clone a rule stored in the third slot', () => {
    const build: PlayerBuild = {
      trajectory: { key: 'chain', level: 3 },
      impact: { key: 'burn', level: 3 },
      secondary: { key: 'frost', level: 3 }
    };
    expect(canAscend(build, 'frost')).toBe(true);
    const next = ascendRule(build, 'frost');
    expect(next.secondary?.ascended).toBe(true);
    expect(next.trajectory).toEqual({ key: 'chain', level: 3 });
    expect(next.impact).toEqual({ key: 'burn', level: 3 });
  });
});

describe('trigger budget and statuses', () => {
  it('caps rule triggers at three per base attack', () => {
    const budget = new TriggerBudget(3);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(false);
    expect(budget.remaining).toBe(0);
  });

  it('refreshes burn without stacking infinite damage', () => {
    const first = mergeBurn(undefined, 3, 4);
    const second = mergeBurn(first, 4, 6);
    expect(second).toEqual({ time: 4, dps: 6 });
    expect(second.dps).toBe(6);
  });

  it('refreshes frost and keeps the strongest slow', () => {
    const first = mergeFrost(undefined, 0.3, 1.2);
    const second = mergeFrost(first, 0.4, 1.6);
    const third = mergeFrost(second, 0.3, 2.0);
    expect(third.slow).toBe(0.4);
    expect(third.time).toBe(2.0);
  });

  it('clamps frost slow to a finite ceiling', () => {
    const state = mergeFrost({ time: 1, slow: 0.75 }, 0.95, 3);
    expect(state.slow).toBeLessThanOrEqual(0.8);
  });
});

describe('chain and spread selection', () => {
  const base: ChainCandidate[] = [
    { id: 1, x: 0, y: 0, active: true },
    { id: 2, x: 100, y: 0, active: true },
    { id: 3, x: 200, y: 0, active: true },
    { id: 4, x: 300, y: 0, active: true },
    { id: 5, x: 50, y: 0, active: false }
  ];

  it('jumps to nearest unique targets within range', () => {
    const targets = selectChainTargets(
      { x: 100, y: 0 },
      base,
      2,
      250,
      [2]
    );
    expect(targets.map((target) => target.id)).toEqual([1, 3]);
  });

  it('never repeats a target and respects jump count', () => {
    const targets = selectChainTargets({ x: 0, y: 0 }, base, 2, 500);
    expect(targets.map((target) => target.id)).toEqual([1, 2]);
    expect(new Set(targets.map((target) => target.id)).size).toBe(2);
  });

  it('creates a symmetric fan of projectiles', () => {
    const angles = getSpreadAngles(0, 3, 30);
    expect(angles).toHaveLength(3);
    expect(angles[0]).toBeCloseTo(-Math.PI / 12);
    expect(angles[1]).toBeCloseTo(0);
    expect(angles[2]).toBeCloseTo(Math.PI / 12);
  });

  it('handles single-projectile spreads', () => {
    expect(getSpreadAngles(1.2, 1, 30)).toEqual([1.2]);
  });
});

describe('build integrity', () => {
  const core = { key: 'nova' as const, level: 3 as const };

  it('preserves the core through event upgrades and swaps', () => {
    const build: PlayerBuild = {
      trajectory: { key: 'pierce', level: 1 },
      impact: { key: 'burn', level: 1 },
      secondary: { key: 'chain', level: 1 },
      core
    };
    const upgraded = upgradeRandomRuleBuild(build, () => 0.2);
    expect(upgraded?.build.core).toEqual(core);
    const swapped = swapRandomRuleBuild(build, () => 0.2);
    expect(swapped?.build.core).toEqual(core);
  });

  it('does not swap a main rule into the third slot key', () => {
    const build: PlayerBuild = {
      trajectory: { key: 'pierce', level: 1 },
      impact: { key: 'burn', level: 1 },
      secondary: { key: 'burn', level: 1 },
      core
    };
    const swapped = swapRandomRuleBuild(build, () => 0.99);
    expect(swapped?.build.impact?.key).not.toBe('burn');
    expect(duplicateRuleKeys(swapped!.build)).toEqual([]);
  });

  it('preserves the core through reforge and ascension', () => {
    const build: PlayerBuild = {
      trajectory: { key: 'pierce', level: 3 },
      impact: { key: 'burn', level: 1 },
      core
    };
    expect(reforgeRule(build, 'impact', 'frost').core).toEqual(core);
    expect(ascendRule(build, 'pierce').core).toEqual(core);
  });

  it('merges an omitted core and removes accidental duplicate secondary rules', () => {
    const previous: PlayerBuild = {
      trajectory: { key: 'pierce', level: 2 },
      impact: { key: 'burn', level: 1 },
      core
    };
    const next: PlayerBuild = {
      trajectory: { key: 'chain', level: 1 },
      impact: { key: 'burn', level: 1 },
      secondary: { key: 'chain', level: 1 }
    };
    const merged = removeDuplicateSecondary(preserveBuildCore(next, previous));
    expect(merged.core).toEqual(core);
    expect(merged.secondary).toBeUndefined();
    expect(duplicateRuleKeys(merged)).toEqual([]);
  });
});
