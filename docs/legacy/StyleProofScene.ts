import Phaser from 'phaser';
import { ARENA, ASSETS, COLORS } from './theme';
import { setDash, setHp, setRoom, setTimer } from '../ui/hud';

type EnemyKind = 'beetle' | 'bat';

interface EnemyUnit {
  kind: EnemyKind;
  root: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
}

export class StyleProofScene extends Phaser.Scene {
  private world!: Phaser.GameObjects.Container;
  private playerRoot!: Phaser.GameObjects.Container;
  private playerSprite!: Phaser.GameObjects.Image;
  private playerAura!: Phaser.GameObjects.Image;
  private enemies: EnemyUnit[] = [];

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private joystick = new Phaser.Math.Vector2();
  private lastMove = new Phaser.Math.Vector2(1, 0);
  private dashDirection = new Phaser.Math.Vector2(1, 0);
  private dashRemaining = 0;
  private dashCooldown = 0;
  private readonly dashCooldownTotal = 4;
  private dashGhostClock = 0;
  private dashQueued = false;

  private elapsed = 222;
  private playEnabled = false;
  private dangerGfx!: Phaser.GameObjects.Graphics;
  private attackCount = 0;

  private readonly onJoystickEvent = (event: Event): void => {
    const detail = (event as CustomEvent<{ x: number; y: number }>).detail;
    this.joystick.set(detail.x, detail.y);
  };

  private readonly onDashEvent = (): void => {
    this.tryDash();
  };

  constructor() {
    super('StyleProof');
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

    this.dangerGfx = this.add.graphics();
    this.world.add(this.dangerGfx);

    this.createEnemy('beetle', 590, 402);
    this.createEnemy('bat', 664, 286);
    this.createEnemy('bat', 614, 574);
    this.createPlayer();

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

    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        this.elapsed += 1;
        setTimer(this.elapsed);
      }
    });

    this.time.addEvent({
      delay: 1580,
      loop: true,
      startAt: 900,
      callback: () => this.fireAttack()
    });

    window.addEventListener('rt-input', this.onJoystickEvent);
    window.addEventListener('rt-dash', this.onDashEvent);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('rt-input', this.onJoystickEvent);
      window.removeEventListener('rt-dash', this.onDashEvent);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });

    setHp(82, 100);
    setDash(1, 0);
    setTimer(this.elapsed);
    setRoom(4, 13);
    this.input.setTopOnly(true);

    this.game.events.emit('style-proof-ready');
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

  public fireAttackNow(): void {
    this.fireAttack();
  }

  public debugPoseChain(): void {
    this.setPlayEnabled(true);
    this.resumeGame();
    const targets = this.enemies;
    if (!targets.length) return;

    const points = targets.map((target) => ({
      x: target.root.x,
      y: target.root.y - 18
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
      this.spawnDamageNumber(
        target.root.x + Phaser.Math.Between(-8, 8),
        target.root.y - 54,
        String(18 + index * 3),
        index === 1 ? '#65dcf0' : '#ffe399'
      );
      this.spawnPoseBlast(target.root.x, target.root.y - 18, index);
    });

    this.scene.pause();
  }

  private spawnPoseBlast(x: number, y: number, index: number): void {
    const color = index === 1 ? COLORS.cyan : COLORS.orange;
    const outer = this.add
      .circle(x, y, 30, 0x000000, 0)
      .setStrokeStyle(2, color, 0.78)
      .setBlendMode(Phaser.BlendModes.ADD);
    const inner = this.add
      .circle(x, y, 14, 0x000000, 0)
      .setStrokeStyle(1.5, COLORS.yellow, 0.9)
      .setBlendMode(Phaser.BlendModes.ADD);
    const glow = this.add
      .image(x, y, 'glow')
      .setDisplaySize(132, 132)
      .setTint(color)
      .setAlpha(0.3)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.world.add([glow, outer, inner]);

    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2 + index * 0.3;
      const radius = 22 + (i % 3) * 12;
      const spark = this.add
        .image(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 'spark')
        .setTint(i % 2 === 0 ? color : COLORS.yellow)
        .setScale(0.5 + (i % 3) * 0.18)
        .setAlpha(0.75)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.world.add(spark);
    }
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

    if (!this.textures.exists('arena-vignette')) {
      const tex = this.textures.createCanvas('arena-vignette', 512, 512);
      if (tex) {
        const ctx = tex.getContext();
        const grad = ctx.createRadialGradient(256, 256, 150, 256, 256, 360);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.72, 'rgba(0,0,0,0.16)');
        grad.addColorStop(1, 'rgba(0,0,0,0.62)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 512);
        tex.refresh();
      }
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
      .setAlpha(0.13)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.world.add(glow);

    const boss = this.add
      .image(ARENA / 2, 166, 'boss')
      .setDisplaySize(292, 292)
      .setAlpha(0.24)
      .setTint(0xc9b6ff);
    this.world.add(boss);

    this.tweens.add({
      targets: boss,
      y: 158,
      alpha: 0.19,
      duration: 3400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    this.tweens.add({
      targets: glow,
      alpha: 0.08,
      scale: 1.08,
      duration: 4400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    const seal = this.add.graphics();
    seal.setPosition(ARENA / 2, 166);
    seal.lineStyle(1, COLORS.purple, 0.13);
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

  private createEnemy(kind: EnemyKind, x: number, y: number): void {
    const isBat = kind === 'bat';
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
    const sprite = this.add.image(0, isBat ? -18 : -8, kind).setDisplaySize(size, size);

    const root = this.add.container(x, y, [shadow, aura, sprite]);
    this.world.add(root);

    if (isBat) {
      const ring = this.add
        .circle(0, 18, 40, 0x000000, 0)
        .setStrokeStyle(1, COLORS.cyan, 0.18);
      root.addAt(ring, 1);
      this.tweens.add({
        targets: ring,
        scale: 1.16,
        alpha: 0.55,
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      this.tweens.add({
        targets: sprite,
        y: -26,
        duration: 1900 + (x % 300),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      this.tweens.add({
        targets: sprite,
        x: isBat && x > 600 ? 6 : -4,
        duration: 2600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      this.tweens.add({
        targets: root,
        y: y - 12,
        duration: 3200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    } else {
      const warning = this.add
        .circle(0, 24, 48, 0x000000, 0)
        .setStrokeStyle(1.5, COLORS.red, 0.42);
      root.addAt(warning, 1);
      this.tweens.add({
        targets: warning,
        scale: 1.12,
        alpha: 0.4,
        duration: 920,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      const mark = this.add
        .text(0, -70, '!', {
          fontFamily: 'Bahnschrift, sans-serif',
          fontSize: '22px',
          color: '#ff7186',
          stroke: '#20090f',
          strokeThickness: 4
        })
        .setOrigin(0.5);
      root.add(mark);
      this.tweens.add({
        targets: mark,
        y: -78,
        alpha: 0.55,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      this.tweens.add({
        targets: sprite,
        y: -3,
        duration: 1300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    this.enemies.push({ kind, root, sprite });
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
    if (!this.playEnabled || this.dashCooldown > 0) return;
    const input = this.getInputVector();
    if (input.lengthSq() > 0.01) {
      this.dashDirection.copy(input).normalize();
      this.lastMove.copy(this.dashDirection);
    } else {
      this.dashDirection.copy(this.lastMove);
    }

    this.dashRemaining = 0.18;
    this.dashCooldown = this.dashCooldownTotal;
    this.dashGhostClock = 0;
    setDash(0, this.dashCooldown);
    this.spawnDashBurst();
  }

  private spawnDashBurst(): void {
    const { x, y } = this.playerRoot;
    const ring = this.add
      .circle(x, y + 18, 22, 0x000000, 0)
      .setStrokeStyle(2, COLORS.cyan, 0.75)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.world.add(ring);
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
      this.world.add(shard);
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
    this.world.add(ghost);
    this.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => ghost.destroy()
    });
  }

  private fireAttack(): void {
    const targets = this.enemies.filter((enemy) => enemy.sprite.active);
    if (!targets.length) return;
    const first = targets[0];
    const orb = this.add
      .circle(this.playerRoot.x + 22, this.playerRoot.y - 22, 6, COLORS.cyan, 1)
      .setBlendMode(Phaser.BlendModes.ADD);
    const orbGlow = this.add
      .image(orb.x, orb.y, 'glow')
      .setDisplaySize(38, 38)
      .setTint(COLORS.cyan)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.world.add([orbGlow, orb]);

    this.tweens.add({
      targets: [orb, orbGlow],
      x: first.root.x,
      y: first.root.y - 16,
      duration: 150,
      ease: 'Sine.easeIn',
      onComplete: () => {
        orb.destroy();
        orbGlow.destroy();
        this.resolveChain(targets);
      }
    });
  }

  private resolveChain(targets: EnemyUnit[]): void {
    this.attackCount += 1;
    let previous: EnemyUnit | null = null;

    targets.forEach((target, index) => {
      this.time.delayedCall(index * 85, () => {
        if (!target.sprite.active) return;
        if (previous) {
          this.drawLightning(
            previous.root.x,
            previous.root.y - 18,
            target.root.x,
            target.root.y - 18
          );
        }
        this.impact(target);
        previous = target;
      });
    });

    this.time.delayedCall(70, () => {
      this.cameras.main.shake(110, 0.0018);
    });
  }

  private impact(target: EnemyUnit): void {
    const x = target.root.x;
    const y = target.root.y - 18;
    const direct = Phaser.Math.Between(17, 24) + (this.attackCount % 10 === 0 ? 9 : 0);
    target.sprite.setTintFill(0xffe6c8);
    this.time.delayedCall(42, () => target.sprite.clearTint());

    this.spawnDamageNumber(x + Phaser.Math.Between(-10, 10), y - 26, String(direct), '#ffe399');
    this.spawnExplosion(x, y);
  }

  private spawnDamageNumber(x: number, y: number, text: string, color: string): void {
    const label = this.add
      .text(x, y, text, {
        fontFamily: 'Bahnschrift, "Noto Sans SC", sans-serif',
        fontSize: '23px',
        fontStyle: 'bold',
        color,
        stroke: '#160c07',
        strokeThickness: 4
      })
      .setOrigin(0.5)
      .setAlpha(0.95);
    this.world.add(label);
    this.tweens.add({
      targets: label,
      y: y - 42,
      alpha: 0,
      scale: 0.86,
      duration: 680,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy()
    });
  }

  private spawnExplosion(x: number, y: number): void {
    const glow = this.add
      .image(x, y, 'glow')
      .setDisplaySize(38, 38)
      .setTint(COLORS.orange)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.world.add(glow);
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
    this.world.add(ring);
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
    this.world.add(core);
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
    this.world.add(sparks);
    sparks.explode(9);
    this.time.delayedCall(650, () => sparks.destroy());
  }

  private drawLightning(x1: number, y1: number, x2: number, y2: number): void {
    const g = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.world.add(g);

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
      this.world.add(spark);
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
      duration: 430,
      ease: 'Cubic.easeOut',
      onComplete: () => g.destroy()
    });
  }

  private updateDanger(): void {
    if (!this.dangerGfx) return;
    const beetle = this.enemies.find((enemy) => enemy.kind === 'beetle');
    if (!beetle) return;

    const g = this.dangerGfx;
    g.clear();

    const bx = beetle.root.x;
    const by = beetle.root.y;
    const px = this.playerRoot.x;
    const py = this.playerRoot.y;
    const angle = Math.atan2(py - by, px - bx);
    const spread = 0.2;
    const reach = 205;
    const leftX = bx + Math.cos(angle - spread) * reach;
    const leftY = by + Math.sin(angle - spread) * reach;
    const rightX = bx + Math.cos(angle + spread) * reach;
    const rightY = by + Math.sin(angle + spread) * reach;

    g.fillStyle(COLORS.red, 0.035);
    g.fillTriangle(bx, by, leftX, leftY, rightX, rightY);
    g.lineStyle(1, COLORS.red, 0.2);
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(leftX, leftY);
    g.moveTo(bx, by);
    g.lineTo(rightX, rightY);
    g.strokePath();

    for (let d = 28; d < reach; d += 24) {
      const t = d / reach;
      const x = bx + Math.cos(angle) * d;
      const y = by + Math.sin(angle) * d;
      g.lineStyle(1, COLORS.red, 0.12 * (1 - t));
      g.beginPath();
      g.moveTo(x - Math.sin(angle) * 4, y + Math.cos(angle) * 4);
      g.lineTo(x + Math.sin(angle) * 4, y - Math.cos(angle) * 4);
      g.strokePath();
    }

    const t = (this.time.now % 1600) / 1600;
    g.lineStyle(1.5, COLORS.red, 0.32 * (1 - t));
    g.strokeCircle(bx, by + 18, 48 + t * 22);

    for (let i = 0; i < 12; i += 1) {
      const a0 = (i / 12) * Math.PI * 2 + this.time.now * 0.0004;
      g.lineStyle(1.3, COLORS.red, 0.33);
      g.beginPath();
      g.arc(bx, by + 18, 48, a0, a0 + 0.18);
      g.strokePath();
    }
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.updateDanger();

    if (!this.playEnabled) {
      return;
    }

    const input = this.getInputVector();
    const moving = input.lengthSq() > 0.0001;
    if (moving) {
      this.lastMove.copy(input).normalize();
    }

    if (this.dashQueued || (this.keys && Phaser.Input.Keyboard.JustDown(this.keys.SPACE))) {
      this.dashQueued = false;
      this.tryDash();
    }

    let speed = 185;
    if (this.dashRemaining > 0) {
      this.dashRemaining -= dt;
      speed = 185 * 3.25;
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
      if (input.x !== 0) {
        this.playerSprite.setFlipX(input.x < 0);
      }
      const targetRotation = input.x * 0.035;
      this.playerSprite.rotation = Phaser.Math.Linear(
        this.playerSprite.rotation,
        targetRotation,
        0.14
      );
    }

    if (this.dashRemaining <= 0 && this.dashCooldown > 0) {
      this.dashCooldown = Math.max(0, this.dashCooldown - dt);
      const progress = 1 - this.dashCooldown / this.dashCooldownTotal;
      setDash(progress, this.dashCooldown);
      if (this.dashCooldown === 0) {
        setDash(1, 0);
      }
    }
  }
}
