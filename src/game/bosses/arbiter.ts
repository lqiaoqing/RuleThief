export interface BossEnemy {
  root: { x: number; y: number };
  hp: number;
  maxHp: number;
  radius: number;
  state: string;
  stateTimer: number;
  chargeDir: { x: number; y: number; set(x: number, y: number): void; normalize(): void };
  warning: { setVisible(visible: boolean): void };
  hasHitThisCharge: boolean;
  contactCd: number;
  dead: boolean;
}

export interface ArbiterTimers {
  attackCd: number;
  chargeCd: number;
  summonCd: number;
  sealCd: number;
}

export interface ArbiterHost {
  arena: number;
  playerRadius: number;
  playerX(): number;
  playerY(): number;
  getPhase(): number;
  setPhase(phase: number): void;
  timers(): ArbiterTimers;
  setTimers(timers: ArbiterTimers): void;
  setBossRef(enemy: BossEnemy): void;
  distanceToPlayer(enemy: BossEnemy): number;
  strafe(enemy: BossEnemy, dt: number, preferred: number, near: number, far: number): void;
  fireFan(enemy: BossEnemy, bolts: number, spread: number): void;
  summon(): void;
  castSeal(): void;
  drawWarning(enemy: BossEnemy): void;
  hurt(amount: number, x: number, y: number, source: 'charge' | 'melee'): void;
  onPhase(phase: number): void;
  onChargeWall(): void;
  audio(name: 'dash' | 'spawn'): void;
  bonusBolts(): number;
  isPlaying(): boolean;
}

export function updateArbiter(enemy: BossEnemy, dt: number, host: ArbiterHost): void {
  if (!host.isPlaying() || enemy.dead) return;
  host.setBossRef(enemy);
  const ratio = enemy.hp / enemy.maxHp;
  const phase = ratio > 0.7 ? 1 : ratio > 0.35 ? 2 : 3;
  if (phase !== host.getPhase()) {
    host.setPhase(phase);
    host.onPhase(phase);
  }

  const timers = host.timers();
  timers.attackCd -= dt;
  timers.chargeCd -= dt;
  timers.summonCd -= dt;
  timers.sealCd -= dt;
  host.setTimers(timers);

  if (enemy.state === 'telegraph') {
    enemy.stateTimer -= dt;
    host.drawWarning(enemy);
    if (enemy.stateTimer <= 0) {
      enemy.state = 'charge';
      enemy.stateTimer = 0.52;
      enemy.hasHitThisCharge = false;
      enemy.warning.setVisible(false);
      host.audio('dash');
    }
    return;
  }

  if (enemy.state === 'charge') {
    enemy.stateTimer -= dt;
    enemy.root.x += enemy.chargeDir.x * 560 * dt;
    enemy.root.y += enemy.chargeDir.y * 560 * dt;
    const contact = host.distanceToPlayer(enemy);
    if (!enemy.hasHitThisCharge && contact < enemy.radius + host.playerRadius + 12) {
      enemy.hasHitThisCharge = true;
      host.hurt(16, enemy.root.x, enemy.root.y, 'charge');
    }
    const atWall =
      enemy.root.x <= 70 ||
      enemy.root.x >= host.arena - 70 ||
      enemy.root.y <= 90 ||
      enemy.root.y >= host.arena - 70;
    if (atWall || enemy.stateTimer <= 0) {
      enemy.state = 'idle';
      enemy.stateTimer = 0;
      host.onChargeWall();
    }
    return;
  }

  host.strafe(enemy, dt, 330, 240, 430);

  if (timers.attackCd <= 0) {
    timers.attackCd = phase >= 3 ? 1.55 : phase === 2 ? 1.95 : 2.4;
    host.setTimers(timers);
    host.fireFan(enemy, (phase >= 3 ? 11 : 9) + host.bonusBolts(), 0.95);
  }

  if (phase >= 2 && timers.chargeCd <= 0) {
    timers.chargeCd = 5.0;
    host.setTimers(timers);
    enemy.state = 'telegraph';
    enemy.stateTimer = 0.75;
    const dx = host.playerX() - enemy.root.x;
    const dy = host.playerY() - enemy.root.y;
    enemy.chargeDir.set(dx, dy);
    enemy.chargeDir.normalize();
    enemy.warning.setVisible(true);
    host.audio('spawn');
  }

  if (phase >= 2 && timers.summonCd <= 0) {
    timers.summonCd = 7.5;
    host.setTimers(timers);
    host.summon();
  }

  if (phase >= 3 && timers.sealCd <= 0) {
    timers.sealCd = 6.5;
    host.setTimers(timers);
    host.castSeal();
  }

  if (enemy.contactCd <= 0 && host.distanceToPlayer(enemy) < enemy.radius + host.playerRadius) {
    enemy.contactCd = 1.0;
    host.hurt(8, enemy.root.x, enemy.root.y, 'melee');
  }
}
