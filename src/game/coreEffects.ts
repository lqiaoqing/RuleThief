import type { EnemyUnit } from './M0Scene';
import type { CoreRef } from './cores';

export interface CoreEffectHost {
  playerX(): number;
  playerY(): number;
  enemies(): readonly EnemyUnit[];
  distanceToPlayer(enemy: EnemyUnit): number;
  applyDamage(enemy: EnemyUnit, amount: number, kind: 'blast' | 'hit'): void;
  spawnRing(
    x: number,
    y: number,
    radius: number,
    color: number,
    lineWidth: number,
    scale: number,
    duration: number
  ): void;
  drawLightning(x1: number, y1: number, x2: number, y2: number): void;
  spawnFirePatch(x: number, y: number, radius: number, duration: number): void;
  lastMoveLength(): number;
}

export function updateCoreEffect(
  core: CoreRef,
  dt: number,
  timer: number,
  host: CoreEffectHost
): number {
  let nextTimer = timer - dt;
  if (nextTimer > 0) return nextTimer;
  const level = core.level;
  const px = host.playerX();
  const py = host.playerY();
  if (core.key === 'orbit') {
    nextTimer = 0.8 - 0.05 * level;
    const targets = host
      .enemies()
      .filter(
        (enemy) =>
          !enemy.dead &&
          Math.hypot(enemy.root.x - px, enemy.root.y - py) < 120 + level * 12
      )
      .slice(0, 2 + level);
    for (const target of targets) {
      host.applyDamage(target, 3 + level * 3, 'blast');
    }
    if (targets.length) host.spawnRing(px, py - 8, 42, 0xb69bff, 1.5, 2.2, 260);
    return nextTimer;
  }
  if (core.key === 'storm') {
    nextTimer = 2.6 - 0.2 * level;
    const targets = [...host.enemies()]
      .filter((enemy) => !enemy.dead)
      .sort((a, b) => host.distanceToPlayer(a) - host.distanceToPlayer(b))
      .slice(0, level);
    for (const target of targets) {
      host.drawLightning(px, py - 20, target.root.x, target.root.y - 10);
      host.applyDamage(target, 10 + level * 8, 'hit');
    }
    return nextTimer;
  }
  if (core.key === 'nova') {
    nextTimer = 3.4 - 0.2 * level;
    const radius = 120 + level * 30;
    for (const enemy of [...host.enemies()]) {
      if (enemy.dead) continue;
      if (Math.hypot(enemy.root.x - px, enemy.root.y - py) <= radius) {
        host.applyDamage(enemy, 4 + level * 4, 'blast');
        enemy.frostTime = Math.max(enemy.frostTime, 1.2);
        enemy.frostSlow = Math.max(enemy.frostSlow, 0.35);
      }
    }
    host.spawnRing(px, py - 8, radius, 0x8ceafa, 2, 1.15, 420);
    return nextTimer;
  }
  if (core.key === 'trail') {
    nextTimer = 0.9 - 0.1 * level;
    if (host.lastMoveLength() > 0.1) {
      host.spawnFirePatch(px, py + 8, 36 + level * 8, 2.2);
    }
    return nextTimer;
  }
  return 1;
}
