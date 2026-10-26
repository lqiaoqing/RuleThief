import { describe, expect, it } from 'vitest';
import { ROOMS } from './rooms';
import { buildRunPlan } from './run';
import { PACING, estimateRoomSeconds, estimateRunMinutes, estimateRunSeconds } from './tuning';

const random = () => 0.37;

describe('pacing model', () => {
  it('estimates every room from spawn interval and quota', () => {
    for (const room of ROOMS) {
      const expected = room.quota * room.spawnInterval + PACING.roomOverhead + (room.leader ? 12 : 0);
      expect(estimateRoomSeconds(room)).toBeCloseTo(expected);
    }
  });

  it('keeps a full run inside the tuned band', () => {
    const minutes = estimateRunMinutes(buildRunPlan(random));
    expect(minutes).toBeGreaterThanOrEqual(PACING.targetMinMinutes);
    expect(minutes).toBeLessThanOrEqual(PACING.targetMaxMinutes);
  });

  it('counts events and the boss in the budget', () => {
    const plan = buildRunPlan(random);
    const seconds = estimateRunSeconds(plan);
    expect(seconds).toBeGreaterThan(PACING.bossTime);
    expect(seconds).toBeGreaterThan(plan.length * PACING.eventTime);
  });

  it('normal rooms escalate in kill quota', () => {
    const normal = ROOMS.filter((room) => !room.elite && !room.boss);
    expect(normal[0].quota).toBeLessThan(normal[normal.length - 1].quota);
    expect(normal.every((room) => room.quota >= 10)).toBe(true);
  });

  it('elite rooms trade quota for a leader', () => {
    for (const room of ROOMS.filter((item) => item.elite)) {
      expect(room.leader).toBeDefined();
      expect(room.quota).toBeLessThanOrEqual(13);
      expect(room.rewardCount).toBe(4);
    }
  });

  it('each plan visits six combat rooms plus the boss', () => {
    const plan = buildRunPlan(random);
    const rooms = plan
      .flatMap((step) => (step.kind === 'choice' ? step.options : [step.encounter]))
      .filter((encounter) => encounter.kind === 'room');
    expect(rooms.length).toBeGreaterThanOrEqual(6);
    const boss = rooms.filter(
      (encounter) => encounter.kind === 'room' && Boolean(encounter.room.boss)
    );
    expect(boss).toHaveLength(1);
  });
});
