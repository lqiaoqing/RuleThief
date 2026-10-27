import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  META_KEY,
  UNLOCKS,
  applyRunToMeta,
  canUnlock,
  defaultMeta,
  loadMeta,
  saveMeta,
  shardsForRun,
  unlockMeta,
  type MetaRunInput
} from './meta';

class MemoryStorage {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const fullRun: MetaRunInput = {
  victory: true,
  stageOnly: false,
  chapterIndex: 1,
  chaptersTotal: 2,
  kills: 150,
  seconds: 1100,
  relics: ['雷鸣徽章'],
  ascensions: ['雷霆领域']
};

describe('meta progression', () => {
  it('starts with two relics and one ascension unlocked', () => {
    const meta = defaultMeta();
    expect(meta.shards).toBe(0);
    expect(meta.unlockedRelics).toEqual(['thunder-emblem', 'bloodflame-heart']);
    expect(meta.unlockedAscensions).toEqual(['thunder-domain']);
  });

  it('awards shards for depth, victory and kills', () => {
    expect(shardsForRun(fullRun)).toBe(15 * 2 + 20 + 15);
    expect(
      shardsForRun({
        ...fullRun,
        victory: false,
        stageOnly: true,
        chapterIndex: 0,
        kills: 40
      })
    ).toBe(15 + 4);
    expect(
      shardsForRun({
        ...fullRun,
        victory: false,
        stageOnly: false,
        chapterIndex: 0,
        kills: 0
      })
    ).toBe(0);
  });

  it('records runs, shards and achievements', () => {
    const first = applyRunToMeta(defaultMeta(), fullRun);
    expect(first.gained).toBe(65);
    expect(first.state.shards).toBe(65);
    expect(first.state.runs).toBe(1);
    expect(first.state.victories).toBe(1);
    expect(first.state.chaptersCleared).toBe(2);
    expect(first.state.maxMutator).toBe(1);
    expect(first.newMutator).toBe(1);
    expect(first.unlocked).toContain('first-run');
    expect(first.unlocked).toContain('chapter-one');
    expect(first.unlocked).toContain('two-chapters');
    expect(first.unlocked).toContain('ascended');
    expect(first.unlocked).toContain('speedrun');

    const second = applyRunToMeta(first.state, fullRun);
    expect(second.unlocked).toEqual([]);
    expect(second.state.shards).toBe(130);
  });

  it('scales shards with mutator level and records daily clears', () => {
    const base = shardsForRun(fullRun);
    expect(shardsForRun({ ...fullRun, mutatorLevel: 5 })).toBe(base * 2);
    const daily = applyRunToMeta(defaultMeta(), {
      ...fullRun,
      mutatorLevel: 5,
      daily: true,
      date: '2026-10-27'
    });
    expect(daily.state.dailyBest).toBe('2026-10-27');
    expect(daily.state.maxMutator).toBe(5);
    expect(daily.unlocked).toContain('mutator-iii');
    expect(daily.unlocked).toContain('mutator-v');
    expect(daily.unlocked).toContain('daily-clear');
  });

  it('unlocks paid content only when the shard cost is met', () => {
    const meta = defaultMeta();
    const frost = UNLOCKS.find((entry) => entry.id === 'frost-crown')!;
    expect(canUnlock(meta, frost)).toBe(false);
    const funded = { ...meta, shards: 100 };
    expect(canUnlock(funded, frost)).toBe(true);
    const unlocked = unlockMeta(funded, 'frost-crown');
    expect(unlocked.shards).toBe(20);
    expect(unlocked.unlockedRelics).toContain('frost-crown');
    expect(unlockMeta(unlocked, 'frost-crown')).toBe(unlocked);
  });

  it('round-trips through storage and repairs corrupt data', () => {
    const storage = new MemoryStorage() as unknown as Storage;
    const meta = { ...defaultMeta(), shards: 42, achievements: ['first-run'] };
    saveMeta(meta, storage);
    expect(loadMeta(storage)).toEqual(meta);

    storage.setItem(META_KEY, '{not json');
    expect(loadMeta(storage)).toEqual(defaultMeta());

    storage.setItem(
      META_KEY,
      JSON.stringify({
        shards: -5,
        unlockedRelics: ['prism', 'nope'],
        unlockedAscensions: ['absolute-zero', 'nope'],
        achievements: ['first-run', 'first-run']
      })
    );
    const repaired = loadMeta(storage);
    expect(repaired.shards).toBe(0);
    expect(repaired.unlockedRelics).toContain('prism');
    expect(repaired.unlockedRelics).toContain('thunder-emblem');
    expect(repaired.unlockedAscensions).toContain('absolute-zero');
    expect(repaired.achievements).toEqual(['first-run']);
  });

  it('defines every achievement with a name and description', () => {
    expect(UNLOCKS).toHaveLength(6);
    for (const def of Object.values(ACHIEVEMENTS)) {
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
    }
  });
});
