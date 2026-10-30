import { describe, expect, it, vi } from 'vitest';
import type { EnemyUnit } from './M0Scene';
import { updateCoreEffect, type CoreEffectHost } from './coreEffects';

function foe(x: number, y: number, dead = false): EnemyUnit {
  return {
    dead,
    root: { x, y },
    frostTime: 0,
    frostSlow: 0
  } as unknown as EnemyUnit;
}

function host(enemies: EnemyUnit[], lastMove = 0): CoreEffectHost {
  return {
    playerX: () => 0,
    playerY: () => 0,
    enemies: () => enemies,
    distanceToPlayer: (enemy) => Math.hypot(enemy.root.x, enemy.root.y),
    applyDamage: vi.fn(),
    spawnRing: vi.fn(),
    drawLightning: vi.fn(),
    spawnFirePatch: vi.fn(),
    lastMoveLength: () => lastMove
  };
}

describe('core effects', () => {
  it('orbit hits nearby targets and draws a ring', () => {
    const h = host([foe(40, 0), foe(200, 0)]);
    const timer = updateCoreEffect({ key: 'orbit', level: 1 }, 0.1, 0, h);
    expect(h.applyDamage).toHaveBeenCalledOnce();
    expect(h.spawnRing).toHaveBeenCalledOnce();
    expect(timer).toBeCloseTo(0.75);
  });

  it('storm strikes the nearest targets', () => {
    const h = host([foe(300, 0), foe(100, 0)]);
    const timer = updateCoreEffect({ key: 'storm', level: 2 }, 0.1, 0, h);
    expect(h.drawLightning).toHaveBeenCalledTimes(2);
    expect(h.applyDamage).toHaveBeenCalledTimes(2);
    expect(timer).toBeCloseTo(2.2);
  });

  it('nova freezes targets and requests a ring', () => {
    const near = [foe(50, 0)];
    const h = host(near);
    updateCoreEffect({ key: 'nova', level: 1 }, 0.1, 0, h);
    expect(h.applyDamage).toHaveBeenCalledOnce();
    expect(h.spawnRing).toHaveBeenCalledOnce();
    expect(near[0].frostTime).toBe(1.2);
    expect(near[0].frostSlow).toBe(0.35);
  });

  it('trail drops fire only while moving', () => {
    const still = host([], 0);
    updateCoreEffect({ key: 'trail', level: 1 }, 0.1, 0, still);
    expect(still.spawnFirePatch).not.toHaveBeenCalled();
    const moving = host([], 1);
    updateCoreEffect({ key: 'trail', level: 1 }, 0.1, 0, moving);
    expect(moving.spawnFirePatch).toHaveBeenCalledOnce();
  });
});
