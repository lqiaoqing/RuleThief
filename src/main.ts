import Phaser from 'phaser';
import './style.css';
import './m0.css';
import { M0Scene } from './game/M0Scene';
import type { RunEndPayload } from './game/M0Scene';
import { audio } from './game/audio';
import { formatTime } from './game/theme';

declare global {
  interface Window {
    __RT_READY__?: boolean;
    __RT_GAME__?: Phaser.Game;
    __RT_SCENE__?: M0Scene;
    __RT_SNAPSHOT__?: () => Record<string, unknown>;
    __RT_GRANT__?: (rule: 'chain' | 'blast') => void;
    __RT_GRANT_ALL__?: () => void;
    __RT_DAMAGE__?: (amount: number) => void;
    __RT_END__?: (victory: boolean) => void;
    __RT_SPAWN__?: (kind?: 'beetle' | 'bat') => void;
    __RT_KILL_ALL__?: () => void;
    __RT_POSE__?: () => void;
    __RT_SET_STATS__?: (elapsed: number, kills: number) => void;
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

const resultKicker = byId<HTMLElement>('result-kicker');
const resultTitle = byId<HTMLElement>('result-title');
const resultSub = byId<HTMLElement>('result-sub');
const resultTime = byId<HTMLElement>('result-time');
const resultKills = byId<HTMLElement>('result-kills');
const resultRules = byId<HTMLElement>('result-rules');

let scene: M0Scene | null = null;
let entered = false;
let pendingArena = false;
let pointerId: number | null = null;

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
  resultKicker.textContent = payload.victory ? 'M0 · RUN COMPLETE' : 'M0 · RUN ENDED';
  resultTitle.textContent = payload.victory ? '审判完成' : '规则耗尽';
  resultSub.textContent = payload.victory
    ? '你在训练回廊中存活了整整 3 分钟。规则可以被夺走，也可以被驾驭。'
    : '生命归零。先看懂预警，再决定什么时候闪避。下一次会更好。';
  resultTime.textContent = formatTime(Math.floor(payload.time));
  resultKills.textContent = String(payload.kills);
  resultRules.textContent = `${payload.rules} / 2`;
  resultScreen.hidden = false;
  pauseScreen.hidden = true;
  scene?.pauseGame();
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
  hud.hidden = false;
  sidebar.hidden = false;
  entered = true;
  scene.setPlayEnabled(true);
  scene.startNewRun();
  void audio.unlock().then(() => audio.resume());
}

function pauseGame(): void {
  if (!scene || !entered) return;
  if (!pauseScreen.hidden || !resultScreen.hidden) return;
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
  window.__RT_KILL_ALL__ = () => scene?.debugKillAll();
  window.__RT_POSE__ = () => scene?.debugPoseCombat();
  window.__RT_SET_STATS__ = (elapsed, kills) => scene?.debugSetStats(elapsed, kills);
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
