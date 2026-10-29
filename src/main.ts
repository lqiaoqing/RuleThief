import Phaser from 'phaser';
import './style.css';
import './m0.css';
import { M0Scene } from './game/M0Scene';
import type { RunEndPayload, ChapterClearPayload } from './game/M0Scene';
import { audio } from './game/audio';
import { formatTime } from './game/theme';
import type { ImpactKey, RuleKey, TrajectoryKey } from './game/rules';
import { ALL_RULE_KEYS, getRuleName } from './game/rules';
import type { RelicId } from './game/relics';
import type { LateUpgradeId } from './game/lateUpgrades';
import type { RoomCleared, RoomPreview, EnemyKind, SupportId } from './game/rooms';
import type { EventPayload, RouteChoicePayload } from './game/run';
import { CHAPTERS } from './game/run';
import { formatRecordLine, saveRun, summarize } from './game/telemetry';
import {
  ACHIEVEMENTS,
  UNLOCKS,
  applyRunToMeta,
  canUnlock,
  clearedChapterCount,
  loadMeta,
  saveMeta,
  unlockMeta
} from './game/meta';
import { MUTATORS, clampMutator, getMutator } from './game/mutators';
import { setRandomSeed } from './game/rng';
import {
  isEventVisible,
  isRewardVisible,
  isRoomVisible,
  isRouteVisible,
  pickReward,
  renderEvent,
  renderRewards,
  renderRoomPreview,
  renderRoute,
  setEventVisible,
  setRewardVisible,
  setRoomVisible,
  setRouteVisible
} from './ui/altar';

declare global {
  interface Window {
    __RT_READY__?: boolean;
    __RT_GAME__?: Phaser.Game;
    __RT_SCENE__?: M0Scene;
    __RT_SNAPSHOT__?: () => Record<string, unknown>;
    __RT_GRANT__?: (rule: RuleKey) => void;
    __RT_GRANT_ALL__?: () => void;
    __RT_DAMAGE__?: (amount: number) => void;
    __RT_DAMAGE_FROM__?: (amount: number, x: number, y: number) => void;
    __RT_END__?: (victory: boolean) => void;
    __RT_SPAWN__?: (kind?: EnemyKind) => void;
    __RT_SPAWN_AT__?: (kind: EnemyKind, x: number, y: number) => void;
    __RT_KILL_ALL__?: () => void;
    __RT_KILL_ONE__?: (index?: number) => void;
    __RT_PURGE_ENEMIES__?: () => void;
    __RT_POSE__?: (build?: {
      trajectory?: TrajectoryKey | null;
      impact?: ImpactKey | null;
      trajectoryLevel?: 1 | 2 | 3;
      impactLevel?: 1 | 2 | 3;
    }) => void;
    __RT_TABLEAU__?: (
      kinds: EnemyKind[],
      build?: {
        trajectory?: TrajectoryKey | null;
        impact?: ImpactKey | null;
        trajectoryLevel?: 1 | 2 | 3;
        impactLevel?: 1 | 2 | 3;
      }
    ) => void;
    __RT_SET_STATS__?: (elapsed: number, kills: number) => void;
    __RT_SET_BUILD__?: (
      trajectory: TrajectoryKey | null,
      impact: ImpactKey | null,
      trajectoryLevel?: 1 | 2 | 3,
      impactLevel?: 1 | 2 | 3
    ) => void;
    __RT_SET_THIRD__?: (key: RuleKey, level?: 1 | 2 | 3) => void;
    __RT_SWAP__?: () => boolean;
    __RT_REFORGE__?: (key: RuleKey) => boolean;
    __RT_STEP__?: (index: number) => boolean;
    __RT_SET_STREAK__?: (count: number) => void;
    __RT_GOD__?: (enabled: boolean) => void;
    __RT_DASH__?: () => void;
    __RT_CLEAR_SEAL__?: () => void;
    __RT_SET_ROOM_KILLS__?: (kills: number) => void;
    __RT_DAMAGE_BOSS__?: (amount: number) => void;
    __RT_VOLLEY__?: () => number;
    __RT_FREEZE_ATTACK__?: () => void;
    __RT_HEAL__?: (amount: number) => void;
    __RT_INTRO__?: () => boolean;
    __RT_OPEN_EVENT__?: (id: string) => void;
    __RT_CAST_SEAL__?: () => void;
    __RT_SPAWN_HAZARD__?: (x: number, y: number) => void;
    __RT_CHAPTER_BOSS__?: (index?: number) => void;
    __RT_CHAPTER_START__?: (index: number) => void;
    __RT_DAILY__?: () => boolean;
    __RT_RELIC__?: (id: RelicId) => void;
    __RT_ASCEND__?: (key: RuleKey) => void;
    __RT_LATE__?: (id: LateUpgradeId) => void;
    __RT_EXPORT__?: () => string;
    __RT_SPAWN_ENEMY_BOLT__?: () => void;
    __RT_ENTER_ROOM__?: () => void;
    __RT_REWARD__?: () => boolean;
    __RT_ROUTE__?: () => boolean;
    __RT_EVENT__?: () => boolean;
    __RT_PICK_ROUTE__?: (index: number) => void;
    __RT_PICK_EVENT__?: (index: number) => void;
    __RT_PICK_REWARD__?: (index: number) => void;
    __RT_PICK_SUPPORT__?: (id: SupportId) => void;
    __RT_AUDIO_STATE__?: () => { muted: boolean; unlocked: boolean; state: string };
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-canvas',
  transparent: true,
  banner: false,
  disableContextMenu: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%'
  },
  fps: {
    target: 60,
    min: 20,
    smoothStep: false
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false
  },
  scene: [M0Scene]
});

window.__RT_GAME__ = game;

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node as T;
}

const menu = byId<HTMLElement>('menu');
const hud = byId<HTMLElement>('hud');
const sidebar = byId<HTMLElement>('sidebar');
const pauseScreen = byId<HTMLElement>('pause-screen');
const resultScreen = byId<HTMLElement>('result-screen');
const noteModal = byId<HTMLElement>('note-modal');
const joystick = byId<HTMLElement>('joystick');
const stick = byId<HTMLElement>('joystick-stick');
const dashButton = byId<HTMLButtonElement>('dash-btn');
const soundButton = byId<HTMLButtonElement>('sound-btn');
const soundOn = soundButton.querySelector<SVGElement>('.sound-on');
const soundOff = soundButton.querySelector<SVGElement>('.sound-off');
const resultEmblemUse = document.querySelector<SVGUseElement>('#result-emblem use');
const roomEnterButton = byId<HTMLButtonElement>('room-enter-btn');
const introScreen = byId<HTMLElement>('intro-screen');
const introStartButton = byId<HTMLButtonElement>('intro-start-btn');
const pauseStats = byId<HTMLElement>('pause-stats');

const resultKicker = byId<HTMLElement>('result-kicker');
const resultTitle = byId<HTMLElement>('result-title');
const resultSub = byId<HTMLElement>('result-sub');
const resultTime = byId<HTMLElement>('result-time');
const resultKills = byId<HTMLElement>('result-kills');
const resultRooms = byId<HTMLElement>('result-rooms');
const resultHorde = byId<HTMLElement>('result-horde');
const resultCombo = byId<HTMLElement>('result-combo');
const resultComboName = byId<HTMLElement>('result-combo-name');
const resultComboLevel = byId<HTMLElement>('result-combo-level');
const resultRecord = byId<HTMLElement>('result-record');
const resultShards = byId<HTMLElement>('result-shards');
const resultMutation = byId<HTMLElement>('result-mutation');
const resultRelics = byId<HTMLElement>('result-relics');
const resultLate = byId<HTMLElement>('result-late');
const resultDamage = byId<HTMLElement>('result-damage');
const chapterScreen = byId<HTMLElement>('chapter-screen');
const chapterKicker = byId<HTMLElement>('chapter-kicker');
const chapterTitle = byId<HTMLElement>('chapter-title');
const chapterEn = byId<HTMLElement>('chapter-en');
const chapterSub = byId<HTMLElement>('chapter-sub');
const chapterHp = byId<HTMLElement>('chapter-hp');
const chapterLevel = byId<HTMLElement>('chapter-level');
const chapterTime = byId<HTMLElement>('chapter-time');
const chapterHint = byId<HTMLElement>('chapter-hint');
const chapterContinueButton = byId<HTMLButtonElement>('chapter-continue-btn');
const chapterStopButton = byId<HTMLButtonElement>('chapter-stop-btn');
const chapterContinueCopy = chapterContinueButton.querySelector<HTMLElement>('.btn-copy b');
const metaScreen = byId<HTMLElement>('meta-screen');
const metaShards = byId<HTMLElement>('meta-shards');
const metaRuns = byId<HTMLElement>('meta-runs');
const metaVictories = byId<HTMLElement>('meta-victories');
const metaUnlocks = byId<HTMLElement>('meta-unlocks');
const metaAchievements = byId<HTMLElement>('meta-achievements');
const metaMutators = byId<HTMLElement>('meta-mutators');
const metaStarts = byId<HTMLElement>('meta-starts');
const metaDaily = byId<HTMLElement>('meta-daily');
const metaCodex = byId<HTMLElement>('meta-codex');
const resultMode = byId<HTMLElement>('result-mode');

let meta = loadMeta();

let scene: M0Scene | null = null;
let entered = false;
let pendingArena = false;
let pointerId: number | null = null;
let pendingRewards: RoomCleared['rewards'] = [];

const params = new URLSearchParams(window.location.search);
const autoArena = params.get('arena') === '1';
const bossPractice = params.get('boss') === '1';
const buildParam = params.get('build');
const seedParam = params.get('seed');
const mutatorParam = params.get('mutator');
const startParam = params.get('start');
let dailyMode = params.get('daily') === '1';
setRandomSeed(seedParam);

function dailySeedDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function dailySeed(): string {
  return `rulethief-daily-${dailySeedDate()}`;
}

function dailyModifierLevel(): number {
  const day = Number(dailySeedDate().slice(-2));
  return 1 + (day % 3);
}

if (dailyMode) setRandomSeed(dailySeed());
if (mutatorParam !== null) {
  const requested = clampMutator(Number(mutatorParam));
  meta.selectedMutator = Math.min(requested, meta.maxMutator);
  saveMeta(meta);
}
if (startParam !== null) {
  const requested = Math.max(0, Math.min(2, Math.floor(Number(startParam) || 0)));
  meta.selectedStartChapter = Math.min(requested, meta.maxStartChapter);
  saveMeta(meta);
}
const INTRO_KEY = 'rulethief.intro.v1';

function maybeShowIntro(): void {
  if (autoArena) return;
  let seen = false;
  try {
    seen = Boolean(localStorage.getItem(INTRO_KEY));
  } catch {
    seen = false;
  }
  introScreen.hidden = seen;
}

function dismissIntro(): void {
  introScreen.hidden = true;
  try {
    localStorage.setItem(INTRO_KEY, '1');
  } catch {
    /* storage disabled — show the manual again next time */
  }
}

function updateSoundIcon(): void {
  const muted = audio.isMuted;
  soundOn?.toggleAttribute('hidden', muted);
  soundOff?.toggleAttribute('hidden', !muted);
  soundButton.setAttribute('aria-pressed', String(muted));
  soundButton.setAttribute('aria-label', muted ? '开启声音' : '静音');
}

function showResult(payload: RunEndPayload): void {
  const stageOnly = payload.stageOnly;
  resultScreen.classList.toggle('is-victory', payload.victory);
  resultScreen.classList.toggle('is-defeat', !payload.victory);
  resultEmblemUse?.setAttribute(
    'href',
    stageOnly ? '#i-shard' : payload.victory ? '#i-crown' : '#i-skull'
  );
  resultKicker.textContent = stageOnly
    ? 'CHAPTER COMPLETE'
    : payload.victory
      ? 'RUN COMPLETE'
      : 'RUN ENDED';
  resultTitle.textContent = stageOnly
    ? `${payload.chapterName} · 阶段完成`
    : payload.victory
      ? '规则终结'
      : '规则耗尽';
  resultSub.textContent = stageOnly
    ? `你选择在第 ${payload.chapterIndex + 1} / ${payload.chaptersTotal} 章结束时收工。构筑与结算已记录，下一局可以继续深入。`
    : payload.victory
      ? payload.startChapter === 0
        ? '你走完了三条世界线，击穿全部精英，并在逆律深渊的尽头终结了规则之源。'
        : `你从第 ${payload.startChapter + 1} 章起步，击穿精英，终结了深渊尽头的规则之源。`
      : '生命归零。先看懂预警，再决定什么时候闪避。';
  resultTime.textContent = formatTime(Math.floor(payload.time));
  resultKills.textContent = String(payload.kills);
  resultHorde.hidden = payload.killStreakBest < 2 && payload.novas === 0;
  resultHorde.textContent = `最高连杀 ×${payload.killStreakBest} · 过载 ${payload.overloads} · 规则爆发 ${payload.novas}`;
  resultRooms.textContent = `${payload.roomsCleared} / ${payload.roomsTotal}`;
  resultComboName.textContent = payload.combo;
  resultComboLevel.textContent = `等级 ${payload.levelSum} / 9`;
  resultCombo.classList.toggle('is-complete', payload.rules === 2);
  const runs = saveRun({
    at: Date.now(),
    victory: payload.victory,
    rooms: payload.roomsCleared,
    total: payload.roomsTotal,
    seconds: Math.floor(payload.time),
    kills: payload.kills,
    combo: payload.combo,
    levelSum: payload.levelSum,
    mutation: payload.mutation,
    topDamage: payload.damage
      .slice(0, 2)
      .map((entry) => `${entry.label}:${entry.amount}`)
      .join('|'),
    chaptersCleared: clearedChapterCount({
      victory: payload.victory,
      stageOnly,
      chapterIndex: payload.chapterIndex,
      chaptersTotal: payload.chaptersTotal,
      startChapter: payload.startChapter
    }),
    startChapter: payload.startChapter,
    stageOnly,
    relics: payload.relics,
    ascensions: payload.ascensions,
    lateUpgrades: payload.lateUpgrades,
    mutatorLevel: payload.mutatorLevel,
    mutatorName: payload.mutatorName,
    daily: dailyMode,
    build: payload.build
  });
  resultRecord.textContent = formatRecordLine(summarize(runs));
  const runMeta = applyRunToMeta(meta, {
    victory: payload.victory,
    stageOnly,
    chapterIndex: payload.chapterIndex,
    chaptersTotal: payload.chaptersTotal,
    kills: payload.kills,
    seconds: payload.time,
    relics: payload.relics,
    ascensions: payload.ascensions,
    rulesSeen: payload.rulesSeen,
    rulesAscended: payload.rulesAscended,
    mutatorLevel: payload.mutatorLevel,
    startChapter: payload.startChapter,
    daily: dailyMode,
    date: dailySeedDate()
  });
  meta = runMeta.state;
  saveMeta(meta);
  resultMode.textContent = `模式 · ${payload.mutatorName}${
    payload.startChapter > 0 ? ` · 起点 W${payload.startChapter + 1}` : ''
  }${dailyMode ? ' · 每日挑战' : ''}`;
  resultShards.textContent = `法则碎片 +${runMeta.gained} · 累计 ${meta.shards}${
    runMeta.unlocked.length
      ? ` · 新成就 ${runMeta.unlocked.map((id) => ACHIEVEMENTS[id]?.name ?? id).join(' / ')}`
      : ''
  }`;
  resultMutation.textContent = payload.mutation ? `突变 · ${payload.mutation}` : '突变 · 无';
  resultRelics.textContent = `遗物 · ${payload.relics.length ? payload.relics.join(' / ') : '无'}${
    payload.ascensions.length ? ` · 升阶 ${payload.ascensions.join(' / ')}` : ''
  }`;
  resultLate.textContent = `高阶强化 · ${
    payload.lateUpgrades.length ? payload.lateUpgrades.join(' / ') : '无'
  }`;
  const totalTaken = payload.damage.reduce((sum, entry) => sum + entry.amount, 0);
  const damageLine = totalTaken
    ? payload.damage
        .slice(0, 3)
        .map((entry) => `${entry.label} ${Math.round((entry.amount / totalTaken) * 100)}%`)
        .join(' · ')
    : '无伤';
  resultDamage.textContent = `承伤构成：${damageLine}`;
  resultScreen.hidden = false;
  pauseScreen.hidden = true;
  hideOverlays();
  scene?.pauseGame();
}

function applyBuildParam(): void {
  if (!buildParam || !scene) return;
  const [trajectory, impact, trajectoryLevel, impactLevel] = buildParam.split(',');
  const trajectoryKey = ['pierce', 'chain', 'spread'].includes(trajectory)
    ? (trajectory as TrajectoryKey)
    : null;
  const impactKey = ['burn', 'frost', 'blast'].includes(impact) ? (impact as ImpactKey) : null;
  if (!trajectoryKey && !impactKey) return;
  const level = (value: string | undefined): 1 | 2 | 3 => {
    const parsed = Number(value);
    return parsed === 2 ? 2 : parsed === 3 ? 3 : 1;
  };
  scene.debugSetBuild(
    trajectoryKey,
    impactKey,
    level(trajectoryLevel),
    level(impactLevel)
  );
}

function hideOverlays(): void {
  setRewardVisible(false);
  setRoomVisible(false);
  setRouteVisible(false);
  setEventVisible(false);
  chapterScreen.hidden = true;
  pendingRewards = [];
}

function renderMeta(): void {
  metaShards.textContent = String(meta.shards);
  metaRuns.textContent = String(meta.runs);
  metaVictories.textContent = String(meta.victories);

  metaUnlocks.textContent = '';
  for (const unlock of UNLOCKS) {
    const owned =
      unlock.kind === 'relic'
        ? (meta.unlockedRelics as readonly string[]).includes(unlock.id)
        : (meta.unlockedAscensions as readonly string[]).includes(unlock.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `meta-unlock${owned ? ' is-owned' : ''}`;
    card.disabled = owned || !canUnlock(meta, unlock);
    const title = document.createElement('b');
    title.textContent = unlock.name;
    const copy = document.createElement('span');
    copy.textContent = unlock.description;
    const cost = document.createElement('em');
    cost.textContent = owned ? '已解锁' : `${unlock.cost} 碎片`;
    card.append(title, copy, cost);
    card.addEventListener('click', () => {
      meta = unlockMeta(meta, unlock.id);
      saveMeta(meta);
      applyMetaToScene();
      renderMeta();
    });
    metaUnlocks.append(card);
  }

  metaAchievements.textContent = '';
  for (const [id, def] of Object.entries(ACHIEVEMENTS)) {
    const row = document.createElement('div');
    row.className = `meta-achievement${meta.achievements.includes(id) ? ' is-done' : ''}`;
    const title = document.createElement('b');
    title.textContent = def.name;
    const copy = document.createElement('span');
    copy.textContent = def.description;
    row.append(title, copy);
    metaAchievements.append(row);
  }

  metaMutators.textContent = '';
  for (const def of MUTATORS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `meta-mutator${meta.selectedMutator === def.level ? ' is-selected' : ''}`;
    button.disabled = def.level > meta.maxMutator;
    button.textContent = def.level === 0 ? '标准' : `异变 ${def.level}`;
    button.title = def.description;
    button.addEventListener('click', () => {
      meta = { ...meta, selectedMutator: def.level };
      saveMeta(meta);
      applyMetaToScene();
      renderMeta();
    });
    metaMutators.append(button);
  }
  metaDaily.textContent = `每日挑战 · ${
    meta.dailyBest ? `最佳 ${meta.dailyBest}` : '未完成'
  } · 今日修正 ${getMutator(dailyModifierLevel()).name}`;

  metaStarts.textContent = '';
  CHAPTERS.forEach((chapter, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `meta-mutator${meta.selectedStartChapter === index ? ' is-selected' : ''}`;
    button.disabled = index > meta.maxStartChapter;
    button.textContent = `W${index + 1} ${chapter.name}`;
    button.title = index === 0 ? '从第一世界开始' : '继承构筑，从该世界开始';
    button.addEventListener('click', () => {
      meta = { ...meta, selectedStartChapter: index };
      saveMeta(meta);
      applyMetaToScene();
      renderMeta();
    });
    metaStarts.append(button);
  });

  metaCodex.textContent = '';
  for (const key of ALL_RULE_KEYS) {
    const seen = meta.seenRules.includes(key);
    const ascended = meta.ascendedRules.includes(key);
    const row = document.createElement('div');
    row.className = `meta-codex-row${seen ? ' is-seen' : ''}${ascended ? ' is-ascended' : ''}`;
    const name = document.createElement('b');
    name.textContent = getRuleName(key);
    const status = document.createElement('span');
    status.textContent = ascended ? '已升阶' : seen ? '已见' : '未发现';
    row.append(name, status);
    metaCodex.append(row);
  }
}

function applyMetaToScene(): void {
  scene?.setMetaUnlocks(meta.unlockedRelics, meta.unlockedAscensions);
  scene?.setMutator(dailyMode ? dailyModifierLevel() : meta.selectedMutator);
  scene?.setStartChapter(meta.selectedStartChapter);
  scene?.setHordeEnabled(params.get('horde') !== '0');
}

function openMeta(): void {
  renderMeta();
  metaScreen.hidden = false;
}

function closeMeta(): void {
  metaScreen.hidden = true;
}

function collectPlaytestData(): Record<string, unknown> {
  const read = (key: string): unknown => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  };
  return {
    exportedAt: new Date().toISOString(),
    url: window.location.href,
    agent: navigator.userAgent,
    runs: read('rulethief.runs.v1') ?? [],
    meta: read('rulethief.meta.v1'),
    introSeen: (() => {
      try {
        return localStorage.getItem('rulethief.intro.v1') === '1';
      } catch {
        return false;
      }
    })()
  };
}

function exportPlaytestData(): void {
  const blob = new Blob([JSON.stringify(collectPlaytestData(), null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `rulethief-playtest-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function showChapterClear(payload: ChapterClearPayload): void {
  setRewardVisible(false);
  setRoomVisible(false);
  setRouteVisible(false);
  setEventVisible(false);
  chapterKicker.textContent = `CHAPTER ${payload.chapterIndex + 1} / ${payload.chaptersTotal} CLEAR`;
  chapterTitle.textContent = `${payload.chapterName} · 已完成`;
  chapterEn.textContent = payload.chapterEn;
  chapterSub.textContent = `下一段路：${payload.nextName}。当前构筑与生命会保留。`;
  chapterHp.textContent = `${Math.ceil(payload.hp)} / ${payload.maxHp}`;
  chapterLevel.textContent = `等级 ${payload.levelSum} / 9 · ${payload.combo}`;
  chapterTime.textContent = formatTime(Math.floor(payload.elapsed));
  chapterHint.textContent = `继续深入 ${payload.nextName}，或在此收工结算。`;
  if (chapterContinueCopy) chapterContinueCopy.textContent = `继续深入 · ${payload.nextName}`;
  chapterScreen.hidden = false;
  pauseScreen.hidden = true;
}

function isChapterVisible(): boolean {
  return !chapterScreen.hidden;
}

function continueChapter(): void {
  if (!scene) return;
  chapterScreen.hidden = true;
  scene.continueToNextChapter();
  void audio.resume();
}

function stopChapter(): void {
  if (!scene) return;
  chapterScreen.hidden = true;
  scene.stopAfterChapter();
}

function showRoute(payload: RouteChoicePayload): void {
  hideOverlays();
  renderRoute(payload, (index) => {
    if (!scene) return;
    setRouteVisible(false);
    scene.chooseRoute(index);
  });
  setRouteVisible(true);
  pauseScreen.hidden = true;
}

function showEvent(payload: EventPayload): void {
  hideOverlays();
  renderEvent(payload, (index) => {
    if (!scene) return;
    setEventVisible(false);
    scene.chooseEventOption(index as 0 | 1);
  });
  setEventVisible(true);
  pauseScreen.hidden = true;
}

function showRoomPreview(payload: RoomPreview): void {
  setRewardVisible(false);
  renderRoomPreview(payload);
  setRoomVisible(true);
  pauseScreen.hidden = true;
}

function showRewards(payload: RoomCleared): void {
  pendingRewards = payload.rewards;
  renderRewards(payload.rewards, (reward) => chooseReward(reward));
  setRoomVisible(false);
  setRewardVisible(true, payload.rewardLabel ?? `ROOM ${payload.index + 1} / ${payload.total} 已清空`);
  pauseScreen.hidden = true;
}

function chooseReward(reward: RoomCleared['rewards'][number]): void {
  if (!scene) return;
  setRewardVisible(false);
  pendingRewards = [];
  scene.applyReward(reward);
  if (
    scene.isRoomPreviewOpen() ||
    scene.isRouteOpen() ||
    scene.isEventOpen() ||
    scene.getChapterState().transitionOpen
  ) {
    return;
  }
  scene.resumeGame();
  void audio.resume();
}

function enterRoom(): void {
  if (!scene) return;
  setRoomVisible(false);
  scene.beginRoom();
  void audio.resume();
}

function startRun(daily: boolean): void {
  dailyMode = daily;
  if (daily) {
    setRandomSeed(dailySeed());
    if (meta.selectedMutator > meta.maxMutator) {
      meta.selectedMutator = meta.maxMutator;
      saveMeta(meta);
    }
  } else {
    setRandomSeed(seedParam);
  }
  enterArena();
}

function enterArena(instant = false): void {
  if (!scene) {
    pendingArena = true;
    return;
  }
  if (entered) return;
  entered = true;
  noteModal.hidden = true;
  pauseScreen.hidden = true;
  resultScreen.hidden = true;
  metaScreen.hidden = true;
  hideOverlays();
  hud.hidden = false;
  sidebar.hidden = false;
  void audio.unlock().then(() => audio.resume());
  scene.setPlayEnabled(true);
  applyMetaToScene();
  scene.startNewRun();
  applyBuildParam();
  if (bossPractice) {
    scene.debugJumpToBoss(!buildParam);
  }

  if (instant) {
    menu.hidden = true;
    menu.classList.remove('is-leaving');
    return;
  }

  menu.classList.add('is-leaving');
  window.setTimeout(() => {
    menu.hidden = true;
    menu.classList.remove('is-leaving');
  }, 460);
}

function restartRun(): void {
  if (!scene) return;
  resultScreen.hidden = true;
  pauseScreen.hidden = true;
  metaScreen.hidden = true;
  hideOverlays();
  hud.hidden = false;
  sidebar.hidden = false;
  entered = true;
  scene.setPlayEnabled(true);
  applyMetaToScene();
  scene.startNewRun();
  void audio.unlock().then(() => audio.resume());
}

function pauseGame(): void {
  if (!scene || !entered) return;
  if (
    !pauseScreen.hidden ||
    !resultScreen.hidden ||
    isRewardVisible() ||
    isRoomVisible() ||
    isRouteVisible() ||
    isEventVisible() ||
    isChapterVisible()
  ) {
    return;
  }
  pauseStats.textContent = scene.runSummary();
  scene.pauseGame();
  pauseScreen.hidden = false;
  void audio.suspend();
}

function resumeGame(): void {
  if (!scene || !entered) return;
  scene.resumeGame();
  pauseScreen.hidden = true;
  void audio.resume();
}

function backToMenu(): void {
  if (!scene) return;
  scene.setPlayEnabled(false);
  scene.pauseGame();
  hideOverlays();
  pauseScreen.hidden = true;
  resultScreen.hidden = true;
  hud.hidden = true;
  sidebar.hidden = true;
  menu.hidden = false;
  menu.classList.remove('is-leaving');
  entered = false;
  void audio.suspend();
}

function openNote(): void {
  noteModal.hidden = false;
}

function closeNote(): void {
  noteModal.hidden = true;
}

function handleReady(): void {
  scene = game.scene.getScene('M0') as M0Scene;
  scene.setPlayEnabled(false);
  scene.pauseGame();
  applyMetaToScene();
  window.__RT_READY__ = true;
  window.__RT_SCENE__ = scene;
  window.__RT_SNAPSHOT__ = () => scene?.debugSnapshot() ?? {};
  window.__RT_GRANT__ = (rule) => scene?.debugGrantRule(rule);
  window.__RT_GRANT_ALL__ = () => scene?.debugGrantAll();
  window.__RT_DAMAGE__ = (amount) => scene?.debugDamagePlayer(amount);
  window.__RT_DAMAGE_FROM__ = (amount, x, y) => scene?.debugDamageFrom(amount, x, y);
  window.__RT_END__ = (victory) => scene?.debugEndRun(victory);
  window.__RT_SPAWN__ = (kind) => scene?.debugSpawn(kind);
  window.__RT_SPAWN_AT__ = (kind, x, y) => scene?.debugSpawnAt(kind, x, y);
  window.__RT_KILL_ALL__ = () => scene?.debugKillAll();
  window.__RT_KILL_ONE__ = (index) => scene?.debugKillEnemy(index);
  window.__RT_PURGE_ENEMIES__ = () => scene?.debugPurgeEnemies();
  window.__RT_POSE__ = (build) => scene?.debugPoseCombat(build);
  window.__RT_TABLEAU__ = (kinds, build) => scene?.debugTableau(kinds, build);
  window.__RT_SET_STATS__ = (elapsed, kills) => scene?.debugSetStats(elapsed, kills);
  window.__RT_SET_BUILD__ = (trajectory, impact, trajectoryLevel = 1, impactLevel = 1) =>
    scene?.debugSetBuild(trajectory, impact, trajectoryLevel, impactLevel);
  window.__RT_SET_THIRD__ = (key, level = 3) => scene?.debugSetThird(key, level);
  window.__RT_SWAP__ = () => scene?.debugSwapRule() ?? false;
  window.__RT_REFORGE__ = (key) => scene?.debugReforge(key) ?? false;
  window.__RT_STEP__ = (index) => scene?.debugJumpToStep(index) ?? false;
  window.__RT_SET_STREAK__ = (count) => scene?.debugSetKillStreak(count);
  window.__RT_GOD__ = (enabled) => scene?.debugGodMode(enabled);
  window.__RT_DASH__ = () => scene?.debugDash();
  window.__RT_CLEAR_SEAL__ = () => scene?.debugClearSeal();
  window.__RT_SET_ROOM_KILLS__ = (kills) => scene?.debugSetRoomKills(kills);
  window.__RT_DAMAGE_BOSS__ = (amount) => scene?.debugDamageBoss(amount);
  window.__RT_VOLLEY__ = () => scene?.debugVolley() ?? -1;
  window.__RT_FREEZE_ATTACK__ = () => scene?.debugFreezeAttack();
  window.__RT_HEAL__ = (amount) => scene?.debugHeal(amount);
  window.__RT_INTRO__ = () => !introScreen.hidden;
  window.__RT_OPEN_EVENT__ = (id) => scene?.debugOpenEvent(id as never);
  window.__RT_CAST_SEAL__ = () => scene?.debugCastSeal();
  window.__RT_SPAWN_HAZARD__ = (x, y) => scene?.debugSpawnHazard(x, y);
  window.__RT_CHAPTER_BOSS__ = (index) => scene?.debugJumpToChapterBoss(index);
  window.__RT_CHAPTER_START__ = (index) => scene?.debugStartChapter(index);
  window.__RT_DAILY__ = () => dailyMode;
  window.__RT_RELIC__ = (id) => scene?.debugGrantRelic(id);
  window.__RT_ASCEND__ = (key) => scene?.debugAscendRule(key);
  window.__RT_LATE__ = (id) => scene?.debugGrantLate(id);
  window.__RT_EXPORT__ = () => JSON.stringify(collectPlaytestData(), null, 2);
  window.__RT_SPAWN_ENEMY_BOLT__ = () => scene?.debugSpawnEnemyBolt();
  window.__RT_ENTER_ROOM__ = () => enterRoom();
  window.__RT_REWARD__ = () => isRewardVisible();
  window.__RT_ROUTE__ = () => isRouteVisible();
  window.__RT_EVENT__ = () => isEventVisible();
  window.__RT_PICK_ROUTE__ = (index) => {
    document.querySelectorAll<HTMLElement>('.route-option')[index]?.click();
  };
  window.__RT_PICK_EVENT__ = (index) => {
    document.querySelectorAll<HTMLElement>('.event-option')[index]?.click();
  };
  window.__RT_PICK_REWARD__ = (index) => {
    pickReward(index);
  };
  window.__RT_PICK_SUPPORT__ = (id) => {
    const reward = pendingRewards.find(
      (item) => item.kind === 'support' && item.support.id === id
    );
    if (reward) chooseReward(reward);
  };
  window.__RT_AUDIO_STATE__ = () => ({
    muted: audio.isMuted,
    unlocked: audio.isUnlocked,
    state: audio.contextState
  });
  document.body.dataset.ready = '1';
  maybeShowIntro();
  updateSoundIcon();
  if (autoArena || pendingArena) {
    enterArena(true);
  }
}

game.events.once('m0-ready', handleReady);
game.events.on('m0-run-ended', (payload: RunEndPayload) => {
  showResult(payload);
});
game.events.on('m2-room-preview', (payload: RoomPreview) => {
  if (!entered) return;
  showRoomPreview(payload);
});
game.events.on('m2-room-cleared', (payload: RoomCleared) => {
  if (!entered) return;
  showRewards(payload);
});
game.events.on('m3-route', (payload: RouteChoicePayload) => {
  if (!entered) return;
  showRoute(payload);
});
game.events.on('m3-event', (payload: EventPayload) => {
  if (!entered) return;
  showEvent(payload);
});
game.events.on('m6-chapter-cleared', (payload: ChapterClearPayload) => {
  if (!entered) return;
  showChapterClear(payload);
});

window.setTimeout(() => {
  if (window.__RT_READY__) return;
  const active = game.scene.getScene('M0') as M0Scene | null;
  if (active && active.scene.isActive()) handleReady();
}, 700);

document.getElementById('enter-btn')?.addEventListener('click', () => startRun(false));
document.getElementById('note-enter-btn')?.addEventListener('click', () => {
  closeNote();
  startRun(false);
});
document.getElementById('menu-note-btn')?.addEventListener('click', openNote);
document.getElementById('menu-meta-btn')?.addEventListener('click', openMeta);
document.getElementById('result-meta-btn')?.addEventListener('click', openMeta);
document.getElementById('result-export-btn')?.addEventListener('click', exportPlaytestData);
document.getElementById('menu-daily-btn')?.addEventListener('click', () => startRun(true));
document.getElementById('meta-daily-btn')?.addEventListener('click', () => {
  metaScreen.hidden = true;
  startRun(true);
});
document.getElementById('meta-close-btn')?.addEventListener('click', closeMeta);
document.getElementById('note-close')?.addEventListener('click', closeNote);
noteModal.addEventListener('click', (event) => {
  if (event.target === noteModal) closeNote();
});

document.getElementById('pause-btn')?.addEventListener('click', pauseGame);
document.getElementById('resume-btn')?.addEventListener('click', resumeGame);
document.getElementById('back-menu-btn')?.addEventListener('click', backToMenu);
document.getElementById('restart-btn')?.addEventListener('click', restartRun);
document.getElementById('pause-restart-btn')?.addEventListener('click', restartRun);
document.getElementById('result-menu-btn')?.addEventListener('click', backToMenu);
chapterContinueButton.addEventListener('click', continueChapter);
chapterStopButton.addEventListener('click', stopChapter);
roomEnterButton.addEventListener('click', enterRoom);
introStartButton.addEventListener('click', dismissIntro);

soundButton.addEventListener('click', async () => {
  await audio.unlock();
  audio.toggleMute();
  updateSoundIcon();
});

dashButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  if (entered && pauseScreen.hidden && resultScreen.hidden) {
    window.dispatchEvent(new CustomEvent('rt-dash'));
  }
});

window.addEventListener(
  'pointerdown',
  () => {
    void audio.unlock().then(() => audio.resume());
  },
  { once: true }
);

function setJoystick(clientX: number, clientY: number): void {
  const rect = joystick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const radius = rect.width * 0.34;
  let dx = clientX - cx;
  let dy = clientY - cy;
  const length = Math.hypot(dx, dy);
  if (length > radius) {
    dx = (dx / length) * radius;
    dy = (dy / length) * radius;
  }
  stick.style.transform = `translate(${dx}px, ${dy}px)`;
  window.dispatchEvent(
    new CustomEvent('rt-input', {
      detail: { x: dx / radius, y: dy / radius }
    })
  );
}

function releaseJoystick(): void {
  pointerId = null;
  stick.style.transform = 'translate(0px, 0px)';
  window.dispatchEvent(new CustomEvent('rt-input', { detail: { x: 0, y: 0 } }));
}

joystick.addEventListener('pointerdown', (event) => {
  if (pointerId !== null) return;
  pointerId = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  joystick.classList.add('is-active');
  setJoystick(event.clientX, event.clientY);
  event.preventDefault();
});

joystick.addEventListener('pointermove', (event) => {
  if (pointerId !== event.pointerId) return;
  setJoystick(event.clientX, event.clientY);
  event.preventDefault();
});

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
  joystick.addEventListener(type, (event) => {
    if (event instanceof PointerEvent && pointerId !== null && event.pointerId !== pointerId) {
      return;
    }
    joystick.classList.remove('is-active');
    releaseJoystick();
  });
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
  }
  if (isRouteVisible() || isEventVisible()) {
    const slot = ['Digit1', 'Digit2'].indexOf(event.code);
    if (slot >= 0) {
      event.preventDefault();
      const selector = isRouteVisible() ? '.route-option' : '.event-option';
      document.querySelectorAll<HTMLElement>(selector)[slot]?.click();
    }
    return;
  }
  if (isRewardVisible()) {
    const slot = ['Digit1', 'Digit2', 'Digit3'].indexOf(event.code);
    if (slot >= 0) {
      event.preventDefault();
      pickReward(slot);
    }
    return;
  }
  if (isRoomVisible()) {
    if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      enterRoom();
    }
    return;
  }
  if (event.code === 'Escape') {
    if (!noteModal.hidden) {
      closeNote();
      return;
    }
    if (!resultScreen.hidden) return;
    if (!pauseScreen.hidden) {
      resumeGame();
      return;
    }
    if (entered) pauseGame();
  }
});

window.addEventListener('blur', () => {
  if (entered && pauseScreen.hidden && resultScreen.hidden && menu.hidden) pauseGame();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});

updateSoundIcon();
