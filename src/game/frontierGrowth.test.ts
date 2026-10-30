import { describe, expect, it } from 'vitest';
import { createEmptyBuild } from './rules';
import {
  frontierDamageMultiplier,
  frontierDashCooldownMultiplier,
  frontierGrowthPool,
  pickFrontierGrowth
} from './frontierGrowth';

describe('frontier growth', () => {
  it('gates combo marks by the owned rules', () => {
    const burn = { ...createEmptyBuild(), impact: { key: 'burn' as const, level: 1 as const } };
    const frost = { ...createEmptyBuild(), impact: { key: 'frost' as const, level: 1 as const } };
    expect(frontierGrowthPool(burn, []).map((def) => def.id)).toContain('ember-bloom');
    expect(frontierGrowthPool(burn, []).map((def) => def.id)).not.toContain('frost-shatter');
    expect(frontierGrowthPool(frost, []).map((def) => def.id)).toContain('frost-shatter');
  });

  it('only offers core awaken after a Lv.3 core', () => {
    const build = createEmptyBuild();
    expect(frontierGrowthPool(build, []).map((def) => def.id)).not.toContain('core-awaken');
    expect(
      frontierGrowthPool(
        { ...build, core: { key: 'nova', level: 3 } },
        []
      ).map((def) => def.id)
    ).toContain('core-awaken');
  });

  it('keeps the repeatable waste echo available up to three stacks', () => {
    const build = createEmptyBuild();
    expect(frontierGrowthPool(build, ['waste-echo']).map((def) => def.id)).toContain('waste-echo');
    expect(
      frontierGrowthPool(build, ['waste-echo', 'waste-echo', 'waste-echo']).map(
        (def) => def.id
      )
    ).not.toContain('waste-echo');
    expect(frontierDamageMultiplier([])).toBe(1);
    expect(frontierDamageMultiplier(['waste-echo', 'waste-echo'])).toBeCloseTo(1.12);
    expect(frontierDashCooldownMultiplier(['phase-dash'])).toBeCloseTo(0.85);
  });

  it('picks a legal mark from the pool', () => {
    const picked = pickFrontierGrowth(createEmptyBuild(), [], () => 0.99);
    expect(picked).not.toBeNull();
    expect(frontierGrowthPool(createEmptyBuild(), []).map((def) => def.id)).toContain(picked!.id);
  });
});
