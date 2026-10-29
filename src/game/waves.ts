export interface WavePlan {
  groups: number[];
  maxAlive: number;
  gap: number;
}

export interface WaveSnapshot {
  wave: number;
  waves: number;
  spawned: number;
  total: number;
  remainingInWave: number;
  done: boolean;
}

export class WaveDirector {
  private readonly plan: WavePlan;
  private waveIndex = 0;
  private currentWave = 0;
  private remainingInWave = 0;
  private spawned = 0;
  private timer = 0;
  private finished = false;

  constructor(plan: WavePlan) {
    this.plan = plan;
    this.finished = plan.groups.length === 0;
  }

  get total(): number {
    return this.plan.groups.reduce((sum, count) => sum + count, 0);
  }

  get done(): boolean {
    return this.finished;
  }

  snapshot(): WaveSnapshot {
    return {
      wave: this.currentWave,
      waves: this.plan.groups.length,
      spawned: this.spawned,
      total: this.total,
      remainingInWave: this.remainingInWave,
      done: this.finished
    };
  }

  update(dt: number, activeCount: number, spawn: () => void): number {
    if (this.finished) return 0;
    if (this.remainingInWave <= 0) {
      if (this.waveIndex >= this.plan.groups.length) {
        this.finished = true;
        return 0;
      }
      if (this.currentWave > 0) {
        this.timer -= dt;
        if (this.timer > 0) return 0;
      }
      this.remainingInWave = this.plan.groups[this.waveIndex];
      this.waveIndex += 1;
      this.currentWave = this.waveIndex;
    }

    const capacity = Math.max(0, this.plan.maxAlive - activeCount);
    if (capacity === 0) return 0;
    const batch = Math.min(this.remainingInWave, capacity, 4);
    for (let index = 0; index < batch; index += 1) spawn();
    this.remainingInWave -= batch;
    this.spawned += batch;
    if (this.remainingInWave === 0 && this.waveIndex >= this.plan.groups.length) {
      this.finished = true;
    }
    if (this.remainingInWave === 0) {
      this.timer = this.plan.gap;
    }
    return batch;
  }

  complete(): void {
    this.finished = true;
    this.remainingInWave = 0;
  }
}

export function buildWavePlan(
  total: number,
  chapterIndex = 0,
  elite = false,
  waveCountOverride?: number
): WavePlan {
  const count = Math.max(0, Math.floor(total));
  if (count === 0) return { groups: [], maxAlive: 0, gap: 0 };
  const defaultWaves = count <= 12 ? 3 : count <= 20 ? 4 : chapterIndex >= 1 ? 5 : 4;
  const waveCount = Math.max(
    2,
    Math.min(6, Math.floor(waveCountOverride ?? defaultWaves))
  );
  const base = Math.floor(count / waveCount);
  const remainder = count % waveCount;
  const groups: number[] = [];
  for (let index = 0; index < waveCount; index += 1) {
    groups.push(base + (index >= waveCount - remainder ? 1 : 0));
  }
  const gap =
    chapterIndex === 0 ? Math.max(0.4, 0.5 - (elite ? 0.05 : 0)) : 0.8;
  const maxAlive =
    chapterIndex === 0
      ? Math.min(30, Math.max(10, count))
      : Math.min(14, Math.max(8, Math.ceil(count * 0.7)));
  return { groups, maxAlive, gap };
}
