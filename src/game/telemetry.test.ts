import { describe, expect, it } from 'vitest';
import { formatRecordLine, loadRuns, saveRun, summarize, type RunRecord } from './telemetry';

function store() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    dump: () => map
  };
}

const record = (overrides: Partial<RunRecord> = {}): RunRecord => ({
  at: 1_700_000_000_000,
  victory: false,
  rooms: 4,
  total: 9,
  seconds: 180,
  kills: 40,
  combo: '雷暴连锁',
  levelSum: 4,
  mutation: 'overload',
  ...overrides
});

describe('run telemetry', () => {
  it('starts empty', () => {
    expect(loadRuns(store())).toEqual([]);
    expect(summarize([])).toEqual({
      total: 0,
      victories: 0,
      bestSeconds: null,
      bestCombo: null,
      bestChapters: 0,
      bestMutator: 0
    });
    expect(formatRecordLine(summarize([]))).toBe('本局已记录');
  });

  it('persists and reloads records', () => {
    const storage = store();
    const first = saveRun(record(), storage);
    expect(first).toHaveLength(1);
    const second = saveRun(record({ victory: true, seconds: 420 }), storage);
    expect(second).toHaveLength(2);
    expect(loadRuns(storage)).toHaveLength(2);
  });

  it('keeps only the latest twenty runs', () => {
    const storage = store();
    for (let i = 0; i < 25; i += 1) saveRun(record({ at: i, seconds: i }), storage);
    const runs = loadRuns(storage);
    expect(runs).toHaveLength(20);
    expect(runs[0].at).toBe(5);
    expect(runs[runs.length - 1].at).toBe(24);
  });

  it('summarizes victories and best clear time', () => {
    const runs = [
      record({ victory: true, seconds: 640 }),
      record({ victory: true, seconds: 520 }),
      record({ victory: false, seconds: 300 })
    ];
    const summary = summarize(runs);
    expect(summary.total).toBe(3);
    expect(summary.victories).toBe(2);
    expect(summary.bestSeconds).toBe(520);
    expect(summary.bestCombo).toBe('雷暴连锁');
    expect(summary.bestChapters).toBe(0);
    expect(summary.bestMutator).toBe(0);
  });

  it('tracks the deepest chapter and highest mutator', () => {
    const runs = [
      record({ chaptersCleared: 1, mutatorLevel: 2 }),
      record({ chaptersCleared: 3, mutatorLevel: 5 }),
      record({ chaptersCleared: 2, mutatorLevel: 1 })
    ];
    const summary = summarize(runs);
    expect(summary.bestChapters).toBe(3);
    expect(summary.bestMutator).toBe(5);
    const line = formatRecordLine(summary);
    expect(line).toContain('最深 W3');
    expect(line).toContain('异变 5');
  });

  it('uses the absolute reached world for the deepest record', () => {
    const summary = summarize([
      record({ chaptersCleared: 1, reachedChapter: 3, startChapter: 1 }),
      record({ chaptersCleared: 1, reachedChapter: 2, startChapter: 1 })
    ]);
    expect(summary.bestChapters).toBe(3);
    expect(formatRecordLine(summary)).toContain('最深 W3');
  });

  it('persists the extended run fields for playtest analysis', () => {
    const storage = store();
    saveRun(
      record({
        chaptersCleared: 2,
        startChapter: 1,
        stageOnly: true,
        relics: ['雷鸣徽章'],
        ascensions: ['雷霆领域'],
        lateUpgrades: ['余烬蔓延'],
        mutatorLevel: 3,
        mutatorName: '异变 III · 审判升级',
        daily: true,
        build: {
          trajectory: { key: 'chain', level: 3, ascended: true },
          impact: { key: 'burn', level: 3 }
        }
      }),
      storage
    );
    const [saved] = loadRuns(storage);
    expect(saved.chaptersCleared).toBe(2);
    expect(saved.startChapter).toBe(1);
    expect(saved.relics).toEqual(['雷鸣徽章']);
    expect(saved.ascensions).toEqual(['雷霆领域']);
    expect(saved.lateUpgrades).toEqual(['余烬蔓延']);
    expect(saved.mutatorLevel).toBe(3);
    expect(saved.daily).toBe(true);
    expect(saved.build?.trajectory?.ascended).toBe(true);
  });

  it('picks the most frequent combo, not the highest level', () => {
    const runs = [
      ...Array.from({ length: 8 }, () => record({ combo: '霜雷网络', levelSum: 4 })),
      record({ combo: '爆裂火花', levelSum: 6 })
    ];
    expect(summarize(runs).bestCombo).toBe('霜雷网络');
  });

  it('breaks combo ties by level and then by recency', () => {
    const byLevel = [
      record({ combo: '霜雷网络', levelSum: 4 }),
      record({ combo: '爆裂火花', levelSum: 6 })
    ];
    expect(summarize(byLevel).bestCombo).toBe('爆裂火花');
    const byRecency = [
      record({ at: 1, combo: '霜雷网络', levelSum: 6 }),
      record({ at: 2, combo: '爆裂火花', levelSum: 6 })
    ];
    expect(summarize(byRecency).bestCombo).toBe('爆裂火花');
  });

  it('ignores corrupted payloads', () => {
    const storage = store();
    storage.setItem('rulethief.runs.v1', '{not json');
    expect(loadRuns(storage)).toEqual([]);
    storage.setItem('ruletheif.runs.v1', '[]');
    storage.setItem('rulethief.runs.v1', JSON.stringify([{ at: 'x' }, null, record()]));
    expect(loadRuns(storage)).toHaveLength(1);
  });

  it('formats a readable record line', () => {
    const line = formatRecordLine({
      total: 7,
      victories: 2,
      bestSeconds: 512,
      bestCombo: '霜雷网络',
      bestChapters: 2,
      bestMutator: 3
    });
    expect(line).toContain('累计 7 局');
    expect(line).toContain('通关 2');
    expect(line).toContain('最快 08:32');
    expect(line).toContain('最深 W2');
    expect(line).toContain('异变 3');
    expect(line).toContain('霜雷网络');
  });

  it('never throws without storage', () => {
    expect(loadRuns(undefined)).toEqual([]);
    expect(saveRun(record()).length).toBeGreaterThanOrEqual(0);
  });
});
