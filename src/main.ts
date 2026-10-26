import Phaser from 'phaser';
import './style.css';
import './m0.css';
import { M0Scene } from './game/M0Scene';
import type { RunEndPayload } from './game/M0Scene';
import { audio } from './game/audio';
import { formatTime } from './game/theme';
import type { ImpactKey, RuleKey, TrajectoryKey } from './game/rules';
import type { RoomCleared, RoomPreview, EnemyKind, SupportId } from './game/rooms';
import type { EventPayload, RouteChoicePayload } from './game/run';
import { formatRecordLine, saveRun, summarize } from './game/telemetry';
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
    __RT_END__?: (victory: boolean) => void;
    __RT_SPAWN__?: (kind?: EnemyKind) => void;
    __RT_SPAWN_AT__?: (kind: EnemyKind, x: number, y: number) => void;
    __RT_KILL_ALL__?: () => void;
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
    __RT_SET_ROOM_KILLS__?: (kills: number) => void;
    __RT_DAMAGE_BOSS__?: (amount: number) => void;
    __RT_OPEN_EVENT__?: (id: string) => void;
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

const resultKicker = byId<HTMLElement>('result-kicker');
const resultTitle = byId<HTMLElement>('result-title');
const resultSub = byId<HTMLElement>('result-sub');
const resultTime = byId<HTMLElement>('result-time');
const resultKills = byId<HTMLElement>('result-kills');
const resultRooms = byId<HTMLElement>('result-rooms');
const resultCombo = byId<HTMLElement>('result-combo');
const resultComboName = byId<HTMLElement>('result-combo-name');
const resultComboLevel = byId<HTMLElement>('result-combo-level');
const resultRecord = byId<HTMLElement>('result-record');
const resultMutation = byId<HTMLElement>('result-mutation');

let scene: M0Scene | null = null;
let entered = false;
let pendingArena = false;
let pointerId: number | null = null;
let pendingRewards: RoomCleared['rewards'] = [];

const autoArena = new URLSearchParams(window.location.search).get('arena') === '1';

function updateSoundIcon(): void {
  const muted = audio.isMuted;
  soundOn?.toggleAttribute('hidden', muted);
  soundOff?.toggleAttribute('hidden', !muted);
  soundButton.setAttribute('aria-pressed', String(muted));
  soundButton.setAttribute('aria-label', muted ? '开启声音' : '静音');
}

function showResult(payload: RunEndPayload): void {
  resultScreen.classList.toggle('is-victory', payload.victory);
  resultScreen.classList.toggle('is-defeat', !payload.victory);
  resultEmblemUse?.setAttribute('href', payload.victory ? '#i-crown' : '#i-skull');
  resultKicker.textContent = payload.victory ? 'M3 · RUN COMPLETE' : 'M3 · RUN ENDED';
  resultTitle.textContent = payload.victory ? '审判完成' : '规则耗尽';
  resultSub.textContent = payload.victory
    ? '你清空了全部六个房间，也击穿了两位精英。规则被夺走，也被驾驭。'
    : '生命归零。先看懂预警，再决定什么时候闪避。';
  resultTime.textContent = formatTime(Math.floor(payload.time));
  resultKills.textContent = String(payload.kills);
  resultRooms.textContent = `${payload.roomsCleared} / ${payload.roomsTotal}`;
  resultComboName.textContent = payload.combo;
  resultComboLevel.textContent = `等级 ${payload.levelSum} / 6`;
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
    mutation: payload.mutation
  });
  resultRecord.textContent = formatRecordLine(summarize(runs));
  resultMutation.textContent = payload.mutation ? `突变 · ${payload.mutation}` : '突变 · 无';
  resultScreen.hidden = false;
  pauseScreen.hidden = true;
  hideOverlays();
  scene?.pauseGame();
}

function hideOverlays(): void {
  setRewardVisible(false);
  setRoomVisible(false);
  setRouteVisible(false);
  setEventVisible(false);
  pendingRewards = [];
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
  setRewardVisible(true, `ROOM ${payload.index + 1} / ${payload.total} 已清空`);
  pauseScreen.hidden = true;
}

function chooseReward(reward: RoomCleared['rewards'][number]): void {
  if (!scene) return;
  setRewardVisible(false);
  pendingRewards = [];
  scene.applyReward(reward);
  if (scene.isRoomPreviewOpen() || scene.isRouteOpen() || scene.isEventOpen()) return;
  scene.resumeGame();
  void audio.resume();
}

function enterRoom(): void {
  if (!scene) return;
  setRoomVisible(false);
  scene.beginRoom();
  void audio.resume();
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
  hideOverlays();
  hud.hidden = false;
  sidebar.hidden = false;
  void audio.unlock().then(() => audio.resume());
  scene.setPlayEnabled(true);
  scene.startNewRun();

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
  hideOverlays();
  hud.hidden = false;
  sidebar.hidden = false;
  entered = true;
  scene.setPlayEnabled(true);
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
    isEventVisible()
  ) {
    return;
  }
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
  window.__RT_READY__ = true;
  window.__RT_SCENE__ = scene;
  window.__RT_SNAPSHOT__ = () => scene?.debugSnapshot() ?? {};
  window.__RT_GRANT__ = (rule) => scene?.debugGrantRule(rule);
  window.__RT_GRANT_ALL__ = () => scene?.debugGrantAll();
  window.__RT_DAMAGE__ = (amount) => scene?.debugDamagePlayer(amount);
  window.__RT_END__ = (victory) => scene?.debugEndRun(victory);
  window.__RT_SPAWN__ = (kind) => scene?.debugSpawn(kind);
  window.__RT_SPAWN_AT__ = (kind, x, y) => scene?.debugSpawnAt(kind, x, y);
  window.__RT_KILL_ALL__ = () => scene?.debugKillAll();
  window.__RT_POSE__ = (build) => scene?.debugPoseCombat(build);
  window.__RT_TABLEAU__ = (kinds, build) => scene?.debugTableau(kinds, build);
  window.__RT_SET_STATS__ = (elapsed, kills) => scene?.debugSetStats(elapsed, kills);
  window.__RT_SET_BUILD__ = (trajectory, impact, trajectoryLevel = 1, impactLevel = 1) =>
    scene?.debugSetBuild(trajectory, impact, trajectoryLevel, impactLevel);
  window.__RT_SET_ROOM_KILLS__ = (kills) => scene?.debugSetRoomKills(kills);
  window.__RT_DAMAGE_BOSS__ = (amount) => scene?.debugDamageBoss(amount);
  window.__RT_OPEN_EVENT__ = (id) => scene?.debugOpenEvent(id as never);
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

window.setTimeout(() => {
  if (window.__RT_READY__) return;
  const active = game.scene.getScene('M0') as M0Scene | null;
  if (active && active.scene.isActive()) handleReady();
}, 700);

document.getElementById('enter-btn')?.addEventListener('click', () => enterArena());
document.getElementById('note-enter-btn')?.addEventListener('click', () => {
  closeNote();
  enterArena();
});
document.getElementById('menu-note-btn')?.addEventListener('click', openNote);
document.getElementById('note-close')?.addEventListener('click', closeNote);
noteModal.addEventListener('click', (event) => {
  if (event.target === noteModal) closeNote();
});

document.getElementById('pause-btn')?.addEventListener('click', pauseGame);
document.getElementById('resume-btn')?.addEventListener('click', resumeGame);
document.getElementById('back-menu-btn')?.addEventListener('click', backToMenu);
document.getElementById('restart-btn')?.addEventListener('click', restartRun);
document.getElementById('result-menu-btn')?.addEventListener('click', backToMenu);
roomEnterButton.addEventListener('click', enterRoom);

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
