import {
  buildLevelSum,
  createEmptyBuild,
  getBuildCombo,
  getRuleDef,
  getRuleLevelDescription,
  type PlayerBuild,
  type RuleKey
} from '../game/rules';
import { ENEMY_SPECS, type EnemyKind } from '../game/rooms';
import type { MutationDef } from '../game/mutations';
import { formatTime } from '../game/theme';

export type RuleToastKind = RuleKey | 'heal';

export const RULE_COLORS: Record<RuleKey | 'heal', string> = {
  pierce: '#b69bff',
  chain: '#65dcf0',
  spread: '#ffb3d9',
  burn: '#ffac68',
  frost: '#8ceafa',
  blast: '#ffd27a',
  heal: '#7edca9'
};

function byId<T extends Element>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing HUD element: ${id}`);
  }
  return node as unknown as T;
}

const hpText = byId<HTMLElement>('hp-text');
const hpFill = byId<HTMLElement>('hp-fill');
const dashText = byId<HTMLElement>('dash-text');
const dashFill = byId<HTMLElement>('dash-fill');
const dashButton = byId<HTMLButtonElement>('dash-btn');
const timer = byId<HTMLElement>('timer');
const mobileTime = byId<HTMLElement>('mobile-time');
const roomNum = byId<HTMLElement>('room-num');
const roomTotal = byId<HTMLElement>('room-total');
const roomName = byId<HTMLElement>('room-name');
const mobileRoomName = byId<HTMLElement>('mobile-room-name');
const objectiveTime = byId<HTMLElement>('objective-time');
const objectiveLabel = byId<HTMLElement>('objective-label');
const objectiveRoom = byId<HTMLElement>('objective-room');
const survivalFill = byId<HTMLElement>('survival-fill');
const killsText = byId<HTMLElement>('kills-text');
const objectiveKills = byId<HTMLElement>('objective-kills');
const mobileKills = byId<HTMLElement>('mobile-kills');
const threatLevel = byId<HTMLElement>('threat-level');
const buildCount = byId<HTMLElement>('build-count');

const slotTrajectory = byId<HTMLElement>('slot-trajectory');
const slotImpact = byId<HTMLElement>('slot-impact');
const slotTrajectoryIcon = byId<SVGUseElement>('slot-trajectory-icon');
const slotImpactIcon = byId<SVGUseElement>('slot-impact-icon');
const slotTrajectoryName = byId<HTMLElement>('slot-trajectory-name');
const slotImpactName = byId<HTMLElement>('slot-impact-name');
const slotTrajectoryStatus = byId<HTMLElement>('slot-trajectory-status');
const slotImpactStatus = byId<HTMLElement>('slot-impact-status');
const slotTrajectoryDesc = byId<HTMLElement>('slot-trajectory-desc');
const slotImpactDesc = byId<HTMLElement>('slot-impact-desc');
const slotTrajectoryIco = byId<HTMLElement>('slot-trajectory-ico');
const slotImpactIco = byId<HTMLElement>('slot-impact-ico');

const miniTrajectory = byId<HTMLElement>('mini-trajectory');
const miniImpact = byId<HTMLElement>('mini-impact');
const miniTrajectoryIcon = byId<SVGUseElement>('mini-trajectory-icon');
const miniImpactIcon = byId<SVGUseElement>('mini-impact-icon');
const miniTrajectoryName = byId<HTMLElement>('mini-trajectory-name');
const miniImpactName = byId<HTMLElement>('mini-impact-name');
const miniTrajectoryStatus = byId<HTMLElement>('mini-trajectory-status');
const miniImpactStatus = byId<HTMLElement>('mini-impact-status');

const comboKicker = byId<HTMLElement>('combo-kicker');
const comboName = byId<HTMLElement>('combo-name');
const comboSub = byId<HTMLElement>('combo-sub');
const comboBanner = document.querySelector('.combo-banner') as HTMLElement;
const mobileComboName = byId<HTMLElement>('mobile-combo-name');
const mobileComboSub = byId<HTMLElement>('mobile-combo-sub');

const codexList = byId<HTMLElement>('codex-list');

const bossBar = byId<HTMLElement>('boss-bar');
const bossBarName = byId<HTMLElement>('boss-bar-name');
const bossBarPhase = byId<HTMLElement>('boss-bar-phase');
const bossBarFill = byId<HTMLElement>('boss-bar-fill');
const bossPips = Array.from(document.querySelectorAll<HTMLElement>('#boss-pips i'));
const mutationLine = byId<HTMLElement>('mutation-line');
const mutationName = byId<HTMLElement>('mutation-name');
const mutationIcon = byId<SVGUseElement>('mutation-icon');
const relicLine = byId<HTMLElement>('relic-line');
const relicCount = byId<HTMLElement>('relic-count');
const relicNames = byId<HTMLElement>('relic-names');

const PHASE_LABELS = ['秩序', '混乱', '规则剥夺'];
const PHASE_NUMERALS = ['I', 'II', 'III'];

export function setBossBar(
  state: { name: string; hp: number; maxHp: number; phase: number } | null
): void {
  document.body.classList.toggle('boss-active', Boolean(state));
  if (!state) {
    bossBar.hidden = true;
    return;
  }
  bossBar.hidden = false;
  bossBarName.textContent = state.name;
  const index = Math.max(0, Math.min(2, state.phase - 1));
  bossBarPhase.textContent = `PHASE ${PHASE_NUMERALS[index]} · ${PHASE_LABELS[index]}`;
  bossBarPhase.dataset.phase = String(state.phase);
  bossBarFill.style.width = `${Math.max(0, Math.min(100, (state.hp / state.maxHp) * 100))}%`;
  bossPips.forEach((pip, pipIndex) => pip.classList.toggle('active', pipIndex < state.phase));
}

export function setMutation(def: MutationDef | null): void {
  mutationLine.hidden = !def;
  if (!def) return;
  mutationName.textContent = def.name;
  mutationLine.style.setProperty('--mutation-color', def.color);
  mutationIcon.setAttribute('href', def.icon);
}

export function setRelics(names: readonly string[]): void {
  relicLine.hidden = names.length === 0;
  relicCount.textContent = `${names.length} / 2`;
  relicNames.textContent = names.length ? names.join(' · ') : '—';
}

export function setSealedRule(slot: 'trajectory' | 'impact' | null, visible: boolean): void {
  const trajectory = visible && slot === 'trajectory';
  const impact = visible && slot === 'impact';
  slotTrajectory.classList.toggle('is-sealed', trajectory);
  slotImpact.classList.toggle('is-sealed', impact);
  miniTrajectory.classList.toggle('is-sealed', trajectory);
  miniImpact.classList.toggle('is-sealed', impact);
}

const lowHpVignette = byId<HTMLElement>('low-hp-vignette');
const toast = byId<HTMLElement>('rule-toast');
const toastIcon = byId<HTMLElement>('rule-toast-icon');
const toastName = byId<HTMLElement>('rule-toast-name');
const toastSub = byId<HTMLElement>('rule-toast-sub');
const phasePips = Array.from(document.querySelectorAll<HTMLElement>('.mb-phases i'));

let toastTimeout: number | undefined;

export function setHp(current: number, max = 100): void {
  const clamped = Math.max(0, Math.min(max, current));
  const pct = (clamped / max) * 100;
  hpText.textContent = `${Math.ceil(clamped)} / ${max}`;
  hpFill.style.width = `${pct}%`;
  lowHpVignette.classList.toggle('is-active', clamped > 0 && clamped / max <= 0.35);
}

export function setDash(progress: number, remaining = 0): void {
  const pct = Math.max(0, Math.min(100, progress * 100));
  dashFill.style.width = `${pct}%`;
  dashButton.style.setProperty('--dash', `${pct}%`);
  dashText.textContent = remaining > 0.05 ? `${remaining.toFixed(1)}s` : '就绪';
  dashButton.classList.toggle('is-ready', remaining <= 0.05);
}

export function setRunClock(elapsedSeconds: number): void {
  const text = formatTime(Math.max(0, Math.floor(elapsedSeconds)));
  timer.textContent = text;
  mobileTime.textContent = text;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

export interface RoomProgress {
  index: number;
  total: number;
  chapterIndex?: number;
  chapterTotal?: number;
  name: string;
  en: string;
  cleared: number;
  quota: number;
  kills: number;
  hp: number;
  maxHp: number;
}

export function setRoomProgress(progress: RoomProgress): void {
  const pad = (value: number) => String(value).padStart(2, '0');
  roomNum.textContent = pad(progress.index);
  roomTotal.textContent = `/ ${pad(progress.total)}`;
  roomName.textContent = progress.name;
  mobileRoomName.textContent = progress.name;
  objectiveLabel.textContent = progress.en;
  const chapterPrefix =
    progress.chapterTotal && progress.chapterTotal > 1
      ? `W${(progress.chapterIndex ?? 0) + 1} · `
      : '';
  objectiveRoom.textContent = `${chapterPrefix}ROOM ${progress.index} / ${progress.total}`;
  objectiveTime.textContent = `${progress.cleared} / ${progress.quota}`;
  survivalFill.style.width = `${Math.min(100, (progress.cleared / progress.quota) * 100)}%`;
  threatLevel.textContent = ROMAN[progress.index - 1] ?? String(progress.index);
  phasePips.forEach((pip, index) => {
    pip.classList.toggle('active', index < progress.index);
  });
  setKills(progress.kills);
  setHp(progress.hp, progress.maxHp);
}

export function setKills(kills: number): void {
  killsText.textContent = String(kills);
  objectiveKills.textContent = String(kills);
  mobileKills.textContent = String(kills);
}

function updateSlot(
  slot: HTMLElement,
  icon: SVGUseElement,
  iconBox: HTMLElement,
  nameEl: HTMLElement,
  statusEl: HTMLElement,
  descEl: HTMLElement,
  ref: PlayerBuild['trajectory'] | PlayerBuild['impact'],
  emptyIcon: string,
  emptyName: string,
  emptyDesc: string,
  slotLabel: string
): void {
  if (!ref) {
    slot.classList.add('is-locked');
    slot.classList.remove('is-owned');
    icon.setAttribute('href', emptyIcon);
    nameEl.textContent = emptyName;
    statusEl.textContent = '空槽';
    descEl.textContent = emptyDesc;
    slot.style.setProperty('--rule-color', '#60748c');
    iconBox.style.color = '#60748c';
    return;
  }
  const def = getRuleDef(ref.key);
  const color = RULE_COLORS[ref.key];
  slot.classList.remove('is-locked');
  slot.classList.add('is-owned');
  icon.setAttribute('href', def.icon);
  nameEl.textContent = def.name;
  statusEl.textContent = ref.ascended ? 'Lv.3 · 升阶' : `Lv.${ref.level}`;
  descEl.textContent = getRuleLevelDescription(ref.key, ref.level);
  slot.style.setProperty('--rule-color', color);
  iconBox.style.color = color;
  iconBox.setAttribute('aria-label', `${slotLabel} ${def.name} Lv.${ref.level}`);
}

export function setBuild(build: PlayerBuild, acquired: ReadonlySet<RuleKey> = new Set()): void {
  updateSlot(
    slotTrajectory,
    slotTrajectoryIcon,
    slotTrajectoryIco,
    slotTrajectoryName,
    slotTrajectoryStatus,
    slotTrajectoryDesc,
    build.trajectory,
    '#i-shard',
    '未装备',
    '通过规则祭坛装备一条弹道规则',
    '弹道规则'
  );
  updateSlot(
    slotImpact,
    slotImpactIcon,
    slotImpactIco,
    slotImpactName,
    slotImpactStatus,
    slotImpactDesc,
    build.impact,
    '#i-shard',
    '未装备',
    '通过规则祭坛装备一条命中规则',
    '命中规则'
  );

  const trajectoryRef = build.trajectory;
  const impactRef = build.impact;
  if (trajectoryRef) {
    const color = RULE_COLORS[trajectoryRef.key];
    miniTrajectory.classList.remove('is-locked');
    miniTrajectory.classList.add('is-owned');
    miniTrajectory.style.setProperty('--rule-color', color);
    miniTrajectoryIcon.setAttribute('href', getRuleDef(trajectoryRef.key).icon);
    miniTrajectoryName.textContent = getRuleDef(trajectoryRef.key).name;
    miniTrajectoryStatus.textContent = `Lv.${trajectoryRef.level}`;
  } else {
    miniTrajectory.classList.add('is-locked');
    miniTrajectory.classList.remove('is-owned');
    miniTrajectory.style.setProperty('--rule-color', '#60748c');
    miniTrajectoryIcon.setAttribute('href', '#i-shard');
    miniTrajectoryName.textContent = '弹道';
    miniTrajectoryStatus.textContent = '空槽';
  }
  if (impactRef) {
    const color = RULE_COLORS[impactRef.key];
    miniImpact.classList.remove('is-locked');
    miniImpact.classList.add('is-owned');
    miniImpact.style.setProperty('--rule-color', color);
    miniImpactIcon.setAttribute('href', getRuleDef(impactRef.key).icon);
    miniImpactName.textContent = getRuleDef(impactRef.key).name;
    miniImpactStatus.textContent = `Lv.${impactRef.level}`;
  } else {
    miniImpact.classList.add('is-locked');
    miniImpact.classList.remove('is-owned');
    miniImpact.style.setProperty('--rule-color', '#60748c');
    miniImpactIcon.setAttribute('href', '#i-shard');
    miniImpactName.textContent = '命中';
    miniImpactStatus.textContent = '空槽';
  }

  buildCount.textContent = `等级 ${buildLevelSum(build)} / 6`;
  const combo = getBuildCombo(build);
  comboKicker.textContent = combo.complete ? 'CURRENT RULE COMBO' : 'CURRENT RULE';
  comboName.textContent = combo.name;
  comboSub.textContent = combo.description;
  mobileComboName.textContent = combo.name;
  mobileComboSub.textContent = combo.description;
  comboBanner.classList.toggle('is-empowered', combo.complete);

  renderCodex(acquired);
}

let codexKinds: EnemyKind[] = [];
let lastAcquired: ReadonlySet<RuleKey> = new Set();

export function setRoomEnemies(kinds: EnemyKind[]): void {
  codexKinds = kinds;
  renderCodex(lastAcquired);
}

function renderCodex(acquired: ReadonlySet<RuleKey>): void {
  lastAcquired = acquired;
  codexList.textContent = '';
  for (const kind of codexKinds.slice(0, 4)) {
    const spec = ENEMY_SPECS[kind];
    const owned = acquired.has(spec.rule);
    const row = document.createElement('div');
    row.className = `codex-row ${owned ? 'is-owned' : 'is-locked'}`;
    row.dataset.kind = kind;

    const imgBox = document.createElement('div');
    imgBox.className = 'codex-img';
    const img = document.createElement('img');
    img.src = `./assets/sprites/${spec.sprite}.png`;
    img.alt = spec.name;
    imgBox.append(img);

    const copy = document.createElement('div');
    copy.className = 'codex-copy';
    const name = document.createElement('b');
    name.textContent = `${spec.elite ? '★ ' : ''}${spec.name}`;
    const hint = document.createElement('small');
    hint.textContent = spec.hint;
    copy.append(name, hint);

    const side = document.createElement('div');
    side.className = 'codex-side';
    const badge = document.createElement('span');
    badge.className = 'codex-rule';
    badge.textContent = spec.ruleName;
    badge.style.color = RULE_COLORS[spec.rule];
    badge.style.borderColor = `${RULE_COLORS[spec.rule]}59`;
    const state = document.createElement('em');
    state.className = 'codex-state';
    state.textContent = owned ? '已掠夺' : '未掠夺';
    side.append(badge, state);

    row.append(imgBox, copy, side);
    codexList.append(row);
  }
}

export function showRuleToast(kind: RuleToastKind, name: string, sub: string): void {
  const iconUse = toastIcon.querySelector('use');
  const color = RULE_COLORS[kind];
  const href = kind === 'heal' ? '#i-heart' : getRuleDef(kind).icon;
  iconUse?.setAttribute('href', href);
  toastIcon.style.color = color;
  toastIcon.style.borderColor = color;
  toastIcon.style.background = `${color}14`;
  toast.className = `rule-toast kind-${kind}`;
  toastName.textContent = name;
  toastSub.textContent = sub;
  toast.hidden = false;
  window.clearTimeout(toastTimeout);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  toastTimeout = window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => {
      if (!toast.classList.contains('is-visible')) toast.hidden = true;
    }, 260);
  }, 2400);
}

export function hideRuleToast(): void {
  window.clearTimeout(toastTimeout);
  toast.classList.remove('is-visible');
  toast.hidden = true;
}

export function resetM0Hud(): void {
  setHp(100, 100);
  setDash(1, 0);
  setRunClock(0);
  setKills(0);
  setRoomProgress({
    index: 1,
    total: 3,
    name: '训戒前庭',
    en: 'ANTECHAMBER',
    cleared: 0,
    quota: 8,
    kills: 0,
    hp: 100,
    maxHp: 100
  });
  setBuild(createEmptyBuild(), new Set());
  setBossBar(null);
  setMutation(null);
  setSealedRule(null, false);
  hideRuleToast();
}
