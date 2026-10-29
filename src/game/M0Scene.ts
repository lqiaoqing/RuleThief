import Phaser from 'phaser';
import { ARENA, ASSETS, COLORS, formatTime } from './theme';
import {
  resetM0Hud,
  setBossBar,
  setBuild,
  setDash,
  setHp,
  setMutation,
  setLate,
  setRelics,
  setKillStreak,
  setRoomEnemies,
  setRoomProgress,
  setRunClock,
  setSealedRule,
  setWaveStatus,
  showRuleToast,
  showWaveBanner
} from '../ui/hud';
import { audio } from './audio';
import {
  applyRuleOffer,
  ascendRule,
  buildLevelSum,
  createEmptyBuild,
  getBuildCombo,
  getImpactProfile,
  getRuleDef,
  getSpreadAngles,
  getTrajectoryProfile,
  isImpactKey,
  isTrajectoryKey,
  mergeBurn,
  mergeFrost,
  reforgeRule,
  reforgeSlot,
  selectChainTargets,
  TriggerBudget,
  type ChainCandidate,
  type ImpactKey,
  type ImpactProfile,
  type PlayerBuild,
  type RuleKey,
  type RuleLevel,
  type RuleOffer,
  type RuleSlot,
  type TrajectoryKey,
  type TrajectoryProfile
} from './rules';
import { RELICS, MAX_RELICS, RELIC_IDS, type RelicId } from './relics';
import { ASCENSION_IDS, getAscensionForRule, type AscensionId } from './ascensions';
import {
  LATE_UPGRADES,
  MAX_LATE_UPGRADES,
  lateUpgradeEligible,
  pickResonance,
  type LateUpgradeId
} from './lateUpgrades';
import { getMutator, clampMutator } from './mutators';
import { getWorldTheme } from './worldTheme';
import { updateArbiter as updateArbiterBoss, type ArbiterHost } from './bosses/arbiter';
import {
  summonCoreAdds,
  updateCore as updateCoreBoss,
  type CoreBossEnemy,
  type CoreHost
} from './bosses/core';
import {
  summonSourceAdds,
  updateSource as updateSourceBoss,
  type SourceHost
} from './bosses/source';
import { ROOMS, buildChapterRewards, buildRoomRewards, pickSpawnKind, getRoomEnemyKinds, ENEMY_SPECS, MAX_REFORGES, type CoverDef, type EnemyKind, type ReforgeOffer, type Reward, type RoomDef, type SupportId } from './rooms';
import { WaveDirector, buildWavePlan } from './waves';
import { EVENTS, CHAPTERS, buildChapterPlan, eventOptionsFor, hasUpgradeableRule, type ChapterDef, type Encounter, type EventDef, type EventEffect, type EventId, type RunStep } from './run';
import { combatBetween, combatInt, combatRandom, random, resetRandomStreams } from './rng';
import {
  MUTATIONS,
  createMutationState,
  consumeOverload,
  equipMutation,
  getAttackIntervalMultiplier,
  getDamageMultiplier,
  getOverloadProgress,
  registerHit,
  tickMutation,
  triggerDashfire,
  type MutationId,
  type MutationState
} from './mutations';

type RunState = 'idle' | 'playing' | 'chapter' | 'ended';
type RoomState = 'preview' | 'fighting' | 'reward' | 'route' | 'event';
type DamageSource = 'melee' | 'charge' | 'bolt' | 'hazard' | 'explosion' | 'other';
const DAMAGE_SOURCES: DamageSource[] = ['melee', 'charge', 'bolt', 'hazard', 'explosion', 'other'];
const DAMAGE_LABELS: Record<DamageSource, string> = {
  melee: '近身接触',
  charge: '冲锋',
  bolt: '敌弹',
  hazard: '火焰地面',
  explosion: '自爆',
  other: '其他'
};
type EnemyState = 'approach' | 'telegraph' | 'charge' | 'recover' | 'idle' | 'cast';

interface EnemyUnit {
  id: number;
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
  burnTime: number;
  burnDps: number;
  burnTick: number;
  frostTime: number;
  frostSlow: number;
  shieldTime: number;
  elite: boolean;
  chargesLeft: number;
  trailCd: number;
  countsTowardQuota: boolean;
  knockX: number;
  knockY: number;
  knockTime: number;
}

interface PlayerBolt {
  root: Phaser.GameObjects.Container;
  mode: 'homing' | 'pierce' | 'spread';
  target: EnemyUnit | null;
  direction: Phaser.Math.Vector2;
  damage: number;
  speed: number;
  radius: number;
  life: number;
  distance: number;
  maxDistance: number;
  maxHits: number;
  hitEnemies: Set<EnemyUnit>;
  budget: TriggerBudget;
  impact: PlayerBuild['impact'];
  extraImpact: PlayerBuild['impact'];
  extraBudget: TriggerBudget | null;
  power: number;
  pierceHits: number;
  chainJumps: number;
  chainRange: number;
  chainMultiplier: number;
  dead: boolean;
}

interface EnemyBolt {
  root: Phaser.GameObjects.Container;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  life: number;
  slowFactor: number;
  slowDuration: number;
  dead: boolean;
}

interface Hazard {
  root: Phaser.GameObjects.Container;
  kind: 'fire' | 'shock';
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  armTime: number;
  damage: number;
  triggered: boolean;
  dead: boolean;
}

interface Pickup {
  root: Phaser.GameObjects.Container;
  age: number;
  dead: boolean;
}

interface SlowField {
  root: Phaser.GameObjects.Container;
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  tick: number;
  dead: boolean;
}

export interface RunEndPayload {
  victory: boolean;
  stageOnly: boolean;
  time: number;
  kills: number;
  killStreakBest: number;
  overloads: number;
  novas: number;
  rules: number;
  combo: string;
  levelSum: number;
  roomsCleared: number;
  roomsTotal: number;
  chapterIndex: number;
  chaptersTotal: number;
  startChapter: number;
  chapterName: string;
  worldTheme: string;
  worldThemeName: string;
  mutatorLevel: number;
  mutatorName: string;
  mutation: string | null;
  relics: string[];
  ascensions: string[];
  lateUpgrades: string[];
  rulesSeen: RuleKey[];
  rulesAscended: RuleKey[];
  build: PlayerBuild;
  maxHp: number;
  damage: { source: string; label: string; amount: number }[];
}

export interface ChapterClearPayload {
  chapterIndex: number;
  chaptersTotal: number;
  chapterName: string;
  chapterEn: string;
  nextName: string;
  nextEn: string;
  hp: number;
  maxHp: number;
  kills: number;
  elapsed: number;
  levelSum: number;
  combo: string;
}

const PLAYER_MAX_HP = 100;
const PLAYER_SPEED = 185;
const PLAYER_RADIUS = 22;
const ATTACK_INTERVAL = 0.65;
const BASE_DAMAGE = 14;
const DASH_COOLDOWN = 4;
const DASH_MIN_COOLDOWN = 1.5;
const DASH_DURATION = 0.18;
const DASH_IFRAME = 0.3;
const BOLT_SPEED = 620;
const IMPACT_TRIGGER_BUDGET = 3;
const SPREAD_COLOR = 0xffb3d9;
const PIERCE_COLOR = 0xb69bff;
const FROST_COLOR = 0x8ceafa;
const MAX_DAMAGE_NUMBERS = 48;
const MAX_HIT_SPARKS = 64;

const RULE_TINTS: Record<RuleKey, number> = {
  pierce: PIERCE_COLOR,
  chain: COLORS.cyan,
  spread: SPREAD_COLOR,
  burn: COLORS.orange,
  frost: FROST_COLOR,
  blast: 0xffd27a
};

export class M0Scene extends Phaser.Scene {
  private world!: Phaser.GameObjects.Container;
  private enemyLayer!: Phaser.GameObjects.Container;
  private fxLayer!: Phaser.GameObjects.Container;
  private frameLayer!: Phaser.GameObjects.Container;
  private coverLayer!: Phaser.GameObjects.Container;
  private covers: readonly CoverDef[] = [];
  private floorImage?: Phaser.GameObjects.Image;
  private themeWash?: Phaser.GameObjects.Rectangle;
  private arenaFrame?: Phaser.GameObjects.Graphics;
  private brazierGlows: Phaser.GameObjects.Image[] = [];
  private dustEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private arbiterHost!: ArbiterHost;
  private coreHost!: CoreHost;
  private sourceHost!: SourceHost;
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
  private maxHp = PLAYER_MAX_HP;
  private moveSpeed = PLAYER_SPEED;
  private dashCdMax = DASH_COOLDOWN;
  private elapsed = 0;
  private kills = 0;
  private invuln = 0;
  private attackCd = 0;
  private spawnCd = 2.5;
  private hudTick = 0;
  private runToken = 0;
  private nextEnemyId = 1;
  private spawnedTotal = 0;

  private scenePaused = false;
  private roomState: RoomState = 'preview';
  private plan: RunStep[] = [];
  private stepIndex = 0;
  private chapterIndex = 0;
  private startChapter = 0;
  private stepsClearedBefore = 0;
  private chapterTransitionOpen = false;
  private encounter: Encounter | null = null;
  private roomKills = 0;
  private roomStartedAt = 0;
  private roomSpawned = 0;
  private pendingSpawns = 0;
  private rewardOpen = false;

  private build: PlayerBuild = createEmptyBuild();
  private acquired = new Set<RuleKey>();
  private relics: RelicId[] = [];
  private lateUpgrades: LateUpgradeId[] = [];
  private pierceMomentum = 0;
  private frostRingCd = 0;
  private slowFields: SlowField[] = [];
  private mutatorLevel = 0;
  private unlockedRelics: RelicId[] = [...RELIC_IDS];
  private unlockedAscensions: AscensionId[] = [...ASCENSION_IDS];
  private chapterRewardOpen = false;
  private thunderStacks = 0;
  private reforgesUsed = 0;
  private roomClearCount = 0;
  private resonanceGranted = false;
  private waveDirector: WaveDirector | null = null;
  private hordeEnabled = true;
  private waveCaptainSpawned = false;
  private overloadSpawned = 0;
  private hordeNovas = 0;
  private dashNovas = 0;
  private totalOverloads = 0;
  private totalNovas = 0;
  private portalToken = 0;
  private killStreak = 0;
  private killStreakBest = 0;
  private killStreakTimer = 0;
  private killBurst = 0;
  private hitStopMs = 0;
  private godMode = false;
  private attackHits = new Set<EnemyUnit>();
  private attackThunderAwarded = false;
  private prismTime = 0;
  private bloodflameCd = 0;
  private featherTime = 0;
  private frostAscendHits = 0;
  private chainAscendJumps = 0;
  private lastExplosionHits = 0;
  private lastExplosionRadius = 0;
  private lastExplosionDistances: number[] = [];
  private prismTriggers = 0;
  private thunderDomainCasts = 0;
  private riftEchoCasts = 0;
  private thirdVolleys = 0;

  private enemies: EnemyUnit[] = [];
  private bolts: PlayerBolt[] = [];
  private enemyBolts: EnemyBolt[] = [];
  private hazards: Hazard[] = [];
  private pickups: Pickup[] = [];

  private slowTime = 0;
  private slowFactor = 0;
  private liveDamageNumbers = 0;
  private damageLabelPool: Phaser.GameObjects.Text[] = [];
  private liveHitSparks = 0;
  private impactProcs = 0;
  private blastDamageEvents = 0;
  private damageDealt = 0;
  private victoryLocked = false;
  private damageTaken: Record<DamageSource, number> = {
    melee: 0,
    charge: 0,
    bolt: 0,
    hazard: 0,
    explosion: 0,
    other: 0
  };

  private mutation: MutationState = createMutationState();
  private bossPhase = 0;
  private bossRef: EnemyUnit | null = null;
  private roomSpeedMult = 1;
  private roomBonusCards = 0;
  private roomHazardCd = 0;
  private roomModifierCd = 0;
  private conveyorVec = new Phaser.Math.Vector2();
  private conveyorGfx?: Phaser.GameObjects.Graphics;
  private coreLaserCd = 0;
  private coreLaserTime = 0;
  private coreLaserAngle = 0;
  private coreLaserGfx?: Phaser.GameObjects.Graphics;
  private pendingSpeedMult = 1;
  private pendingBonusCards = 0;
  private pendingBonusElite = false;
  private sealSlot: 'trajectory' | 'impact' | null = null;
  private sealZone: { x: number; y: number; radius: number; time: number } | null = null;
  private sealTime = 0;
  private bossAttackCd = 0;
  private bossChargeCd = 0;
  private bossSummonCd = 0;
  private bossSealCd = 0;

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
    this.load.image('spore', ASSETS.spore);
    this.load.image('slime', ASSETS.slime);
    this.load.image('wisp', ASSETS.wisp);
    this.load.image('bomber', ASSETS.bomber);
    this.load.image('boss', ASSETS.boss);
  }

  create(): void {
    this.buildTextures();
    this.world = this.add.container(0, 0);
    this.addFloor();
    this.addBossHologram();
    this.frameLayer = this.add.container(0, 0);
    this.world.add(this.frameLayer);
    this.addArenaFrame();
    this.addBrazier(92, 120);
    this.addBrazier(708, 120);
    this.addBrazier(92, 680);
    this.addBrazier(708, 680);
    this.addAmbientDust();

    this.coverLayer = this.add.container(0, 0);
    this.world.add(this.coverLayer);

    this.enemyLayer = this.add.container(0, 0);
    this.world.add(this.enemyLayer);
    this.createPlayer();
    this.fxLayer = this.add.container(0, 0);
    this.world.add(this.fxLayer);
    this.arbiterHost = {
      arena: ARENA,
      playerRadius: PLAYER_RADIUS,
      playerX: () => this.playerRoot.x,
      playerY: () => this.playerRoot.y,
      getPhase: () => this.bossPhase,
      setPhase: (phase) => {
        this.bossPhase = phase;
      },
      timers: () => ({
        attackCd: this.bossAttackCd,
        chargeCd: this.bossChargeCd,
        summonCd: this.bossSummonCd,
        sealCd: this.bossSealCd
      }),
      setTimers: (timers) => {
        this.bossAttackCd = timers.attackCd;
        this.bossChargeCd = timers.chargeCd;
        this.bossSummonCd = timers.summonCd;
        this.bossSealCd = timers.sealCd;
      },
      setBossRef: (enemy) => {
        this.bossRef = enemy as unknown as EnemyUnit;
      },
      distanceToPlayer: (enemy) =>
        this.distanceToPlayer(enemy as unknown as EnemyUnit),
      strafe: (enemy, dt, preferred, near, far) =>
        this.strafeAtRange(enemy as unknown as EnemyUnit, dt, preferred, near, far),
      fireFan: (enemy, bolts, spread) =>
        this.fireBossFan(enemy as unknown as EnemyUnit, bolts, spread),
      summon: () => this.summonBossAdds(),
      castSeal: () => this.castRuleSeal(),
      drawWarning: (enemy) => this.drawBeetleWarning(enemy as unknown as EnemyUnit),
      hurt: (amount, x, y, source) => this.hurtPlayer(amount, x, y, source),
      onPhase: (phase) => this.onBossPhase(phase),
      onChargeWall: () => this.cameras.main.shake(140, 0.0024),
      audio: (name) => audio.play(name),
      bonusBolts: () => (this.mutatorLevel >= 3 ? 2 : 0),
      isPlaying: () => this.runState === 'playing'
    };
    const bossHost = {
      arena: ARENA,
      playerRadius: PLAYER_RADIUS,
      now: () => this.time.now,
      playerX: () => this.playerRoot.x,
      playerY: () => this.playerRoot.y,
      isPlaying: () => this.runState === 'playing',
      setBossRef: (enemy: CoreBossEnemy) => {
        this.bossRef = enemy as unknown as EnemyUnit;
      },
      phase: () => this.bossPhase,
      setPhase: (phase: number) => {
        this.bossPhase = phase;
      },
      fireFan: (enemy: CoreBossEnemy, bolts: number, spread: number) =>
        this.fireBossFan(enemy as unknown as EnemyUnit, bolts, spread),
      distanceToPlayer: (enemy: CoreBossEnemy) =>
        this.distanceToPlayer(enemy as unknown as EnemyUnit),
      hurt: (amount: number, x: number, y: number, source: 'hazard' | 'melee') =>
        this.hurtPlayer(amount, x, y, source),
      bonusBolts: () => (this.mutatorLevel >= 3 ? 2 : 0)
    };
    this.coreHost = {
      ...bossHost,
      timers: () => ({
        attackCd: this.bossAttackCd,
        summonCd: this.bossSummonCd,
        sealCd: this.bossSealCd,
        laserCd: this.coreLaserCd,
        laserTime: this.coreLaserTime,
        laserAngle: this.coreLaserAngle
      }),
      setTimers: (timers) => {
        this.bossAttackCd = timers.attackCd;
        this.bossSummonCd = timers.summonCd;
        this.bossSealCd = timers.sealCd;
        this.coreLaserCd = timers.laserCd;
        this.coreLaserTime = timers.laserTime;
        this.coreLaserAngle = timers.laserAngle;
      },
      onPhase: (phase) => this.onCorePhase(phase),
      summon: () => summonCoreAdds(this.coreHost),
      spawnShockZone: (x, y, radius, delay) => this.spawnShockZone(x, y, radius, delay),
      audio: (name) => audio.play(name),
      aliveAdds: () => this.enemies.filter((item) => !item.dead && !item.elite).length,
      spawnAdd: (kind, x, y) => this.spawnBossAdd(kind, x, y),
      random: () => combatRandom(),
      randomInt: (min, max) => combatInt(min, max),
      startLaser: () => this.startCoreLaser(),
      drawLaser: (enemy, angle) =>
        this.drawCoreLaser(enemy as unknown as EnemyUnit, angle),
      stopLaser: () => this.stopCoreLaser()
    };
    this.sourceHost = {
      ...bossHost,
      timers: () => ({
        attackCd: this.bossAttackCd,
        summonCd: this.bossSummonCd,
        sealCd: this.bossSealCd,
        chargeCd: this.bossChargeCd
      }),
      setTimers: (timers) => {
        this.bossAttackCd = timers.attackCd;
        this.bossSummonCd = timers.summonCd;
        this.bossSealCd = timers.sealCd;
        this.bossChargeCd = timers.chargeCd;
      },
      onPhase: (phase) => this.onSourcePhase(phase),
      summon: () => summonSourceAdds(this.sourceHost),
      castSeal: () => this.castRuleSeal(),
      spawnVoidZone: (x, y, radius, delay) =>
        this.spawnShockZone(x, y, radius, delay, COLORS.purple, 18),
      shake: () => this.cameras.main.shake(80, 0.001),
      randomInt: (min, max) => combatInt(min, max),
      aliveAdds: () => this.enemies.filter((item) => !item.dead && !item.elite).length,
      spawnAdd: (kind, x, y) => this.spawnBossAdd(kind, x, y),
      audio: (name) => audio.play(name)
    };

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
    this.resumeScene();
    this.time.removeAllEvents();
    this.runToken += 1;
    this.clearTransient();
    for (const key of DAMAGE_SOURCES) this.damageTaken[key] = 0;
    this.victoryLocked = false;
    this.runState = 'playing';
    this.playEnabled = true;
    this.hp = PLAYER_MAX_HP;
    this.maxHp = PLAYER_MAX_HP;
    this.moveSpeed = PLAYER_SPEED;
    this.dashCdMax = DASH_COOLDOWN;
    this.elapsed = 0;
    this.kills = 0;
    this.invuln = 0;
    this.attackCd = 0.6;
    this.hudTick = 0;
    this.dashCooldown = 0;
    this.dashRemaining = 0;
    this.dashQueued = false;
    this.joystick.set(0, 0);
    this.nextEnemyId = 1;
    this.spawnedTotal = 0;
    this.build = createEmptyBuild();
    this.acquired.clear();
    this.relics = [];
    this.lateUpgrades = [];
    this.pierceMomentum = 0;
    this.frostRingCd = 0;
    this.slowFields = [];
    this.chapterRewardOpen = false;
    this.thunderStacks = 0;
    this.reforgesUsed = 0;
    this.roomClearCount = 0;
    this.resonanceGranted = false;
    this.totalOverloads = 0;
    this.totalNovas = 0;
    this.waveDirector = null;
    this.portalToken = 0;
    this.killStreak = 0;
    this.killStreakBest = 0;
    this.killStreakTimer = 0;
    this.killBurst = 0;
    this.hitStopMs = 0;
    this.godMode = false;
    this.prismTime = 0;
    this.bloodflameCd = 0;
    this.featherTime = 0;
    this.frostAscendHits = 0;
    this.chainAscendJumps = 0;
    this.lastExplosionHits = 0;
    this.lastExplosionRadius = 0;
    this.lastExplosionDistances = [];
    this.prismTriggers = 0;
    this.thunderDomainCasts = 0;
    this.riftEchoCasts = 0;
    this.thirdVolleys = 0;
    setRelics([]);
    setLate([]);
    resetRandomStreams();
    this.chapterIndex = this.startChapter;
    this.stepsClearedBefore = 0;
    this.chapterTransitionOpen = false;
    this.plan = buildChapterPlan(this.chapterIndex, random);
    this.applyWorldTheme();
    this.stepIndex = 0;
    this.encounter = null;
    this.roomKills = 0;
    this.roomStartedAt = 0;
    this.roomSpawned = 0;
    this.pendingSpawns = 0;
    this.rewardOpen = false;
    this.slowTime = 0;
    this.slowFactor = 0;
    this.mutation = createMutationState();
    this.bossPhase = 0;
    this.bossRef = null;
    this.sealSlot = null;
    this.sealTime = 0;
    this.bossAttackCd = 0;
    this.bossChargeCd = 0;
    this.bossSummonCd = 0;
    this.bossSealCd = 0;
    this.roomSpeedMult = 1;
    this.roomBonusCards = 0;
    this.roomHazardCd = 0;
    this.roomModifierCd = 0;
    this.conveyorVec.set(0, 0);
    this.conveyorGfx?.destroy();
    this.conveyorGfx = undefined;
    this.coreLaserCd = 0;
    this.coreLaserTime = 0;
    this.coreLaserGfx?.destroy();
    this.coreLaserGfx = undefined;
    this.pendingSpeedMult = 1;
    this.pendingBonusCards = 0;
    this.pendingBonusElite = false;
    this.playerRoot.setPosition(300, 500);
    this.playerSprite.setAlpha(1).clearTint();
    this.playerSprite.setRotation(0);
    this.playerSprite.setFlipX(false);
    this.applyStartChapterKit();
    resetM0Hud();
    setRunClock(0);
    setBuild(this.build, this.acquired);
    setDash(1, 0);
    this.loadStep(0);
  }

  private applyStartChapterKit(): void {
    if (this.startChapter <= 0) return;
    const level = (this.startChapter >= 2 ? 3 : 2) as RuleLevel;
    this.build = {
      trajectory: { key: 'spread', level },
      impact: { key: 'burn', level }
    };
    this.acquired.add('spread');
    this.acquired.add('burn');
    const pool = this.unlockedRelics.filter((id) => !this.relics.includes(id));
    const count = this.startChapter >= 2 ? 2 : 1;
    for (let i = 0; i < count && pool.length > 0; i += 1) {
      const [id] = pool.splice(combatInt(0, pool.length - 1), 1);
      if (id) this.relics.push(id);
    }
    setRelics(this.relics.map((id) => RELICS[id]));
    showRuleToast(
      'chain',
      '继承构筑',
      `W${this.startChapter + 1} 起始 · Lv.${level} 双规则 · ${this.relics.length} 件遗物`
    );
  }

  public setStartChapter(index: number): void {
    this.startChapter = Math.max(0, Math.min(2, Math.floor(index)));
  }

  public setHordeEnabled(enabled: boolean): void {
    this.hordeEnabled = enabled;
  }

  public getRoom(): RoomDef {
    return this.encounter?.kind === 'room' ? this.encounter.room : ROOMS[ROOMS.length - 1];
  }

  public isRoomPreviewOpen(): boolean {
    return this.roomState === 'preview';
  }

  public isEventOpen(): boolean {
    return this.roomState === 'event';
  }

  public isRouteOpen(): boolean {
    return this.roomState === 'route';
  }

  private get stepTotal(): number {
    return this.plan.length;
  }

  private get chapter(): ChapterDef {
    return CHAPTERS[this.chapterIndex] ?? CHAPTERS[0];
  }

  public getChapterState(): {
    index: number;
    total: number;
    name: string;
    nextName: string | null;
    transitionOpen: boolean;
  } {
    return {
      index: this.chapterIndex,
      total: CHAPTERS.length,
      name: this.chapter.name,
      nextName: CHAPTERS[this.chapterIndex + 1]?.name ?? null,
      transitionOpen: this.chapterTransitionOpen
    };
  }

  private refreshRoomHud(): void {
    const total = this.stepTotal;
    if (this.encounter?.kind === 'event') {
      setRoomProgress({
        index: this.stepIndex + 1,
        total,
        chapterIndex: this.chapterIndex,
        chapterTotal: CHAPTERS.length,
        mutator: this.mutatorLevel > 0 ? `M${this.mutatorLevel}` : undefined,
        name: this.encounter.event.name,
        en: this.encounter.event.en,
        cleared: 0,
        quota: 1,
        kills: this.kills,
        hp: this.hp,
        maxHp: this.maxHp
      });
      setWaveStatus(0, 0, 0);
      return;
    }
    const room = this.getRoom();
    setRoomProgress({
      index: this.stepIndex + 1,
      total,
      chapterIndex: this.chapterIndex,
      chapterTotal: CHAPTERS.length,
      mutator: this.mutatorLevel > 0 ? `M${this.mutatorLevel}` : undefined,
      name: room.name,
      en: room.en,
      cleared: this.roomKills,
      quota: room.quota,
      kills: this.kills,
      hp: this.hp,
      maxHp: this.maxHp
    });
  }

  private loadStep(index: number): void {
    const step = this.plan[index];
    if (!step) {
      this.finishChapter();
      return;
    }
    this.stepIndex = index;
    if (step.kind === 'choice') {
      this.roomState = 'route';
      this.playEnabled = false;
      this.joystick.set(0, 0);
      this.pauseScene();
      this.refreshRoomHud();
      this.game.events.emit('m3-route', {
        index,
        total: this.stepTotal,
        options: step.options
      });
      return;
    }
    this.loadEncounter(step.encounter);
  }

  private loadEncounter(encounter: Encounter): void {
    this.encounter = encounter;
    if (encounter.kind === 'room') {
      this.openRoomPreview();
    } else {
      this.openEvent(encounter.event);
    }
  }

  public chooseRoute(optionIndex: number): void {
    if (this.roomState !== 'route') return;
    const step = this.plan[this.stepIndex];
    if (!step || step.kind !== 'choice') return;
    const encounter = step.options[optionIndex];
    if (!encounter) return;
    this.loadEncounter(encounter);
  }

  private openRoomPreview(): void {
    this.roomState = 'preview';
    this.playEnabled = false;
    this.joystick.set(0, 0);
    this.pauseScene();
    setRoomEnemies(getRoomEnemyKinds(this.getRoom()));
    this.refreshRoomHud();
    this.game.events.emit('m2-room-preview', {
      index: this.stepIndex,
      total: this.stepTotal,
      room: this.getRoom(),
      hp: this.hp,
      maxHp: this.maxHp,
      kills: this.kills,
      elapsed: this.elapsed,
      build: JSON.parse(JSON.stringify(this.build)) as PlayerBuild
    });
  }

  private openEvent(event: EventDef): void {
    this.roomState = 'event';
    this.playEnabled = false;
    this.joystick.set(0, 0);
    this.pauseScene();
    setRoomEnemies([]);
    this.refreshRoomHud();
    this.game.events.emit('m3-event', {
      index: this.stepIndex,
      total: this.stepTotal,
      event,
      options: eventOptionsFor(event, this.build),
      hp: this.hp,
      maxHp: this.maxHp,
      kills: this.kills,
      build: JSON.parse(JSON.stringify(this.build)) as PlayerBuild
    });
  }

  public chooseEventOption(optionIndex: 0 | 1): void {
    if (this.roomState !== 'event' || this.encounter?.kind !== 'event') return;
    const options = eventOptionsFor(this.encounter.event, this.build);
    const option = options[optionIndex];
    if (!option) return;
    audio.play('rule');
    this.applyEventEffect(option.effect);
    this.advanceStep();
  }

  private applyEventEffect(effect: EventEffect): void {
    switch (effect.kind) {
      case 'none':
        break;
      case 'heal':
        this.hp = Math.min(this.maxHp, this.hp + effect.amount);
        setHp(this.hp, this.maxHp);
        break;
      case 'loseHpUpgrade':
        if (!hasUpgradeableRule(this.build)) {
          this.hp = Math.min(this.maxHp, this.hp + 20);
          setHp(this.hp, this.maxHp);
          break;
        }
        this.hp = Math.max(1, this.hp - effect.hp);
        setHp(this.hp, this.maxHp);
        if (!this.upgradeRandomRule()) {
          this.hp = Math.min(this.maxHp, this.hp + effect.hp);
          setHp(this.hp, this.maxHp);
        }
        break;
      case 'upgradeAndSpeedRisk':
        if (this.upgradeRandomRule()) {
          this.pendingSpeedMult = 1 + effect.percent / 100;
        }
        break;
      case 'swapRuleHeal':
        this.swapRandomRule();
        this.hp = Math.min(this.maxHp, this.hp + effect.heal);
        setHp(this.hp, this.maxHp);
        break;
      case 'relicOrHeal': {
        this.hp = Math.max(1, this.hp - effect.hp);
        const available = this.unlockedRelics.filter((id) => !this.relics.includes(id));
        if (available.length > 0 && this.relics.length < MAX_RELICS) {
          const id = available[combatInt(0, available.length - 1)];
          this.relics.push(id);
          setRelics(this.relics.map((relicId) => RELICS[relicId]));
          showRuleToast('chain', `虚空遗物 · ${RELICS[id].name}`, RELICS[id].description);
        } else {
          this.hp = Math.min(this.maxHp, this.hp + effect.heal);
        }
        setHp(this.hp, this.maxHp);
        break;
      }
      case 'curseElite':
        this.pendingBonusElite = true;
        this.pendingBonusCards = 1;
        break;
    }
    this.refreshRoomHud();
  }

  private upgradeRandomRule(): boolean {
    const slots: ('trajectory' | 'impact' | 'secondary')[] = [];
    if (this.build.trajectory && this.build.trajectory.level < 3) slots.push('trajectory');
    if (this.build.impact && this.build.impact.level < 3) slots.push('impact');
    if (this.build.secondary && this.build.secondary.level < 3) slots.push('secondary');
    if (!slots.length) return false;
    const slot = slots[combatInt(0, slots.length - 1)];
    const ref =
      slot === 'trajectory'
        ? this.build.trajectory
        : slot === 'impact'
          ? this.build.impact
          : this.build.secondary;
    if (!ref) return false;
    const next: PlayerBuild = {
      trajectory: this.build.trajectory ? { ...this.build.trajectory } : null,
      impact: this.build.impact ? { ...this.build.impact } : null,
      secondary: this.build.secondary ? { ...this.build.secondary } : undefined
    };
    const level = (ref.level + 1) as RuleLevel;
    if (slot === 'trajectory') {
      next.trajectory = { key: ref.key as TrajectoryKey, level };
    } else if (slot === 'impact') {
      next.impact = { key: ref.key as ImpactKey, level };
    } else {
      next.secondary = { key: ref.key, level };
    }
    this.applyBuildState(next, {
      key: ref.key,
      title: '事件 · 规则升级',
      sub: `${getRuleDef(ref.key).name} Lv.${level}`
    });
    return true;
  }

  private swapRandomRule(): boolean {
    const slots: ('trajectory' | 'impact')[] = [];
    if (this.build.trajectory) slots.push('trajectory');
    if (this.build.impact) slots.push('impact');
    if (!slots.length) return false;
    const slot = slots[combatInt(0, slots.length - 1)];
    const current = slot === 'trajectory' ? this.build.trajectory : this.build.impact;
    if (!current) return false;
    const pool: RuleKey[] =
      slot === 'trajectory' ? ['pierce', 'chain', 'spread'] : ['burn', 'frost', 'blast'];
    const options = pool.filter((key) => key !== current.key);
    const key = options[combatInt(0, options.length - 1)];
    const next: PlayerBuild = {
      trajectory: this.build.trajectory ? { ...this.build.trajectory } : null,
      impact: this.build.impact ? { ...this.build.impact } : null,
      secondary: this.build.secondary ? { ...this.build.secondary } : undefined
    };
    if (slot === 'trajectory') {
      next.trajectory = { key: key as TrajectoryKey, level: 1 };
    } else {
      next.impact = { key: key as ImpactKey, level: 1 };
    }
    this.applyBuildState(next, {
      key,
      title: '事件 · 规则更换',
      sub: `${getRuleDef(key).name} Lv.1`
    });
    return true;
  }

  public debugSwapRule(): boolean {
    return this.swapRandomRule();
  }

  public debugGodMode(enabled: boolean): void {
    this.godMode = enabled;
  }

  public debugDash(): void {
    this.tryDash();
  }

  public debugClearSeal(): void {
    if (!this.sealSlot) return;
    this.sealSlot = null;
    this.sealTime = 0;
    setSealedRule(null, false);
  }

  public debugSetKillStreak(count: number): void {
    this.killStreak = Math.max(0, Math.floor(count));
    this.killStreakTimer = 2.4;
    setKillStreak(this.killStreak, this.killStreakBest);
  }

  public debugReforge(key: RuleKey): boolean {
    if (this.reforgesUsed >= MAX_REFORGES) return false;
    const slot = reforgeSlot(this.build);
    if (!slot) return false;
    const ref =
      slot === 'trajectory'
        ? this.build.trajectory
        : slot === 'impact'
          ? this.build.impact
          : this.build.secondary;
    if (!ref) return false;
    const equipped = new Set(
      [this.build.trajectory, this.build.impact, this.build.secondary]
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .map((item) => item.key)
    );
    if (equipped.has(key)) return false;
    this.applyReforge({ slot, from: { ...ref }, to: key });
    return true;
  }

  private advanceStep(): void {
    if (this.runState !== 'playing') return;
    const next = this.stepIndex + 1;
    if (next >= this.plan.length) {
      this.finishChapter();
      return;
    }
    this.loadStep(next);
  }

  public setMetaUnlocks(relics: readonly RelicId[], ascensions: readonly AscensionId[]): void {
    this.unlockedRelics = [...relics];
    this.unlockedAscensions = [...ascensions];
  }

  public setMutator(level: number): void {
    this.mutatorLevel = clampMutator(level);
  }

  public debugGrantRelic(id: RelicId): void {
    if (this.relics.includes(id) || this.relics.length >= MAX_RELICS) return;
    this.relics.push(id);
    setRelics(this.relics.map((relicId) => RELICS[relicId]));
  }

  public debugAscendRule(key: RuleKey): void {
    const ref = key === 'pierce' || key === 'chain' || key === 'spread'
      ? this.build.trajectory
      : this.build.impact;
    if (!ref || ref.key !== key || ref.level !== 3) return;
    this.build = ascendRule(this.build, key);
    setBuild(this.build, this.acquired);
  }

  public debugGrantLate(id: LateUpgradeId): void {
    if (this.lateUpgrades.includes(id) || this.lateUpgrades.length >= MAX_LATE_UPGRADES) {
      return;
    }
    this.lateUpgrades.push(id);
    setLate(this.lateUpgrades.map((lateId) => LATE_UPGRADES[lateId]));
  }

  public debugSetThird(key: RuleKey, level: RuleLevel = 3): void {
    this.build = { ...this.build, secondary: { key, level } };
    this.acquired.add(key);
    setBuild(this.build, this.acquired);
  }

  private openChapterReward(): void {
    if (this.runState !== 'playing') return;
    this.chapterRewardOpen = true;
    this.roomState = 'reward';
    this.rewardOpen = true;
    this.playEnabled = false;
    this.joystick.set(0, 0);
    this.pauseScene();
    audio.play('rule');
    const rewards = buildChapterRewards(this.build, this.relics, random, {
      unlockedRelics: this.unlockedRelics,
      unlockedAscensions: this.unlockedAscensions,
      lateEligible: lateUpgradeEligible(this.build, this.relics.length),
      lateUpgrades: this.lateUpgrades,
      reforgeLeft: Math.max(0, MAX_REFORGES - this.reforgesUsed)
    });
    this.game.events.emit('m2-room-cleared', {
      index: this.stepIndex,
      total: this.stepTotal,
      room: this.getRoom(),
      kills: this.kills,
      elapsed: this.elapsed,
      rewards,
      rewardLabel: `${this.chapter.name} · 章节奖励`,
      chapterReward: true
    });
  }

  private finishChapter(): void {    if (this.runState !== 'playing') return;
    const next = CHAPTERS[this.chapterIndex + 1];
    if (!next) {
      this.endRun(true);
      return;
    }
    this.runState = 'chapter';
    this.chapterTransitionOpen = true;
    this.playEnabled = false;
    this.joystick.set(0, 0);
    this.dashQueued = false;
    for (const bolt of this.bolts) {
      bolt.dead = true;
      bolt.root.destroy(true);
    }
    this.bolts = [];
    this.pauseScene();
    audio.play('victory');
    this.game.events.emit('m6-chapter-cleared', {
      chapterIndex: this.chapterIndex,
      chaptersTotal: CHAPTERS.length,
      chapterName: this.chapter.name,
      chapterEn: this.chapter.en,
      nextName: next.name,
      nextEn: next.en,
      hp: this.hp,
      maxHp: this.maxHp,
      kills: this.kills,
      elapsed: this.elapsed,
      levelSum: buildLevelSum(this.build),
      combo: getBuildCombo(this.build).name
    } satisfies ChapterClearPayload);
  }

  public continueToNextChapter(): void {
    if (!this.chapterTransitionOpen) return;
    const nextIndex = this.chapterIndex + 1;
    if (!CHAPTERS[nextIndex]) return;
    this.chapterTransitionOpen = false;
    this.stepsClearedBefore += this.plan.length;
    this.chapterIndex = nextIndex;
    this.plan = buildChapterPlan(nextIndex, random);
    this.applyWorldTheme();
    this.stepIndex = 0;
    this.encounter = null;
    this.roomKills = 0;
    this.roomStartedAt = 0;
    this.roomSpawned = 0;
    this.pendingSpawns = 0;
    this.rewardOpen = false;
    this.roomSpeedMult = 1;
    this.roomBonusCards = 0;
    this.roomHazardCd = 0;
    this.roomModifierCd = 0;
    this.conveyorVec.set(0, 0);
    this.conveyorGfx?.destroy();
    this.conveyorGfx = undefined;
    this.coreLaserCd = 0;
    this.coreLaserTime = 0;
    this.coreLaserGfx?.destroy();
    this.coreLaserGfx = undefined;
    this.pendingSpeedMult = 1;
    this.pendingBonusCards = 0;
    this.pendingBonusElite = false;
    this.victoryLocked = false;
    this.runState = 'playing';
    this.roomState = 'preview';
    setBossBar(null);
    this.refreshRoomHud();
    this.loadStep(0);
  }

  public stopAfterChapter(): void {
    if (!this.chapterTransitionOpen) return;
    this.chapterTransitionOpen = false;
    this.endRun(true, true);
  }

  public beginRoom(): void {
    if (this.runState !== 'playing') return;
    if (this.encounter?.kind !== 'room') return;
    this.clearTransient();
    this.roomState = 'fighting';
    this.rewardOpen = false;
    this.playEnabled = true;
    this.roomKills = 0;
    this.roomStartedAt = this.elapsed;
    this.roomSpawned = 0;
    this.pendingSpawns = 0;
    this.waveDirector = null;
    this.waveCaptainSpawned = false;
    this.overloadSpawned = 0;
    this.hordeNovas = 0;
    this.dashNovas = 0;
    this.killStreak = 0;
    this.killStreakTimer = 0;
    this.killBurst = 0;
    this.hitStopMs = 0;
    setKillStreak(0, this.killStreakBest);
    setWaveStatus(0, 0, 0);
    this.roomSpeedMult = this.pendingSpeedMult;
    this.roomBonusCards = this.pendingBonusCards;
    this.pendingSpeedMult = 1;
    this.pendingBonusCards = 0;
    this.spawnCd = 1.1;
    this.attackCd = 0.5;
    this.invuln = 1.0;
    this.slowTime = 0;
    this.playerRoot.setPosition(300, 500);
    this.playerSprite.setAlpha(1).clearTint();
    const room = this.getRoom();
    this.roomHazardCd = room.hazard ? (room.hazard === 'void-rift' ? 1.5 : 1.8) : 0;
    this.roomModifierCd = room.modifier === 'rule-null' ? 4.5 : 0;
    this.conveyorVec.set(
      room.modifier === 'conveyor' ? room.conveyor?.x ?? 0 : 0,
      room.modifier === 'conveyor' ? room.conveyor?.y ?? 0 : 0
    );
    this.drawConveyor();
    this.covers = room.cover ?? [];
    this.drawCovers();
    setRoomEnemies(getRoomEnemyKinds(room));
    this.refreshRoomHud();
    this.resumeScene();
    audio.play('spawn');

    if (room.leader) {
      this.spawnEnemy(room.leader, ARENA * 0.5, 210);
      this.roomSpawned += 1;
      this.spawnLeaderBurst(ARENA * 0.5, 210);
    }
    if (room.boss) {
      this.spawnEnemy(room.boss, ARENA * 0.5, 235);
      this.roomSpawned += 1;
      this.bossRef = this.enemies[this.enemies.length - 1] ?? null;
      this.bossPhase = 1;
      this.bossAttackCd = 1.6;
      this.bossChargeCd = 4.5;
      this.bossSummonCd = 7;
      this.bossSealCd = 6;
      this.coreLaserCd = 3.5;
      this.coreLaserTime = 0;
      this.spawnLeaderBurst(ARENA * 0.5, 235);
      this.cameras.main.shake(420, 0.005);
    }
    if (this.pendingBonusElite) {
      this.pendingBonusElite = false;
      if (room.elite || room.boss) {
        this.pendingBonusCards = 0;
      } else {
        const kind: EnemyKind = combatRandom() < 0.5 ? 'sunder' : 'thunder';
        this.spawnEnemy(kind, ARENA - 150, 200, false);
        this.spawnLeaderBurst(ARENA - 150, 200);
        showRuleToast('blast', '诅咒宝箱', `额外出现 ${ENEMY_SPECS[kind].name} · 本房奖励 +1 张`);
      }
    }
    const mutator = getMutator(this.mutatorLevel);
    if (
      !room.elite &&
      !room.boss &&
      mutator.eliteChance > 0 &&
      combatRandom() < mutator.eliteChance
    ) {
      const kinds: EnemyKind[] = ['sunder', 'thunder', 'seer'];
      const kind = kinds[combatInt(0, kinds.length - 1)];
      this.spawnEnemy(kind, ARENA - 160, 240, false);
      this.spawnLeaderBurst(ARENA - 160, 240);
      showRuleToast('blast', '异变 · 额外精英', `${ENEMY_SPECS[kind].name} 进入本房`);
    }

    if (this.hordeEnabled && !room.boss) {
      const remaining = Math.max(0, room.quota - this.roomSpawned);
      this.waveDirector =
        remaining > 0
          ? new WaveDirector(
              buildWavePlan(
                remaining,
                this.chapterIndex,
                Boolean(room.elite),
                this.waveCountForRoom(room)
              )
            )
          : null;
    }
  }

  private spawnLeaderBurst(x: number, y: number): void {
    const ring = this.add
      .circle(x, y, 40, 0x000000, 0)
      .setStrokeStyle(3, COLORS.gold, 0.85)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(ring);
    this.tweens.add({
      targets: ring,
      scale: 2.6,
      alpha: 0,
      duration: 620,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });
    this.cameras.main.shake(180, 0.003);
    audio.play('rule');
  }

  private clearRoom(): void {
    if (this.roomState !== 'fighting' || this.victoryLocked) return;
    this.roomState = 'reward';
    this.rewardOpen = true;
    this.playEnabled = false;
    this.joystick.set(0, 0);
    for (const bolt of this.bolts) {
      bolt.dead = true;
      bolt.root.destroy(true);
    }
    this.bolts = [];
    this.hp = Math.min(this.maxHp, this.hp + 10);
    setHp(this.hp, this.maxHp);
    this.pauseScene();
    audio.play('rule');
    const clearSeconds = this.elapsed - this.roomStartedAt;
    const speedBonus =
      this.hordeEnabled && !this.getRoom().boss && clearSeconds <= 18 ? 1 : 0;
    if (speedBonus) {
      showRuleToast('blast', '速杀奖励', `清房 ${clearSeconds.toFixed(1)} 秒 · 额外一张奖励`);
    }
    const rewards = buildRoomRewards(this.build, this.getRoom(), random, {
      hasMutation: Boolean(this.mutation.id),
      bonusCards: this.roomBonusCards + speedBonus,
      lateEligible: lateUpgradeEligible(this.build, this.relics.length),
      lateUpgrades: this.lateUpgrades,
      reforgeLeft: Math.max(0, MAX_REFORGES - this.reforgesUsed)
    });
    this.roomClearCount += 1;
    if (
      !this.getRoom().boss &&
      this.roomClearCount >= 4 &&
      !this.resonanceGranted &&
      this.lateUpgrades.length < MAX_LATE_UPGRADES
    ) {
      const upgrade = pickResonance(this.build, this.lateUpgrades, random);
      if (upgrade) {
        const card: Reward = { kind: 'resonance', upgrade };
        const supportIndex = rewards.findIndex((reward) => reward.kind === 'support');
        if (supportIndex >= 0) {
          rewards[supportIndex] = card;
          this.resonanceGranted = true;
        } else if (rewards.length < 4) {
          rewards.push(card);
          this.resonanceGranted = true;
        }
        if (this.resonanceGranted) {
          showRuleToast('chain', '规则共鸣', `${upgrade.name} · ${upgrade.description}`);
        }
      }
    }
    this.game.events.emit('m2-room-cleared', {
      index: this.stepIndex,
      total: this.stepTotal,
      room: this.getRoom(),
      kills: this.kills,
      elapsed: this.elapsed,
      rewards
    });
  }

  public applyReward(reward: Reward): void {
    if (!this.rewardOpen) return;
    this.rewardOpen = false;
    if (reward.kind === 'rule') {
      const next = applyRuleOffer(this.build, reward.offer);
      const title =
        reward.offer.action === 'upgrade'
          ? '规则升级'
          : reward.offer.action === 'replace'
            ? '规则替换'
            : '掠夺规则';
      this.applyBuildState(next, {
        key: reward.offer.key,
        title,
        sub: `${reward.offer.name} Lv.${reward.offer.nextLevel}`
      });
    } else if (reward.kind === 'mutation') {
      this.mutation = equipMutation(this.mutation, reward.mutation.id);
      setMutation(reward.mutation);
      audio.play('rule');
      showRuleToast('pierce', '突变已装备', reward.mutation.name);
    } else if (reward.kind === 'relic') {
      if (!this.relics.includes(reward.relic.id) && this.relics.length < MAX_RELICS) {
        this.relics.push(reward.relic.id);
        setRelics(this.relics.map((id) => RELICS[id]));
        audio.play('rule');
        showRuleToast('chain', `遗物 · ${reward.relic.name}`, reward.relic.description);
      }
    } else if (reward.kind === 'ascension') {
      this.build = ascendRule(this.build, reward.ascension.rule);
      this.applyBuildState(this.build, {
        key: reward.ascension.rule,
        title: '规则升阶',
        sub: `${reward.ascension.name} · ${reward.ascension.en}`
      });
    } else if (reward.kind === 'late') {
      if (
        !this.lateUpgrades.includes(reward.upgrade.id) &&
        this.lateUpgrades.length < MAX_LATE_UPGRADES
      ) {
        this.lateUpgrades.push(reward.upgrade.id);
        setLate(this.lateUpgrades.map((id) => LATE_UPGRADES[id]));
        audio.play('rule');
        showRuleToast('chain', `高阶强化 · ${reward.upgrade.name}`, reward.upgrade.description);
      }
    } else if (reward.kind === 'resonance') {
      if (
        !this.lateUpgrades.includes(reward.upgrade.id) &&
        this.lateUpgrades.length < MAX_LATE_UPGRADES
      ) {
        this.lateUpgrades.push(reward.upgrade.id);
        setLate(this.lateUpgrades.map((id) => LATE_UPGRADES[id]));
        audio.play('rule');
        showRuleToast('chain', `规则共鸣 · ${reward.upgrade.name}`, reward.upgrade.description);
      }
    } else if (reward.kind === 'reforge') {
      this.applyReforge(reward.offer);
    } else {
      this.applySupport(reward.support.id);
    }
    if (this.chapterRewardOpen) {
      this.chapterRewardOpen = false;
      this.finishChapter();
    } else {
      this.advanceStep();
    }
  }

  private applySupport(id: SupportId): void {
    if (id === 'max-hp') {
      this.maxHp += 20;
      this.hp = Math.min(this.maxHp, this.hp + 20);
      this.refreshRoomHud();
      audio.play('pickup');
    } else if (id === 'heal') {
      this.hp = Math.min(this.maxHp, this.hp + 45);
      this.refreshRoomHud();
      audio.play('pickup');
    } else if (id === 'dash') {
      this.dashCdMax = Math.max(DASH_MIN_COOLDOWN, this.dashCdMax - 0.8);
      audio.play('pickup');
    } else if (id === 'speed') {
      this.moveSpeed *= 1.08;
      audio.play('pickup');
    }
    setHp(this.hp, this.maxHp);
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
    this.pauseScene();
  }

  public resumeGame(): void {
    this.resumeScene();
  }

  private pauseScene(): void {
    if (this.scenePaused) return;
    this.scenePaused = true;
    this.scene.pause();
  }

  private resumeScene(): void {
    if (!this.scenePaused) return;
    this.scenePaused = false;
    this.scene.resume();
  }

  public debugGrantRule(rule: RuleKey): void {
    const def = getRuleDef(rule);
    const next = {
      trajectory: this.build.trajectory ? { ...this.build.trajectory } : null,
      impact: this.build.impact ? { ...this.build.impact } : null
    };
    if (def.slot === 'trajectory' && (rule === 'pierce' || rule === 'chain' || rule === 'spread')) {
      const level =
        next.trajectory?.key === rule
          ? (Math.min(3, next.trajectory.level + 1) as RuleLevel)
          : 1;
      next.trajectory = { key: rule, level };
    } else if (def.slot === 'impact' && (rule === 'burn' || rule === 'frost' || rule === 'blast')) {
      const level =
        next.impact?.key === rule ? (Math.min(3, next.impact.level + 1) as RuleLevel) : 1;
      next.impact = { key: rule, level };
    }
    this.applyBuildState(next, {
      key: rule,
      title: '掠夺规则',
      sub: `${def.name} Lv.${def.slot === 'trajectory' ? next.trajectory?.level : next.impact?.level}`
    });
  }

  public debugGrantAll(): void {
    this.debugSetBuild('chain', 'blast', 1, 1);
  }

  public debugSetBuild(
    trajectory: TrajectoryKey | null,
    impact: ImpactKey | null,
    trajectoryLevel: RuleLevel = 1,
    impactLevel: RuleLevel = 1
  ): void {
    const next: PlayerBuild = {
      trajectory: trajectory ? { key: trajectory, level: trajectoryLevel } : null,
      impact: impact ? { key: impact, level: impactLevel } : null
    };
    this.applyBuildState(next);
  }

  public debugTableau(kinds: EnemyKind[], build?: {
    trajectory?: TrajectoryKey | null;
    impact?: ImpactKey | null;
    trajectoryLevel?: RuleLevel;
    impactLevel?: RuleLevel;
  }): void {
    if (this.runState !== 'playing') return;
    if (build) {
      this.debugSetBuild(
        build.trajectory ?? null,
        build.impact ?? null,
        build.trajectoryLevel ?? 2,
        build.impactLevel ?? 2
      );
    }
    this.attackCd = 99;
    this.playerRoot.setPosition(280, 560);
    for (const enemy of [...this.enemies]) {
      this.destroyEnemy(enemy);
    }
    this.enemies = [];
    for (const bolt of this.bolts) {
      bolt.dead = true;
      bolt.root.destroy(true);
    }
    this.bolts = [];
    const spots: [number, number][] = [
      [530, 300],
      [660, 250],
      [700, 430],
      [600, 560],
      [480, 190],
      [770, 560]
    ];
    kinds.slice(0, spots.length).forEach((kind, index) => {
      this.spawnEnemy(kind, spots[index][0], spots[index][1]);
    });
    this.enemies.forEach((enemy) => {
      enemy.attackCd = 99;
      this.tweens.killTweensOf(enemy.root);
      enemy.root.setScale(1).setAlpha(1);
    });
    this.time.delayedCall(340, () => this.pauseScene());
  }

  public runSummary(): string {
    const combo = getBuildCombo(this.build);
    const mutation = this.mutation.id ? MUTATIONS[this.mutation.id].name : '无';
    const lines = [
      `${this.chapter.name} · ${combo.name} · 等级 ${buildLevelSum(this.build)} / 9 · 突变 ${mutation}`,
      `异变 ${getMutator(this.mutatorLevel).name} · 第 ${this.stepIndex + 1} / ${this.stepTotal} 步 · ${formatTime(this.elapsed)} · 击杀 ${this.kills} · 生命 ${Math.ceil(this.hp)} / ${this.maxHp}`
    ];
    return lines.join(String.fromCharCode(10));
  }

  public debugSpawnHazard(x: number, y: number): void {
    if (this.runState !== 'playing' || this.roomState !== 'fighting') return;
    this.spawnFirePatch(x, y, 44, 2.6);
  }

  public debugSpawnEnemyBolt(): void {
    if (this.runState !== 'playing' || this.roomState !== 'fighting') return;
    this.spawnEnemyBolt(this.playerRoot.x, this.playerRoot.y - 60, Math.PI / 2, {
      speed: 320,
      damage: 10
    });
  }

  public debugCastSeal(): void {
    if (this.runState !== 'playing' || this.roomState !== 'fighting') return;
    this.castRuleSeal();
  }

  public debugJumpToStep(index: number): boolean {
    if (this.runState !== 'playing' || this.plan.length === 0) return false;
    const target = Math.max(0, Math.min(this.plan.length - 1, Math.floor(index)));
    this.stepIndex = target;
    this.roomKills = 0;
    this.roomSpawned = 0;
    this.pendingSpawns = 0;
    this.waveDirector = null;
    this.waveCaptainSpawned = false;
    this.loadStep(target);
    return true;
  }

  public debugJumpToBoss(withStarterBuild = true): void {
    if (this.runState !== 'playing') return;
    const last = this.plan[this.plan.length - 1];
    if (!last || last.kind !== 'encounter' || last.encounter.kind !== 'room') return;
    this.stepIndex = Math.max(0, this.plan.length - 1);
    this.encounter = last.encounter;
    this.roomKills = 0;
    this.roomSpawned = 0;
    this.pendingSpawns = 0;
    if (withStarterBuild) {
      this.debugSetBuild('chain', 'blast', 2, 1);
    }
    this.openRoomPreview();
  }

  public debugJumpToChapterBoss(chapterIndex = CHAPTERS.length - 1): void {
    if (this.runState !== 'playing') return;
    const plan = buildChapterPlan(chapterIndex, random);
    const last = plan[plan.length - 1];
    if (!last || last.kind !== 'encounter' || last.encounter.kind !== 'room') return;
    this.chapterIndex = chapterIndex;
    this.plan = plan;
    this.stepsClearedBefore = 0;
    this.stepIndex = plan.length - 1;
    this.encounter = last.encounter;
    this.roomKills = 0;
    this.roomSpawned = 0;
    this.pendingSpawns = 0;
    this.victoryLocked = false;
    this.applyWorldTheme();
    this.openRoomPreview();
  }

  public debugStartChapter(chapterIndex: number): void {
    if (this.runState !== 'playing') return;
    const plan = buildChapterPlan(chapterIndex, random);
    if (!plan.length) return;
    this.chapterIndex = chapterIndex;
    this.plan = plan;
    this.stepsClearedBefore = 0;
    this.stepIndex = 0;
    this.encounter = null;
    this.roomKills = 0;
    this.roomSpawned = 0;
    this.pendingSpawns = 0;
    this.victoryLocked = false;
    this.applyWorldTheme();
    this.loadStep(0);
  }

  public debugFreezeAttack(): void {
    this.attackCd = 99;
    this.clearPlayerBolts();
  }

  public debugHeal(amount: number): void {
    if (this.runState !== 'playing') return;
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, amount));
    setHp(this.hp, this.maxHp);
    this.refreshRoomHud();
  }

  public debugVolley(): number {
    if (this.runState !== 'playing' || this.roomState !== 'fighting') return -1;
    const target = this.findNearestEnemy(this.playerRoot.x, this.playerRoot.y);
    if (!target) return -1;
    this.attackCd = 99;
    this.fireAttack(target);
    return this.impactProcs;
  }

  public debugDamageBoss(amount: number): void {
    const boss = this.bossRef;
    if (!boss || boss.dead) return;
    this.applyDamage(boss, amount, 'blast');
    this.refreshBossHud();
  }

  public debugOpenEvent(id: EventId): void {
    if (this.runState !== 'playing') return;
    this.encounter = { kind: 'event', event: EVENTS[id] };
    this.openEvent(this.encounter.event);
  }

  public debugOpenReward(): void {
    this.clearRoom();
  }

  public debugDamagePlayer(amount: number): void {
    if (this.runState !== 'playing') return;
    this.invuln = 0;
    this.hurtPlayer(amount, this.playerRoot.x, this.playerRoot.y - 40, 'other');
  }

  public debugDamageFrom(amount: number, x: number, y: number): void {
    if (this.runState !== 'playing') return;
    this.invuln = 0;
    this.hurtPlayer(amount, x, y, 'other');
  }

  public debugEndRun(victory: boolean): void {
    this.endRun(victory);
  }

  public debugSpawn(kind: EnemyKind = 'beetle'): void {
    if (this.runState !== 'playing' || this.roomState !== 'fighting') return;
    const pos = this.chooseSpawnPosition();
    this.spawnPortal(kind, pos.x, pos.y);
  }

  public debugSpawnAt(kind: EnemyKind, x: number, y: number): void {
    if (this.runState !== 'playing' || this.roomState !== 'fighting') return;
    this.spawnEnemy(kind, x, y);
  }

  public debugKillAll(): void {
    this.waveDirector?.complete();
    this.overloadSpawned = 2;
    for (const enemy of [...this.enemies]) {
      this.killEnemy(enemy);
    }
  }

  public debugKillEnemy(index = 0): void {
    const enemy = this.enemies[index];
    if (enemy) this.killEnemy(enemy);
  }

  public debugPurgeEnemies(): void {
    this.waveDirector?.complete();
    this.portalToken += 1;
    for (const enemy of this.enemies) {
      this.destroyEnemy(enemy);
    }
    this.enemies = [];
    this.pendingSpawns = 0;
    setWaveStatus(0, 0, 0);
  }

  public debugSetStats(elapsed: number, kills: number): void {
    this.elapsed = Math.max(0, elapsed);
    this.kills = kills;
    setRunClock(this.elapsed);
    this.refreshRoomHud();
  }

  public debugSetRoomKills(kills: number): void {
    this.waveDirector?.complete();
    this.roomKills = Math.max(0, Math.min(this.getRoom().quota, kills));
    this.roomSpawned = Math.max(this.roomSpawned, this.roomKills);
    this.refreshRoomHud();
  }

  public debugPoseCombat(build?: {
    trajectory?: TrajectoryKey | null;
    impact?: ImpactKey | null;
    trajectoryLevel?: RuleLevel;
    impactLevel?: RuleLevel;
  }): void {
    if (this.runState !== 'playing') return;
    this.debugSetBuild(
      build?.trajectory ?? 'chain',
      build?.impact ?? 'blast',
      build?.trajectoryLevel ?? 2,
      build?.impactLevel ?? 1
    );
    this.attackCd = 99;
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
    this.spawnEnemy('beetle', 511, 411);
    this.spawnEnemy('bat', 630, 361);
    this.spawnEnemy('bat', 731, 318);
    const targets = this.enemies;
    targets.forEach((target) => {
      target.attackCd = 99;
      this.tweens.killTweensOf(target.root);
      target.root.setScale(1).setAlpha(1);
    });

    this.attackCd = 0;
    this.fireAttack(targets[0]);
    this.attackCd = 99;
    for (const bolt of this.bolts) {
      bolt.speed = 0;
      bolt.life = 99;
    }
    const originX = this.playerRoot.x;
    const originY = this.playerRoot.y - 14;
    const impact = this.build.impact?.key;
    const mode = this.bolts[0]?.mode ?? 'homing';
    const reach = Phaser.Math.Distance.Between(
      originX,
      originY,
      targets[0].root.x,
      targets[0].root.y - 10
    );
    const lead = reach * (mode === 'pierce' ? 0.72 : 0.5);

    this.time.delayedCall(160, () => {
      this.bolts.forEach((bolt, index) => {
        const travel = mode === 'spread' ? reach * 0.5 + index * 20 : lead + index * 52;
        bolt.root.x = originX + bolt.direction.x * travel;
        bolt.root.y = originY + bolt.direction.y * travel;
      });
      targets.forEach((target, index) => {
        const px = target.root.x;
        const py = target.root.y - 10;
        if (impact === 'blast') {
          this.spawnPoseBlast(px, py, index);
        } else if (impact === 'burn') {
          this.applyBurn(target, { duration: 4, dps: 5, tick: 0.5 });
          this.spawnStatusSpark(px, py, COLORS.orange);
          this.spawnStatusSpark(px + 12, py - 9, COLORS.yellow);
        } else if (impact === 'frost') {
          this.applyFrost(target, { duration: 2, slow: 0.5 });
          this.spawnStatusSpark(px, py, COLORS.cyan);
          this.spawnStatusSpark(px - 11, py + 8, 0xffffff);
        }
        this.spawnDamageNumber(
          px + Phaser.Math.Between(-8, 8),
          py - 34,
          String(18 + index * 4),
          impact === 'frost' ? '#65dcf0' : '#ffe399'
        );
      });
      this.pauseScene();
    });
  }

  private spawnPoseBlast(x: number, y: number, index: number): void {
    const color = index === 1 ? COLORS.cyan : COLORS.orange;
    const glow = this.add
      .image(x, y, 'glow')
      .setDisplaySize(96, 96)
      .setTint(color)
      .setAlpha(0.2)
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
      roomState: this.roomState,
      roomIndex: this.stepIndex,
      stepTotal: this.stepTotal,
      chapterIndex: this.chapterIndex,
      chaptersTotal: CHAPTERS.length,
      startChapter: this.startChapter,
      worldTheme: getWorldTheme(this.chapterIndex).id,
      worldThemeName: getWorldTheme(this.chapterIndex).name,
      chapterName: this.chapter.name,
      chapterTransitionOpen: this.chapterTransitionOpen,
      mutatorLevel: this.mutatorLevel,
      mutatorName: getMutator(this.mutatorLevel).name,
      encounterKind: this.encounter?.kind ?? null,
      roomKills: this.roomKills,
      roomQuota: this.getRoom().quota,
      roomId: this.getRoom().id,
      wave: this.waveDirector?.snapshot() ?? null,
      alive: this.enemies.length + this.pendingSpawns,
      killStreak: this.killStreak,
      killStreakBest: this.killStreakBest,
      hitStopMs: this.hitStopMs,
      overloadSpawned: this.overloadSpawned,
      hordeNovas: this.hordeNovas,
      dashNovas: this.dashNovas,
      roomElite: Boolean(this.getRoom().elite),
      roomBoss: Boolean(this.getRoom().boss),
      rewardOpen: this.rewardOpen,
      hp: this.hp,
      maxHp: this.maxHp,
      moveSpeed: this.moveSpeed,
      dashCdMax: this.dashCdMax,
      elapsed: this.elapsed,
      kills: this.kills,
      build: JSON.parse(JSON.stringify(this.build)) as PlayerBuild,
      acquired: [...this.acquired] as RuleKey[],
      relics: [...this.relics],
      ascensions: [this.build.trajectory, this.build.impact, this.build.secondary]
        .map((ref) => (ref?.ascended ? ref.key : null))
        .filter(Boolean),
      thunderStacks: this.thunderStacks,
      attackHits: this.attackHits.size,
      attackThunderAwarded: this.attackThunderAwarded,
      frostAscendHits: this.frostAscendHits,
      prismTime: this.prismTime,
      prismTriggers: this.prismTriggers,
      lastExplosionHits: this.lastExplosionHits,
      lastExplosionRadius: this.lastExplosionRadius,
      lastExplosionDistances: this.lastExplosionDistances,
      chainAscendJumps: this.chainAscendJumps,
      thunderDomainCasts: this.thunderDomainCasts,
      riftEchoCasts: this.riftEchoCasts,
      thirdVolleys: this.thirdVolleys,
      lateUpgrades: [...this.lateUpgrades],
      reforgeLeft: Math.max(0, MAX_REFORGES - this.reforgesUsed),
      pierceMomentum: this.pierceMomentum,
      slowFields: this.slowFields.length,
      relicDamageMultiplier: this.relicDamageMultiplier(),
      featherTime: this.featherTime,
      enemies: this.enemies.length,
      hazards: this.hazards.length,
      liveDamageNumbers: this.liveDamageNumbers,
      liveHitSparks: this.liveHitSparks,
      damageLabelPool: this.damageLabelPool.length,
      impactProcs: this.impactProcs,
      blastDamageEvents: this.blastDamageEvents,
      damageDealt: Math.round(this.damageDealt),
      slowTime: this.slowTime,
      damageTaken: { ...this.damageTaken },
      invuln: this.invuln,
      mutation: this.mutation.id,
      mutationReady: this.mutation.overloadReady,
      dashfireTime: this.mutation.dashfireTime,
      roomSpeedMult: this.roomSpeedMult,
      roomBonusCards: this.roomBonusCards,
      conveyor: { x: this.conveyorVec.x, y: this.conveyorVec.y },
      coreLaserActive: this.coreLaserTime > 0,
      coreLaserAngle: this.coreLaserAngle,
      coreLaserCd: this.coreLaserCd,
      plan: this.plan.map((step) =>
        step.kind === 'choice'
          ? {
              kind: 'choice',
              options: step.options.map((option) =>
                option.kind === 'room' ? option.room.id : option.event.id
              )
            }
          : {
              kind: 'encounter',
              encounter: step.encounter.kind === 'room' ? step.encounter.room.id : step.encounter.event.id
            }
      ),
      bossPhase: this.bossPhase,
      bossHp: this.bossRef ? Math.round(this.bossRef.hp) : 0,
      sealSlot: this.sealSlot,
      sealTime: this.sealTime,
      sealZone: this.sealZone
        ? { x: Math.round(this.sealZone.x), y: Math.round(this.sealZone.y), radius: this.sealZone.radius }
        : null,
      eliteAlive: this.enemies.filter((enemy) => enemy.elite && !enemy.dead).length,
      spawnedTotal: this.spawnedTotal,
      enemyCounts: this.enemies.reduce<Record<string, number>>((acc, enemy) => {
        acc[enemy.kind] = (acc[enemy.kind] ?? 0) + 1;
        return acc;
      }, {}),
      enemyList: this.enemies.slice(0, 24).map((enemy) => ({
        kind: enemy.kind,
        x: Math.round(enemy.root.x),
        y: Math.round(enemy.root.y),
        radius: enemy.radius,
        hp: Math.round(enemy.hp),
        burning: enemy.burnTime > 0,
        slowed: enemy.frostTime > 0,
        slow: enemy.frostSlow,
        shielded: enemy.shieldTime > 0,
        elite: enemy.elite,
        state: enemy.state,
        charging: enemy.state === 'charge'
      })),
      hazardList: this.hazards.slice(0, 12).map((hazard) => ({
        x: Math.round(hazard.x),
        y: Math.round(hazard.y),
        radius: hazard.radius
      })),
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

    for (const list of [this.bolts, this.enemyBolts, this.pickups, this.hazards, this.slowFields]) {
      for (const item of list) {
        this.tweens.killTweensOf(item.root);
        item.root.destroy(true);
      }
      list.length = 0;
    }
    this.slowTime = 0;
    this.slowFactor = 0;
    this.liveDamageNumbers = 0;
    this.liveHitSparks = 0;
    this.damageLabelPool = [];
    this.impactProcs = 0;
    this.blastDamageEvents = 0;
    this.damageDealt = 0;
    this.sealSlot = null;
    this.sealTime = 0;
    this.sealZone = null;
    this.bossRef = null;
    this.bossPhase = 0;
    this.playerSprite?.clearTint();

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
    this.floorImage = floor;
    const shade = this.add
      .rectangle(ARENA / 2, ARENA / 2, ARENA, ARENA, 0x050a12, 0.14)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.world.add(shade);
    const wash = this.add
      .rectangle(ARENA / 2, ARENA / 2, ARENA, ARENA, 0xffb066, 0.045)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.world.add(wash);
    this.themeWash = wash;
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
    const theme = getWorldTheme(this.chapterIndex);
    const frame = this.add.graphics();
    frame.lineStyle(22, theme.framePrimary, 0.022);
    frame.strokeRoundedRect(2, 2, ARENA - 4, ARENA - 4, 20);
    frame.lineStyle(7, theme.frameSecondary, 0.045);
    frame.strokeRoundedRect(8, 8, ARENA - 16, ARENA - 16, 17);
    frame.lineStyle(1.4, theme.frameAccent, 0.32);
    frame.strokeRoundedRect(6, 6, ARENA - 12, ARENA - 12, 17);
    frame.lineStyle(1, theme.framePrimary, 0.085);
    frame.strokeRoundedRect(22, 22, ARENA - 44, ARENA - 44, 10);

    const bracket = 34;
    const pad = 24;
    for (const [x, y, sx, sy] of [
      [pad, pad, 1, 1],
      [ARENA - pad, pad, -1, 1],
      [pad, ARENA - pad, 1, -1],
      [ARENA - pad, ARENA - pad, -1, -1]
    ]) {
      frame.lineStyle(2, theme.framePrimary, 0.46);
      frame.beginPath();
      frame.moveTo(x, y + sy * bracket);
      frame.lineTo(x, y);
      frame.lineTo(x + sx * bracket, y);
      frame.strokePath();
      frame.lineStyle(1, theme.frameSecondary, 0.2);
      frame.beginPath();
      frame.moveTo(x + sx * 6, y + sy * (bracket + 7));
      frame.lineTo(x + sx * 6, y + sy * 6);
      frame.lineTo(x + sx * (bracket + 7), y + sy * 6);
      frame.strokePath();
    }

    for (let i = 100; i < ARENA; i += 100) {
      if (i === 400) continue;
      frame.lineStyle(1, theme.frameAccent, 0.09);
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

    this.frameLayer.add(frame);
    this.arenaFrame = frame;
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
    this.brazierGlows.push(glow);

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
    this.dustEmitter = dust;
  }

  private drawCovers(): void {
    this.coverLayer.removeAll(true);
    for (const cover of this.covers) {
      const base = this.add
        .ellipse(cover.x, cover.y + 16, cover.radius * 2.1, cover.radius * 0.8, 0x050a12, 0.6)
        .setStrokeStyle(1, COLORS.gold, 0.16);
      const body = this.add
        .circle(cover.x, cover.y, cover.radius, 0x263b55, 1)
        .setStrokeStyle(2, COLORS.gold, 0.5);
      const top = this.add
        .ellipse(cover.x, cover.y - cover.radius * 0.48, cover.radius * 1.3, cover.radius * 0.54, 0x3b5675, 0.9)
        .setStrokeStyle(1, COLORS.cyan, 0.28);
      const ring = this.add
        .circle(cover.x, cover.y, cover.radius * 0.56, 0x000000, 0)
        .setStrokeStyle(1, COLORS.cyan, 0.2);
      this.coverLayer.add([base, body, top, ring]);
    }
  }

  private coverAt(x: number, y: number, radius: number): boolean {
    return this.covers.some(
      (cover) =>
        Phaser.Math.Distance.Between(x, y, cover.x, cover.y) <
        cover.radius + radius
    );
  }

  private resolveCover(
    target: { x: number; y: number },
    radius: number
  ): void {
    for (const cover of this.covers) {
      const dx = target.x - cover.x;
      const dy = target.y - cover.y;
      const distance = Math.hypot(dx, dy);
      const minDistance = cover.radius + radius;
      if (distance > 0 && distance < minDistance) {
        target.x = cover.x + (dx / distance) * minDistance;
        target.y = cover.y + (dy / distance) * minDistance;
      }
    }
  }

  private drawConveyor(): void {
    this.conveyorGfx?.destroy();
    this.conveyorGfx = undefined;
    if (this.conveyorVec.lengthSq() === 0) return;
    const g = this.add.graphics();
    const angle = Math.atan2(this.conveyorVec.y, this.conveyorVec.x);
    g.lineStyle(2, getWorldTheme(this.chapterIndex).framePrimary, 0.08);
    for (let x = 160; x <= 640; x += 120) {
      for (let y = 150; y <= 650; y += 100) {
        const cx = x + Math.cos(angle) * 18;
        const cy = y + Math.sin(angle) * 18;
        g.beginPath();
        g.moveTo(cx - Math.cos(angle) * 16, cy - Math.sin(angle) * 16);
        g.lineTo(cx, cy);
        g.lineTo(
          cx - Math.cos(angle) * 16 - Math.sin(angle) * 10,
          cy - Math.sin(angle) * 16 + Math.cos(angle) * 10
        );
        g.moveTo(cx, cy);
        g.lineTo(
          cx - Math.cos(angle) * 16 + Math.sin(angle) * 10,
          cy - Math.sin(angle) * 16 - Math.cos(angle) * 10
        );
        g.strokePath();
      }
    }
    this.world.addAt(g, 1);
    this.conveyorGfx = g;
  }

  private applyWorldTheme(): void {
    const theme = getWorldTheme(this.chapterIndex);
    this.floorImage?.setTint(theme.floorTint);
    this.themeWash?.setFillStyle(theme.washColor, theme.washAlpha);
    for (const glow of this.brazierGlows) glow.setTint(theme.brazier);
    this.dustEmitter?.setParticleTint(theme.dust);
    if (this.arenaFrame) {
      this.frameLayer.removeAll(true);
      this.arenaFrame = undefined;
      this.addArenaFrame();
    }
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
    this.dashCooldown = this.dashCdMax;
    if (this.relics.includes('feather')) this.featherTime = 2;
    triggerDashfire(this.mutation);
    this.invuln = Math.max(this.invuln, DASH_IFRAME);
    this.dashGhostClock = 0;
    setDash(0, this.dashCooldown);
    audio.play('dash');
    this.spawnDashBurst();
    if (this.hordeEnabled) {
      const token = this.runToken;
      this.time.delayedCall(80, () => {
        if (
          token === this.runToken &&
          this.runState === 'playing' &&
          this.roomState === 'fighting'
        ) {
          this.triggerDashNova();
        }
      });
    }
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

    if (this.slowTime > 0) {
      this.slowTime = Math.max(0, this.slowTime - dt);
      if (this.slowTime === 0) {
        this.slowFactor = 0;
        this.playerSprite.clearTint();
        this.playerSprite.setAlpha(1);
      }
    }

    let speed = this.slowTime > 0 ? this.moveSpeed * (1 - this.slowFactor) : this.moveSpeed;
    if (this.dashRemaining > 0) {
      this.dashRemaining -= dt;
      speed = this.moveSpeed * 3.25;
      this.dashGhostClock -= dt;
      if (this.dashGhostClock <= 0) {
        this.dashGhostClock = 0.045;
        this.spawnDashGhost();
      }
    } else {
      this.featherTime = Math.max(0, this.featherTime - dt);
      if (this.featherTime > 0) speed *= 1.25;
    }

    if (moving || this.dashRemaining > 0) {
      const dir = this.dashRemaining > 0 ? this.dashDirection : input;
      this.playerRoot.x += dir.x * speed * dt;
      this.playerRoot.y += dir.y * speed * dt;
    }
    if (this.conveyorVec.lengthSq() > 0) {
      this.playerRoot.x += this.conveyorVec.x * dt;
      this.playerRoot.y += this.conveyorVec.y * dt;
    }
    this.playerRoot.x = Phaser.Math.Clamp(this.playerRoot.x, 54, ARENA - 54);
    this.playerRoot.y = Phaser.Math.Clamp(this.playerRoot.y, 74, ARENA - 54);
    this.resolveCover(this.playerRoot, PLAYER_RADIUS);

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
      setDash(1 - this.dashCooldown / this.dashCdMax, this.dashCooldown);
      if (this.dashCooldown === 0) setDash(1, 0);
    }

    this.attackCd -= dt;
    if (this.attackCd <= 0) {
      const target = this.findNearestEnemy(this.playerRoot.x, this.playerRoot.y);
      if (target) {
        this.fireAttack(target);
        this.attackCd =
          ATTACK_INTERVAL *
          (this.hordeEnabled ? 0.85 : 1) *
          getAttackIntervalMultiplier(this.mutation) *
          this.hordeFrenzyMultiplier();
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

  private fireAttack(target: EnemyUnit): void {
    this.attackHits.clear();
    this.attackThunderAwarded = false;
    const pierceMomentum = this.pierceMomentum;
    this.pierceMomentum = 0;
    const baseAngle = Math.atan2(
      target.root.y - (this.playerRoot.y - 14),
      target.root.x - this.playerRoot.x
    );
    const budget = new TriggerBudget(IMPACT_TRIGGER_BUDGET);
    const sealedTrajectory = this.sealSlot === 'trajectory';
    const sealedImpact = this.sealSlot === 'impact';
    const trajectory = sealedTrajectory ? null : this.build.trajectory;
    const profile = trajectory
      ? getTrajectoryProfile(trajectory.key, trajectory.level)
      : null;
    const overcharged = consumeOverload(this.mutation);
    const power =
      getDamageMultiplier(this.mutation, this.hp, this.maxHp, overcharged) *
      this.relicDamageMultiplier() *
      this.hordeDamageMultiplier();
    if (this.thunderStacks >= 3) this.thunderStacks = 0;
    const impact = sealedImpact ? null : this.build.impact;
    const third = this.build.secondary ?? null;
    const thirdTrajectory =
      third && isTrajectoryKey(third.key)
        ? getTrajectoryProfile(third.key, third.level)
        : null;
    const thirdImpact =
      third && isImpactKey(third.key) ? (third as PlayerBuild['impact']) : null;
    const thirdBudget = thirdImpact
      ? new TriggerBudget(IMPACT_TRIGGER_BUDGET)
      : null;
    const color = this.trajectoryColor(profile);

    if (overcharged) {
      this.spawnOverloadBurst();
    }

    this.spawnTrajectoryVolley(
      profile,
      target,
      baseAngle,
      power,
      budget,
      impact,
      thirdImpact,
      thirdBudget,
      color,
      pierceMomentum
    );
    if (thirdTrajectory) {
      this.thirdVolleys += 1;
      const thirdColor = this.trajectoryColor(thirdTrajectory);
      this.spawnTrajectoryVolley(
        thirdTrajectory,
        target,
        baseAngle,
        power,
        new TriggerBudget(IMPACT_TRIGGER_BUDGET),
        impact,
        null,
        null,
        thirdColor,
        0
      );
      this.spawnMuzzle(thirdColor);
    }
    this.spawnMuzzle(color);
    audio.play('shoot');
  }

  private trajectoryColor(profile: TrajectoryProfile | null): number {
    return profile?.kind === 'pierce'
      ? PIERCE_COLOR
      : profile?.kind === 'spread'
        ? SPREAD_COLOR
        : COLORS.cyan;
  }

  private spawnTrajectoryVolley(
    profile: TrajectoryProfile | null,
    target: EnemyUnit,
    baseAngle: number,
    power: number,
    budget: TriggerBudget,
    impact: PlayerBuild['impact'],
    extraImpact: PlayerBuild['impact'],
    extraBudget: TriggerBudget | null,
    color: number,
    pierceBonus = 0
  ): void {
    if (profile?.kind === 'spread') {
      const angles = getSpreadAngles(baseAngle, profile.bolts, profile.spreadDeg);
      for (const angle of angles) {
        this.spawnBolt({
          mode: 'spread',
          angle,
          damage: profile.damage * power,
          speed: profile.speed,
          maxDistance: profile.range,
          budget,
          impact,
          extraImpact,
          extraBudget,
          power,
          color
        });
      }
    } else if (profile?.kind === 'pierce') {
      this.spawnBolt({
        mode: 'pierce',
        angle: baseAngle,
        damage: BASE_DAMAGE * power,
        speed: profile.speed,
        maxDistance: profile.range,
        maxHits: profile.targets + pierceBonus,
        budget,
        impact,
        extraImpact,
        extraBudget,
        power,
        color
      });
    } else {
      this.spawnBolt({
        mode: 'homing',
        target,
        angle: baseAngle,
        damage: BASE_DAMAGE * power,
        speed: profile?.kind === 'chain' ? profile.speed : BOLT_SPEED,
        maxDistance: ARENA * 1.6,
        budget,
        impact,
        extraImpact,
        extraBudget,
        power,
        chainJumps: profile?.kind === 'chain' ? profile.jumps : 0,
        chainRange: profile?.kind === 'chain' ? profile.range : 0,
        chainMultiplier: profile?.kind === 'chain' ? profile.damageMultiplier : 1,
        color
      });
    }
  }

  private spawnBolt(options: {
    mode: PlayerBolt['mode'];
    target?: EnemyUnit | null;
    angle: number;
    damage: number;
    speed: number;
    maxDistance: number;
    maxHits?: number;
    budget: TriggerBudget;
    impact?: PlayerBuild['impact'];
    extraImpact?: PlayerBuild['impact'];
    extraBudget?: TriggerBudget | null;
    power?: number;
    chainJumps?: number;
    chainRange?: number;
    chainMultiplier?: number;
    color: number;
  }): void {
    const startX = this.playerRoot.x + Math.cos(options.angle) * 24;
    const startY = this.playerRoot.y - 14 + Math.sin(options.angle) * 24;
    const wide = options.mode === 'pierce';
    const glow = this.add
      .image(0, 0, 'glow')
      .setDisplaySize(wide ? 62 : options.mode === 'spread' ? 34 : 44, wide ? 18 : 44)
      .setTint(options.color)
      .setAlpha(0.7)
      .setBlendMode(Phaser.BlendModes.ADD);
    const core = this.add
      .circle(0, 0, wide ? 4 : options.mode === 'spread' ? 4 : 5, 0xffffff, 1)
      .setBlendMode(Phaser.BlendModes.ADD);
    const root = this.add.container(startX, startY, [glow, core]);
    root.setRotation(options.angle);
    this.addFx(root);
    this.bolts.push({
      root,
      mode: options.mode,
      target: options.target ?? null,
      direction: new Phaser.Math.Vector2(Math.cos(options.angle), Math.sin(options.angle)),
      damage: options.damage,
      speed: options.speed,
      radius: wide ? 9 : 7,
      life: options.maxDistance / options.speed + 0.25,
      distance: 0,
      maxDistance: options.maxDistance,
      maxHits: options.maxHits ?? 1,
      hitEnemies: new Set(),
      budget: options.budget,
      impact: options.impact ?? null,
      extraImpact: options.extraImpact ?? null,
      extraBudget: options.extraBudget ?? null,
      power: options.power ?? 1,
      pierceHits: 0,
      chainJumps: options.chainJumps ?? 0,
      chainRange: options.chainRange ?? 0,
      chainMultiplier: options.chainMultiplier ?? 1,
      dead: false
    });
  }

  private spawnMuzzle(color: number): void {
    const muzzle = this.add
      .image(this.playerRoot.x + 22, this.playerRoot.y - 18, 'glow')
      .setDisplaySize(34, 34)
      .setTint(color)
      .setAlpha(0.55)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(muzzle);
    this.tweens.add({
      targets: muzzle,
      alpha: 0,
      scale: 1.7,
      duration: 140,
      onComplete: () => muzzle.destroy()
    });
  }

  private updateBolts(dt: number): void {
    for (const bolt of this.bolts) {
      if (bolt.dead) continue;
      bolt.life -= dt;
      if (bolt.life <= 0) {
        this.destroyBolt(bolt);
        continue;
      }
      if (bolt.mode === 'homing') {
        this.updateHomingBolt(bolt, dt);
      } else {
        this.updateDirectionalBolt(bolt, dt);
      }
    }
    this.bolts = this.bolts.filter((bolt) => !bolt.dead);
  }

  private updateHomingBolt(bolt: PlayerBolt, dt: number): void {
    if (bolt.target && (bolt.target.dead || !bolt.target.root.active)) {
      bolt.target = this.findNearestEnemy(bolt.root.x, bolt.root.y);
    }
    if (!bolt.target) {
      this.destroyBolt(bolt);
      return;
    }
    const angle = Math.atan2(
      bolt.target.root.y - bolt.root.y,
      bolt.target.root.x - bolt.root.x
    );
    bolt.direction.set(Math.cos(angle), Math.sin(angle));
    bolt.root.setRotation(angle);
    bolt.root.x += bolt.direction.x * bolt.speed * dt;
    bolt.root.y += bolt.direction.y * bolt.speed * dt;
    bolt.distance += bolt.speed * dt;
    if (this.coverAt(bolt.root.x, bolt.root.y, bolt.radius)) {
      this.destroyBolt(bolt);
      return;
    }
    if (bolt.distance >= bolt.maxDistance) {
      this.destroyBolt(bolt);
      return;
    }
    const hit = this.findCollidingEnemy(bolt, null);
    if (hit) {
      this.handleBoltHit(bolt, hit);
      this.destroyBolt(bolt);
    }
  }

  private updateDirectionalBolt(bolt: PlayerBolt, dt: number): void {
    bolt.root.x += bolt.direction.x * bolt.speed * dt;
    bolt.root.y += bolt.direction.y * bolt.speed * dt;
    bolt.distance += bolt.speed * dt;
    if (this.coverAt(bolt.root.x, bolt.root.y, bolt.radius)) {
      this.destroyBolt(bolt);
      return;
    }
    for (const enemy of [...this.enemies]) {
      if (enemy.dead || bolt.hitEnemies.has(enemy)) continue;
      const dist = Phaser.Math.Distance.Between(
        bolt.root.x,
        bolt.root.y,
        enemy.root.x,
        enemy.root.y
      );
      if (dist <= enemy.radius + bolt.radius) {
        bolt.hitEnemies.add(enemy);
        this.handleBoltHit(bolt, enemy);
        if (bolt.hitEnemies.size >= bolt.maxHits) {
          this.destroyBolt(bolt);
          return;
        }
        if (bolt.mode === 'spread') {
          this.destroyBolt(bolt);
          return;
        }
      }
    }
    if (bolt.distance >= bolt.maxDistance) {
      this.destroyBolt(bolt);
    }
  }

  private findCollidingEnemy(bolt: PlayerBolt, exclude: EnemyUnit | null): EnemyUnit | null {
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy === exclude || bolt.hitEnemies.has(enemy)) continue;
      const dist = Phaser.Math.Distance.Between(
        bolt.root.x,
        bolt.root.y,
        enemy.root.x,
        enemy.root.y
      );
      if (dist <= enemy.radius + bolt.radius) return enemy;
    }
    return null;
  }

  private destroyBolt(bolt: PlayerBolt): void {
    if (bolt.dead) return;
    bolt.dead = true;
    this.checkThunderEmblem();
    this.tweens.killTweensOf(bolt.root);
    bolt.root.destroy(true);
  }

  private checkThunderEmblem(): void {
    if (
      this.attackThunderAwarded ||
      !this.relics.includes('thunder-emblem') ||
      this.attackHits.size < 2
    ) {
      return;
    }
    this.attackThunderAwarded = true;
    this.thunderStacks = Math.min(3, this.thunderStacks + 1);
    this.spawnStatusSpark(this.playerRoot.x, this.playerRoot.y - 18, COLORS.cyan);
  }

  private handleBoltHit(bolt: PlayerBolt, enemy: EnemyUnit): void {
    this.attackHits.add(enemy);
    this.checkThunderEmblem();
    if (bolt.mode === 'pierce' && bolt.pierceHits > 0 && this.hasLate('pierce-momentum')) {
      this.pierceMomentum = Math.min(3, this.pierceMomentum + 1);
    }
    const pierceBonus = bolt.mode === 'pierce' ? 1 + 0.2 * bolt.pierceHits : 1;
    bolt.pierceHits += 1;
    this.applyDamage(enemy, bolt.damage * pierceBonus, 'hit');
    if (this.registerOverloadHit()) {
      this.showOverloadReady();
    }
    if (bolt.impact && bolt.budget.tryConsume()) {
      this.applyImpact(enemy, bolt.damage, bolt.impact, bolt.power);
    }
    if (bolt.extraImpact && bolt.extraBudget?.tryConsume()) {
      this.applyImpact(enemy, bolt.damage, bolt.extraImpact, bolt.power);
    }
    if (bolt.chainJumps > 0) {
      this.resolveChain(
        enemy,
        bolt.chainJumps,
        bolt.chainRange,
        bolt.chainMultiplier,
        bolt.budget
      );
    }
  }

  private resolveChain(
    from: EnemyUnit,
    jumps: number,
    range: number,
    multiplier: number,
    budget: TriggerBudget
  ): void {
    const visited = new Set<EnemyUnit>([from]);
    let cursor = from;
    const chainTargets: EnemyUnit[] = [];
    for (let i = 0; i < jumps; i += 1) {
      const candidates: ChainCandidate[] = this.enemies
        .filter((enemy) => !enemy.dead && !visited.has(enemy))
        .map((enemy) => ({
          id: enemy.id,
          x: enemy.root.x,
          y: enemy.root.y - 10,
          active: true
        }));
      const picked = selectChainTargets(
        { x: cursor.root.x, y: cursor.root.y - 10 },
        candidates,
        1,
        range
      )[0];
      if (!picked) break;
      const target = this.enemies.find((enemy) => enemy.id === picked.id);
      if (!target) break;
      chainTargets.push(target);
      visited.add(target);
      cursor = target;
    }

    if (this.build.trajectory?.ascended && chainTargets.length > 0) {
      this.chainAscendJumps += chainTargets.length;
      if (this.chainAscendJumps >= 6) {
        this.chainAscendJumps -= 6;
        this.time.delayedCall(140, () => this.castThunderDomain());
      }
    }

    if (this.hasLate('rift-echo') && chainTargets.length > 0) {
      this.scheduleRiftEcho(chainTargets[chainTargets.length - 1]);
    }

    let fromX = from.root.x;
    let fromY = from.root.y - 10;
    chainTargets.forEach((target, index) => {
      const sourceX = fromX;
      const sourceY = fromY;
      fromX = target.root.x;
      fromY = target.root.y - 10;
      this.time.delayedCall(70 + index * 70, () => {
        if (this.runState !== 'playing' || target.dead || !target.root.active) return;
        this.drawLightning(sourceX, sourceY, target.root.x, target.root.y - 10);
        this.attackHits.add(target);
        const damage = Math.round(BASE_DAMAGE * multiplier);
        this.applyDamage(target, damage, 'hit');
        this.checkThunderEmblem();
        if (this.registerOverloadHit()) {
          this.showOverloadReady();
        }
        if (this.build.impact && budget.tryConsume()) {
          this.applyImpact(target, damage, this.build.impact, 0.6);
        }
      });
    });
  }

  private scheduleRiftEcho(target: EnemyUnit): void {
    this.time.delayedCall(220, () => {
      if (this.runState !== 'playing' || target.dead || !target.root.active) return;
      const x = target.root.x;
      const y = target.root.y - 10;
      this.riftEchoCasts += 1;
      this.spawnExplosion(x, y, 70);
      audio.play('explosion');
      const budget = new TriggerBudget(2);
      for (const enemy of [...this.enemies]) {
        if (enemy.dead || enemy === target) continue;
        const dist = Phaser.Math.Distance.Between(x, y, enemy.root.x, enemy.root.y - 10);
        if (dist <= enemy.radius + 70 && budget.tryConsume()) {
          this.applyDamage(enemy, 12, 'blast');
        }
      }
    });
  }

  private applyImpact(
    enemy: EnemyUnit,
    directDamage: number,
    impact: PlayerBuild['impact'],
    power = 1
  ): void {
    void directDamage;
    const sealed = this.sealSlot === 'impact' ? null : impact;
    if (!sealed) return;
    this.impactProcs += 1;
    const profile = getImpactProfile(sealed.key, sealed.level);
    if (profile.kind === 'blast') {
      this.explodeAt(enemy.root.x, enemy.root.y - 10, enemy, {
        radius: profile.radius,
        damage: profile.damage * power
      });
    } else if (!enemy.dead) {
      if (profile.kind === 'burn') {
        this.applyBurn(enemy, profile);
      } else {
        this.applyFrost(enemy, profile);
      }
    }
  }

  private applyBurn(
    enemy: EnemyUnit,
    profile: { duration: number; dps: number; tick: number }
  ): void {
    const merged = mergeBurn(
      { time: enemy.burnTime, dps: enemy.burnDps },
      profile.duration,
      profile.dps
    );
    enemy.burnTime = merged.time;
    enemy.burnDps = merged.dps;
    if (enemy.burnTick <= 0) enemy.burnTick = profile.tick;
    enemy.burnTick = Math.min(enemy.burnTick, profile.tick);
    enemy.aura.setTint(COLORS.orange);
    enemy.aura.setAlpha(0.24);
    this.spawnStatusSpark(enemy.root.x, enemy.root.y - 10, COLORS.orange);
  }

  private applyFrost(
    enemy: EnemyUnit,
    profile: { duration: number; slow: number }
  ): void {
    const merged = mergeFrost(
      { time: enemy.frostTime, slow: enemy.frostSlow },
      profile.slow,
      profile.duration
    );
    enemy.frostTime = merged.time;
    enemy.frostSlow = merged.slow;
    enemy.aura.setTint(COLORS.cyan);
    enemy.aura.setAlpha(0.24);
    this.spawnStatusSpark(enemy.root.x, enemy.root.y - 10, COLORS.cyan);
    if (this.hasLate('frost-ring') && this.frostRingCd <= 0) {
      this.frostRingCd = 1.2;
      this.spawnSlowField(enemy.root.x, enemy.root.y, 70, 1.8);
    }
    if (this.build.impact?.key === 'frost' && this.build.impact.ascended) {
      this.frostAscendHits += 1;
      if (this.frostAscendHits >= 4) {
        this.frostAscendHits = 0;
        enemy.frostTime = Math.max(enemy.frostTime, 1.5);
        enemy.frostSlow = 1;
        const ring = this.add
          .circle(enemy.root.x, enemy.root.y - 8, 26, 0x000000, 0)
          .setStrokeStyle(2.5, COLORS.cyan, 0.9)
          .setBlendMode(Phaser.BlendModes.ADD);
        this.addFx(ring);
        this.tweens.add({
          targets: ring,
          scale: 2.2,
          alpha: 0,
          duration: 420,
          onComplete: () => ring.destroy()
        });
      }
    }
  }

  private hasLate(id: LateUpgradeId): boolean {
    return this.lateUpgrades.includes(id);
  }

  private relicDamageMultiplier(): number {
    const thunder = this.relics.includes('thunder-emblem') ? this.thunderStacks * 0.12 : 0;
    const prism = this.relics.includes('prism') && this.prismTime > 0 ? 0.2 : 0;
    const greed = this.relics.includes('greed') ? 0.2 : 0;
    return 1 + thunder + prism + greed;
  }

  private updateRelicTimers(dt: number): void {
    this.prismTime = Math.max(0, this.prismTime - dt);
    this.bloodflameCd = Math.max(0, this.bloodflameCd - dt);
    this.frostRingCd = Math.max(0, this.frostRingCd - dt);
  }

  private castThunderDomain(): void {
    if (this.runState !== 'playing' || !this.build.trajectory?.ascended) return;
    const targets = [...this.enemies]
      .filter((enemy) => !enemy.dead)
      .sort((a, b) => this.distanceToPlayer(a) - this.distanceToPlayer(b))
      .slice(0, 3);
    if (!targets.length) return;
    this.thunderDomainCasts += 1;
    const budget = new TriggerBudget(targets.length);
    for (const target of targets) {
      if (!budget.tryConsume()) break;
      this.drawLightning(
        this.playerRoot.x,
        this.playerRoot.y - 10,
        target.root.x,
        target.root.y - 10
      );
      this.applyDamage(target, BASE_DAMAGE * 1.1, 'blast');
      this.spawnStatusSpark(target.root.x, target.root.y - 10, COLORS.cyan);
    }
    audio.play('rule');
    this.cameras.main.shake(120, 0.002);
  }

  private spawnStatusSpark(x: number, y: number, color: number): void {
    const spark = this.add
      .circle(x, y, 3, color, 0.8)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(spark);
    this.tweens.add({
      targets: spark,
      y: y - 28,
      alpha: 0,
      scale: 0,
      duration: 360,
      onComplete: () => spark.destroy()
    });
  }

  private updateEnemyStatuses(enemy: EnemyUnit, dt: number): void {
    if (enemy.burnTime > 0) {
      enemy.burnTime = Math.max(0, enemy.burnTime - dt);
      enemy.burnTick -= dt;
      while (enemy.burnTick <= 0 && enemy.burnTime > 0 && !enemy.dead) {
        enemy.burnTick += 0.5;
        this.applyDamage(enemy, enemy.burnDps * 0.5, 'dot');
      }
      if (enemy.burnTime <= 0) enemy.burnDps = 0;
    }
    if (enemy.frostTime > 0) {
      enemy.frostTime = Math.max(0, enemy.frostTime - dt);
      if (enemy.frostTime <= 0) enemy.frostSlow = 0;
    }
    if (enemy.shieldTime > 0) {
      enemy.shieldTime = Math.max(0, enemy.shieldTime - dt);
      enemy.castRing.setVisible(enemy.shieldTime > 0);
      if (enemy.shieldTime > 0) {
        enemy.castRing.setScale(1 + Math.sin(this.time.now * 0.012) * 0.08);
      }
    }
    if (enemy.dead) return;
    if (enemy.burnTime > 0) {
      enemy.aura.setTint(COLORS.orange);
      enemy.aura.setAlpha(0.24);
    } else if (enemy.frostTime > 0) {
      enemy.aura.setTint(COLORS.cyan);
      enemy.aura.setAlpha(0.24);
    } else {
      this.resetEnemyAura(enemy);
    }
  }

  private explodeAt(
    x: number,
    y: number,
    source: EnemyUnit,
    profile: { radius: number; damage: number }
  ): void {
    this.spawnExplosion(x, y, profile.radius);
    audio.play('explosion');
    this.cameras.main.shake(70, 0.0012);
    let hits = 0;
    for (const enemy of [...this.enemies]) {
      if (enemy.dead || enemy === source) continue;
      const dist = Phaser.Math.Distance.Between(x, y, enemy.root.x, enemy.root.y - 10);
      if (dist <= enemy.radius + profile.radius) {
        this.applyDamage(enemy, profile.damage, 'blast');
        this.attackHits.add(enemy);
        hits += 1;
      }
    }
    this.checkThunderEmblem();
    this.lastExplosionHits = hits;
    this.lastExplosionRadius = profile.radius;
    this.lastExplosionDistances = this.enemies
      .filter((enemy) => !enemy.dead && enemy !== source)
      .map((enemy) =>
        Math.round(
          Phaser.Math.Distance.Between(x, y, enemy.root.x, enemy.root.y - 10)
        )
      );
    if (hits >= 2 && this.relics.includes('prism')) {
      this.prismTime = 4;
      this.prismTriggers += 1;
      const ring = this.add
        .circle(this.playerRoot.x, this.playerRoot.y - 10, 34, 0x000000, 0)
        .setStrokeStyle(2, 0xffd27a, 0.8)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.addFx(ring);
      this.tweens.add({
        targets: ring,
        scale: 2.4,
        alpha: 0,
        duration: 380,
        onComplete: () => ring.destroy()
      });
    }
  }

  private applyDamage(
    enemy: EnemyUnit,
    amount: number,
    visual: 'hit' | 'blast' | 'dot'
  ): void {
    if (enemy.dead) return;
    const dealt = enemy.shieldTime > 0 ? amount * 0.6 : amount;
    this.damageDealt += Math.max(0, dealt);
    if (visual === 'blast') this.blastDamageEvents += 1;
    enemy.hp -= dealt;
    enemy.hpFill.setScale(Math.max(0, enemy.hp / enemy.maxHp), 1);
    const x = enemy.root.x + Phaser.Math.Between(-8, 8);
    const y = enemy.root.y - (enemy.kind === 'bat' ? 44 : 58);
    if (this.hordeEnabled && visual !== 'dot' && !ENEMY_SPECS[enemy.kind].boss) {
      const dx = enemy.root.x - this.playerRoot.x;
      const dy = enemy.root.y - this.playerRoot.y;
      const length = Math.hypot(dx, dy) || 1;
      const force = enemy.elite ? 65 : 185;
      enemy.knockX = (dx / length) * force;
      enemy.knockY = (dy / length) * force;
      enemy.knockTime = 0.14;
    }
    if (visual === 'hit') {
      enemy.sprite.setTintFill(0xffe6c8);
      this.time.delayedCall(44, () => {
        if (!enemy.dead) enemy.sprite.clearTint();
      });
      this.spawnDamageNumber(x, y, String(Math.round(dealt)), '#ffe399');
      audio.play('hit');
      this.spawnHitSpark(enemy.root.x, enemy.root.y - 10);
    } else if (visual === 'blast') {
      this.spawnDamageNumber(x, y, String(Math.round(dealt)), '#ffb078', 18);
    } else {
      this.spawnDamageNumber(x, y, String(Math.round(dealt)), '#ff9a5c', 15);
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
    if (enemy.countsTowardQuota) this.roomKills += 1;
    this.registerKillStreak();
    this.refreshRoomHud();

    if (enemy.burnTime > 0 && this.hasLate('ember-spread')) {
      const target = [...this.enemies]
        .filter((item) => !item.dead)
        .sort((a, b) => this.distanceToPlayer(a) - this.distanceToPlayer(b))
        .find(
          (item) =>
            Phaser.Math.Distance.Between(x, y, item.root.x, item.root.y) < 240
        );
      if (target) {
        target.burnTime = Math.max(target.burnTime, enemy.burnTime * 0.5);
        target.burnDps = Math.max(target.burnDps, enemy.burnDps);
        target.burnTick = Math.min(target.burnTick || 0.5, 0.5);
        target.aura.setTint(COLORS.orange);
        target.aura.setAlpha(0.24);
        this.spawnStatusSpark(target.root.x, target.root.y - 10, COLORS.orange);
      }
    }

    if (enemy.burnTime > 0 && this.build.impact?.key === 'burn' && this.build.impact.ascended) {
      this.explodeAt(enemy.root.x, enemy.root.y - 10, enemy, { radius: 90, damage: 24 });
    }
    if (enemy.burnTime > 0 && this.relics.includes('bloodflame-heart') && this.bloodflameCd <= 0) {
      this.bloodflameCd = 2;
      this.hp = Math.min(this.maxHp, this.hp + 4);
      setHp(this.hp, this.maxHp);
      this.refreshRoomHud();
      this.spawnStatusSpark(this.playerRoot.x, this.playerRoot.y - 18, COLORS.orange);
    }

    if (enemy.kind === 'bomber') {
      this.detonate(enemy);
    } else if (enemy.kind === 'slime') {
      this.spawnFirePatch(x, y + 8, 40, 2.2);
    } else if (ENEMY_SPECS[enemy.kind].boss) {
      this.onBossDefeated(enemy);
      return;
    }

    if (this.kills > 0 && this.kills % 8 === 0) {
      this.dropHeal(x, y);
    }
    if (
      !this.victoryLocked &&
      this.roomKills >= this.getRoom().quota &&
      this.enemies.length === 0 &&
      this.pendingSpawns === 0
    ) {
      this.clearRoom();
    }
  }

  private registerKillStreak(): void {
    this.killStreak += 1;
    this.killStreakTimer = 2.4;
    this.killStreakBest = Math.max(this.killStreakBest, this.killStreak);
    setKillStreak(this.killStreak, this.killStreakBest);
    this.killBurst += 1;
    if (this.hordeEnabled && this.killBurst === 3) {
      this.hitStopMs = 45;
      this.cameras.main.shake(80, 0.0028);
      this.spawnHordeBurst();
    }
    if (this.hordeEnabled && !this.getRoom().boss && this.killStreak === 10) {
      this.spawnOverloadPack(4);
      showRuleToast('blast', 'OVERLOAD ×10', '额外怪潮压入 · 继续清场');
      this.cameras.main.shake(150, 0.0034);
      this.spawnHordeBurst();
    } else if (this.hordeEnabled && !this.getRoom().boss && this.killStreak === 25) {
      this.spawnOverloadPack(6);
      this.triggerHordeNova(280, 42);
      showRuleToast('blast', 'MASSACRE ×25', '规则爆发 · 清空周围怪潮');
      this.cameras.main.shake(180, 0.004);
    } else if (this.hordeEnabled && this.killStreak === 50) {
      this.triggerHordeNova(360, 64);
      showRuleToast('blast', 'MASSACRE ×50', '规则爆发 · 清场节奏拉满');
      this.cameras.main.shake(200, 0.0045);
    }
  }

  private spawnOverloadPack(count: number): void {
    const room = this.getRoom();
    if (room.boss || room.mix.length === 0 || this.overloadSpawned >= 2) return;
    this.overloadSpawned += 1;
    this.totalOverloads += 1;
    for (let index = 0; index < count; index += 1) {
      const kind = this.pickWaveKind(room);
      const pos = this.chooseSpawnPosition();
      this.spawnPortal(kind, pos.x, pos.y, true);
    }
  }

  private hordeFrenzyMultiplier(): number {
    if (!this.hordeEnabled) return 1;
    return Math.max(0.72, 1 - Math.min(0.28, this.killStreak * 0.012));
  }

  private hordeDamageMultiplier(): number {
    if (!this.hordeEnabled) return 1;
    return 1 + Math.min(0.3, this.killStreak * 0.012);
  }

  private triggerDashNova(): void {
    this.dashNovas += 1;
    const x = this.playerRoot.x;
    const y = this.playerRoot.y;
    const ring = this.add
      .circle(x, y, 24, 0x000000, 0)
      .setStrokeStyle(2.5, COLORS.cyan, 0.8)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(ring);
    this.tweens.add({
      targets: ring,
      scale: 4.6,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });
    this.cameras.main.shake(55, 0.0015);
    for (const enemy of [...this.enemies]) {
      if (enemy.dead || ENEMY_SPECS[enemy.kind].boss) continue;
      if (
        Phaser.Math.Distance.Between(x, y, enemy.root.x, enemy.root.y) <= 120
      ) {
        this.applyDamage(enemy, 24, 'blast');
      }
    }
  }

  private triggerHordeNova(radius: number, damage: number): void {
    this.hordeNovas += 1;
    this.totalNovas += 1;
    const x = this.playerRoot.x;
    const y = this.playerRoot.y;
    const ring = this.add
      .circle(x, y, 34, 0x000000, 0)
      .setStrokeStyle(4, COLORS.orange, 0.9)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(ring);
    this.tweens.add({
      targets: ring,
      scale: radius / 34,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });
    this.cameras.main.flash(120, 255, 170, 90);
    for (const enemy of [...this.enemies]) {
      if (enemy.dead || ENEMY_SPECS[enemy.kind].boss) continue;
      if (
        Phaser.Math.Distance.Between(x, y, enemy.root.x, enemy.root.y) <= radius
      ) {
        this.applyDamage(enemy, damage, 'blast');
      }
    }
  }

  private spawnHordeBurst(): void {
    const ring = this.add
      .circle(this.playerRoot.x, this.playerRoot.y, 30, 0x000000, 0)
      .setStrokeStyle(2.5, COLORS.orange, 0.8)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(ring);
    this.tweens.add({
      targets: ring,
      scale: 2.8,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });
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
    this.pickups.push({ root, age: 0, dead: false });
  }

  private applyReforge(offer: ReforgeOffer): void {
    if (this.reforgesUsed >= MAX_REFORGES) return;
    this.reforgesUsed += 1;
    this.applyBuildState(reforgeRule(this.build, offer.slot, offer.to), {
      key: offer.to,
      title: '规则重铸',
      sub: `${getRuleDef(offer.from.key).name} → ${getRuleDef(offer.to).name} Lv.1`
    });
  }

  private applyBuildState(
    next: PlayerBuild,
    notice?: { key: RuleKey; title: string; sub: string }
  ): void {
    const previous = this.build;
    const trajectoryChanged = previous.trajectory?.key !== next.trajectory?.key;
    const impactChanged = previous.impact?.key !== next.impact?.key;
    this.build = next;
    if (next.trajectory) this.acquired.add(next.trajectory.key);
    if (next.impact) this.acquired.add(next.impact.key);
    if (trajectoryChanged) {
      this.clearPlayerBolts();
    }
    if (impactChanged) {
      this.clearAllStatuses();
    }
    setBuild(this.build, this.acquired);
    if (notice) {
      audio.play('rule');
      showRuleToast(notice.key, notice.title, notice.sub);
    }
  }

  private clearPlayerBolts(): void {
    for (const bolt of this.bolts) {
      bolt.dead = true;
      this.tweens.killTweensOf(bolt.root);
      bolt.root.destroy(true);
    }
    this.bolts = [];
  }

  private clearAllStatuses(): void {
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.burnTime = 0;
      enemy.burnDps = 0;
      enemy.burnTick = 0;
      enemy.frostTime = 0;
      enemy.frostSlow = 0;
      this.resetEnemyAura(enemy);
    }
  }

  private resetEnemyAura(enemy: EnemyUnit): void {
    enemy.aura.setTint(RULE_TINTS[ENEMY_SPECS[enemy.kind].rule]);
    enemy.aura.setAlpha(enemy.elite ? 0.2 : 0.1);
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
          this.hp = Math.min(this.maxHp, this.hp + 14);
          setHp(this.hp, this.maxHp);
          this.refreshRoomHud();
          audio.play('pickup');
          showRuleToast('heal', '生命碎片', '恢复 14 点生命');
          pickup.root.destroy(true);
        }
      }
    }
    this.pickups = this.pickups.filter((pickup) => !pickup.dead);
  }

  private spawnPortal(kind: EnemyKind, x: number, y: number, quiet = false): void {
    const token = this.runToken;
    const portal = this.portalToken;
    const color = RULE_TINTS[ENEMY_SPECS[kind].rule];
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
    if (!quiet) audio.play('spawn');
    this.pendingSpawns += 1;
    this.time.delayedCall(550, () => {
      this.pendingSpawns = Math.max(0, this.pendingSpawns - 1);
      const active =
        token === this.runToken &&
        portal === this.portalToken &&
        this.runState === 'playing' &&
        !this.victoryLocked;
      if (!active) return;
      this.spawnEnemy(kind, x, y);
      if (
        this.enemies.length === 0 &&
        this.pendingSpawns === 0 &&
        this.roomKills >= this.getRoom().quota
      ) {
        this.clearRoom();
      }
    });
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number, countsTowardQuota = true): void {
    this.spawnedTotal += 1;
    const spec = ENEMY_SPECS[kind];
    const elite = Boolean(spec.elite);
    const mutator = getMutator(this.mutatorLevel);
    const chapterHpScale = this.chapterIndex >= 1 ? 1.15 : 1;
    const thirdHpScale = this.build.secondary ? 1.05 : 1;
    const hordeHpScale = this.hordeEnabled && !elite && !spec.boss ? 0.38 : 1;
    const baseHp =
      spec.hp *
      (spec.boss ? mutator.bossHp : mutator.enemyHp) *
      chapterHpScale *
      thirdHpScale *
      hordeHpScale;
    const baseSpeed = spec.speed * mutator.enemySpeed;
    const hover =
      kind === 'bat' ||
      kind === 'wisp' ||
      kind === 'thunder' ||
      kind === 'phase' ||
      kind === 'core' ||
      kind === 'seer' ||
      kind === 'source';
    const color = RULE_TINTS[spec.rule];
    const spriteY = hover ? -20 : -8;

    const shadow = this.add
      .image(0, hover ? 22 : 31, 'shadow')
      .setDisplaySize(hover ? 108 : 82, hover ? 30 : 26)
      .setAlpha(hover ? 0.38 : 0.52);
    const aura = this.add
      .image(0, hover ? 0 : 8, 'glow')
      .setDisplaySize(spec.displaySize * 1.08, spec.displaySize * 1.08)
      .setTint(color)
      .setAlpha(elite ? 0.2 : 0.1)
      .setBlendMode(Phaser.BlendModes.ADD);
    const warning = this.add.graphics();
    const sprite = this.add.image(0, spriteY, spec.sprite).setDisplaySize(spec.displaySize, spec.displaySize);
    const castRing = this.add
      .circle(0, hover ? 14 : 22, spec.radius + 12, 0x000000, 0)
      .setStrokeStyle(1, elite ? COLORS.gold : color, elite ? 0.45 : 0.22);

    const barWidth = Math.max(46, Math.round(spec.displaySize * 0.52));
    const barY = -Math.round(spec.displaySize * 0.42) - 14;
    const hpBg = this.add
      .rectangle(0, barY, barWidth, 5, 0x0a121f, 0.82)
      .setStrokeStyle(1, elite ? 0x6d5326 : 0x2a3d55, 0.5);
    const hpFill = this.add
      .rectangle(-barWidth / 2, barY, barWidth, 3, elite ? COLORS.gold : color, 0.92)
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

    if (elite) {
      const halo = this.add
        .circle(0, hover ? -4 : 4, spec.radius + 18, 0x000000, 0)
        .setStrokeStyle(2, COLORS.gold, 0.5)
        .setBlendMode(Phaser.BlendModes.ADD);
      root.addAt(halo, 1);
      this.tweens.add({
        targets: halo,
        scale: 1.12,
        alpha: 0.18,
        duration: 1100,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

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
      y: hover ? spriteY - 8 : spriteY + 5,
      duration: hover ? 1700 : 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    if (hover) {
      this.tweens.add({
        targets: sprite,
        x: 5,
        duration: 2400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    const startsCasting = kind === 'bat' || kind === 'wisp' || kind === 'thunder' || kind === 'spore';
    const enemy: EnemyUnit = {
      id: this.nextEnemyId++,
      kind,
      root,
      sprite,
      shadow,
      aura,
      warning,
      castRing,
      hp: baseHp,
      maxHp: baseHp,
      radius: spec.radius,
      speed: baseSpeed * this.roomSpeedMult,
      dead: false,
      state: startsCasting ? 'idle' : 'approach',
      stateTimer: 0,
      attackCd: startsCasting ? 1.2 + combatRandom() * 0.9 : 0.8,
      contactCd: 0,
      chargeDir: new Phaser.Math.Vector2(1, 0),
      hasHitThisCharge: false,
      hpFill,
      burnTime: 0,
      burnDps: 0,
      burnTick: 0,
      frostTime: 0,
      frostSlow: 0,
      shieldTime: 0,
      elite,
      chargesLeft: 0,
      trailCd: 1.2,
      countsTowardQuota,
      knockX: 0,
      knockY: 0,
      knockTime: 0
    };

    this.enemies.push(enemy);
  }

  private chooseSpawnPosition(): { x: number; y: number } {
    const margin = 92;
    let x = margin;
    let y = margin;
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const side = combatInt(0, 3);
      if (side === 0) {
        x = combatInt(margin, ARENA - margin);
        y = margin;
      } else if (side === 1) {
        x = ARENA - margin;
        y = combatInt(margin, ARENA - margin);
      } else if (side === 2) {
        x = combatInt(margin, ARENA - margin);
        y = ARENA - margin;
      } else {
        x = margin;
        y = combatInt(margin, ARENA - margin);
      }
      const distToPlayer = Phaser.Math.Distance.Between(x, y, this.playerRoot.x, this.playerRoot.y);
      if (distToPlayer > 220) return { x, y };
    }
    return { x, y };
  }

  private updateEnemies(dt: number): void {
    const current = [...this.enemies];
    for (const enemy of current) {
      this.updateEnemyStatuses(enemy, dt);
      if (enemy.dead) continue;
      if (enemy.knockTime > 0 && !ENEMY_SPECS[enemy.kind].boss) {
        enemy.knockTime = Math.max(0, enemy.knockTime - dt);
        enemy.root.x = Phaser.Math.Clamp(
          enemy.root.x + enemy.knockX * dt,
          70,
          ARENA - 70
        );
        enemy.root.y = Phaser.Math.Clamp(
          enemy.root.y + enemy.knockY * dt,
          90,
          ARENA - 70
        );
        enemy.knockX *= 0.82;
        enemy.knockY *= 0.82;
      }
      enemy.contactCd = Math.max(0, enemy.contactCd - dt);
      if (enemy.elite && this.mutatorLevel > 0) {
        enemy.attackCd -= dt * 0.12 * this.mutatorLevel;
      }
      switch (enemy.kind) {
        case 'beetle':
          this.updateBeetle(enemy, dt);
          break;
        case 'sunder':
          this.updateSunder(enemy, dt);
          break;
        case 'bat':
          this.updateBat(enemy, dt);
          break;
        case 'thunder':
          this.updateThunder(enemy, dt);
          break;
        case 'wisp':
          this.updateWisp(enemy, dt);
          break;
        case 'spore':
          this.updateSpore(enemy, dt);
          break;
        case 'slime':
          this.updateSlime(enemy, dt);
          break;
        case 'bomber':
          this.updateBomber(enemy, dt);
          break;
        case 'arbiter':
          updateArbiterBoss(enemy, dt, this.arbiterHost);
          break;
        case 'sentry':
          this.updateSentry(enemy, dt);
          break;
        case 'phase':
          this.updatePhase(enemy, dt);
          break;
        case 'core':
          updateCoreBoss(enemy, dt, this.coreHost);
          break;
        case 'seer':
          this.updateSeer(enemy, dt);
          break;
        case 'source':
          updateSourceBoss(enemy, dt, this.sourceHost);
          break;
        case 'warden':
          this.updateWarden(enemy, dt);
          break;
      }
      enemy.root.x = Phaser.Math.Clamp(enemy.root.x, 58, ARENA - 58);
      enemy.root.y = Phaser.Math.Clamp(enemy.root.y, 78, ARENA - 58);
      this.resolveCover(enemy.root, enemy.radius * 0.82);
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
    const slowScale = enemy.frostTime > 0 ? 1 - enemy.frostSlow : 1;
    enemy.attackCd = Math.max(0, enemy.attackCd - dt);

    if (enemy.state === 'approach') {
      if (dist > 4) {
        enemy.root.x += (dx / dist) * enemy.speed * slowScale * dt;
        enemy.root.y += (dy / dist) * enemy.speed * slowScale * dt;
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
      enemy.root.x += enemy.chargeDir.x * 520 * slowScale * dt;
      enemy.root.y += enemy.chargeDir.y * 520 * slowScale * dt;
      if (enemy.root.x <= 64 || enemy.root.x >= ARENA - 64 || enemy.root.y <= 84 || enemy.root.y >= ARENA - 64) {
        enemy.state = 'recover';
        enemy.stateTimer = 1.0;
      } else if (enemy.stateTimer <= 0) {
        enemy.state = 'recover';
        enemy.stateTimer = 0.95;
      }
      if (!enemy.hasHitThisCharge && dist < enemy.radius + PLAYER_RADIUS + 8) {
        enemy.hasHitThisCharge = true;
        this.hurtPlayer(12, enemy.root.x, enemy.root.y, 'charge');
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
      this.hurtPlayer(6, enemy.root.x, enemy.root.y, 'melee');
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
    const slowScale = enemy.frostTime > 0 ? 1 - enemy.frostSlow : 1;
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
        enemy.attackCd = 2.1 + combatRandom() * 0.7;
      }
    } else {
      if (dist < 205) {
        enemy.root.x -= (dx / dist) * enemy.speed * slowScale * dt;
        enemy.root.y -= (dy / dist) * enemy.speed * slowScale * dt;
      } else if (dist > 330) {
        enemy.root.x += (dx / dist) * enemy.speed * slowScale * dt;
        enemy.root.y += (dy / dist) * enemy.speed * slowScale * dt;
      } else {
        const strafe = Math.sin(this.time.now * 0.0015 + enemy.root.x) > 0 ? 1 : -1;
        enemy.root.x += (-dy / dist) * enemy.speed * 0.65 * slowScale * dt * strafe;
        enemy.root.y += (dx / dist) * enemy.speed * 0.65 * slowScale * dt * strafe;
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
      this.hurtPlayer(4, enemy.root.x, enemy.root.y, 'melee');
    }
  }

  private updateSunder(enemy: EnemyUnit, dt: number): void {
    const dx = this.playerRoot.x - enemy.root.x;
    const dy = this.playerRoot.y - enemy.root.y;
    const dist = Math.hypot(dx, dy);
    const slowScale = enemy.frostTime > 0 ? 1 - enemy.frostSlow : 1;
    enemy.attackCd = Math.max(0, enemy.attackCd - dt);

    if (enemy.state === 'approach') {
      if (dist > 4) {
        enemy.root.x += (dx / dist) * enemy.speed * slowScale * dt;
        enemy.root.y += (dy / dist) * enemy.speed * slowScale * dt;
      }
      if (dist < 420 && enemy.attackCd <= 0) {
        enemy.state = 'telegraph';
        enemy.stateTimer = 0.7;
        enemy.chargesLeft = 2;
        enemy.chargeDir.set(dx / (dist || 1), dy / (dist || 1));
        enemy.warning.setVisible(true);
        this.drawBeetleWarning(enemy);
      }
    } else if (enemy.state === 'telegraph') {
      enemy.stateTimer -= dt;
      this.drawBeetleWarning(enemy);
      if (enemy.chargesLeft === 1) {
        enemy.chargeDir.set(dx / (dist || 1), dy / (dist || 1));
      }
      if (enemy.stateTimer <= 0) {
        enemy.state = 'charge';
        enemy.stateTimer = 0.42;
        enemy.hasHitThisCharge = false;
        enemy.warning.setVisible(false);
        audio.play('dash');
      }
    } else if (enemy.state === 'charge') {
      enemy.stateTimer -= dt;
      enemy.root.x += enemy.chargeDir.x * 560 * slowScale * dt;
      enemy.root.y += enemy.chargeDir.y * 560 * slowScale * dt;
      const atWall =
        enemy.root.x <= 64 ||
        enemy.root.x >= ARENA - 64 ||
        enemy.root.y <= 84 ||
        enemy.root.y >= ARENA - 64;
      if (!enemy.hasHitThisCharge && dist < enemy.radius + PLAYER_RADIUS + 10) {
        enemy.hasHitThisCharge = true;
        this.hurtPlayer(14, enemy.root.x, enemy.root.y, 'charge');
      }
      if (atWall || enemy.stateTimer <= 0) {
        enemy.chargesLeft -= 1;
        if (enemy.chargesLeft > 0) {
          enemy.state = 'telegraph';
          enemy.stateTimer = 0.42;
          enemy.chargeDir.set(dx / (dist || 1), dy / (dist || 1));
          enemy.warning.setVisible(true);
          this.drawBeetleWarning(enemy);
        } else {
          enemy.state = 'recover';
          enemy.stateTimer = 0.85;
        }
      }
    } else if (enemy.state === 'recover') {
      enemy.stateTimer -= dt;
      if (enemy.stateTimer <= 0) {
        enemy.state = 'approach';
        enemy.attackCd = 1.2;
      }
    }

    if (enemy.state !== 'charge' && enemy.contactCd <= 0 && dist < enemy.radius + PLAYER_RADIUS) {
      enemy.contactCd = 0.9;
      this.hurtPlayer(8, enemy.root.x, enemy.root.y, 'melee');
    }
  }

  private updateThunder(enemy: EnemyUnit, dt: number): void {
    this.strafeAtRange(enemy, dt, 300, 200, 380);
    enemy.attackCd = Math.max(0, enemy.attackCd - dt);

    if (enemy.state === 'cast') {
      enemy.stateTimer -= dt;
      enemy.castRing.setVisible(true);
      enemy.castRing.setScale(1 + Math.sin(this.time.now * 0.03) * 0.12);
      this.drawThunderWarning(enemy);
      if (enemy.stateTimer <= 0) {
        enemy.state = 'idle';
        enemy.castRing.setVisible(false);
        enemy.warning.clear();
        enemy.sprite.clearTint();
        const base = Math.atan2(
          this.playerRoot.y - enemy.root.y,
          this.playerRoot.x - enemy.root.x
        );
        for (const offset of [-0.2, 0, 0.2]) {
          this.fireEnemyBolt(enemy, { angle: base + offset, speed: 250, damage: 9, tint: COLORS.cyan });
        }
        this.time.delayedCall(140, () => {
          if (enemy.dead || this.runState !== 'playing') return;
          for (const offset of [-0.1, 0.1]) {
            this.fireEnemyBolt(enemy, { angle: base + offset, speed: 230, damage: 8, tint: COLORS.cyan });
          }
        });
        enemy.attackCd = 2.7 + combatRandom() * 0.5;
      }
    } else if (enemy.attackCd <= 0) {
      enemy.state = 'cast';
      enemy.stateTimer = 0.8;
      enemy.sprite.setTint(0x9defff);
      enemy.castRing.setVisible(true);
      audio.play('spawn');
    }

    const contact = Phaser.Math.Distance.Between(
      enemy.root.x,
      enemy.root.y,
      this.playerRoot.x,
      this.playerRoot.y
    );
    if (enemy.state !== 'cast' && enemy.contactCd <= 0 && contact < enemy.radius + PLAYER_RADIUS) {
      enemy.contactCd = 0.9;
      this.hurtPlayer(5, enemy.root.x, enemy.root.y, 'melee');
    }
  }

  private drawThunderWarning(enemy: EnemyUnit): void {
    const g = enemy.warning;
    g.clear();
    const angle = Math.atan2(
      this.playerRoot.y - enemy.root.y,
      this.playerRoot.x - enemy.root.x
    );
    const reach = 420;
    const spread = 0.2;
    const pulse = 0.28 + Math.sin(this.time.now * 0.02) * 0.1;
    g.fillStyle(COLORS.cyan, 0.05);
    g.fillTriangle(
      0,
      0,
      Math.cos(angle - spread) * reach,
      Math.sin(angle - spread) * reach,
      Math.cos(angle + spread) * reach,
      Math.sin(angle + spread) * reach
    );
    g.lineStyle(1.5, COLORS.cyan, pulse);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(angle - spread) * reach, Math.sin(angle - spread) * reach);
    g.moveTo(0, 0);
    g.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
    g.moveTo(0, 0);
    g.lineTo(Math.cos(angle + spread) * reach, Math.sin(angle + spread) * reach);
    g.strokePath();
    for (let d = 26; d < reach; d += 22) {
      const t = d / reach;
      const x = Math.cos(angle) * d;
      const y = Math.sin(angle) * d;
      g.lineStyle(1, COLORS.cyan, 0.3 * (1 - t) + 0.06);
      g.beginPath();
      g.moveTo(x - Math.sin(angle) * 5, y + Math.cos(angle) * 5);
      g.lineTo(x + Math.sin(angle) * 5, y - Math.cos(angle) * 5);
      g.strokePath();
    }
  }

  private updateWisp(enemy: EnemyUnit, dt: number): void {
    this.strafeAtRange(enemy, dt, 300, 220, 380);
    enemy.attackCd = Math.max(0, enemy.attackCd - dt);

    if (enemy.state === 'cast') {
      enemy.stateTimer -= dt;
      enemy.castRing.setVisible(true);
      enemy.castRing.setScale(1 + Math.sin(this.time.now * 0.02) * 0.08);
      if (enemy.stateTimer <= 0) {
        enemy.state = 'idle';
        enemy.castRing.setVisible(false);
        enemy.sprite.clearTint();
        this.fireEnemyBolt(enemy, {
          speed: 170,
          damage: 6,
          tint: 0x8ceafa,
          slow: 0.45,
          slowDuration: 1.8,
          scale: 1.2
        });
        enemy.attackCd = 2.5 + combatRandom() * 0.6;
      }
    } else if (enemy.attackCd <= 0 && this.distanceToPlayer(enemy) < 520) {
      enemy.state = 'cast';
      enemy.stateTimer = 0.6;
      enemy.sprite.setTint(0xbfefff);
      enemy.castRing.setVisible(true);
      audio.play('spawn');
    }

    if (enemy.state !== 'cast' && enemy.contactCd <= 0 && this.distanceToPlayer(enemy) < enemy.radius + PLAYER_RADIUS) {
      enemy.contactCd = 0.9;
      this.hurtPlayer(4, enemy.root.x, enemy.root.y, 'melee');
    }
  }

  private distanceToPlayer(enemy: EnemyUnit): number {
    return Phaser.Math.Distance.Between(
      enemy.root.x,
      enemy.root.y,
      this.playerRoot.x,
      this.playerRoot.y
    );
  }

  private updateSpore(enemy: EnemyUnit, dt: number): void {
    const dx = this.playerRoot.x - enemy.root.x;
    const dy = this.playerRoot.y - enemy.root.y;
    const distance = Math.hypot(dx, dy) || 1;
    enemy.attackCd = Math.max(0, enemy.attackCd - dt);

    if (distance < 200) {
      enemy.root.x -= (dx / distance) * enemy.speed * dt;
      enemy.root.y -= (dy / distance) * enemy.speed * dt;
    }

    if (enemy.state === 'cast') {
      enemy.stateTimer -= dt;
      enemy.castRing.setVisible(true);
      enemy.castRing.setScale(1 + Math.sin(this.time.now * 0.025) * 0.1);
      if (enemy.stateTimer <= 0) {
        enemy.state = 'idle';
        enemy.castRing.setVisible(false);
        enemy.sprite.clearTint();
        const base = Math.atan2(dy, dx);
        for (const offset of [-0.34, -0.17, 0, 0.17, 0.34]) {
          this.fireEnemyBolt(enemy, {
            angle: base + offset,
            speed: 165,
            damage: 5,
            tint: 0xffb3d9,
            scale: 0.75
          });
        }
        enemy.attackCd = 2.4 + combatRandom() * 0.5;
      }
    } else if (enemy.attackCd <= 0 && distance < 470) {
      enemy.state = 'cast';
      enemy.stateTimer = 0.65;
      enemy.sprite.setTint(0xffd6ea);
      enemy.castRing.setVisible(true);
      audio.play('spawn');
    }

    if (enemy.contactCd <= 0 && distance < enemy.radius + PLAYER_RADIUS) {
      enemy.contactCd = 0.9;
      this.hurtPlayer(4, enemy.root.x, enemy.root.y, 'melee');
    }
  }

  private updateSlime(enemy: EnemyUnit, dt: number): void {
    const dx = this.playerRoot.x - enemy.root.x;
    const dy = this.playerRoot.y - enemy.root.y;
    const distance = Math.hypot(dx, dy) || 1;
    const slowScale = enemy.frostTime > 0 ? 1 - enemy.frostSlow : 1;

    enemy.root.x += (dx / distance) * enemy.speed * slowScale * dt;
    enemy.root.y += (dy / distance) * enemy.speed * slowScale * dt;

    enemy.trailCd -= dt;
    if (enemy.trailCd <= 0 && distance < 300) {
      enemy.trailCd = 1.7;
      this.spawnFirePatch(enemy.root.x, enemy.root.y + 8, 44, 2.6);
    }

    if (enemy.contactCd <= 0 && distance < enemy.radius + PLAYER_RADIUS) {
      enemy.contactCd = 0.9;
      this.hurtPlayer(7, enemy.root.x, enemy.root.y, 'melee');
    }
  }

  private updateSentry(enemy: EnemyUnit, dt: number): void {
    enemy.attackCd = Math.max(0, enemy.attackCd - dt);
    const dist = this.distanceToPlayer(enemy);
    if (enemy.state === 'cast') {
      enemy.stateTimer -= dt;
      enemy.castRing.setVisible(true);
      enemy.castRing.setScale(1 + Math.sin(this.time.now * 0.03) * 0.12);
      const angle = Math.atan2(
        this.playerRoot.y - enemy.root.y,
        this.playerRoot.x - enemy.root.x
      );
      enemy.chargeDir.set(Math.cos(angle), Math.sin(angle));
      this.drawSentryWarning(enemy);
      if (enemy.stateTimer <= 0) {
        enemy.state = 'idle';
        enemy.castRing.setVisible(false);
        enemy.warning.setVisible(false);
        enemy.sprite.clearTint();
        this.fireEnemyBolt(enemy, {
          angle,
          speed: 340,
          damage: 11,
          tint: COLORS.orange,
          scale: 1.2
        });
        enemy.attackCd = 2.4 + combatRandom() * 0.5;
      }
    } else if (enemy.attackCd <= 0 && dist < 560) {
      enemy.state = 'cast';
      enemy.stateTimer = 0.55;
      enemy.sprite.setTint(0xffc98a);
      enemy.castRing.setVisible(true);
      enemy.warning.setVisible(true);
      audio.play('spawn');
    }

    if (enemy.state !== 'cast' && enemy.contactCd <= 0 && dist < enemy.radius + PLAYER_RADIUS) {
      enemy.contactCd = 0.9;
      this.hurtPlayer(5, enemy.root.x, enemy.root.y, 'melee');
    }
  }

  private drawSentryWarning(enemy: EnemyUnit): void {
    const g = enemy.warning;
    g.clear();
    const angle = Math.atan2(enemy.chargeDir.y, enemy.chargeDir.x);
    const reach = 700;
    g.lineStyle(2, COLORS.orange, 0.3);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
    g.strokePath();
    for (let d = 30; d < 420; d += 26) {
      const t = d / 420;
      const x = Math.cos(angle) * d;
      const y = Math.sin(angle) * d;
      g.lineStyle(1, COLORS.orange, 0.24 * (1 - t));
      g.beginPath();
      g.moveTo(x - Math.sin(angle) * 4, y + Math.cos(angle) * 4);
      g.lineTo(x + Math.sin(angle) * 4, y - Math.cos(angle) * 4);
      g.strokePath();
    }
  }

  private spawnTeleportFlash(x: number, y: number, color: number): void {
    const ring = this.add
      .circle(x, y - 8, 18, 0x000000, 0)
      .setStrokeStyle(2, color, 0.8)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(ring);
    this.tweens.add({
      targets: ring,
      scale: 3.2,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });
    const glow = this.add
      .image(x, y - 8, 'glow')
      .setDisplaySize(92, 92)
      .setTint(color)
      .setAlpha(0.4)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(glow);
    this.tweens.add({
      targets: glow,
      scale: 1.8,
      alpha: 0,
      duration: 300,
      onComplete: () => glow.destroy()
    });
  }

  private updatePhase(enemy: EnemyUnit, dt: number): void {
    const dx = this.playerRoot.x - enemy.root.x;
    const dy = this.playerRoot.y - enemy.root.y;
    const dist = Math.hypot(dx, dy);
    const slowScale = enemy.frostTime > 0 ? 1 - enemy.frostSlow : 1;
    enemy.attackCd = Math.max(0, enemy.attackCd - dt);

    if (enemy.state === 'approach') {
      if (dist > 4) {
        enemy.root.x += (dx / dist) * enemy.speed * slowScale * dt;
        enemy.root.y += (dy / dist) * enemy.speed * slowScale * dt;
      }
      if (enemy.attackCd <= 0 && dist < 440) {
        const angle = combatRandom() * Math.PI * 2;
        const radius = 170 + combatRandom() * 60;
        const nx = Phaser.Math.Clamp(
          this.playerRoot.x + Math.cos(angle) * radius,
          84,
          ARENA - 84
        );
        const ny = Phaser.Math.Clamp(
          this.playerRoot.y + Math.sin(angle) * radius,
          92,
          ARENA - 84
        );
        this.spawnTeleportFlash(enemy.root.x, enemy.root.y, COLORS.purple);
        enemy.root.setPosition(nx, ny);
        this.spawnTeleportFlash(nx, ny, COLORS.cyan);
        const ndx = this.playerRoot.x - nx;
        const ndy = this.playerRoot.y - ny;
        const len = Math.hypot(ndx, ndy) || 1;
        enemy.chargeDir.set(ndx / len, ndy / len);
        enemy.state = 'telegraph';
        enemy.stateTimer = 0.6;
        enemy.warning.setVisible(true);
        this.drawBeetleWarning(enemy);
        enemy.attackCd = 4.2;
        audio.play('spawn');
      }
    } else if (enemy.state === 'telegraph') {
      enemy.stateTimer -= dt;
      this.drawBeetleWarning(enemy);
      if (enemy.stateTimer <= 0) {
        enemy.state = 'charge';
        enemy.stateTimer = 0.4;
        enemy.hasHitThisCharge = false;
        enemy.warning.setVisible(false);
        audio.play('dash');
      }
    } else if (enemy.state === 'charge') {
      enemy.stateTimer -= dt;
      enemy.root.x += enemy.chargeDir.x * 560 * slowScale * dt;
      enemy.root.y += enemy.chargeDir.y * 560 * slowScale * dt;
      if (
        enemy.root.x <= 64 ||
        enemy.root.x >= ARENA - 64 ||
        enemy.root.y <= 84 ||
        enemy.root.y >= ARENA - 64
      ) {
        enemy.state = 'recover';
        enemy.stateTimer = 0.9;
      } else if (enemy.stateTimer <= 0) {
        enemy.state = 'recover';
        enemy.stateTimer = 0.9;
      }
      if (!enemy.hasHitThisCharge && this.distanceToPlayer(enemy) < enemy.radius + PLAYER_RADIUS + 8) {
        enemy.hasHitThisCharge = true;
        this.hurtPlayer(13, enemy.root.x, enemy.root.y, 'charge');
      }
    } else if (enemy.state === 'recover') {
      enemy.stateTimer -= dt;
      if (enemy.stateTimer <= 0) {
        enemy.state = 'approach';
        enemy.attackCd = 1.2;
      }
    }

    if (enemy.state !== 'charge' && enemy.contactCd <= 0 && dist < enemy.radius + PLAYER_RADIUS) {
      enemy.contactCd = 0.9;
      this.hurtPlayer(6, enemy.root.x, enemy.root.y, 'melee');
    }
  }

  private startCoreLaser(): void {
    if (!this.coreLaserGfx) {
      this.coreLaserGfx = this.add.graphics();
      this.addFx(this.coreLaserGfx);
    }
  }

  private drawCoreLaser(enemy: EnemyUnit, angle: number): void {
    const g = this.coreLaserGfx;
    if (!g) return;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    g.clear();
    g.lineStyle(12, COLORS.red, 0.08);
    g.beginPath();
    g.moveTo(enemy.root.x, enemy.root.y - 10);
    g.lineTo(enemy.root.x + cos * 900, enemy.root.y - 10 + sin * 900);
    g.strokePath();
    g.lineStyle(3, COLORS.orange, 0.75);
    g.beginPath();
    g.moveTo(enemy.root.x, enemy.root.y - 10);
    g.lineTo(enemy.root.x + cos * 900, enemy.root.y - 10 + sin * 900);
    g.strokePath();
  }

  private stopCoreLaser(): void {
    this.coreLaserGfx?.destroy();
    this.coreLaserGfx = undefined;
  }

  private onCorePhase(phase: number): void {
    if (phase >= 2) this.coreLaserCd = 1.2;
    this.cameras.main.shake(380, 0.005);
    this.cameras.main.flash(200, 90, 210, 255);
    audio.play('rule');
    showRuleToast(
      'chain',
      `失序核心 · 第 ${phase} 阶段`,
      phase === 1 ? '脉冲 · 扇形弹幕' : phase === 2 ? '过载 · 地面放电加剧' : '失序 · 安全区持续收缩'
    );
    this.refreshBossHud();
  }

  private spawnBossAdd(kind: EnemyKind, x: number, y: number): void {
    this.spawnEnemy(kind, x, y, false);
    const spawned = this.enemies[this.enemies.length - 1];
    if (!spawned) return;
    this.tweens.killTweensOf(spawned.root);
    this.tweens.add({
      targets: spawned.root,
      scale: { from: 0.2, to: 1 },
      alpha: { from: 0, to: 1 },
      duration: 240,
      ease: 'Back.easeOut'
    });
  }

  private updateSeer(enemy: EnemyUnit, dt: number): void {
    this.strafeAtRange(enemy, dt, 300, 220, 400);
    enemy.attackCd = Math.max(0, enemy.attackCd - dt);
    enemy.trailCd -= dt;

    if (enemy.trailCd <= 0) {
      enemy.trailCd = 7;
      this.spawnShockZone(this.playerRoot.x, this.playerRoot.y, 72, 1.0, COLORS.purple, 16);
      this.spawnTeleportFlash(enemy.root.x, enemy.root.y, COLORS.purple);
      const angle = combatRandom() * Math.PI * 2;
      const nx = Phaser.Math.Clamp(
        this.playerRoot.x + Math.cos(angle) * 240,
        92,
        ARENA - 92
      );
      const ny = Phaser.Math.Clamp(
        this.playerRoot.y + Math.sin(angle) * 240,
        100,
        ARENA - 92
      );
      enemy.root.setPosition(nx, ny);
      this.spawnTeleportFlash(nx, ny, COLORS.cyan);
      audio.play('spawn');
    }

    if (enemy.attackCd <= 0) {
      enemy.attackCd = this.bossPhase >= 2 ? 2.2 : 2.7;
      this.fireBossFan(enemy, 5, 0.9);
      enemy.castRing.setVisible(true);
      this.time.delayedCall(220, () => {
        if (!enemy.dead) enemy.castRing.setVisible(false);
      });
    }

    if (enemy.contactCd <= 0 && this.distanceToPlayer(enemy) < enemy.radius + PLAYER_RADIUS) {
      enemy.contactCd = 1.0;
      this.hurtPlayer(8, enemy.root.x, enemy.root.y, 'melee');
    }
  }

  private updateWarden(enemy: EnemyUnit, dt: number): void {
    this.strafeAtRange(enemy, dt, 280, 210, 420);
    enemy.attackCd = Math.max(0, enemy.attackCd - dt);
    enemy.trailCd -= dt;

    if (enemy.trailCd <= 0) {
      enemy.trailCd = 6;
      enemy.shieldTime = 3;
      enemy.castRing.setVisible(true);
      const ring = this.add
        .circle(enemy.root.x, enemy.root.y - 8, enemy.radius + 22, 0x000000, 0)
        .setStrokeStyle(2, COLORS.cyan, 0.7)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.addFx(ring);
      this.tweens.add({
        targets: ring,
        scale: 1.6,
        alpha: 0,
        duration: 380,
        onComplete: () => ring.destroy()
      });
      audio.play('spawn');
    }

    if (enemy.attackCd <= 0 && this.distanceToPlayer(enemy) < 560) {
      enemy.attackCd = 2.8;
      this.fireEnemyBolt(enemy, {
        speed: 200,
        damage: 7,
        tint: COLORS.cyan,
        scale: 1.1
      });
    }

    if (enemy.contactCd <= 0 && this.distanceToPlayer(enemy) < enemy.radius + PLAYER_RADIUS) {
      enemy.contactCd = 0.9;
      this.hurtPlayer(6, enemy.root.x, enemy.root.y, 'melee');
    }
  }

  private onSourcePhase(phase: number): void {
    this.cameras.main.shake(480, 0.007);
    this.cameras.main.flash(240, 190, 120, 255);
    audio.play('victory');
    showRuleToast(
      'blast',
      `规则之源 · 第 ${phase} 阶段`,
      phase === 1 ? '源律 · 扇形弹幕' : phase === 2 ? '规则风暴 · 封印与召唤' : '终焉 · 虚空裂隙全覆盖'
    );
    this.refreshBossHud();
  }

  private updateBomber(enemy: EnemyUnit, dt: number): void {
    const dx = this.playerRoot.x - enemy.root.x;
    const dy = this.playerRoot.y - enemy.root.y;
    const distance = Math.hypot(dx, dy) || 1;
    const slowScale = enemy.frostTime > 0 ? 1 - enemy.frostSlow : 1;

    if (enemy.state === 'telegraph') {
      enemy.stateTimer -= dt;
      const pulse = 1 + Math.sin(this.time.now * 0.04) * 0.16;
      enemy.sprite.setScale(pulse * 1.06);
      if (enemy.stateTimer <= 0) {
        this.killEnemy(enemy);
      }
      return;
    }

    if (distance > 4) {
      enemy.root.x += (dx / distance) * enemy.speed * slowScale * dt;
      enemy.root.y += (dy / distance) * enemy.speed * slowScale * dt;
    }

    if (distance < 78) {
      enemy.state = 'telegraph';
      enemy.stateTimer = 0.62;
      enemy.sprite.setTint(0xffb066);
      audio.play('spawn');
      return;
    }

    if (enemy.contactCd <= 0 && distance < enemy.radius + PLAYER_RADIUS) {
      enemy.contactCd = 0.9;
      this.hurtPlayer(6, enemy.root.x, enemy.root.y, 'melee');
    }
  }

  private onBossDefeated(boss: EnemyUnit): void {
    this.victoryLocked = true;
    this.invuln = Math.max(this.invuln, 3);
    this.slowTime = 0;
    this.slowFactor = 0;
    for (const bolt of this.enemyBolts) {
      this.tweens.killTweensOf(bolt.root);
      bolt.root.destroy(true);
    }
    this.enemyBolts = [];
    for (const hazard of this.hazards) {
      this.tweens.killTweensOf(hazard.root);
      hazard.root.destroy(true);
    }
    this.hazards = [];
    this.coreLaserGfx?.destroy();
    this.coreLaserGfx = undefined;
    this.coreLaserTime = 0;
    this.bossRef = null;
    this.sealSlot = null;
    this.sealTime = 0;
    setSealedRule(null, false);
    setBossBar(null);
    for (const enemy of [...this.enemies]) {
      if (enemy === boss) continue;
      enemy.dead = true;
      this.spawnDeathBurst(enemy.root.x, enemy.root.y - 8, enemy.kind);
      this.tweens.killTweensOf(enemy.root);
      this.tweens.add({
        targets: enemy.root,
        alpha: 0,
        scale: 0.6,
        duration: 320,
        onComplete: () => enemy.root.destroy(true)
      });
    }
    this.enemies = [];
    this.pendingSpawns = 0;
    this.spawnExplosion(boss.root.x, boss.root.y - 20, 200);
    this.cameras.main.shake(700, 0.01);
    this.cameras.main.flash(420, 255, 235, 190);
    audio.play('victory');
    this.time.delayedCall(900, () => {
      if (this.runState !== 'playing' || !this.victoryLocked) return;
      if (CHAPTERS[this.chapterIndex + 1]) {
        this.openChapterReward();
      } else {
        this.finishChapter();
      }
    });
  }

  private refreshBossHud(): void {
    const boss = this.bossRef;
    if (!boss || boss.dead) {
      setBossBar(null);
      return;
    }
    setBossBar({
      name: ENEMY_SPECS[boss.kind].name,
      hp: boss.hp,
      maxHp: boss.maxHp,
      phase: this.bossPhase
    });
  }

  private fireBossFan(enemy: EnemyUnit, bolts: number, spreadRad: number): void {
    const base = Math.atan2(this.playerRoot.y - enemy.root.y, this.playerRoot.x - enemy.root.x);
    for (let i = 0; i < bolts; i += 1) {
      const t = bolts === 1 ? 0.5 : i / (bolts - 1);
      const angle = base - spreadRad / 2 + spreadRad * t;
      this.fireEnemyBolt(enemy, {
        angle,
        speed: 205,
        damage: 9,
        tint: COLORS.purple,
        scale: 1.15
      });
    }
    this.cameras.main.shake(90, 0.0012);
  }

  private summonBossAdds(): void {
    const alive = this.enemies.filter((item) => !item.dead && !item.elite).length;
    if (alive >= 4) return;
    const kinds: EnemyKind[] = this.bossPhase >= 3 ? ['bomber', 'wisp'] : ['bat', 'spore'];
    const spots: [number, number][] = [
      [140, 190],
      [ARENA - 140, 190]
    ];
    kinds.forEach((kind, index) => {
      this.spawnEnemy(kind, spots[index][0], spots[index][1], false);
      const spawned = this.enemies[this.enemies.length - 1];
      if (spawned) {
        this.tweens.killTweensOf(spawned.root);
        this.tweens.add({
          targets: spawned.root,
          scale: { from: 0.2, to: 1 },
          alpha: { from: 0, to: 1 },
          duration: 260,
          ease: 'Back.easeOut'
        });
      }
    });
    audio.play('spawn');
  }

  private castRuleSeal(): void {
    const x = this.playerRoot.x;
    const y = this.playerRoot.y;
    const radius = 96;
    this.sealZone = { x, y, radius, time: 1.15 };
    const ring = this.add
      .circle(x, y, radius, 0x8d6a39, 0.12)
      .setStrokeStyle(2.5, COLORS.gold, 0.75)
      .setBlendMode(Phaser.BlendModes.ADD);
    const inner = this.add
      .circle(x, y, radius * 0.55, 0x000000, 0)
      .setStrokeStyle(1.5, COLORS.purple, 0.55);
    this.addFx(ring);
    this.addFx(inner);
    this.tweens.add({
      targets: [ring, inner],
      scale: { from: 0.18, to: 1 },
      duration: 1150,
      ease: 'Cubic.easeOut'
    });
    this.tweens.add({
      targets: ring,
      alpha: { from: 1, to: 0.35 },
      duration: 260,
      yoyo: true,
      repeat: 3
    });
    this.time.delayedCall(1150, () => {
      const hit =
        Phaser.Math.Distance.Between(x, y, this.playerRoot.x, this.playerRoot.y) <
        radius + PLAYER_RADIUS * 0.5;
      ring.destroy();
      inner.destroy();
      this.sealZone = null;
      if (hit) this.sealRandomRule();
    });
  }

  private sealRandomRule(duration = 4, label = '规则被封印'): void {
    const slots: ('trajectory' | 'impact')[] = [];
    if (this.build.trajectory) slots.push('trajectory');
    if (this.build.impact) slots.push('impact');
    if (!slots.length) return;
    const slot = slots[combatInt(0, slots.length - 1)];
    this.sealSlot = slot;
    this.sealTime = duration;
    setSealedRule(slot, true);
    audio.play('hurt');
    this.cameras.main.flash(140, 120, 90, 200);
    showRuleToast(
      'pierce',
      label,
      `${slot === 'trajectory' ? '弹道' : '命中'}规则离线 ${duration} 秒`
    );
  }

  private onBossPhase(phase: number): void {
    if (phase === 2) {
      this.bossChargeCd = 1.4;
      this.bossSummonCd = 2.6;
    } else if (phase === 3) {
      this.bossSealCd = 1.2;
    }
    this.cameras.main.shake(420, 0.006);
    this.cameras.main.flash(220, 150, 110, 255);
    const enemy = this.bossRef;
    const ringX = enemy?.root.x ?? ARENA / 2;
    const ringY = (enemy?.root.y ?? 235) - 10;
    const ring = this.add
      .circle(ringX, ringY, 60, 0x000000, 0)
      .setStrokeStyle(4, COLORS.purple, 0.9)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(ring);
    this.tweens.add({
      targets: ring,
      scale: 5.5,
      alpha: 0,
      duration: 780,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });
    audio.play('rule');
    showRuleToast('blast', `规则审判者 · 第 ${phase} 阶段`, phase === 1 ? '秩序 · 扇形审判' : phase === 2 ? '混乱 · 冲锋与召唤' : '规则剥夺 · 小心封印区');
    this.refreshBossHud();
  }

  private registerOverloadHit(): boolean {
    return registerHit(this.mutation);
  }

  private showOverloadReady(): void {
    showRuleToast('spread', '过载核心已充能', '下一轮普通攻击伤害 ×1.8');
    audio.play('rule');
    const ring = this.add
      .circle(this.playerRoot.x, this.playerRoot.y - 16, 26, 0x000000, 0)
      .setStrokeStyle(2, COLORS.purple, 0.9)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(ring);
    this.tweens.add({
      targets: ring,
      scale: 2.4,
      alpha: 0,
      duration: 420,
      onComplete: () => ring.destroy()
    });
  }

  private spawnOverloadBurst(): void {
    const glow = this.add
      .image(this.playerRoot.x, this.playerRoot.y - 16, 'glow')
      .setDisplaySize(96, 96)
      .setTint(COLORS.purple)
      .setAlpha(0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(glow);
    this.tweens.add({
      targets: glow,
      scale: 1.7,
      alpha: 0,
      duration: 320,
      onComplete: () => glow.destroy()
    });
    audio.play('rule');
  }

  private strafeAtRange(
    enemy: EnemyUnit,
    dt: number,
    preferred: number,
    near: number,
    far: number
  ): void {
    const dx = this.playerRoot.x - enemy.root.x;
    const dy = this.playerRoot.y - enemy.root.y;
    const distance = Math.hypot(dx, dy) || 1;
    const slowScale = enemy.frostTime > 0 ? 1 - enemy.frostSlow : 1;
    const speed = enemy.speed * slowScale * dt;

    if (distance < near) {
      enemy.root.x -= (dx / distance) * speed;
      enemy.root.y -= (dy / distance) * speed;
    } else if (distance > far) {
      enemy.root.x += (dx / distance) * speed;
      enemy.root.y += (dy / distance) * speed;
    } else if (Math.abs(distance - preferred) < 90) {
      const strafe = Math.sin(this.time.now * 0.0015 + enemy.root.x) > 0 ? 1 : -1;
      enemy.root.x += (-dy / distance) * speed * 0.7 * strafe;
      enemy.root.y += (dx / distance) * speed * 0.7 * strafe;
    } else {
      enemy.root.x += (dx / distance) * speed * 0.6;
      enemy.root.y += (dy / distance) * speed * 0.6;
    }
  }

  private fireEnemyBolt(
    enemy: EnemyUnit,
    options: {
      angle?: number;
      speed?: number;
      damage?: number;
      tint?: number;
      slow?: number;
      slowDuration?: number;
      scale?: number;
    } = {}
  ): void {
    const angle =
      options.angle ??
      Math.atan2(this.playerRoot.y - enemy.root.y, this.playerRoot.x - enemy.root.x);
    this.spawnEnemyBolt(enemy.root.x, enemy.root.y - 12, angle, options);
  }

  private spawnEnemyBolt(
    x: number,
    y: number,
    angle: number,
    options: {
      speed?: number;
      damage?: number;
      tint?: number;
      slow?: number;
      slowDuration?: number;
      scale?: number;
    } = {}
  ): void {
    const tint = options.tint ?? COLORS.cyan;
    const scale = options.scale ?? 1;
    const glow = this.add
      .image(0, 0, 'glow')
      .setDisplaySize(36 * scale, 36 * scale)
      .setTint(tint)
      .setAlpha(0.65)
      .setBlendMode(Phaser.BlendModes.ADD);
    const core = this.add
      .circle(0, 0, 6 * scale, 0xd7fbff, 1)
      .setBlendMode(Phaser.BlendModes.ADD);
    const root = this.add.container(x, y, [glow, core]);
    this.addFx(root);
    this.enemyBolts.push({
      root,
      vx: Math.cos(angle) * (options.speed ?? 215),
      vy: Math.sin(angle) * (options.speed ?? 215),
      damage: options.damage ?? 8,
      radius: 10 * scale,
      life: 4,
      slowFactor: options.slow ?? 0,
      slowDuration: options.slowDuration ?? 0,
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
      if (this.coverAt(bolt.root.x, bolt.root.y, bolt.radius)) {
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
        if (bolt.slowFactor > 0) {
          this.applyPlayerSlow(bolt.slowFactor, bolt.slowDuration);
        }
        this.hurtPlayer(bolt.damage, hitX, hitY, 'bolt');
      }
    }
    this.enemyBolts = this.enemyBolts.filter((bolt) => !bolt.dead);
  }

  private applyPlayerSlow(factor: number, duration: number): void {
    if (duration <= 0 || factor <= 0) return;
    this.slowFactor = Math.max(this.slowFactor, Math.min(0.7, factor));
    this.slowTime = Math.max(this.slowTime, duration);
    this.playerSprite.setTint(0xbfe9ff);
    showRuleToast('frost', '被冰霜减速', `移动速度 -${Math.round(this.slowFactor * 100)}%`);
  }

  private spawnSlowField(x: number, y: number, radius: number, life: number): void {
    const glow = this.add
      .image(0, 0, 'glow')
      .setDisplaySize(radius * 2.2, radius * 2.2)
      .setTint(COLORS.cyan)
      .setAlpha(0.12)
      .setBlendMode(Phaser.BlendModes.ADD);
    const disc = this.add.circle(0, 0, radius, COLORS.cyan, 0.06);
    const ring = this.add
      .circle(0, 0, radius, 0x000000, 0)
      .setStrokeStyle(1.8, COLORS.cyan, 0.42);
    const root = this.add.container(x, y, [glow, disc, ring]);
    this.addFx(root);
    this.slowFields.push({
      root,
      x,
      y,
      radius,
      life,
      maxLife: life,
      tick: 0,
      dead: false
    });
  }

  private updateSlowFields(dt: number): void {
    for (const field of this.slowFields) {
      if (field.dead) continue;
      field.life -= dt;
      field.root.setAlpha(Math.max(0, field.life / field.maxLife));
      if (field.life <= 0) {
        field.dead = true;
        field.root.destroy(true);
        continue;
      }
      field.tick -= dt;
      if (field.tick > 0) continue;
      field.tick = 0.4;
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        const dist = Phaser.Math.Distance.Between(
          field.x,
          field.y,
          enemy.root.x,
          enemy.root.y
        );
        if (dist > field.radius + enemy.radius) continue;
        const merged = mergeFrost(
          { time: enemy.frostTime, slow: enemy.frostSlow },
          0.5,
          0.6
        );
        enemy.frostTime = merged.time;
        enemy.frostSlow = merged.slow;
        enemy.aura.setTint(COLORS.cyan);
        enemy.aura.setAlpha(0.24);
      }
    }
    this.slowFields = this.slowFields.filter((field) => !field.dead);
  }

  private spawnFirePatch(x: number, y: number, radius: number, life: number): void {
    const activeFires = this.hazards.filter(
      (hazard) => hazard.kind === 'fire' && !hazard.dead
    ).length;
    if (this.hordeEnabled && activeFires >= 12) return;
    const glow = this.add
      .image(0, 0, 'glow')
      .setDisplaySize(radius * 2.3, radius * 2.3)
      .setTint(COLORS.orange)
      .setAlpha(0.2)
      .setBlendMode(Phaser.BlendModes.ADD);
    const disc = this.add
      .circle(0, 0, radius, 0xff7a34, 0.13)
      .setStrokeStyle(1.5, COLORS.orange, 0.4);
    const root = this.add.container(x, y, [glow, disc]);
    this.addFx(root);
    this.tweens.add({
      targets: glow,
      alpha: 0.1,
      scale: 0.94,
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    this.hazards.push({
      root,
      kind: 'fire',
      x,
      y,
      radius,
      life,
      maxLife: life,
      armTime: 0,
      damage: 5,
      triggered: false,
      dead: false
    });
  }

  private spawnShockZone(
    x: number,
    y: number,
    radius: number,
    delay: number,
    color: number = COLORS.cyan,
    damage = 14
  ): void {
    const glow = this.add
      .image(0, 0, 'glow')
      .setDisplaySize(radius * 2.1, radius * 2.1)
      .setTint(color)
      .setAlpha(0.12)
      .setBlendMode(Phaser.BlendModes.ADD);
    const disc = this.add.circle(0, 0, radius, color, 0.08);
    const ring = this.add
      .circle(0, 0, radius, 0x000000, 0)
      .setStrokeStyle(2.5, color, 0.55);
    const root = this.add.container(x, y, [glow, disc, ring]);
    this.addFx(root);
    this.tweens.add({
      targets: glow,
      alpha: 0.4,
      duration: delay * 1000,
      ease: 'Sine.easeIn'
    });
    this.tweens.add({
      targets: ring,
      scale: 0.86,
      duration: delay * 1000,
      ease: 'Cubic.easeIn'
    });
    this.hazards.push({
      root,
      kind: 'shock',
      x,
      y,
      radius,
      life: delay + 0.18,
      maxLife: delay + 0.18,
      armTime: delay,
      damage,
      triggered: false,
      dead: false
    });
  }

  private updateHazards(dt: number): void {
    for (const hazard of this.hazards) {
      if (hazard.dead) continue;
      if (hazard.kind === 'shock') {
        hazard.armTime -= dt;
        if (hazard.armTime <= 0 && !hazard.triggered) {
          hazard.triggered = true;
          hazard.root.setAlpha(0);
          this.spawnExplosion(hazard.x, hazard.y, hazard.radius * 1.35);
          audio.play('explosion');
          if (
            Phaser.Math.Distance.Between(
              hazard.x,
              hazard.y,
              this.playerRoot.x,
              this.playerRoot.y
            ) <
            hazard.radius + PLAYER_RADIUS * 0.55
          ) {
            this.hurtPlayer(hazard.damage, hazard.x, hazard.y, 'hazard');
          }
        }
        hazard.life -= dt;
        if (hazard.life <= 0) {
          hazard.dead = true;
          hazard.root.destroy(true);
        }
        continue;
      }
      hazard.life -= dt;
      hazard.root.setAlpha(Math.max(0, hazard.life / hazard.maxLife));
      if (hazard.life <= 0) {
        hazard.dead = true;
        hazard.root.destroy(true);
        continue;
      }
      if (
        this.invuln <= 0 &&
        Phaser.Math.Distance.Between(
          hazard.x,
          hazard.y,
          this.playerRoot.x,
          this.playerRoot.y
        ) <
          hazard.radius + PLAYER_RADIUS * 0.55
      ) {
        this.hurtPlayer(hazard.damage, hazard.x, hazard.y, 'hazard');
      }
    }
    this.hazards = this.hazards.filter((hazard) => !hazard.dead);
  }

  private updateRoomHazard(dt: number): void {
    const room = this.getRoom();
    if (!room.hazard) return;
    this.roomHazardCd -= dt;
    if (this.roomHazardCd > 0) return;
    if (room.hazard === 'void-rift') {
      this.roomHazardCd = 3.6 * getMutator(this.mutatorLevel).hazardInterval;
      this.spawnShockZone(this.playerRoot.x, this.playerRoot.y, 70, 1.1, COLORS.purple, 17);
      for (let i = 0; i < 2; i += 1) {
        this.spawnShockZone(
          combatInt(120, ARENA - 120),
          combatInt(130, ARENA - 120),
          62,
          1.3,
          COLORS.purple,
          17
        );
      }
      return;
    }
    this.roomHazardCd = 4.2 * getMutator(this.mutatorLevel).hazardInterval;
    this.spawnShockZone(this.playerRoot.x, this.playerRoot.y, 54, 0.95);
    for (let i = 0; i < 2; i += 1) {
      const x = combatInt(110, ARENA - 110);
      const y = combatInt(120, ARENA - 110);
      this.spawnShockZone(x, y, 48, 1.15);
    }
  }

  private updateRoomModifier(dt: number): void {
    if (this.getRoom().modifier !== 'rule-null') return;
    this.roomModifierCd -= dt;
    if (this.roomModifierCd > 0) return;
    this.roomModifierCd = 9;
    if (this.sealSlot) return;
    if (!this.build.trajectory && !this.build.impact) return;
    this.sealRandomRule(2.5, '逆律 · 规则失效');
    const ring = this.add
      .circle(this.playerRoot.x, this.playerRoot.y - 10, 44, 0x000000, 0)
      .setStrokeStyle(2.5, COLORS.purple, 0.8)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(ring);
    this.tweens.add({
      targets: ring,
      scale: 2.4,
      alpha: 0,
      duration: 520,
      onComplete: () => ring.destroy()
    });
  }

  private detonate(enemy: EnemyUnit): void {
    const radius = 86;
    this.spawnExplosion(enemy.root.x, enemy.root.y - 10, radius);
    audio.play('explosion');
    this.cameras.main.shake(130, 0.003);
    if (
      Phaser.Math.Distance.Between(enemy.root.x, enemy.root.y, this.playerRoot.x, this.playerRoot.y) <
      radius + PLAYER_RADIUS
    ) {
      this.invuln = 0;
      this.hurtPlayer(18, enemy.root.x, enemy.root.y, 'explosion');
    }
  }

  private hurtPlayer(
    amount: number,
    sourceX: number,
    sourceY: number,
    source: DamageSource = 'other'
  ): void {
    if (this.runState !== 'playing' || this.victoryLocked || this.invuln > 0) return;
    if (this.godMode) return;
    if (
      this.relics.includes('frost-crown') &&
      this.enemies.some(
        (enemy) =>
          !enemy.dead &&
          enemy.frostTime > 0 &&
          Phaser.Math.Distance.Between(enemy.root.x, enemy.root.y, sourceX, sourceY) < 120
      )
    ) {
      amount = Math.round(amount * 0.75);
    }
    if (this.relics.includes('greed')) {
      amount = Math.round(amount * 1.2);
    }
    this.damageTaken[source] += amount;
    this.hp = Math.max(0, this.hp - amount);
    this.invuln = 1.0;
    setHp(this.hp, this.maxHp);
    this.refreshRoomHud();
    audio.play('hurt');
    this.cameras.main.shake(this.hordeEnabled ? 90 : 130, this.hordeEnabled ? 0.0018 : 0.0022);
    this.cameras.main.flash(this.hordeEnabled ? 65 : 110, 255, 55, 80);
    this.spawnHitDirection(sourceX, sourceY);
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
    const room = this.getRoom();
    if (this.waveDirector) {
      if (this.roomKills >= room.quota) {
        this.waveDirector.complete();
        return;
      }
      const before = this.waveDirector.snapshot().wave;
      this.waveDirector.update(
        dt,
        this.enemies.length + this.pendingSpawns,
        () => this.spawnWaveEnemy()
      );
      const snapshot = this.waveDirector.snapshot();
      if (snapshot.wave !== before && snapshot.wave > 0) {
        showWaveBanner(snapshot.wave, snapshot.waves);
        audio.play('spawn');
      }
      if (
        this.chapterIndex === 0 &&
        !this.waveCaptainSpawned &&
        !room.elite &&
        this.stepIndex >= 5 &&
        room.quota >= 20 &&
        snapshot.wave >= 3
      ) {
        this.waveCaptainSpawned = true;
        this.spawnWaveCaptain();
      }
      return;
    }
    if (this.roomSpawned >= room.quota) return;
    this.spawnCd -= dt;
    if (this.spawnCd > 0 || this.enemies.length + this.pendingSpawns >= room.maxAlive) return;
    const kind = pickSpawnKind(room, combatRandom);
    const pos = this.chooseSpawnPosition();
    this.spawnPortal(kind, pos.x, pos.y);
    this.roomSpawned += 1;
    this.spawnCd = room.spawnInterval;
  }

  private spawnWaveEnemy(): void {
    const room = this.getRoom();
    const kind = this.pickWaveKind(room);
    const pos = this.chooseSpawnPosition();
    this.spawnPortal(kind, pos.x, pos.y, true);
    this.roomSpawned += 1;
  }

  private pickWaveKind(room: RoomDef): EnemyKind {
    if (this.chapterIndex > 0 && combatRandom() < 0.5) {
      const fodder: EnemyKind[] =
        this.chapterIndex === 1
          ? ['beetle', 'slime', 'bomber']
          : ['bat', 'spore', 'wisp'];
      return fodder[combatInt(0, fodder.length - 1)];
    }
    return pickSpawnKind(room, combatRandom);
  }

  private waveCountForRoom(room: RoomDef): number | undefined {
    if (this.chapterIndex !== 0 || room.elite || this.stepIndex < 5) return undefined;
    return [2, 3, 5, 4][this.stepIndex % 4];
  }

  private spawnWaveCaptain(): void {
    const kind: EnemyKind = combatRandom() < 0.5 ? 'sunder' : 'thunder';
    const pos = this.chooseSpawnPosition();
    this.spawnEnemy(kind, pos.x, pos.y, false);
    this.spawnLeaderBurst(pos.x, pos.y);
    showRuleToast('chain', '怪潮头目', '精英混入怪潮 · 不计入清场配额');
  }

  private updateHud(dt: number): void {
    this.hudTick += dt;
    if (this.hudTick >= 0.1) {
      this.hudTick = 0;
      setRunClock(this.elapsed);
      if (this.waveDirector) {
        const wave = this.waveDirector.snapshot();
        setWaveStatus(wave.wave, wave.waves, this.enemies.length + this.pendingSpawns);
      }
      if (this.bossRef) this.refreshBossHud();
    }
  }

  private endRun(victory: boolean, stageOnly = false): void {
    if (this.runState === 'ended') return;
    this.runState = 'ended';
    this.roomState = 'fighting';
    this.rewardOpen = false;
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
      stageOnly,
      time: this.elapsed,
      kills: this.kills,
      killStreakBest: this.killStreakBest,
      overloads: this.totalOverloads,
      novas: this.totalNovas,
      rules: Number(Boolean(this.build.trajectory)) + Number(Boolean(this.build.impact)),
      combo: getBuildCombo(this.build).name,
      levelSum: buildLevelSum(this.build),
      roomsCleared: this.stepsClearedBefore + (victory ? this.stepTotal : this.stepIndex),
      roomsTotal: this.stepsClearedBefore + this.stepTotal,
      chapterIndex: this.chapterIndex,
      chaptersTotal: CHAPTERS.length,
      startChapter: this.startChapter,
      worldTheme: getWorldTheme(this.chapterIndex).id,
      worldThemeName: getWorldTheme(this.chapterIndex).name,
      chapterName: this.chapter.name,
      mutatorLevel: this.mutatorLevel,
      mutatorName: getMutator(this.mutatorLevel).name,
      mutation: this.mutation.id ? MUTATIONS[this.mutation.id].name : null,
      relics: this.relics.map((id) => RELICS[id].name),
      ascensions: [this.build.trajectory, this.build.impact, this.build.secondary]
        .map((ref) => (ref?.ascended ? getAscensionForRule(ref.key)?.name ?? null : null))
        .filter((name): name is string => Boolean(name)),
      lateUpgrades: this.lateUpgrades.map((id) => LATE_UPGRADES[id].name),
      rulesSeen: [
        ...new Set(
          [
            ...this.acquired,
            this.build.trajectory?.key,
            this.build.impact?.key,
            this.build.secondary?.key
          ].filter((key): key is RuleKey => Boolean(key))
        )
      ],
      rulesAscended: [this.build.trajectory, this.build.impact, this.build.secondary]
        .map((ref) => (ref?.ascended ? ref.key : null))
        .filter((key): key is RuleKey => Boolean(key)),
      build: JSON.parse(JSON.stringify(this.build)) as PlayerBuild,
      maxHp: this.maxHp,
      damage: DAMAGE_SOURCES.map((source) => ({
        source,
        label: DAMAGE_LABELS[source],
        amount: Math.round(this.damageTaken[source])
      }))
        .filter((entry) => entry.amount > 0)
        .sort((a, b) => b.amount - a.amount)
    } satisfies RunEndPayload);
  }

  private spawnExplosion(x: number, y: number, radius = 74): void {
    const s = radius / 74;
    const glow = this.add
      .image(x, y, 'glow')
      .setDisplaySize(38 * s, 38 * s)
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
      .circle(x, y, 16 * s, 0x000000, 0)
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
      .setDisplaySize(24 * s, 24 * s)
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

  private spawnHitDirection(sourceX: number, sourceY: number): void {
    const angle = Math.atan2(sourceY - this.playerRoot.y, sourceX - this.playerRoot.x);
    const arc = this.add.graphics();
    arc.lineStyle(3, 0xff4d5e, 0.9);
    arc.beginPath();
    arc.arc(0, 0, 40, angle - 0.42, angle + 0.42);
    arc.strokePath();
    arc.setPosition(this.playerRoot.x, this.playerRoot.y - 6);
    arc.setBlendMode(Phaser.BlendModes.ADD);
    this.addFx(arc);
    this.tweens.add({
      targets: arc,
      alpha: 0,
      scale: 1.45,
      duration: 360,
      ease: 'Cubic.easeOut',
      onComplete: () => arc.destroy()
    });
  }

  private spawnHitSpark(x: number, y: number): void {
    if (this.liveHitSparks >= MAX_HIT_SPARKS) return;
    this.liveHitSparks += 1;
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
      onComplete: () => {
        this.liveHitSparks = Math.max(0, this.liveHitSparks - 1);
        ring.destroy();
      }
    });
  }

  private spawnDeathBurst(x: number, y: number, kind: EnemyKind): void {
    const color = RULE_TINTS[ENEMY_SPECS[kind].rule];
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

  private spawnDamageNumber(
    x: number,
    y: number,
    text: string,
    color: string,
    fontSize = 22
  ): void {
    if (this.liveDamageNumbers >= MAX_DAMAGE_NUMBERS) return;
    this.liveDamageNumbers += 1;
    let label = this.damageLabelPool.find((item) => !item.active);
    if (!label) {
      if (this.damageLabelPool.length >= MAX_DAMAGE_NUMBERS) {
        this.liveDamageNumbers = Math.max(0, this.liveDamageNumbers - 1);
        return;
      }
      label = this.add
        .text(0, 0, '', {
          fontFamily: 'Bahnschrift, "Noto Sans SC", sans-serif',
          fontSize: `${fontSize}px`,
          fontStyle: 'bold',
          color,
          stroke: '#160c07',
          strokeThickness: 4
        })
        .setOrigin(0.5);
      this.addFx(label);
      this.damageLabelPool.push(label);
    }
    label
      .setText(text)
      .setPosition(x, y)
      .setFontSize(fontSize)
      .setColor(color)
      .setAlpha(0.95)
      .setScale(1)
      .setActive(true)
      .setVisible(true);
    this.tweens.add({
      targets: label,
      y: y - 40,
      alpha: 0,
      scale: 0.86,
      duration: 650,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.liveDamageNumbers = Math.max(0, this.liveDamageNumbers - 1);
        label.setActive(false).setVisible(false);
      }
    });
  }

  private addFx(obj: Phaser.GameObjects.GameObject): void {
    if (!this.fxLayer) return;
    this.fxLayer.add(obj);
  }

  update(_time: number, deltaMs: number): void {
    if (this.runState !== 'playing' || this.roomState !== 'fighting') return;
    if (this.hitStopMs > 0) {
      this.hitStopMs = Math.max(0, this.hitStopMs - deltaMs);
      return;
    }
    this.killBurst = 0;
    if (this.killStreakTimer > 0) {
      this.killStreakTimer = Math.max(0, this.killStreakTimer - deltaMs / 1000);
      if (this.killStreakTimer === 0) {
        this.killStreak = 0;
        setKillStreak(0, this.killStreakBest);
      }
    }
    const dt = Math.min(deltaMs, 50) / 1000;
    this.elapsed += dt;
    this.updateRelicTimers(dt);

    tickMutation(this.mutation, dt);
    if (this.sealTime > 0) {
      this.sealTime = Math.max(0, this.sealTime - dt);
      if (this.sealTime === 0 && this.sealSlot) {
        this.sealSlot = null;
        setSealedRule(null, false);
        showRuleToast('pierce', '规则解封', '被封印的规则已经恢复');
      }
    }

    this.updatePlayer(dt);
    if (this.runState !== 'playing') return;
    this.updateEnemies(dt);
    if (this.runState !== 'playing') return;
    this.updateBolts(dt);
    this.updateEnemyBolts(dt);
    this.updateHazards(dt);
    this.updateSlowFields(dt);
    this.updatePickups(dt);
    this.updateSpawns(dt);
    this.updateRoomHazard(dt);
    this.updateRoomModifier(dt);
    this.updateHud(dt);
  }
}
