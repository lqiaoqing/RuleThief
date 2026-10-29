import { describe, expect, it } from 'vitest';
import { WaveDirector, buildWavePlan } from './waves';

describe('wave director', () => {
  it('splits the room quota into escalating groups', () => {
    const plan = buildWavePlan(22, 0);
    expect(plan.groups.reduce((sum, count) => sum + count, 0)).toBe(22);
    expect(plan.groups.length).toBe(4);
    expect(plan.groups.at(-1)).toBeGreaterThanOrEqual(plan.groups[0]);
    expect(plan.maxAlive).toBe(22);
  });

  it('can vary the number of waves for room pacing', () => {
    const burst = buildWavePlan(28, 0, false, 2);
    expect(burst.groups).toHaveLength(2);
    expect(burst.groups).toEqual([14, 14]);
    const stream = buildWavePlan(28, 0, false, 5);
    expect(stream.groups).toHaveLength(5);
    expect(stream.groups.reduce((sum, count) => sum + count, 0)).toBe(28);
  });

  it('keeps later-world crowds readable with more waves', () => {
    const plan = buildWavePlan(24, 1);
    expect(plan.maxAlive).toBeLessThanOrEqual(16);
    expect(plan.gap).toBeGreaterThanOrEqual(0.7);
    expect(plan.groups).toHaveLength(6);
    const late = buildWavePlan(34, 1);
    expect(late.groups).toHaveLength(7);
    expect(late.maxAlive).toBe(16);
  });

  it('spawns a whole wave without waiting for kills and keeps a capacity cap', () => {
    const director = new WaveDirector({
      groups: [4, 4, 4, 4],
      maxAlive: 10,
      gap: 0.5
    });
    let alive = 0;
    let spawned = 0;
    const spawn = () => {
      spawned += 1;
      alive += 1;
    };

    director.update(0, alive, spawn);
    expect(spawned).toBe(4);

    director.update(0.5, alive, spawn);
    expect(spawned).toBe(8);

    director.update(0.5, alive, spawn);
    expect(spawned).toBe(10);
    expect(alive).toBe(10);

    alive = 5;
    director.update(0.5, alive, spawn);
    expect(spawned).toBe(12);
    expect(director.snapshot().wave).toBe(3);
  });

  it('finishes after all groups are spawned even while enemies remain', () => {
    const director = new WaveDirector({
      groups: [3, 3],
      maxAlive: 6,
      gap: 0.4
    });
    let alive = 0;
    let spawned = 0;
    const spawn = () => {
      spawned += 1;
      alive += 1;
    };
    director.update(0, alive, spawn);
    director.update(0.4, alive, spawn);
    expect(spawned).toBe(6);
    expect(director.done).toBe(true);
    expect(director.snapshot().done).toBe(true);
    expect(director.update(10, alive, spawn)).toBe(0);
  });

  it('can be force-completed when a debug clear skips the remaining waves', () => {
    const director = new WaveDirector({ groups: [5, 5], maxAlive: 10, gap: 0.5 });
    director.complete();
    expect(director.done).toBe(true);
    expect(director.snapshot().remainingInWave).toBe(0);
  });
});
