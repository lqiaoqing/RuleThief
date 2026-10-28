export interface CoreBossEnemy {
  root: { x: number; y: number };
  hp: number;
  maxHp: number;
  radius: number;
  contactCd: number;
  dead: boolean;
}

export interface CoreTimers {
  attackCd: number;
  summonCd: number;
  sealCd: number;
  laserCd: number;
  laserTime: number;
  laserAngle: number;
}

export interface CoreHost {
  arena: number;
  playerRadius: number;
  now(): number;
  playerX(): number;
  playerY(): number;
  isPlaying(): boolean;
  setBossRef(enemy: CoreBossEnemy): void;
  phase(): number;
  setPhase(phase: number): void;
  timers(): CoreTimers;
  setTimers(timers: CoreTimers): void;
  onPhase(phase: number): void;
  fireFan(enemy: CoreBossEnemy, bolts: number, spread: number): void;
  summon(): void;
  spawnShockZone(x: number, y: number, radius: number, delay: number): void;
  distanceToPlayer(enemy: CoreBossEnemy): number;
  hurt(amount: number, x: number, y: number, source: 'hazard' | 'melee'): void;
  audio(name: 'spawn'): void;
  bonusBolts(): number;
  random(): number;
  randomInt(min: number, max: number): number;
  startLaser(): void;
  drawLaser(enemy: CoreBossEnemy, angle: number): void;
  stopLaser(): void;
  aliveAdds(): number;
  spawnAdd(kind: 'sentry' | 'phase', x: number, y: number): void;
}

export function summonCoreAdds(host: CoreHost): void {
  if (host.aliveAdds() >= 4) return;
  const kinds: ('sentry' | 'phase')[] = host.phase() >= 3 ? ['sentry', 'phase'] : ['sentry'];
  const spots: [number, number][] = [
    [150, 210],
    [host.arena - 150, 210]
  ];
  kinds.forEach((kind, index) => host.spawnAdd(kind, spots[index][0], spots[index][1]));
  host.audio('spawn');
}

export function updateCore(enemy: CoreBossEnemy, dt: number, host: CoreHost): void {
  if (!host.isPlaying() || enemy.dead) return;
  host.setBossRef(enemy);
  const ratio = enemy.hp / enemy.maxHp;
  const phase = ratio > 0.7 ? 1 : ratio > 0.35 ? 2 : 3;
  if (phase !== host.phase()) {
    host.setPhase(phase);
    host.onPhase(phase);
  }

  const timers = host.timers();
  timers.attackCd -= dt;
  timers.summonCd -= dt;
  timers.sealCd -= dt;
  timers.laserCd -= dt;

  enemy.root.x = host.arena * 0.5 + Math.sin(host.now() * 0.0006) * 190;
  enemy.root.y = 235 + Math.sin(host.now() * 0.0011) * 22;

  if (timers.attackCd <= 0) {
    timers.attackCd = phase >= 3 ? 1.7 : phase === 2 ? 2.05 : 2.5;
    host.setTimers(timers);
    host.fireFan(enemy, (phase >= 3 ? 7 : 5) + host.bonusBolts(), phase >= 3 ? 1.15 : 0.85);
  }
  if (timers.summonCd <= 0) {
    timers.summonCd = 8;
    host.setTimers(timers);
    host.summon();
  }
  if (timers.sealCd <= 0) {
    timers.sealCd = phase >= 3 ? 3.2 : 4.6;
    host.spawnShockZone(host.playerX(), host.playerY(), 56, 0.9);
    if (phase >= 2) {
      host.spawnShockZone(host.randomInt(130, host.arena - 130), host.randomInt(150, host.arena - 130), 48, 1.2);
      host.spawnShockZone(host.randomInt(130, host.arena - 130), host.randomInt(150, host.arena - 130), 48, 1.35);
    }
  }

  updateLaser(enemy, dt, phase, host, timers);

  if (enemy.contactCd <= 0 && host.distanceToPlayer(enemy) < enemy.radius + host.playerRadius) {
    enemy.contactCd = 1.0;
    host.hurt(8, enemy.root.x, enemy.root.y, 'melee');
  }
  host.setTimers(timers);
}

function updateLaser(
  enemy: CoreBossEnemy,
  dt: number,
  phase: number,
  host: CoreHost,
  timers: CoreTimers
): void {
  if (timers.laserTime <= 0) {
    if (timers.laserCd > 0) return;
    timers.laserTime = 2.2;
    timers.laserAngle = host.random() * Math.PI * 2;
    timers.laserCd = 999;
    host.startLaser();
    host.audio('spawn');
  }

  timers.laserTime -= dt;
  timers.laserAngle += dt * (phase >= 3 ? 2.8 : 1.9);
  host.drawLaser(enemy, timers.laserAngle);

  const cos = Math.cos(timers.laserAngle);
  const sin = Math.sin(timers.laserAngle);
  const dx = host.playerX() - enemy.root.x;
  const dy = host.playerY() - (enemy.root.y - 10);
  const along = dx * cos + dy * sin;
  const perpendicular = Math.abs(-dx * sin + dy * cos);
  if (along > 0 && perpendicular < host.playerRadius + 8) {
    host.hurt(10, enemy.root.x, enemy.root.y, 'hazard');
  }

  if (timers.laserTime <= 0) {
    host.stopLaser();
    timers.laserCd = phase >= 3 ? 3.5 : 5;
  }
}
