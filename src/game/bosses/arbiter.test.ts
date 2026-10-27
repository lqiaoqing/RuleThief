import { describe, expect, it } from 'vitest';
import { updateArbiter, type ArbiterHost, type BossEnemy } from './arbiter';

function enemy(overrides: Partial<BossEnemy> = {}): BossEnemy {
  return {
    root: { x: 400, y: 300 },
    hp: 100,
    maxHp: 100,
    radius: 62,
    state: 'idle',
    stateTimer: 0,
    chargeDir: {
      x: 1,
      y: 0,
      set(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
      normalize() {
        const length = Math.hypot(this.x, this.y) || 1;
        this.x /= length;
        this.y /= length;
      }
    },
    warning: { setVisible: () => undefined },
    hasHitThisCharge: false,
    contactCd: 0,
    dead: false,
    ...overrides
  };
}

function host(overrides: Partial<ArbiterHost> = {}): ArbiterHost & {
  actions: string[];
  timersValue: { attackCd: number; chargeCd: number; summonCd: number; sealCd: number };
} {
  const actions: string[] = [];
  const timersValue = { attackCd: 0, chargeCd: 1, summonCd: 1, sealCd: 1 };
  const base: ArbiterHost = {
    arena: 800,
    playerRadius: 22,
    playerX: () => 400,
    playerY: () => 500,
    getPhase: () => 1,
    setPhase: () => undefined,
    timers: () => ({ ...timersValue }),
    setTimers: (value) => Object.assign(timersValue, value),
    setBossRef: () => undefined,
    distanceToPlayer: () => 300,
    strafe: () => undefined,
    fireFan: (_enemy, bolts) => actions.push(`fan:${bolts}`),
    summon: () => actions.push('summon'),
    castSeal: () => actions.push('seal'),
    drawWarning: () => undefined,
    hurt: (_amount, _x, _y, source) => actions.push(`hurt:${source}`),
    onPhase: (phase) => actions.push(`phase:${phase}`),
    onChargeWall: () => actions.push('wall'),
    audio: () => undefined,
    bonusBolts: () => 0,
    isPlaying: () => true
  };
  return Object.assign(base, overrides, { actions, timersValue });
}

describe('arbiter boss module', () => {
  it('fires a fan and resets the attack timer in phase 1', () => {
    const h = host();
    const target = enemy();
    updateArbiter(target, 0.1, h);
    expect(h.actions).toContain('fan:9');
    expect(h.timersValue.attackCd).toBeCloseTo(2.4, 5);
  });

  it('enters phase 2 and starts a telegraphed charge', () => {
    const h = host({
      getPhase: () => 1,
      timers: () => ({ attackCd: 1, chargeCd: 0, summonCd: 1, sealCd: 1 })
    });
    const target = enemy({ hp: 50, maxHp: 100 });
    updateArbiter(target, 0.1, h);
    expect(h.actions).toContain('phase:2');
    expect(target.state).toBe('telegraph');
  });

  it('casts the seal in phase 3 when its timer is ready', () => {
    const h = host({
      getPhase: () => 3,
      timers: () => ({ attackCd: 1, chargeCd: 1, summonCd: 1, sealCd: 0 })
    });
    updateArbiter(enemy({ hp: 20, maxHp: 100 }), 0.1, h);
    expect(h.actions).toContain('seal');
  });

  it('deals charge damage on contact and stops at the wall', () => {
    const h = host({
      distanceToPlayer: () => 10
    });
    const target = enemy({
      state: 'charge',
      stateTimer: 0.05,
      root: { x: 100, y: 300 }
    });
    updateArbiter(target, 0.1, h);
    expect(h.actions).toContain('hurt:charge');
    expect(target.hasHitThisCharge).toBe(true);
    expect(h.actions).toContain('wall');
  });
});
