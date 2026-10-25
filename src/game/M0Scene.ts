import Phaser from 'phaser';
import { ARENA, ASSETS, COLORS } from './theme';
import {
  resetM0Hud,
  setDash,
  setHp,
  setObjective,
  setRules,
  setTimer,
  showRuleToast
} from '../ui/hud';
import { audio } from './audio';

type EnemyKind = 'beetle' | 'bat';
type RunState = 'idle' | 'playing' | 'ended';
type RuleKey = 'chain' | 'blast';
type EnemyState = 'approach' | 'telegraph' | 'charge' | 'recover' | 'idle' | 'cast';

interface EnemyUnit {
  kind: EnemyKind;
  root: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  aura: Phaser.GameObjects.Image;
  warning: Phaser.GameObjects.Graphics;
  castRing: Phaser.GameObjects.Arc;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  dead: boolean;
  state: EnemyState;
  stateTimer: number;
  attackCd: number;
  contactCd: number;
  chargeDir: Phaser.Math.Vector2;
  hasHitThisCharge: boolean;
  hpFill: Phaser.GameObjects.Rectangle;
}

interface PlayerBolt {
  root: Phaser.GameObjects.Container;
  target: EnemyUnit | null;
  damage: number;
  speed: number;
  radius: number;
  life: number;
  dead: boolean;
}

interface EnemyBolt {
  root: Phaser.GameObjects.Container;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  life: number;
  dead: boolean;
}

interface Pickup {
  root: Phaser.GameObjects.Container;
  kind: 'rule' | 'heal';
  ruleKey?: RuleKey;
  age: number;
  dead: boolean;
}

export interface RunEndPayload {
  victory: boolean;
  time: number;
  kills: number;
  rules: number;
}

const RUN_DURATION = 180;
const PLAYER_MAX_HP = 100;
const PLAYER_SPEED = 185;
const PLAYER_RADIUS = 22;
const ATTACK_INTERVAL = 0.65;
const BASE_DAMAGE = 14;
const DASH_COOLDOWN = 4;
const DASH_DURATION = 0.18;
const DASH_IFRAME = 0.3;
const BOLT_SPEED = 620;
const CHAIN_DAMAGE = 12;
const BLAST_DAMAGE = 7;
const BLAST_RADIUS = 74;
const CHAIN_RADIUS = 255;

export class M0Scene extends Phaser.Scene {
  private world!: Phaser.GameObjects.Container;
  private enemyLayer!: Phaser.GameObjects.Container;
  private fxLayer!: Phaser.GameObjects.Container;
  private playerRoot!: Phaser.GameObjects.Container;
  private playerSprite!: Phaser.GameObjects.Image;
  private playerAura!: Phaser.GameObjects.Image;

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private joystick = new Phaser.Math.Vector2();
  private lastMove = new Phaser.Math.Vector2(1, 0);
  private dashDirection = new Phaser.Math.Vector2(1, 0);
  private dashRemaining = 0;
  private dashCooldown = 0;
  private dashGhostClock = 0;
  private dashQueued = false;

  private runState: RunState = 'idle';
  private playEnabled = false;
  private hp = PLAYER_MAX_HP;
  private elapsed = 0;
  private timeLeft = RUN_DURATION;
  private kills = 0;
  private invuln = 0;
  private attackCd = 0;
  private spawnCd = 2.5;
  private hudTick = 0;
  private runToken = 0;

  private rules: Record<RuleKey, boolean> = { chain: false, blast: false };
  private shardDropped: Record<RuleKey, boolean> = { chain: false, blast: false };

  private enemies: EnemyUnit[] = [];
  private bolts: PlayerBolt[] = [];
  private enemyBolts: EnemyBolt[] = [];
  private pickups: Pickup[] = [];

  private readonly onJoystickEvent = (event: Event): void => {
    const detail = (event as CustomEvent<{ x: number; y: number }>).detail;
    this.joystick.set(detail.x, detail.y);
  };

  private readonly onDashEvent = (): void => {
    this.tryDash();
  };

  constructor() {
    super('M0');
  }

  preload(): void {
    this.load.image('floor', ASSETS.floor);
    this.load.image('player', ASSETS.player);
    this.load.image('beetle', ASSETS.beetle);
    this.load.image('bat', ASSETS.bat);
    this.load.image('boss', ASSETS.boss);
  }

  create(): void {
    this.buildTextures();
    this.world = this.add.container(0, 0);
    this.addFloor();
    this.addBossHologram();
    this.addArenaFrame();
    this.addBrazier(92, 120);
    this.addBrazier(708, 120);
    this.addBrazier(92, 680);
    this.addBrazier(708, 680);
    this.addAmbientDust();

    this.enemyLayer = this.add.container(0, 0);
    this.world.add(this.enemyLayer);
    this.createPlayer();
    this.fxLayer = this.add.container(0, 0);
    this.world.add(this.fxLayer);

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.addCapture([
        Phaser.Input.Keyboard.KeyCodes.SPACE,
        Phaser.Input.Keyboard.KeyCodes.UP,
        Phaser.Input.Keyboard.KeyCodes.DOWN,
        Phaser.Input.Keyboard.KeyCodes.LEFT,
        Phaser.Input.Keyboard.KeyCodes.RIGHT,
        Phaser.Input.Keyboard.KeyCodes.W,
        Phaser.Input.Keyboard.KeyCodes.A,
        Phaser.Input.Keyboard.KeyCodes.S,
        Phaser.Input.Keyboard.KeyCodes.D
      ]);
      this.keys = keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE') as Record<
        string,
        Phaser.Input.Keyboard.Key
      >;
      keyboard.on('keydown-SPACE', () => {
        if (this.playEnabled) this.dashQueued = true;
      });
    }

    window.addEventListener('rt-input', this.onJoystickEvent);
    window.addEventListener('rt-dash', this.onDashEvent);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('rt-input', this.onJoystickEvent);
      window.removeEventListener('rt-dash', this.onDashEvent);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });

    resetM0Hud();
    this.input.setTopOnly(true);
    this.game.events.emit('m0-ready');
  }

  public startNewRun(): void {
    this.scene.resume();
    this.time.removeAllEvents();
    this.runToken += 1;
    this.clearTransient();
    this.runState = 'playing';
    this.playEnabled = true;
    this.hp = PLAYER_MAX_HP;
    this.elapsed = 0;
    this.timeLeft = RUN_DURATION;
    this.kills = 0;
    this.invuln = 0;
    this.attackCd = 0.6;
    this.spawnCd = 2.4;
    this.hudTick = 0;
    this.dashCooldown = 0;
    this.dashRemaining = 0;
    this.dashQueued = false;
    this.joystick.set(0, 0);
    this.rules = { chain: false, blast: false };
    this.shardDropped = { chain: false, blast: false };
    this.playerRoot.setPosition(300, 500);
    this.playerSprite.setAlpha(1).clearTint();
    this.playerSprite.setRotation(0);
    this.playerSprite.setFlipX(false);
    resetM0Hud();
    setTimer(RUN_DURATION);
    setObjective(0, RUN_DURATION, 0);
    setRules(this.rules);
    setDash(1, 0);
    this.spawnPortal('beetle', 590, 402);
    this.spawnPortal('bat', 660, 286);
  }

  public setPlayEnabled(enabled: boolean): void {
    this.playEnabled = enabled;
    if (!enabled) {
      this.joystick.set(0, 0);
      this.dashQueued = false;
    }
  }

  public pauseGame(): void {
    this.joystick.set(0, 0);
    this.scene.pause();
  }

  public resumeGame(): void {
    this.scene.resume();
  }

  public debugGrantRule(rule: RuleKey): void {
    this.grantRule(rule);
  }

  public debugGrantAll(): void {
    this.grantRule('chain');
    this.grantRule('blast');
  }

  public debugDamagePlayer(amount: number): void {
    if (this.runState !== 'playing') return;
    this.invuln = 0;
    this.hp = Math.max(0, this.hp - amount);
    setHp(this.hp, PLAYER_MAX_HP);
    audio.play('hurt');
    this.cameras.main.flash(90, 255, 70, 90);
    if (this.hp <= 0) this.endRun(false);
  }

  public debugEndRun(victory: boolean): void {
    this.endRun(victory);
  }

  public debugSpawn(kind: EnemyKind = 'beetle'): void {
    if (this.runState !== 'playing') return;
    const pos = this.chooseSpawnPosition();
    this.spawnPortal(kind, pos.x, pos.y);
  }

  public debugKillAll(): void {
    for (const enemy of [...this.enemies]) {
      this.killEnemy(enemy);
    }
  }

  public debugSetStats(elapsed: number, kills: number): void {
    this.elapsed = Phaser.Math.Clamp(elapsed, 0, RUN_DURATION);
    this.timeLeft = RUN_DURATION - this.elapsed;
    this.kills = kills;
    setTimer(this.timeLeft);
    setObjective(this.elapsed, RUN_DURATION, this.kills);
  }

  public debugPoseCombat(): void {
    if (this.runState !== 'playing') return;
    this.attackCd = 99;
    this.rules.chain = true;
    this.rules.blast = true;
    setRules(this.rules);
    this.playerRoot.setPosition(300, 500);
    for (const enemy of [...this.enemies]) {
      this.destroyEnemy(enemy);
    }
    this.enemies = [];
    for (const bolt of this.bolts) {
      bolt.dead = true;
      bolt.root.destroy(true);
    }
    this.bolts = [];
    for (const bolt of this.enemyBolts) {
      bolt.dead = true;
      bolt.root.destroy(true);
    }
    this.enemyBolts = [];
    this.spawnEnemy('beetle', 580, 410);
    this.spawnEnemy('bat', 660, 280);
    this.spawnEnemy('bat', 600, 570);
    const targets = this.enemies;
    targets.forEach((target) => {
      target.attackCd = 99;
    });
    const points = targets.map((target) => ({
      x: target.root.x,
      y: target.root.y - 10
    }));
    this.drawLightning(
      this.playerRoot.x + 22,
      this.playerRoot.y - 22,
      points[0].x,
      points[0].y
    );
    for (let i = 0; i < points.length - 1; i += 1) {
      this.drawLightning(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    }
    targets.forEach((target, index) => {
      this.spawnExplosion(points[index].x, points[index].y);
      this.spawnPoseBlast(points[index].x, points[index].y, index);
      this.spawnDamageNumber(
        points[index].x + Phaser.Math.Between(-8, 8),
        points[index].y - 34,
        String(18 + index * 4),
        index === 1 ? '#65dcf0' : '#ffe399'
      );
    });
    this.time.delayedCall(160, () => this.scene.pause());
  }

  private spawnPoseBlast(x: number, y: number, index: number): void {
    const color = index === 1 ? COLORS.cyan : COLORS.orange;
    const glow = this.add
      .image(x, y, 'glow')
      .setDisplaySize(132, 132)
      .setTint(color)
      .setAlpha(0.3)
      .setBlendMode(Phaser.BlendModes.ADD);
    const outer = this.add
      .circle(x, y, 30, 0x000000, 0)
      .setStrokeStyle(2.5, color, 0.8)
      .setBlendMode(Phaser.BlendModes.ADD);
    const inner = this.add
      .circle(x, y, 16, 0x000000, 0)
      .setStrokeStyle(1.5, COLORS.yellow, 0.9)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(glow);
    this.addFx(outer);
    this.addFx(inner);
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2 + index * 0.4;
      const radius = 26 + (i % 3) * 13;
      const spark = this.add
        .image(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 'spark')
        .setTint(i % 2 === 0 ? color : COLORS.yellow)
        .setScale(0.46 + (i % 3) * 0.17)
        .setAlpha(0.7)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.addFx(spark);
    }
  }

  public debugSnapshot(): Record<string, unknown> {
    return {
      runState: this.runState,
      hp: this.hp,
      elapsed: this.elapsed,
      timeLeft: this.timeLeft,
      kills: this.kills,
      rules: { ...this.rules },
      enemies: this.enemies.length,
      bolts: this.bolts.length,
      enemyBolts: this.enemyBolts.length,
      pickups: this.pickups.length,
      dashCooldown: this.dashCooldown,
      playerX: this.playerRoot.x,
      playerY: this.playerRoot.y
    };
  }

  private clearTransient(): void {
    for (const enemy of this.enemies) {
      this.destroyEnemy(enemy);
    }
    this.enemies = [];

    for (const list of [this.bolts, this.enemyBolts, this.pickups]) {
      for (const item of list) {
        this.tweens.killTweensOf(item.root);
        item.root.destroy(true);
      }
      list.length = 0;
    }

    for (const child of [...this.fxLayer.list, ...this.enemyLayer.list]) {
      this.tweens.killTweensOf(child);
    }
    this.fxLayer.removeAll(true);
    this.enemyLayer.removeAll(true);
  }

  private destroyEnemy(enemy: EnemyUnit): void {
    this.tweens.killTweensOf(enemy.root);
    this.tweens.killTweensOf(enemy.sprite);
    this.tweens.killTweensOf(enemy.aura);
    this.tweens.killTweensOf(enemy.shadow);
    enemy.root.destroy(true);
  }

  private buildTextures(): void {
    if (!this.textures.exists('spark')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillCircle(8, 8, 7);
      g.generateTexture('spark', 16, 16);
      g.destroy();
    }

    if (!this.textures.exists('shadow')) {
      const tex = this.textures.createCanvas('shadow', 128, 64);
      if (tex) {
        const ctx = tex.getContext();
        const grad = ctx.createRadialGradient(64, 32, 2, 64, 32, 58);
        grad.addColorStop(0, 'rgba(0,0,0,0.78)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0.32)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 64);
        tex.refresh();
      }
    }

    if (!this.textures.exists('glow')) {
      const tex = this.textures.createCanvas('glow', 256, 256);
      if (tex) {
        const ctx = tex.getContext();
        const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        grad.addColorStop(0, 'rgba(255,255,255,0.95)');
        grad.addColorStop(0.2, 'rgba(255,255,255,0.34)');
        grad.addColorStop(0.55, 'rgba(255,255,255,0.09)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);
        tex.refresh();
      }
    }

    if (!this.textures.exists('shard')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.beginPath();
      g.moveTo(8, 1);
      g.lineTo(15, 8);
      g.lineTo(8, 15);
      g.lineTo(1, 8);
      g.closePath();
      g.fillPath();
      g.generateTexture('shard', 16, 16);
      g.destroy();
    }
  }

  private addFloor(): void {
    const floor = this.add
      .image(ARENA / 2, ARENA / 2, 'floor')
      .setDisplaySize(ARENA, ARENA);
    this.world.add(floor);
    const shade = this.add
      .rectangle(ARENA / 2, ARENA / 2, ARENA, ARENA, 0x050a12, 0.14)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.world.add(shade);
  }

  private addBossHologram(): void {
    const glow = this.add
      .image(ARENA / 2, 166, 'glow')
      .setDisplaySize(460, 460)
      .setTint(COLORS.purple)
      .setAlpha(0.11)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.world.add(glow);

    const boss = this.add
      .image(ARENA / 2, 166, 'boss')
      .setDisplaySize(292, 292)
      .setAlpha(0.2)
      .setTint(0xc9b6ff);
    this.world.add(boss);

    this.tweens.add({
      targets: boss,
      y: 158,
      alpha: 0.15,
      duration: 3400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    this.tweens.add({
      targets: glow,
      alpha: 0.07,
      scale: 1.08,
      duration: 4400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    const seal = this.add.graphics();
    seal.setPosition(ARENA / 2, 166);
    seal.lineStyle(1, COLORS.purple, 0.1);
    for (let i = 0; i < 28; i += 2) {
      const a0 = (i / 28) * Math.PI * 2;
      seal.beginPath();
      seal.arc(0, 0, 176, a0, a0 + 0.12);
      seal.strokePath();
    }
    this.world.add(seal);
    this.tweens.add({
      targets: seal,
      angle: 360,
      duration: 64000,
      repeat: -1,
      ease: 'Linear'
    });
  }

  private addArenaFrame(): void {
    const frame = this.add.graphics();
    frame.lineStyle(22, COLORS.cyan, 0.022);
    frame.strokeRoundedRect(2, 2, ARENA - 4, ARENA - 4, 20);
    frame.lineStyle(7, COLORS.purple, 0.045);
    frame.strokeRoundedRect(8, 8, ARENA - 16, ARENA - 16, 17);
    frame.lineStyle(1.4, 0xa6d8e6, 0.32);
    frame.strokeRoundedRect(6, 6, ARENA - 12, ARENA - 12, 17);
    frame.lineStyle(1, COLORS.cyan, 0.085);
    frame.strokeRoundedRect(22, 22, ARENA - 44, ARENA - 44, 10);

    const bracket = 34;
    const pad = 24;
    for (const [x, y, sx, sy] of [
      [pad, pad, 1, 1],
      [ARENA - pad, pad, -1, 1],
      [pad, ARENA - pad, 1, -1],
      [ARENA - pad, ARENA - pad, -1, -1]
    ]) {
      frame.lineStyle(2, COLORS.cyan, 0.46);
      frame.beginPath();
      frame.moveTo(x, y + sy * bracket);
      frame.lineTo(x, y);
      frame.lineTo(x + sx * bracket, y);
      frame.strokePath();
      frame.lineStyle(1, COLORS.purple, 0.2);
      frame.beginPath();
      frame.moveTo(x + sx * 6, y + sy * (bracket + 7));
      frame.lineTo(x + sx * 6, y + sy * 6);
      frame.lineTo(x + sx * (bracket + 7), y + sy * 6);
      frame.strokePath();
    }

    for (let i = 100; i < ARENA; i += 100) {
      if (i === 400) continue;
      frame.lineStyle(1, 0x8fb2c4, 0.09);
      frame.beginPath();
      frame.moveTo(i, 6);
      frame.lineTo(i, 14);
      frame.moveTo(i, ARENA - 6);
      frame.lineTo(i, ARENA - 14);
      frame.moveTo(6, i);
      frame.lineTo(14, i);
      frame.moveTo(ARENA - 6, i);
      frame.lineTo(ARENA - 14, i);
      frame.strokePath();
    }

    this.world.add(frame);
  }

  private addBrazier(x: number, y: number): void {
    const base = this.add.graphics();
    base.fillStyle(0x060c15, 0.9);
    base.fillEllipse(x, y + 30, 52, 18);
    base.fillStyle(0x0d1826, 1);
    base.fillRoundedRect(x - 12, y - 2, 24, 34, 3);
    base.lineStyle(1, 0x2e415a, 0.7);
    base.strokeRoundedRect(x - 12, y - 2, 24, 34, 3);
    base.fillStyle(0x173348, 1);
    base.fillEllipse(x, y, 34, 14);
    base.lineStyle(1, COLORS.cyan, 0.25);
    base.strokeEllipse(x, y, 34, 14);
    this.world.add(base);

    const glow = this.add
      .image(x, y - 4, 'glow')
      .setDisplaySize(112, 112)
      .setTint(COLORS.orange)
      .setAlpha(0.28)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.world.add(glow);

    const ember = this.add.particles(x, y - 5, 'spark', {
      speedX: { min: -8, max: 8 },
      speedY: { min: -52, max: -18 },
      lifespan: { min: 380, max: 900 },
      scale: { start: 0.62, end: 0 },
      alpha: { start: 0.75, end: 0 },
      frequency: 110,
      quantity: 1,
      tint: [COLORS.orange, COLORS.red, COLORS.yellow],
      blendMode: Phaser.BlendModes.ADD
    });
    this.world.add(ember);

    this.tweens.add({
      targets: glow,
      alpha: 0.18,
      scale: 0.92,
      duration: 780 + Math.random() * 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  private addAmbientDust(): void {
    const dust = this.add.particles(0, 0, 'spark', {
      x: { min: 55, max: ARENA - 55 },
      y: { min: 55, max: ARENA - 55 },
      speedX: { min: -6, max: 6 },
      speedY: { min: -13, max: -2 },
      lifespan: { min: 5200, max: 9800 },
      scale: { start: 0.32, end: 0 },
      alpha: { start: 0.2, end: 0 },
      frequency: 190,
      quantity: 1,
      tint: [COLORS.cyan, COLORS.purple, 0xffffff],
      blendMode: Phaser.BlendModes.ADD
    });
    this.world.add(dust);
  }

  private createPlayer(): void {
    const shadow = this.add
      .image(0, 32, 'shadow')
      .setDisplaySize(88, 30)
      .setAlpha(0.6);
    const aura = this.add
      .image(0, 3, 'glow')
      .setDisplaySize(170, 170)
      .setTint(COLORS.cyan)
      .setAlpha(0.13)
      .setBlendMode(Phaser.BlendModes.ADD);
    const sprite = this.add.image(0, -10, 'player').setDisplaySize(98, 98);

    const root = this.add.container(300, 500, [shadow, aura, sprite]);
    this.world.add(root);
    this.playerRoot = root;
    this.playerSprite = sprite;
    this.playerAura = aura;

    this.tweens.add({
      targets: sprite,
      y: -16,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    this.tweens.add({
      targets: aura,
      alpha: 0.21,
      scale: 1.06,
      duration: 2400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    const ring = this.add.graphics();
    ring.setPosition(0, 28);
    ring.lineStyle(1, COLORS.cyan, 0.2);
    for (let i = 0; i < 18; i += 2) {
      const a0 = (i / 18) * Math.PI * 2;
      ring.beginPath();
      ring.arc(0, 0, 34, a0, a0 + 0.15);
      ring.strokePath();
    }
    root.addAt(ring, 0);
    this.tweens.add({
      targets: ring,
      angle: 360,
      duration: 22000,
      repeat: -1,
      ease: 'Linear'
    });
  }

  private layout(): void {
    if (!this.world) return;
    const width = this.scale.width;
    const height = this.scale.height;
    const landscapePhone = width > height && height < 600;
    let size: number;
    let x: number;
    let y: number;

    if (landscapePhone) {
      size = Math.max(250, Math.min(width - 360, height - 16));
      x = (width - size) / 2;
      y = (height - size) / 2;
    } else {
      const narrow = width < 700;
      const margin = narrow ? 8 : 30;
      const availableW = width - margin * 2;
      const availableH = height - (narrow ? 110 : margin * 2);
      size = Math.max(260, Math.min(availableW, availableH) * (narrow ? 1 : 0.93));
      x = (width - size) / 2;
      y = (height - size) / 2;
      if (narrow && height > width) {
        y -= 48;
      }
    }

    this.world.setScale(size / ARENA);
    this.world.setPosition(x, y);
  }

  private getInputVector(): Phaser.Math.Vector2 {
    let x = 0;
    let y = 0;
    if (this.keys) {
      if (this.keys.A?.isDown || this.keys.LEFT?.isDown) x -= 1;
      if (this.keys.D?.isDown || this.keys.RIGHT?.isDown) x += 1;
      if (this.keys.W?.isDown || this.keys.UP?.isDown) y -= 1;
      if (this.keys.S?.isDown || this.keys.DOWN?.isDown) y += 1;
    }
    x += this.joystick.x;
    y += this.joystick.y;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    return new Phaser.Math.Vector2(x, y);
  }

  private tryDash(): void {
    if (this.runState !== 'playing' || this.dashCooldown > 0) return;
    const input = this.getInputVector();
    if (input.lengthSq() > 0.01) {
      this.dashDirection.copy(input).normalize();
      this.lastMove.copy(this.dashDirection);
    } else {
      this.dashDirection.copy(this.lastMove);
    }

    this.dashRemaining = DASH_DURATION;
    this.dashCooldown = DASH_COOLDOWN;
    this.invuln = Math.max(this.invuln, DASH_IFRAME);
    this.dashGhostClock = 0;
    setDash(0, this.dashCooldown);
    audio.play('dash');
    this.spawnDashBurst();
  }

  private spawnDashBurst(): void {
    const { x, y } = this.playerRoot;
    const ring = this.add
      .circle(x, y + 18, 22, 0x000000, 0)
      .setStrokeStyle(2, COLORS.cyan, 0.75)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(ring);
    this.tweens.add({
      targets: ring,
      scale: 2.8,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });

    for (let i = 0; i < 8; i += 1) {
      const shard = this.add
        .image(x + Phaser.Math.Between(-30, 30), y + Phaser.Math.Between(-10, 34), 'spark')
        .setTint(COLORS.cyan)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(Phaser.Math.FloatBetween(0.35, 0.8));
      this.addFx(shard);
      this.tweens.add({
        targets: shard,
        x: shard.x + Phaser.Math.Between(-50, 50),
        y: shard.y + Phaser.Math.Between(-30, 20),
        alpha: 0,
        scale: 0,
        duration: Phaser.Math.Between(260, 480),
        ease: 'Cubic.easeOut',
        onComplete: () => shard.destroy()
      });
    }
  }

  private spawnDashGhost(): void {
    const ghost = this.add
      .image(this.playerRoot.x, this.playerRoot.y - 10, 'player')
      .setDisplaySize(98, 98)
      .setTint(COLORS.cyan)
      .setAlpha(0.26)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(ghost);
    this.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => ghost.destroy()
    });
  }

  private updatePlayer(dt: number): void {
    const input = this.getInputVector();
    const moving = input.lengthSq() > 0.0001;
    if (moving) {
      this.lastMove.copy(input).normalize();
    }

    if (this.dashQueued || (this.keys && Phaser.Input.Keyboard.JustDown(this.keys.SPACE))) {
      this.dashQueued = false;
      this.tryDash();
    }

    let speed = PLAYER_SPEED;
    if (this.dashRemaining > 0) {
      this.dashRemaining -= dt;
      speed = PLAYER_SPEED * 3.25;
      this.dashGhostClock -= dt;
      if (this.dashGhostClock <= 0) {
        this.dashGhostClock = 0.045;
        this.spawnDashGhost();
      }
    }

    if (moving || this.dashRemaining > 0) {
      const dir = this.dashRemaining > 0 ? this.dashDirection : input;
      this.playerRoot.x += dir.x * speed * dt;
      this.playerRoot.y += dir.y * speed * dt;
      this.playerRoot.x = Phaser.Math.Clamp(this.playerRoot.x, 54, ARENA - 54);
      this.playerRoot.y = Phaser.Math.Clamp(this.playerRoot.y, 74, ARENA - 54);
    }

    if (this.playerSprite) {
      if (input.x !== 0) this.playerSprite.setFlipX(input.x < 0);
      this.playerSprite.rotation = Phaser.Math.Linear(
        this.playerSprite.rotation,
        input.x * 0.035,
        0.14
      );
    }

    if (this.invuln > 0) {
      this.invuln = Math.max(0, this.invuln - dt);
      this.playerSprite.setAlpha(Math.floor(this.time.now * 0.02) % 2 === 0 ? 0.42 : 1);
      if (this.invuln === 0) this.playerSprite.setAlpha(1);
    }

    if (this.dashRemaining <= 0 && this.dashCooldown > 0) {
      this.dashCooldown = Math.max(0, this.dashCooldown - dt);
      setDash(1 - this.dashCooldown / DASH_COOLDOWN, this.dashCooldown);
      if (this.dashCooldown === 0) setDash(1, 0);
    }

    this.attackCd -= dt;
    if (this.attackCd <= 0) {
      const target = this.findNearestEnemy(this.playerRoot.x, this.playerRoot.y);
      if (target) {
        this.fireBolt(target);
        this.attackCd = ATTACK_INTERVAL;
      } else {
        this.attackCd = 0;
      }
    }
  }

  private findNearestEnemy(x: number, y: number, exclude?: EnemyUnit): EnemyUnit | null {
    let best: EnemyUnit | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy === exclude) continue;
      const dist = Phaser.Math.Distance.Between(x, y, enemy.root.x, enemy.root.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = enemy;
      }
    }
    return best;
  }

  private fireBolt(target: EnemyUnit): void {
    const angle = Math.atan2(target.root.y - this.playerRoot.y, target.root.x - this.playerRoot.x);
    const startX = this.playerRoot.x + Math.cos(angle) * 24;
    const startY = this.playerRoot.y - 14 + Math.sin(angle) * 24;
    const glow = this.add
      .image(0, 0, 'glow')
      .setDisplaySize(44, 44)
      .setTint(COLORS.cyan)
      .setAlpha(0.65)
      .setBlendMode(Phaser.BlendModes.ADD);
    const core = this.add.circle(0, 0, 5, 0xdffcff, 1).setBlendMode(Phaser.BlendModes.ADD);
    const root = this.add.container(startX, startY, [glow, core]);
    this.addFx(root);
    this.bolts.push({
      root,
      target,
      damage: BASE_DAMAGE,
      speed: BOLT_SPEED,
      radius: 7,
      life: 1.7,
      dead: false
    });

    const muzzle = this.add
      .image(startX, startY, 'glow')
      .setDisplaySize(30, 30)
      .setTint(COLORS.cyan)
      .setAlpha(0.55)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(muzzle);
    this.tweens.add({
      targets: muzzle,
      alpha: 0,
      scale: 1.6,
      duration: 140,
      onComplete: () => muzzle.destroy()
    });
    audio.play('shoot');
  }

  private updateBolts(dt: number): void {
    for (const bolt of this.bolts) {
      if (bolt.dead) continue;
      bolt.life -= dt;
      if (bolt.life <= 0) {
        bolt.dead = true;
        bolt.root.destroy(true);
        continue;
      }
      if (bolt.target && (bolt.target.dead || !bolt.target.root.active)) {
        bolt.target = this.findNearestEnemy(bolt.root.x, bolt.root.y);
      }
      if (!bolt.target) {
        const angle = Math.atan2(bolt.root.y - this.playerRoot.y, bolt.root.x - this.playerRoot.x);
        bolt.root.x += Math.cos(angle) * bolt.speed * dt;
        bolt.root.y += Math.sin(angle) * bolt.speed * dt;
        continue;
      }
      const angle = Math.atan2(bolt.target.root.y - bolt.root.y, bolt.target.root.x - bolt.root.x);
      bolt.root.x += Math.cos(angle) * bolt.speed * dt;
      bolt.root.y += Math.sin(angle) * bolt.speed * dt;

      let hit: EnemyUnit | null = null;
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        const dist = Phaser.Math.Distance.Between(bolt.root.x, bolt.root.y, enemy.root.x, enemy.root.y);
        if (dist <= enemy.radius + bolt.radius) {
          hit = enemy;
          break;
        }
      }
      if (hit) {
        bolt.dead = true;
        bolt.root.destroy(true);
        this.hitEnemyWithBolt(hit, bolt.damage);
      }
      if (bolt.root.x < -40 || bolt.root.x > ARENA + 40 || bolt.root.y < -40 || bolt.root.y > ARENA + 40) {
        bolt.dead = true;
        bolt.root.destroy(true);
      }
    }
    this.bolts = this.bolts.filter((bolt) => !bolt.dead);
  }

  private hitEnemyWithBolt(enemy: EnemyUnit, damage: number): void {
    this.applyDamage(enemy, damage, true);

    if (this.rules.blast) {
      this.explodeAt(enemy.root.x, enemy.root.y - 10, enemy);
    }

    if (!this.rules.chain) return;
    const hitIds = new Set<EnemyUnit>([enemy]);
    let fromX = enemy.root.x;
    let fromY = enemy.root.y - 10;
    const candidates = this.enemies
      .filter((candidate) => !candidate.dead && candidate !== enemy)
      .map((candidate) => ({
        enemy: candidate,
        dist: Phaser.Math.Distance.Between(fromX, fromY, candidate.root.x, candidate.root.y)
      }))
      .filter((candidate) => candidate.dist <= CHAIN_RADIUS)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 2);

    candidates.forEach((candidate, index) => {
      const target = candidate.enemy;
      this.time.delayedCall(70 + index * 70, () => {
        if (this.runState !== 'playing' || target.dead || !target.root.active) return;
        this.drawLightning(fromX, fromY, target.root.x, target.root.y - 10);
        fromX = target.root.x;
        fromY = target.root.y - 10;
        if (hitIds.has(target)) return;
        hitIds.add(target);
        this.applyDamage(target, CHAIN_DAMAGE, true);
        if (this.rules.blast) {
          this.explodeAt(target.root.x, target.root.y - 10, target);
        }
      });
    });
  }

  private explodeAt(x: number, y: number, source: EnemyUnit): void {
    this.spawnExplosion(x, y);
    audio.play('explosion');
    this.cameras.main.shake(70, 0.0012);
    for (const enemy of [...this.enemies]) {
      if (enemy.dead || enemy === source) continue;
      const dist = Phaser.Math.Distance.Between(x, y, enemy.root.x, enemy.root.y - 10);
      if (dist <= enemy.radius + BLAST_RADIUS) {
        this.applyDamage(enemy, BLAST_DAMAGE, false);
      }
    }
  }

  private applyDamage(enemy: EnemyUnit, amount: number, direct: boolean): void {
    if (enemy.dead) return;
    enemy.hp -= amount;
    enemy.hpFill.setScale(Math.max(0, enemy.hp / enemy.maxHp), 1);
    enemy.sprite.setTintFill(0xffe6c8);
    this.time.delayedCall(44, () => {
      if (!enemy.dead) enemy.sprite.clearTint();
    });
    const x = enemy.root.x + Phaser.Math.Between(-8, 8);
    const y = enemy.root.y - (enemy.kind === 'bat' ? 44 : 58);
    this.spawnDamageNumber(x, y, String(Math.round(amount)), direct ? '#ffe399' : '#ffb078');
    audio.play('hit');
    if (direct) {
      this.spawnHitSpark(enemy.root.x, enemy.root.y - 10);
    }
    if (enemy.hp <= 0) {
      this.killEnemy(enemy);
    }
  }

  private killEnemy(enemy: EnemyUnit): void {
    if (enemy.dead) return;
    enemy.dead = true;
    const x = enemy.root.x;
    const y = enemy.root.y;
    this.enemies = this.enemies.filter((item) => item !== enemy);
    this.tweens.killTweensOf(enemy.root);
    this.tweens.killTweensOf(enemy.sprite);
    this.tweens.killTweensOf(enemy.aura);
    this.spawnDeathBurst(x, y - 8, enemy.kind);
    this.tweens.add({
      targets: enemy.root,
      alpha: 0,
      scale: 0.75,
      duration: 190,
      onComplete: () => enemy.root.destroy(true)
    });
    audio.play('death');
    this.kills += 1;
    setObjective(this.elapsed, RUN_DURATION, this.kills);

    if (enemy.kind === 'beetle' && !this.rules.blast && !this.shardDropped.blast) {
      this.shardDropped.blast = true;
      this.dropRuleShard('blast', x, y);
    } else if (enemy.kind === 'bat' && !this.rules.chain && !this.shardDropped.chain) {
      this.shardDropped.chain = true;
      this.dropRuleShard('chain', x, y);
    }

    if (this.kills > 0 && this.kills % 10 === 0) {
      this.dropHeal(x, y);
    }
  }

  private dropRuleShard(rule: RuleKey, x: number, y: number): void {
    const isBlast = rule === 'blast';
    const color = isBlast ? COLORS.orange : COLORS.cyan;
    const glow = this.add
      .image(0, 0, 'glow')
      .setDisplaySize(70, 70)
      .setTint(color)
      .setAlpha(0.34)
      .setBlendMode(Phaser.BlendModes.ADD);
    const shard = this.add.image(0, 0, 'shard').setTint(color).setScale(1.8);
    const label = this.add
      .text(0, 24, isBlast ? '爆裂' : '弹射', {
        fontFamily: 'Noto Sans SC, sans-serif',
        fontSize: '10px',
        color: isBlast ? '#ffac68' : '#65dcf0'
      })
      .setOrigin(0.5);
    const root = this.add.container(x, y, [glow, shard, label]);
    this.addFx(root);
    this.tweens.add({
      targets: glow,
      alpha: 0.18,
      scale: 0.92,
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    this.pickups.push({ root, kind: 'rule', ruleKey: rule, age: 0, dead: false });
  }

  private dropHeal(x: number, y: number): void {
    const glow = this.add
      .image(0, 0, 'glow')
      .setDisplaySize(64, 64)
      .setTint(COLORS.green)
      .setAlpha(0.32)
      .setBlendMode(Phaser.BlendModes.ADD);
    const core = this.add.circle(0, 0, 7, COLORS.green, 0.85).setBlendMode(Phaser.BlendModes.ADD);
    const root = this.add.container(x, y, [glow, core]);
    this.addFx(root);
    this.pickups.push({ root, kind: 'heal', age: 0, dead: false });
  }

  private grantRule(rule: RuleKey): void {
    if (this.rules[rule]) return;
    this.rules[rule] = true;
    setRules(this.rules);
    audio.play('rule');
    if (rule === 'blast') {
      showRuleToast('blast', '爆裂', '有效命中点产生范围伤害');
    } else {
      showRuleToast('chain', '弹射', '命中后跳跃最多 2 个其他目标');
    }
  }

  private updatePickups(dt: number): void {
    for (const pickup of this.pickups) {
      if (pickup.dead) continue;
      pickup.age += dt;
      if (pickup.age > 0.45) {
        const angle = Math.atan2(
          this.playerRoot.y - pickup.root.y,
          this.playerRoot.x - pickup.root.x
        );
        const speed = 390;
        pickup.root.x += Math.cos(angle) * speed * dt;
        pickup.root.y += Math.sin(angle) * speed * dt;
        if (
          Phaser.Math.Distance.Between(
            pickup.root.x,
            pickup.root.y,
            this.playerRoot.x,
            this.playerRoot.y
          ) < 32
        ) {
          pickup.dead = true;
          if (pickup.kind === 'rule' && pickup.ruleKey) {
            this.grantRule(pickup.ruleKey);
          } else {
            this.hp = Math.min(PLAYER_MAX_HP, this.hp + 12);
            setHp(this.hp, PLAYER_MAX_HP);
            audio.play('pickup');
            showRuleToast('heal', '生命碎片', '恢复 12 点生命');
          }
          pickup.root.destroy(true);
        }
      }
    }
    this.pickups = this.pickups.filter((pickup) => !pickup.dead);
  }

  private spawnPortal(kind: EnemyKind, x: number, y: number): void {
    const token = this.runToken;
    const color = kind === 'beetle' ? COLORS.purple : COLORS.cyan;
    const glow = this.add
      .image(x, y, 'glow')
      .setDisplaySize(150, 150)
      .setTint(color)
      .setAlpha(0.2)
      .setBlendMode(Phaser.BlendModes.ADD);
    const ring = this.add
      .circle(x, y + 8, 32, 0x000000, 0)
      .setStrokeStyle(1.5, color, 0.55);
    const rune = this.add
      .circle(x, y + 8, 12, color, 0.16)
      .setStrokeStyle(1, color, 0.45);
    this.addFx(glow);
    this.addFx(ring);
    this.addFx(rune);
    this.tweens.add({
      targets: [ring, rune, glow],
      scale: 1.35,
      alpha: 0.05,
      duration: 520,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        ring.destroy();
        rune.destroy();
        glow.destroy();
      }
    });
    audio.play('spawn');
    this.time.delayedCall(550, () => {
      if (token !== this.runToken || this.runState !== 'playing') return;
      this.spawnEnemy(kind, x, y);
    });
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number): void {
    const isBat = kind === 'bat';
    const maxHp = isBat ? 46 : 72;
    const radius = isBat ? 24 : 34;
    const speed = isBat ? 58 : 68;
    const size = isBat ? 150 : 96;

    const shadow = this.add
      .image(0, isBat ? 22 : 31, 'shadow')
      .setDisplaySize(isBat ? 108 : 82, isBat ? 30 : 26)
      .setAlpha(isBat ? 0.38 : 0.52);
    const aura = this.add
      .image(0, isBat ? 0 : 8, 'glow')
      .setDisplaySize(isBat ? 150 : 124, isBat ? 150 : 124)
      .setTint(isBat ? COLORS.cyan : COLORS.purple)
      .setAlpha(isBat ? 0.1 : 0.08)
      .setBlendMode(Phaser.BlendModes.ADD);
    const warning = this.add.graphics();
    const sprite = this.add.image(0, isBat ? -18 : -8, kind).setDisplaySize(size, size);
    const castRing = this.add
      .circle(0, isBat ? 14 : 22, isBat ? 36 : 44, 0x000000, 0)
      .setStrokeStyle(1, isBat ? COLORS.cyan : COLORS.red, 0.22);

    const barWidth = isBat ? 44 : 52;
    const barY = isBat ? -58 : -70;
    const hpBg = this.add
      .rectangle(0, barY, barWidth, 5, 0x0a121f, 0.82)
      .setStrokeStyle(1, 0x2a3d55, 0.45);
    const hpFill = this.add
      .rectangle(-barWidth / 2, barY, barWidth, 3, isBat ? COLORS.cyan : COLORS.red, 0.9)
      .setOrigin(0, 0.5);

    castRing.setVisible(false);
    const root = this.add.container(x, y, [
      shadow,
      castRing,
      warning,
      aura,
      sprite,
      hpBg,
      hpFill
    ]);
    this.enemyLayer.add(root);

    this.tweens.add({
      targets: root,
      scale: { from: 0.68, to: 1 },
      alpha: { from: 0.4, to: 1 },
      duration: 240,
      ease: 'Back.easeOut'
    });
    this.tweens.add({
      targets: sprite,
      y: isBat ? -26 : -3,
      duration: isBat ? 1700 : 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    if (isBat) {
      this.tweens.add({
        targets: sprite,
        x: 5,
        duration: 2400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    const enemy: EnemyUnit = {
      kind,
      root,
      sprite,
      shadow,
      aura,
      warning,
      castRing,
      hp: maxHp,
      maxHp,
      radius,
      speed,
      dead: false,
      state: isBat ? 'idle' : 'approach',
      stateTimer: 0,
      attackCd: isBat ? 1.2 + Math.random() * 0.8 : 0.8,
      contactCd: 0,
      chargeDir: new Phaser.Math.Vector2(1, 0),
      hasHitThisCharge: false,
      hpFill
    };

    this.enemies.push(enemy);
  }

  private chooseSpawnPosition(): { x: number; y: number } {
    const margin = 92;
    let x = margin;
    let y = margin;
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const side = Phaser.Math.Between(0, 3);
      if (side === 0) {
        x = Phaser.Math.Between(margin, ARENA - margin);
        y = margin;
      } else if (side === 1) {
        x = ARENA - margin;
        y = Phaser.Math.Between(margin, ARENA - margin);
      } else if (side === 2) {
        x = Phaser.Math.Between(margin, ARENA - margin);
        y = ARENA - margin;
      } else {
        x = margin;
        y = Phaser.Math.Between(margin, ARENA - margin);
      }
      const distToPlayer = Phaser.Math.Distance.Between(x, y, this.playerRoot.x, this.playerRoot.y);
      if (distToPlayer > 220) return { x, y };
    }
    return { x, y };
  }

  private updateEnemies(dt: number): void {
    const current = [...this.enemies];
    for (const enemy of current) {
      if (enemy.dead) continue;
      enemy.contactCd = Math.max(0, enemy.contactCd - dt);
      if (enemy.kind === 'beetle') {
        this.updateBeetle(enemy, dt);
      } else {
        this.updateBat(enemy, dt);
      }
      enemy.root.x = Phaser.Math.Clamp(enemy.root.x, 58, ARENA - 58);
      enemy.root.y = Phaser.Math.Clamp(enemy.root.y, 78, ARENA - 58);
    }

    for (let i = 0; i < current.length; i += 1) {
      const a = current[i];
      if (a.dead) continue;
      for (let j = i + 1; j < current.length; j += 1) {
        const b = current[j];
        if (b.dead) continue;
        const dx = b.root.x - a.root.x;
        const dy = b.root.y - a.root.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius + 4;
        if (dist > 0 && dist < minDist) {
          const push = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.root.x -= nx * push;
          a.root.y -= ny * push;
          b.root.x += nx * push;
          b.root.y += ny * push;
        }
      }
    }
  }

  private updateBeetle(enemy: EnemyUnit, dt: number): void {
    const dx = this.playerRoot.x - enemy.root.x;
    const dy = this.playerRoot.y - enemy.root.y;
    const dist = Math.hypot(dx, dy);
    enemy.attackCd = Math.max(0, enemy.attackCd - dt);

    if (enemy.state === 'approach') {
      if (dist > 4) {
        enemy.root.x += (dx / dist) * enemy.speed * dt;
        enemy.root.y += (dy / dist) * enemy.speed * dt;
      }
      if (dist < 360 && enemy.attackCd <= 0) {
        enemy.state = 'telegraph';
        enemy.stateTimer = 0.82;
        enemy.chargeDir.set(dx / (dist || 1), dy / (dist || 1));
        enemy.warning.setVisible(true);
        this.drawBeetleWarning(enemy);
      }
    } else if (enemy.state === 'telegraph') {
      enemy.stateTimer -= dt;
      this.drawBeetleWarning(enemy);
      if (enemy.stateTimer <= 0) {
        enemy.state = 'charge';
        enemy.stateTimer = 0.38;
        enemy.hasHitThisCharge = false;
        enemy.warning.setVisible(false);
        audio.play('dash');
      }
    } else if (enemy.state === 'charge') {
      enemy.stateTimer -= dt;
      enemy.root.x += enemy.chargeDir.x * 520 * dt;
      enemy.root.y += enemy.chargeDir.y * 520 * dt;
      if (enemy.root.x <= 64 || enemy.root.x >= ARENA - 64 || enemy.root.y <= 84 || enemy.root.y >= ARENA - 64) {
        enemy.state = 'recover';
        enemy.stateTimer = 1.0;
      } else if (enemy.stateTimer <= 0) {
        enemy.state = 'recover';
        enemy.stateTimer = 0.95;
      }
      if (!enemy.hasHitThisCharge && dist < enemy.radius + PLAYER_RADIUS + 8) {
        enemy.hasHitThisCharge = true;
        this.hurtPlayer(12, enemy.root.x, enemy.root.y);
      }
    } else if (enemy.state === 'recover') {
      enemy.stateTimer -= dt;
      if (enemy.stateTimer <= 0) {
        enemy.state = 'approach';
        enemy.attackCd = 1.0;
      }
    }

    if (enemy.state !== 'charge' && enemy.contactCd <= 0 && dist < enemy.radius + PLAYER_RADIUS) {
      enemy.contactCd = 0.9;
      this.hurtPlayer(6, enemy.root.x, enemy.root.y);
    }
  }

  private drawBeetleWarning(enemy: EnemyUnit): void {
    const g = enemy.warning;
    g.clear();
    const angle = Math.atan2(enemy.chargeDir.y, enemy.chargeDir.x);
    const reach = 220;
    const spread = 0.2;
    g.fillStyle(COLORS.red, 0.045);
    g.fillTriangle(
      0,
      0,
      Math.cos(angle - spread) * reach,
      Math.sin(angle - spread) * reach,
      Math.cos(angle + spread) * reach,
      Math.sin(angle + spread) * reach
    );
    g.lineStyle(1.5, COLORS.red, 0.32);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(angle - spread) * reach, Math.sin(angle - spread) * reach);
    g.moveTo(0, 0);
    g.lineTo(Math.cos(angle + spread) * reach, Math.sin(angle + spread) * reach);
    g.strokePath();
    for (let d = 28; d < reach; d += 24) {
      const t = d / reach;
      const x = Math.cos(angle) * d;
      const y = Math.sin(angle) * d;
      g.lineStyle(1, COLORS.red, 0.24 * (1 - t));
      g.beginPath();
      g.moveTo(x - Math.sin(angle) * 4, y + Math.cos(angle) * 4);
      g.lineTo(x + Math.sin(angle) * 4, y - Math.cos(angle) * 4);
      g.strokePath();
    }
  }

  private updateBat(enemy: EnemyUnit, dt: number): void {
    const dx = this.playerRoot.x - enemy.root.x;
    const dy = this.playerRoot.y - enemy.root.y;
    const dist = Math.hypot(dx, dy) || 1;
    enemy.attackCd = Math.max(0, enemy.attackCd - dt);

    if (enemy.state === 'cast') {
      enemy.stateTimer -= dt;
      enemy.castRing.setVisible(true);
      enemy.castRing.setScale(1 + Math.sin(this.time.now * 0.02) * 0.08);
      if (enemy.stateTimer <= 0) {
        enemy.state = 'idle';
        enemy.castRing.setVisible(false);
        enemy.sprite.clearTint();
        this.fireEnemyBolt(enemy);
        enemy.attackCd = 2.1 + Math.random() * 0.7;
      }
    } else {
      if (dist < 205) {
        enemy.root.x -= (dx / dist) * enemy.speed * dt;
        enemy.root.y -= (dy / dist) * enemy.speed * dt;
      } else if (dist > 330) {
        enemy.root.x += (dx / dist) * enemy.speed * dt;
        enemy.root.y += (dy / dist) * enemy.speed * dt;
      } else {
        const strafe = Math.sin(this.time.now * 0.0015 + enemy.root.x) > 0 ? 1 : -1;
        enemy.root.x += (-dy / dist) * enemy.speed * 0.65 * dt * strafe;
        enemy.root.y += (dx / dist) * enemy.speed * 0.65 * dt * strafe;
      }
      if (enemy.attackCd <= 0 && dist < 520) {
        enemy.state = 'cast';
        enemy.stateTimer = 0.55;
        enemy.sprite.setTint(0x9defff);
        enemy.castRing.setVisible(true);
        audio.play('spawn');
      }
    }

    if (enemy.state !== 'cast' && enemy.contactCd <= 0 && dist < enemy.radius + PLAYER_RADIUS) {
      enemy.contactCd = 0.9;
      this.hurtPlayer(4, enemy.root.x, enemy.root.y);
    }
  }

  private fireEnemyBolt(enemy: EnemyUnit): void {
    const angle = Math.atan2(
      this.playerRoot.y - enemy.root.y,
      this.playerRoot.x - enemy.root.x
    );
    const glow = this.add
      .image(0, 0, 'glow')
      .setDisplaySize(36, 36)
      .setTint(COLORS.cyan)
      .setAlpha(0.65)
      .setBlendMode(Phaser.BlendModes.ADD);
    const core = this.add.circle(0, 0, 6, 0xd7fbff, 1).setBlendMode(Phaser.BlendModes.ADD);
    const root = this.add.container(enemy.root.x, enemy.root.y - 12, [glow, core]);
    this.addFx(root);
    this.enemyBolts.push({
      root,
      vx: Math.cos(angle) * 215,
      vy: Math.sin(angle) * 215,
      damage: 8,
      radius: 10,
      life: 4,
      dead: false
    });
    audio.play('spawn');
  }

  private updateEnemyBolts(dt: number): void {
    for (const bolt of this.enemyBolts) {
      if (bolt.dead) continue;
      bolt.life -= dt;
      bolt.root.x += bolt.vx * dt;
      bolt.root.y += bolt.vy * dt;
      if (bolt.life <= 0 || bolt.root.x < -30 || bolt.root.x > ARENA + 30 || bolt.root.y < -30 || bolt.root.y > ARENA + 30) {
        bolt.dead = true;
        bolt.root.destroy(true);
        continue;
      }
      if (
        Phaser.Math.Distance.Between(
          bolt.root.x,
          bolt.root.y,
          this.playerRoot.x,
          this.playerRoot.y - 10
        ) < bolt.radius + PLAYER_RADIUS
      ) {
        const hitX = bolt.root.x;
        const hitY = bolt.root.y;
        bolt.dead = true;
        bolt.root.destroy(true);
        this.hurtPlayer(bolt.damage, hitX, hitY);
      }
    }
    this.enemyBolts = this.enemyBolts.filter((bolt) => !bolt.dead);
  }

  private hurtPlayer(amount: number, sourceX: number, sourceY: number): void {
    if (this.runState !== 'playing' || this.invuln > 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.invuln = 1.0;
    setHp(this.hp, PLAYER_MAX_HP);
    audio.play('hurt');
    this.cameras.main.shake(130, 0.0022);
    this.cameras.main.flash(110, 255, 55, 80);
    this.spawnDamageNumber(
      this.playerRoot.x,
      this.playerRoot.y - 62,
      `-${amount}`,
      '#ff7186'
    );
    const angle = Math.atan2(this.playerRoot.y - sourceY, this.playerRoot.x - sourceX);
    this.playerRoot.x = Phaser.Math.Clamp(
      this.playerRoot.x + Math.cos(angle) * 24,
      54,
      ARENA - 54
    );
    this.playerRoot.y = Phaser.Math.Clamp(
      this.playerRoot.y + Math.sin(angle) * 24,
      74,
      ARENA - 54
    );
    if (this.hp <= 0) {
      this.endRun(false);
    }
  }

  private updateSpawns(dt: number): void {
    this.spawnCd -= dt;
    const maxAlive = this.elapsed < 60 ? 5 : this.elapsed < 120 ? 7 : 9;
    if (this.spawnCd > 0 || this.enemies.length >= maxAlive) return;
    const kind: EnemyKind = Math.random() < 0.55 ? 'beetle' : 'bat';
    const pos = this.chooseSpawnPosition();
    this.spawnPortal(kind, pos.x, pos.y);
    this.spawnCd = this.elapsed < 60 ? 3.2 : this.elapsed < 120 ? 2.8 : 2.3;
  }

  private updateHud(dt: number): void {
    this.hudTick += dt;
    if (this.hudTick >= 0.1) {
      this.hudTick = 0;
      setTimer(this.timeLeft);
      setObjective(this.elapsed, RUN_DURATION, this.kills);
    }
  }

  private endRun(victory: boolean): void {
    if (this.runState === 'ended') return;
    this.runState = 'ended';
    this.playEnabled = false;
    this.joystick.set(0, 0);
    this.time.removeAllEvents();
    this.cameras.main.stopFollow();
    audio.play(victory ? 'victory' : 'defeat');
    if (!victory) {
      this.cameras.main.shake(360, 0.005);
      this.cameras.main.flash(260, 90, 10, 24);
    }
    this.game.events.emit('m0-run-ended', {
      victory,
      time: victory ? RUN_DURATION : this.elapsed,
      kills: this.kills,
      rules: Number(this.rules.chain) + Number(this.rules.blast)
    } satisfies RunEndPayload);
  }

  private spawnExplosion(x: number, y: number): void {
    const glow = this.add
      .image(x, y, 'glow')
      .setDisplaySize(38, 38)
      .setTint(COLORS.orange)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(glow);
    this.tweens.add({
      targets: glow,
      scale: 2.2,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => glow.destroy()
    });

    const ring = this.add
      .circle(x, y, 16, 0x000000, 0)
      .setStrokeStyle(2, COLORS.orange, 0.7)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(ring);
    this.tweens.add({
      targets: ring,
      scale: 2.0,
      alpha: 0,
      duration: 340,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });

    const core = this.add
      .image(x, y, 'glow')
      .setDisplaySize(24, 24)
      .setTint(COLORS.yellow)
      .setAlpha(0.65)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(core);
    this.tweens.add({
      targets: core,
      scale: 1.25,
      alpha: 0,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => core.destroy()
    });

    const sparks = this.add.particles(x, y, 'spark', {
      speed: { min: 55, max: 190 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 180, max: 480 },
      scale: { start: 0.78, end: 0 },
      alpha: { start: 0.78, end: 0 },
      quantity: 9,
      tint: [COLORS.orange, COLORS.yellow, COLORS.cyan],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false
    });
    this.addFx(sparks);
    sparks.explode(9);
    this.time.delayedCall(650, () => sparks.destroy());
  }

  private spawnHitSpark(x: number, y: number): void {
    const ring = this.add
      .circle(x, y, 8, 0x000000, 0)
      .setStrokeStyle(1.5, COLORS.yellow, 0.8)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(ring);
    this.tweens.add({
      targets: ring,
      scale: 2.2,
      alpha: 0,
      duration: 220,
      onComplete: () => ring.destroy()
    });
  }

  private spawnDeathBurst(x: number, y: number, kind: EnemyKind): void {
    const color = kind === 'beetle' ? COLORS.purple : COLORS.cyan;
    const glow = this.add
      .image(x, y, 'glow')
      .setDisplaySize(80, 80)
      .setTint(color)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(glow);
    this.tweens.add({
      targets: glow,
      scale: 2.1,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => glow.destroy()
    });
    const particles = this.add.particles(x, y, 'spark', {
      speed: { min: 40, max: 170 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 220, max: 620 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.85, end: 0 },
      quantity: 10,
      tint: [color, 0xffffff, COLORS.purple],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false
    });
    this.addFx(particles);
    particles.explode(10);
    this.time.delayedCall(800, () => particles.destroy());
  }

  private drawLightning(x1: number, y1: number, x2: number, y2: number): void {
    const g = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(g);
    const segments = 5;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const points: Array<{ x: number; y: number }> = [{ x: x1, y: y1 }];
    for (let i = 1; i < segments; i += 1) {
      const t = i / segments;
      const offset = Phaser.Math.FloatBetween(-10, 10);
      points.push({
        x: x1 + dx * t + nx * offset,
        y: y1 + dy * t + ny * offset
      });
    }
    points.push({ x: x2, y: y2 });

    g.lineStyle(10, COLORS.cyan, 0.09);
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) g.lineTo(points[i].x, points[i].y);
    g.strokePath();

    g.lineStyle(2.4, COLORS.cyan, 0.95);
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) g.lineTo(points[i].x, points[i].y);
    g.strokePath();

    g.lineStyle(1, COLORS.purple, 0.65);
    g.beginPath();
    g.moveTo(points[0].x + 2, points[0].y - 2);
    for (let i = 1; i < points.length; i += 1) g.lineTo(points[i].x + 2, points[i].y - 2);
    g.strokePath();

    for (let i = 1; i < points.length - 1; i += 1) {
      const spark = this.add
        .circle(points[i].x, points[i].y, 2.2, COLORS.cyan, 0.9)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.addFx(spark);
      this.tweens.add({
        targets: spark,
        alpha: 0,
        scale: 0,
        duration: 180,
        onComplete: () => spark.destroy()
      });
    }

    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 360,
      ease: 'Cubic.easeOut',
      onComplete: () => g.destroy()
    });
  }

  private spawnDamageNumber(x: number, y: number, text: string, color: string): void {
    const label = this.add
      .text(x, y, text, {
        fontFamily: 'Bahnschrift, "Noto Sans SC", sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
        color,
        stroke: '#160c07',
        strokeThickness: 4
      })
      .setOrigin(0.5)
      .setAlpha(0.95);
    this.addFx(label);
    this.tweens.add({
      targets: label,
      y: y - 40,
      alpha: 0,
      scale: 0.86,
      duration: 650,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy()
    });
  }

  private addFx(obj: Phaser.GameObjects.GameObject): void {
    if (!this.fxLayer) return;
    this.fxLayer.add(obj);
  }

  update(_time: number, deltaMs: number): void {
    if (this.runState !== 'playing') return;
    const dt = Math.min(deltaMs, 50) / 1000;
    this.elapsed = Math.min(RUN_DURATION, this.elapsed + dt);
    this.timeLeft = Math.max(0, RUN_DURATION - this.elapsed);

    this.updatePlayer(dt);
    if (this.runState !== 'playing') return;
    this.updateEnemies(dt);
    if (this.runState !== 'playing') return;
    this.updateBolts(dt);
    this.updateEnemyBolts(dt);
    this.updatePickups(dt);
    this.updateSpawns(dt);
    this.updateHud(dt);

    if (this.timeLeft <= 0) {
      this.endRun(true);
    }
  }
}
