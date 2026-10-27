import { describe, expect, it } from 'vitest';
import { MUTATORS, clampMutator, getMutator } from './mutators';

describe('mutators', () => {
  it('ships a standard level and five mutations', () => {
    expect(MUTATORS).toHaveLength(6);
    expect(MUTATORS.map((entry) => entry.level)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(getMutator(0).name).toBe('标准');
    expect(getMutator(5).name).toContain('异变 V');
  });

  it('scales difficulty and shard rewards monotonically', () => {
    for (let level = 1; level < MUTATORS.length; level += 1) {
      const previous = MUTATORS[level - 1];
      const current = MUTATORS[level];
      expect(current.enemyHp).toBeGreaterThanOrEqual(previous.enemyHp);
      expect(current.shardBonus).toBeGreaterThan(previous.shardBonus);
    }
  });

  it('clamps out-of-range levels', () => {
    expect(clampMutator(-3)).toBe(0);
    expect(clampMutator(99)).toBe(5);
    expect(getMutator(99).level).toBe(5);
  });

  it('shortens hazard intervals at higher levels', () => {
    expect(getMutator(5).hazardInterval).toBeLessThan(getMutator(0).hazardInterval);
    expect(getMutator(5).eliteChance).toBeGreaterThan(0);
  });
});
