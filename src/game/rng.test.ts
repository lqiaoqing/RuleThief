import { describe, expect, it, afterEach } from 'vitest';
import {
  combatBetween,
  combatInt,
  combatRandom,
  mulberry32,
  random,
  resetRandomStreams,
  seedFromString,
  setRandomSeed
} from './rng';

afterEach(() => {
  setRandomSeed(null);
});

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

  it('replays both streams after a reset', () => {
    setRandomSeed('alpha');
    const runA = Array.from({ length: 6 }, () => random());
    const combatA = Array.from({ length: 6 }, () => combatRandom());
    resetRandomStreams();
    const runB = Array.from({ length: 6 }, () => random());
    const combatB = Array.from({ length: 6 }, () => combatRandom());
    expect(runB).toEqual(runA);
    expect(combatB).toEqual(combatA);
  });

  it('keeps combat draws from shifting the route stream', () => {
    setRandomSeed('alpha');
    const clean = [random(), random()];
    resetRandomStreams();
    combatRandom();
    combatRandom();
    const afterCombat = [random(), random()];
    expect(afterCombat).toEqual(clean);
  });

  it('separates the run and combat streams', () => {
    setRandomSeed('alpha');
    const first = [random(), combatRandom()];
    resetRandomStreams();
    const second = [random(), combatRandom()];
    expect(first).toEqual(second);
    expect(first[0]).not.toBe(first[1]);
  });

  it('keeps combat helpers in range', () => {
    setRandomSeed('range');
    for (let index = 0; index < 100; index += 1) {
      const int = combatInt(3, 7);
      expect(Number.isInteger(int)).toBe(true);
      expect(int).toBeGreaterThanOrEqual(3);
      expect(int).toBeLessThanOrEqual(7);
      const value = combatBetween(-2, 2);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThan(2);
    }
  });

  it('falls back to an unseeded source', () => {
    setRandomSeed(null);
    const value = random();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });
});
