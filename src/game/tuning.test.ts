import { describe, expect, it } from 'vitest';
import { ROOMS } from './rooms';
import { buildChapterPlan, buildRunPlan } from './run';
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

  it('keeps the workshop chapter near the nine-to-twelve minute target', () => {
    const minutes = estimateRunMinutes(buildChapterPlan(1, random));
    expect(minutes).toBeGreaterThanOrEqual(8);
    expect(minutes).toBeLessThanOrEqual(12);
  });

  it('keeps the abyss chapter near the nine-to-twelve minute target', () => {
    const minutes = estimateRunMinutes(buildChapterPlan(2, random));
    expect(minutes).toBeGreaterThanOrEqual(8);
    expect(minutes).toBeLessThanOrEqual(12);
  });

  it('keeps the three-chapter route near twenty-five-to-thirty-five minutes', () => {
    const total =
      estimateRunMinutes(buildRunPlan(random)) +
      estimateRunMinutes(buildChapterPlan(1, random)) +
      estimateRunMinutes(buildChapterPlan(2, random));
    expect(total).toBeGreaterThanOrEqual(25);
    expect(total).toBeLessThanOrEqual(35);
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
    const standardQuota = Math.max(
      ...ROOMS.filter((item) => !item.elite && !item.boss).map((item) => item.quota)
    );
    for (const room of ROOMS.filter((item) => item.elite)) {
      expect(room.leader).toBeDefined();
      expect(room.quota).toBeLessThan(standardQuota);
      expect(room.rewardCount).toBe(4);
    }
  });

  it('each plan visits at least ten combat rooms plus the boss', () => {
    const plan = buildRunPlan(random);
    const rooms = plan
      .flatMap((step) => (step.kind === 'choice' ? step.options : [step.encounter]))
      .filter((encounter) => encounter.kind === 'room');
    expect(rooms.length).toBeGreaterThanOrEqual(10);
    const boss = rooms.filter(
      (encounter) => encounter.kind === 'room' && Boolean(encounter.room.boss)
    );
    expect(boss).toHaveLength(1);
  });
});
