import { describe, expect, it } from 'vitest';
import {
  summonSourceAdds,
  updateSource,
  type SourceBossEnemy,
  type SourceHost,
  type SourceTimers
} from './source';

function enemy(overrides: Partial<SourceBossEnemy> = {}): SourceBossEnemy {
  return {
    root: { x: 400, y: 225 },
    hp: 100,
    maxHp: 100,
    radius: 64,
    contactCd: 1,
    dead: false,
    ...overrides
  };
}

function timers(): SourceTimers {
  return { attackCd: 1, summonCd: 1, sealCd: 1, chargeCd: 1 };
}

function host(overrides: Partial<SourceHost> = {}): SourceHost & {
  actions: string[];
  timersValue: SourceTimers;
} {
  const actions: string[] = [];
  const phase = { value: 1 };
  const timersValue = timers();
  const base: SourceHost = {
    arena: 800,
    playerRadius: 22,
    now: () => 0,
    playerX: () => 400,
    playerY: () => 600,
    isPlaying: () => true,
    setBossRef: () => undefined,
    phase: () => phase.value,
    setPhase: (value) => {
      phase.value = value;
    },
    timers: () => ({ ...timersValue }),
    setTimers: (value) => Object.assign(timersValue, value),
    onPhase: (value) => actions.push(`phase:${value}`),
    fireFan: (_enemy, bolts) => actions.push(`fan:${bolts}`),
    summon: () => actions.push('summon'),
    castSeal: () => actions.push('seal'),
    spawnVoidZone: (_x, _y, radius) => actions.push(`void:${radius}`),
    distanceToPlayer: () => 300,
    hurt: (_amount, _x, _y, _source) => actions.push('hurt'),
    shake: () => actions.push('shake'),
    bonusBolts: () => 2,
    randomInt: (min) => min,
    aliveAdds: () => 0,
    spawnAdd: (kind) => actions.push(`add:${kind}`),
    audio: (name) => actions.push(`audio:${name}`)
  };
  return Object.assign(base, overrides, { actions, timersValue });
}

describe('source boss module', () => {
  it('fires a boosted fan in phase 1 and shakes the camera', () => {
    const h = host();
    h.setTimers({ ...timers(), attackCd: 0 });
    updateSource(enemy(), 0.1, h);
    expect(h.actions).toContain('fan:9');
    expect(h.actions).toContain('shake');
    expect(h.timersValue.attackCd).toBeCloseTo(2.3, 5);
  });

  it('summons and casts the seal in phase 2 when timers are ready', () => {
    const h = host();
    h.setTimers({ ...timers(), attackCd: 1, summonCd: 0, sealCd: 0 });
    updateSource(enemy({ hp: 60 }), 0.1, h);
    expect(h.actions).toContain('phase:2');
    expect(h.actions).toContain('summon');
    expect(h.actions).toContain('seal');
  });

  it('covers the arena with three void zones in phase 3', () => {
    const h = host();
    h.setTimers({ ...timers(), attackCd: 1, summonCd: 1, sealCd: 1, chargeCd: 0 });
    updateSource(enemy({ hp: 20 }), 0.1, h);
    expect(h.actions).toContain('phase:3');
    expect(h.actions.filter((action) => action.startsWith('void:'))).toHaveLength(3);
    expect(h.timersValue.chargeCd).toBe(3.5);
  });

  it('summons sentry and phase adds, swapping in the seer at phase 3', () => {
    const early = host();
    summonSourceAdds(early);
    expect(early.actions.filter((action) => action.startsWith('add:'))).toEqual([
      'add:sentry',
      'add:phase'
    ]);
    const late = host({ phase: () => 3 });
    summonSourceAdds(late);
    expect(late.actions.filter((action) => action.startsWith('add:'))).toEqual([
      'add:seer',
      'add:phase'
    ]);
  });

  it('deals contact damage when the player stands inside the boss', () => {
    const h = host({ distanceToPlayer: () => 10 });
    h.setTimers({ ...timers(), attackCd: 1 });
    updateSource(enemy({ contactCd: 0 }), 0.1, h);
    expect(h.actions).toContain('hurt');
  });
});
