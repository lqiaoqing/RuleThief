import { describe, expect, it, vi } from 'vitest';
import type { EnemyUnit } from './M0Scene';
import {
  updateArtilleryAi,
  updateHexerAi,
  updateSplitterAi,
  type FrontierAiHost
} from './frontierAi';

function enemy(kind: 'splitter' | 'artillery' | 'hexer'): EnemyUnit {
  return {
    kind,
    root: { x: 0, y: 0 },
    radius: 20,
    speed: 100,
    frostTime: 0,
    frostSlow: 0,
    attackCd: 0,
    contactCd: 0,
    trailCd: 0,
    dead: false,
    state: 'idle',
    stateTimer: 0
  } as unknown as EnemyUnit;
}

function host(overrides: Partial<FrontierAiHost> = {}): FrontierAiHost {
  return {
    playerX: () => 100,
    playerY: () => 0,
    arenaSize: () => 2400,
    now: () => 0,
    random: () => 0.5,
    int: (min) => min,
    hurtPlayer: vi.fn(),
    enemyCount: () => 0,
    spawnlingCount: () => 0,
    narrowScreen: () => false,
    aliveCap: () => 9999,
    spawnEnemy: vi.fn(),
    spawnLeaderBurst: vi.fn(),
    spawnStatusSpark: vi.fn(),
    strafeAtRange: vi.fn(),
    spawnShockZone: vi.fn(),
    fireEnemyBolt: vi.fn(),
    ...overrides
  };
}

describe('frontier enemy ai', () => {
  it('moves splitters toward the player and applies contact damage', () => {
    const unit = enemy('splitter');
    unit.root.x = 60;
    const h = host();
    updateSplitterAi(unit, 0.1, h);
    expect(unit.root.x).toBeGreaterThan(60);
    expect(h.hurtPlayer).toHaveBeenCalledWith(6, unit.root.x, unit.root.y, 'melee');
  });

  it('fires artillery volleys and a delayed ground zone', () => {
    const unit = enemy('artillery');
    const h = host();
    updateArtilleryAi(unit, 0.1, h);
    expect(h.spawnShockZone).toHaveBeenCalledOnce();
    expect(h.fireEnemyBolt).toHaveBeenCalledTimes(2);
  });

  it('applies hexer slow on its bolt', () => {
    const unit = enemy('hexer');
    const h = host();
    updateHexerAi(unit, 0.1, h);
    expect(h.fireEnemyBolt).toHaveBeenCalledWith(
      unit,
      expect.objectContaining({ slow: 0.25, slowDuration: 2.2 })
    );
  });
});
