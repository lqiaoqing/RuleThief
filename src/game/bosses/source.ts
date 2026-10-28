export interface SourceBossEnemy {
  root: { x: number; y: number };
  hp: number;
  maxHp: number;
  radius: number;
  contactCd: number;
  dead: boolean;
}

export interface SourceTimers {
  attackCd: number;
  summonCd: number;
  sealCd: number;
  chargeCd: number;
}

export interface SourceHost {
  arena: number;
  playerRadius: number;
  now(): number;
  playerX(): number;
  playerY(): number;
  isPlaying(): boolean;
  setBossRef(enemy: SourceBossEnemy): void;
  phase(): number;
  setPhase(phase: number): void;
  timers(): SourceTimers;
  setTimers(timers: SourceTimers): void;
  onPhase(phase: number): void;
  fireFan(enemy: SourceBossEnemy, bolts: number, spread: number): void;
  summon(): void;
  castSeal(): void;
  spawnVoidZone(x: number, y: number, radius: number, delay: number): void;
  distanceToPlayer(enemy: SourceBossEnemy): number;
  hurt(amount: number, x: number, y: number, source: 'melee'): void;
  shake(): void;
  bonusBolts(): number;
  randomInt(min: number, max: number): number;
  aliveAdds(): number;
  spawnAdd(kind: 'sentry' | 'phase' | 'seer', x: number, y: number): void;
  audio(name: 'spawn'): void;
}

export function summonSourceAdds(host: SourceHost): void {
  if (host.aliveAdds() >= 4) return;
  const kinds: ('sentry' | 'phase' | 'seer')[] =
    host.phase() >= 3 ? ['seer', 'phase'] : ['sentry', 'phase'];
  const spots: [number, number][] = [
    [150, 220],
    [host.arena - 150, 220]
  ];
  kinds.forEach((kind, index) => host.spawnAdd(kind, spots[index][0], spots[index][1]));
  host.audio('spawn');
}

export function updateSource(enemy: SourceBossEnemy, dt: number, host: SourceHost): void {
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
  timers.chargeCd -= dt;

  enemy.root.x = host.arena * 0.5 + Math.sin(host.now() * 0.00055) * 210;
  enemy.root.y = 225 + Math.sin(host.now() * 0.001) * 20;

  if (timers.attackCd <= 0) {
    timers.attackCd = phase >= 3 ? 1.5 : phase === 2 ? 1.9 : 2.3;
    host.setTimers(timers);
    host.fireFan(
      enemy,
      (phase >= 3 ? 13 : phase === 2 ? 9 : 7) + host.bonusBolts(),
      phase >= 3 ? 1.2 : 1.0
    );
    host.shake();
  }
  if (phase >= 2 && timers.summonCd <= 0) {
    timers.summonCd = 8.5;
    host.setTimers(timers);
    host.summon();
  }
  if (phase >= 2 && timers.sealCd <= 0) {
    timers.sealCd = 7;
    host.setTimers(timers);
    host.castSeal();
  }
  if (phase >= 3 && timers.chargeCd <= 0) {
    timers.chargeCd = 3.5;
    host.spawnVoidZone(host.playerX(), host.playerY(), 72, 0.95);
    host.spawnVoidZone(host.randomInt(130, host.arena - 130), host.randomInt(140, host.arena - 130), 64, 1.15);
    host.spawnVoidZone(host.randomInt(130, host.arena - 130), host.randomInt(140, host.arena - 130), 64, 1.3);
  }

  if (enemy.contactCd <= 0 && host.distanceToPlayer(enemy) < enemy.radius + host.playerRadius) {
    enemy.contactCd = 1.0;
    host.hurt(10, enemy.root.x, enemy.root.y, 'melee');
  }
  host.setTimers(timers);
}
