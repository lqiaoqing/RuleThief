import { describe, expect, it } from 'vitest';
import {
  CORES,
  CORE_IDS,
  MAX_CORE_LEVEL,
  coreLevel,
  nextCoreLevel,
  pickCoreOffer
} from './cores';

describe('law cores', () => {
  it('ships eight unique cores with three levels', () => {
    expect(CORE_IDS).toHaveLength(9);
    expect(new Set(CORE_IDS.map((id) => CORES[id].name)).size).toBe(9);
    for (const id of CORE_IDS) {
      expect(CORES[id].descriptions).toHaveLength(MAX_CORE_LEVEL);
    }
    expect(MAX_CORE_LEVEL).toBe(3);
  });

  it('offers an unowned core or upgrades the equipped one', () => {
    const first = pickCoreOffer(null, () => 0);
    expect(first?.core.id).toBe('orbit');
    expect(first?.nextLevel).toBe(1);
    const upgrade = pickCoreOffer({ key: 'storm', level: 1 }, () => 0);
    expect(upgrade?.core.id).toBe('storm');
    expect(upgrade?.nextLevel).toBe(2);
    expect(pickCoreOffer({ key: 'storm', level: 3 }, () => 0)).toBeNull();
  });

  it('counts core levels safely', () => {
    expect(coreLevel(null)).toBe(0);
    expect(coreLevel({ key: 'leech', level: 2 })).toBe(2);
    expect(nextCoreLevel({ key: 'leech', level: 2 })).toBe(3);
    expect(nextCoreLevel({ key: 'leech', level: 3 })).toBe(3);
  });
});
