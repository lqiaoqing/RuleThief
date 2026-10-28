import { describe, expect, it } from 'vitest';
import {
  summonCoreAdds,
  updateCore,
  type CoreBossEnemy,
  type CoreHost,
  type CoreTimers
} from './core';

function enemy(overrides: Partial<CoreBossEnemy> = {}): CoreBossEnemy {
  return {
    root: { x: 400, y: 235 },
    hp: 100,
    maxHp: 100,
    radius: 60,
    contactCd: 1,
    dead: false,
    ...overrides
  };
}

function host(overrides: Partial<CoreHost> = {}): CoreHost & {
  actions: string[];
  timersValue: CoreTimers;
} {
  const actions: string[] = [];
  const state = {
    phaseValue: 1,
    timersValue: {
      attackCd: 1,
      summonCd: 1,
      sealCd: 1,
      laserCd: 1,
      laserTime: 0,
      laserAngle: 0
    }
  };
  const base: CoreHost = {
    arena: 800,
    playerRadius: 22,
    now: () => 0,
    playerX: () => 400,
    playerY: () => 500,
    isPlaying: () => true,
    setBossRef: () => undefined,
    phase: () => state.phaseValue,
    setPhase: (phase) => {
      state.phaseValue = phase;
    },
    timers: () => ({ ...state.timersValue }),
    setTimers: (value) => Object.assign(state.timersValue, value),
    onPhase: (phase) => actions.push(`phase:${phase}`),
    fireFan: (_enemy, bolts) => actions.push(`fan:${bolts}`),
    summon: () => actions.push('summon'),
    spawnShockZone: (_x, _y, radius) => actions.push(`zone:${radius}`),
    distanceToPlayer: () => 300,
    hurt: (_amount, _x, _y, source) => actions.push(`hurt:${source}`),
    audio: (name) => actions.push(`audio:${name}`),
    bonusBolts: () => 2,
    random: () => 0,
    randomInt: (min) => min,
    startLaser: () => actions.push('laser:start'),
    drawLaser: () => undefined,
    stopLaser: () => actions.push('laser:stop'),
    aliveAdds: () => 0,
    spawnAdd: (kind) => actions.push(`add:${kind}`)
  };
  return Object.assign(base, overrides, { actions, timersValue: state.timersValue });
}

describe('core boss module', () => {
  it('fires a boosted fan in phase 1 and resets its cadence', () => {
    const h = host();
    h.setTimers({ ...h0(), attackCd: 0 });
    updateCore(enemy(), 0.1, h);
    expect(h.actions).toContain('fan:7');
    expect(h.timersValue.attackCd).toBeCloseTo(2.5, 5);
  });

  it('enters phase 2 and adds a second warning zone', () => {
    const h = host();
    h.setTimers({ ...h0(), attackCd: 1, sealCd: 0 });
    updateCore(enemy({ hp: 60 }), 0.1, h);
    expect(h.actions).toContain('phase:2');
    expect(h.actions.filter((action) => action.startsWith('zone:'))).toHaveLength(3);
  });

  it('starts the sweeping laser and damages a player on the beam', () => {
    const h = host({ playerX: () => 520, playerY: () => 225 });
    h.setTimers({ ...h0(), attackCd: 1, laserCd: 0 });
    updateCore(enemy(), 0.1, h);
    expect(h.actions).toContain('laser:start');
    expect(h.actions).toContain('hurt:hazard');
  });

  it('summons one add in phase 1 and two in phase 3', () => {
    const early = host();
    summonCoreAdds(early);
    expect(early.actions.filter((action) => action.startsWith('add:'))).toEqual([
      'add:sentry'
    ]);
    const late = host({ phase: () => 3 });
    summonCoreAdds(late);
    expect(late.actions.filter((action) => action.startsWith('add:'))).toEqual([
      'add:sentry',
      'add:phase'
    ]);
  });

  it('stops the laser when its duration expires', () => {
    const h = host({ playerX: () => 400, playerY: () => 600 });
    h.setTimers({ ...h0(), attackCd: 1, laserCd: 999, laserTime: 0.05 });
    updateCore(enemy(), 0.1, h);
    expect(h.actions).toContain('laser:stop');
    expect(h.timersValue.laserCd).toBe(5);
  });
});

function h0(): CoreTimers {
  return {
    attackCd: 1,
    summonCd: 1,
    sealCd: 1,
    laserCd: 1,
    laserTime: 0,
    laserAngle: 0
  };
}
