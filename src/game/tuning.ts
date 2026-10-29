import type { RoomDef } from './rooms';
import { stepEncounters, type RunStep } from './run';

/** Time budget assumptions for the pacing model (seconds). */
export const PACING = {
  roomOverhead: 8,
  rewardTime: 12,
  eventTime: 12,
  bossTime: 75,
  targetMinMinutes: 7.5,
  targetMaxMinutes: 12,
  /** measured (first human run: 8.5 min) / model (12.8 min) */
  measuredCalibration: 0.7
} as const;

export function estimateRoomSeconds(room: RoomDef): number {
  const spawnBound = room.quota * room.spawnInterval;
  const eliteBonus = room.leader ? 12 : 0;
  return spawnBound + PACING.roomOverhead + eliteBonus;
}

function estimateEncounterSeconds(encounter: ReturnType<typeof stepEncounters>[number]): number {
  if (encounter.kind !== 'room') return PACING.eventTime;
  if (encounter.room.boss) return PACING.bossTime;
  return estimateRoomSeconds(encounter.room) + PACING.rewardTime;
}

export function estimateRunSeconds(plan: readonly RunStep[]): number {
  let total = 0;
  for (const step of plan) {
    const encounters = stepEncounters(step);
    if (!encounters.length) continue;
    // branching steps only walk one path; use the average of the options
    total +=
      encounters.reduce((sum, encounter) => sum + estimateEncounterSeconds(encounter), 0) /
      encounters.length;
  }
  return total;
}

export function estimateRunMinutes(plan: readonly RunStep[]): number {
  return (estimateRunSeconds(plan) * PACING.measuredCalibration) / 60;
}
