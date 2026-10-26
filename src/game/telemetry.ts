export interface RunRecord {
  at: number;
  victory: boolean;
  rooms: number;
  total: number;
  seconds: number;
  kills: number;
  combo: string;
  levelSum: number;
  mutation: string | null;
  topDamage?: string;
}

const STORAGE_KEY = 'rulethief.runs.v1';
const MAX_RECORDS = 20;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function safeStore(store?: Store | null): Store | null {
  if (store) return store;
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadRuns(store?: Store | null): RunRecord[] {
  const target = safeStore(store);
  if (!target) return [];
  try {
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RunRecord =>
        Boolean(item) &&
        typeof item.at === 'number' &&
        typeof item.victory === 'boolean' &&
        typeof item.seconds === 'number'
    );
  } catch {
    return [];
  }
}

export function saveRun(record: RunRecord, store?: Store | null): RunRecord[] {
  const target = safeStore(store);
  const next = [...loadRuns(target), record].slice(-MAX_RECORDS);
  if (!target) return next;
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return next;
  }
  return next;
}

export interface RunSummary {
  total: number;
  victories: number;
  bestSeconds: number | null;
  bestCombo: string | null;
}

export function summarize(runs: readonly RunRecord[]): RunSummary {
  if (!runs.length) {
    return { total: 0, victories: 0, bestSeconds: null, bestCombo: null };
  }
  const victories = runs.filter((run) => run.victory).length;
  const victoryTimes = runs.filter((run) => run.victory).map((run) => run.seconds);
  const bestSeconds = victoryTimes.length ? Math.min(...victoryTimes) : null;
  const bestCombo =
    runs
      .filter((run) => run.levelSum >= 4)
      .sort((a, b) => b.levelSum - a.levelSum)[0]?.combo ?? null;
  return { total: runs.length, victories, bestSeconds, bestCombo };
}

export function formatRecordLine(summary: RunSummary): string {
  if (!summary.total) return '本局已记录';
  const wins = summary.victories ? `通关 ${summary.victories}` : '尚未通关';
  const best =
    summary.bestSeconds === null
      ? ''
      : ` · 最快 ${String(Math.floor(summary.bestSeconds / 60)).padStart(2, '0')}:${String(
          summary.bestSeconds % 60
        ).padStart(2, '0')}`;
  const combo = summary.bestCombo ? ` · 最常构筑 ${summary.bestCombo}` : '';
  return `累计 ${summary.total} 局 · ${wins}${best}${combo}`;
}
