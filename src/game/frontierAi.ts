import type { EnemyUnit } from './M0Scene';
import type { EnemyKind } from './rooms';

export interface FrontierBoltOptions {
  angle?: number;
  speed?: number;
  damage?: number;
  tint?: number;
  slow?: number;
  slowDuration?: number;
  scale?: number;
}

export type FrontierDamageSource = 'melee' | 'charge' | 'bolt' | 'hazard' | 'explosion' | 'other';

export interface FrontierAiHost {
  playerX(): number;
  playerY(): number;
  arenaSize(): number;
  now(): number;
  random(): number;
  int(min: number, max: number): number;
  hurtPlayer(amount: number, x: number, y: number, source: FrontierDamageSource): void;
  enemyCount(): number;
  spawnlingCount(): number;
  narrowScreen(): boolean;
  aliveCap(): number;
  spawnEnemy(kind: EnemyKind, x: number, y: number, countsTowardQuota: boolean): void;
  spawnLeaderBurst(x: number, y: number): void;
  spawnStatusSpark(x: number, y: number, color: number): void;
  strafeAtRange(
    enemy: EnemyUnit,
    dt: number,
    preferred: number,
    near: number,
    far: number
  ): void;
  spawnShockZone(
    x: number,
    y: number,
    radius: number,
    delay: number,
    color: number,
    damage: number
  ): void;
  fireEnemyBolt(enemy: EnemyUnit, options?: FrontierBoltOptions): void;
}

export function updateSplitterAi(enemy: EnemyUnit, dt: number, host: FrontierAiHost): void {
  const dx = host.playerX() - enemy.root.x;
  const dy = host.playerY() - enemy.root.y;
  const dist = Math.hypot(dx, dy) || 1;
  const slow = enemy.frostTime > 0 ? 1 - enemy.frostSlow : 1;
  enemy.root.x += (dx / dist) * enemy.speed * slow * dt;
  enemy.root.y += (dy / dist) * enemy.speed * slow * dt;
  if (enemy.contactCd <= 0 && dist < enemy.radius + 22) {
    enemy.contactCd = 1;
    host.hurtPlayer(6, enemy.root.x, enemy.root.y, 'melee');
  }
}

export function updateBulwarkAi(enemy: EnemyUnit, dt: number, host: FrontierAiHost): void {
  const dx = host.playerX() - enemy.root.x;
  const dy = host.playerY() - enemy.root.y;
  const dist = Math.hypot(dx, dy) || 1;
  const slow = enemy.frostTime > 0 ? 1 - enemy.frostSlow : 1;
  if (dist > 140) {
    enemy.root.x += (dx / dist) * enemy.speed * slow * dt;
    enemy.root.y += (dy / dist) * enemy.speed * slow * dt;
  }
  enemy.castRing.setVisible(true).setScale(1 + Math.sin(host.now() * 0.003) * 0.08);
  if (enemy.kind === 'bastion') {
    enemy.trailCd -= dt;
    if (enemy.trailCd <= 0) {
      enemy.trailCd = 3.8;
      host.spawnShockZone(enemy.root.x, enemy.root.y, 130, 1.0, 0x65dcf0, 16);
    }
  }
  if (enemy.contactCd <= 0 && dist < enemy.radius + 22 + 8) {
    enemy.contactCd = 1.1;
    host.hurtPlayer(9, enemy.root.x, enemy.root.y, 'melee');
  }
}

export function updateBurrowerAi(enemy: EnemyUnit, dt: number, host: FrontierAiHost): void {
  const dx = host.playerX() - enemy.root.x;
  const dy = host.playerY() - enemy.root.y;
  const dist = Math.hypot(dx, dy) || 1;
  const slow = enemy.frostTime > 0 ? 1 - enemy.frostSlow : 1;
  enemy.attackCd = Math.max(0, enemy.attackCd - dt);
  if (enemy.state === 'cast') {
    enemy.stateTimer -= dt;
    enemy.sprite.setAlpha(0.35);
    if (enemy.stateTimer <= 0) {
      enemy.state = 'approach';
      enemy.sprite.setAlpha(1);
      const angle = host.random() * Math.PI * 2;
      enemy.root.x = Math.max(
        70,
        Math.min(host.arenaSize() - 70, host.playerX() + Math.cos(angle) * 110)
      );
      enemy.root.y = Math.max(
        90,
        Math.min(host.arenaSize() - 70, host.playerY() + Math.sin(angle) * 110)
      );
      host.spawnLeaderBurst(enemy.root.x, enemy.root.y);
      enemy.attackCd = 4.2;
    }
    return;
  }
  if (dist > 4) {
    enemy.root.x += (dx / dist) * enemy.speed * slow * dt;
    enemy.root.y += (dy / dist) * enemy.speed * slow * dt;
  }
  if (enemy.attackCd <= 0) {
    enemy.state = 'cast';
    enemy.stateTimer = 0.7;
    return;
  }
  if (enemy.contactCd <= 0 && dist < enemy.radius + 22) {
    enemy.contactCd = 0.9;
    host.hurtPlayer(7, enemy.root.x, enemy.root.y, 'melee');
  }
}

export function updateBroodAi(enemy: EnemyUnit, dt: number, host: FrontierAiHost): void {
  enemy.attackCd -= dt;
  enemy.castRing.setVisible(true).setScale(1 + Math.sin(host.now() * 0.004) * 0.1);
  if (enemy.attackCd > 0) return;
  enemy.attackCd = 3.2;
  const alive = host.spawnlingCount();
  if (alive >= 18 || (host.narrowScreen() && host.enemyCount() >= host.aliveCap())) return;
  for (let index = 0; index < 2; index += 1) {
    if (host.narrowScreen() && host.enemyCount() >= host.aliveCap()) break;
    const angle = host.random() * Math.PI * 2;
    const x = Math.max(70, Math.min(host.arenaSize() - 70, enemy.root.x + Math.cos(angle) * 46));
    const y = Math.max(90, Math.min(host.arenaSize() - 70, enemy.root.y + Math.sin(angle) * 46));
    host.spawnEnemy('spawnling', x, y, false);
  }
  host.spawnStatusSpark(enemy.root.x, enemy.root.y - 10, 0xffac68);
  if (enemy.kind === 'broodQueen') {
    const base = Math.atan2(host.playerY() - enemy.root.y, host.playerX() - enemy.root.x);
    for (const offset of [-0.28, 0, 0.28]) {
      host.fireEnemyBolt(enemy, {
        angle: base + offset,
        speed: 165,
        damage: 9,
        tint: 0xffac68,
        scale: 1.3
      });
    }
  }
}

export function updateArtilleryAi(enemy: EnemyUnit, dt: number, host: FrontierAiHost): void {
  host.strafeAtRange(enemy, dt, 520, 380, 720);
  enemy.attackCd = Math.max(0, enemy.attackCd - dt);
  if (enemy.attackCd > 0) return;
  enemy.attackCd = 3.4;
  host.spawnShockZone(host.playerX(), host.playerY(), 74, 0.95, 0xffac68, 14);
  const base = Math.atan2(host.playerY() - enemy.root.y, host.playerX() - enemy.root.x);
  for (const offset of [-0.12, 0.12]) {
    host.fireEnemyBolt(enemy, {
      angle: base + offset,
      speed: 150,
      damage: 8,
      tint: 0xffac68,
      scale: 1.35
    });
  }
}

export function updateMirrorAi(enemy: EnemyUnit, dt: number, host: FrontierAiHost): void {
  host.strafeAtRange(enemy, dt, 320, 220, 540);
  enemy.attackCd = Math.max(0, enemy.attackCd - dt);
  if (enemy.attackCd > 0) return;
  enemy.attackCd = 2.6;
  const angle = Math.atan2(host.playerY() - enemy.root.y, host.playerX() - enemy.root.x);
  for (let index = -1; index <= 1; index += 1) {
    host.fireEnemyBolt(enemy, {
      angle: angle + index * 0.2,
      speed: 210,
      damage: 6,
      tint: 0x65dcf0,
      scale: 0.9
    });
  }
  if (host.random() < 0.35) {
    const side = host.random() < 0.5 ? 1 : -1;
    enemy.root.x = Math.max(
      70,
      Math.min(host.arenaSize() - 70, host.playerX() + side * 260)
    );
    enemy.root.y = Math.max(
      90,
      Math.min(host.arenaSize() - 70, host.playerY() + host.int(-160, 160))
    );
  }
}

export function updateHexerAi(enemy: EnemyUnit, dt: number, host: FrontierAiHost): void {
  host.strafeAtRange(enemy, dt, 300, 200, 500);
  enemy.attackCd = Math.max(0, enemy.attackCd - dt);
  if (enemy.attackCd > 0) return;
  enemy.attackCd = 2.8;
  host.fireEnemyBolt(enemy, {
    speed: 190,
    damage: 6,
    tint: 0xb69bff,
    slow: 0.25,
    slowDuration: 2.2,
    scale: 1.05
  });
}
