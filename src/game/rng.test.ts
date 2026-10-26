import { describe, expect, it } from 'vitest';
import { mulberry32, random, resetRandomSource, seedFromString, setRandomSource } from './rng';

describe('random source', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const first = Array.from({ length: 8 }, () => a());
    const second = Array.from({ length: 8 }, () => b());
    expect(first).toEqual(second);
  });

  it('differs across seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it('stays inside [0, 1)', () => {
    const next = mulberry32(7);
    for (let index = 0; index < 200; index += 1) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('hashes strings to stable seeds', () => {
    expect(seedFromString('alpha')).toBe(seedFromString('alpha'));
    expect(seedFromString('alpha')).not.toBe(seedFromString('beta'));
    expect(seedFromString('alpha')).toBeGreaterThanOrEqual(0);
  });

  it('routes the global source', () => {
    resetRandomSource();
    expect(random()).toBeGreaterThanOrEqual(0);
    setRandomSource(() => 0.25);
    expect(random()).toBe(0.25);
    resetRandomSource();
  });
});
