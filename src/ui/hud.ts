import {
  buildLevelSum,
  createEmptyBuild,
  getBuildCombo,
  getRuleDef,
  getRuleLevelDescription,
  type PlayerBuild,
  type RuleKey,
  type RuleRef
} from '../game/rules';
import { ENEMY_SPECS, type EnemyKind } from '../game/rooms';
import type { MutationDef } from '../game/mutations';
import type { RelicDef } from '../game/relics';
import { MAX_LATE_UPGRADES, type LateUpgradeDef } from '../game/lateUpgrades';
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
const slotSecondary = byId<HTMLElement>('slot-secondary');
const slotTrajectoryIcon = byId<SVGUseElement>('slot-trajectory-icon');
const slotImpactIcon = byId<SVGUseElement>('slot-impact-icon');
const slotSecondaryIcon = byId<SVGUseElement>('slot-secondary-icon');
const slotTrajectoryName = byId<HTMLElement>('slot-trajectory-name');
const slotImpactName = byId<HTMLElement>('slot-impact-name');
const slotSecondaryName = byId<HTMLElement>('slot-secondary-name');
const slotTrajectoryStatus = byId<HTMLElement>('slot-trajectory-status');
const slotImpactStatus = byId<HTMLElement>('slot-impact-status');
const slotSecondaryStatus = byId<HTMLElement>('slot-secondary-status');
const slotTrajectoryDesc = byId<HTMLElement>('slot-trajectory-desc');
const slotImpactDesc = byId<HTMLElement>('slot-impact-desc');
const slotSecondaryDesc = byId<HTMLElement>('slot-secondary-desc');
const slotTrajectoryIco = byId<HTMLElement>('slot-trajectory-ico');
const slotImpactIco = byId<HTMLElement>('slot-impact-ico');
const slotSecondaryIco = byId<HTMLElement>('slot-secondary-ico');

const miniTrajectory = byId<HTMLElement>('mini-trajectory');
const miniImpact = byId<HTMLElement>('mini-impact');
const miniSecondary = byId<HTMLElement>('mini-secondary');
const miniTrajectoryIcon = byId<SVGUseElement>('mini-trajectory-icon');
const miniImpactIcon = byId<SVGUseElement>('mini-impact-icon');
const miniSecondaryIcon = byId<SVGUseElement>('mini-secondary-icon');
const miniTrajectoryName = byId<HTMLElement>('mini-trajectory-name');
const miniImpactName = byId<HTMLElement>('mini-impact-name');
const miniSecondaryName = byId<HTMLElement>('mini-secondary-name');
const miniTrajectoryStatus = byId<HTMLElement>('mini-trajectory-status');
const miniImpactStatus = byId<HTMLElement>('mini-impact-status');
const miniSecondaryStatus = byId<HTMLElement>('mini-secondary-status');

const comboKicker = byId<HTMLElement>('combo-kicker');
const comboName = byId<HTMLElement>('combo-name');
const comboSub = byId<HTMLElement>('combo-sub');
const comboBanner = document.querySelector('.combo-banner') as HTMLElement;
const mobileComboName = byId<HTMLElement>('mobile-combo-name');
const mobileComboSub = byId<HTMLElement>('mobile-combo-sub');

const codexList = byId<HTMLElement>('codex-list');
const objectiveWave = byId<HTMLElement>('objective-wave');
const waveLabel = byId<HTMLElement>('wave-label');
const waveProgress = byId<HTMLElement>('wave-progress');
const aliveCount = byId<HTMLElement>('alive-count');
const killStreak = byId<HTMLElement>('kill-streak');
const killStreakKicker = byId<HTMLElement>('kill-streak-kicker');
const killStreakCount = byId<HTMLElement>('kill-streak-count');
const killStreakBest = byId<HTMLElement>('kill-streak-best');
const waveBanner = byId<HTMLElement>('wave-banner');
const waveBannerText = byId<HTMLElement>('wave-banner-text');
const waveBannerSub = byId<HTMLElement>('wave-banner-sub');
let waveBannerTimeout: number | undefined;

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
const lateLine = byId<HTMLElement>('late-line');
const lateCount = byId<HTMLElement>('late-count');
const lateNames = byId<HTMLElement>('late-names');
const itemTip = byId<HTMLElement>('item-tip');

interface ItemTipData {
  title: string;
  lines: string[];
}

function showItemTip(anchor: HTMLElement, data: ItemTipData): void {
  itemTip.textContent = '';
  const title = document.createElement('b');
  title.textContent = data.title;
  itemTip.append(title);
  for (const line of data.lines) {
    const row = document.createElement('span');
    row.textContent = line;
    itemTip.append(row);
  }
  itemTip.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const tipRect = itemTip.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - tipRect.width - 8, rect.left));
  const below = rect.bottom + 8;
  const top =
    below + tipRect.height <= window.innerHeight - 8
      ? below
      : Math.max(8, rect.top - tipRect.height - 8);
  itemTip.style.left = `${left}px`;
  itemTip.style.top = `${top}px`;
}

function hideItemTip(): void {
  itemTip.hidden = true;
}

function bindItemTip(anchor: HTMLElement, getData: () => ItemTipData | null): void {
  anchor.tabIndex = 0;
  const show = () => {
    const data = getData();
    if (data) showItemTip(anchor, data);
  };
  anchor.onmouseenter = show;
  anchor.onfocus = show;
  anchor.onmouseleave = hideItemTip;
  anchor.onblur = hideItemTip;
  anchor.onclick = (event) => {
    event.preventDefault();
    if (itemTip.hidden) {
      show();
    } else {
      hideItemTip();
    }
  };
}

const PHASE_LABELS = ['秩序', '混乱', '规则剥夺'];
const PHASE_NUMERALS = ['I', 'II', 'III'];

export function setBossBar(
  state: {
    name: string;
    hp: number;
    maxHp: number;
    phase: number;
    enraged?: boolean;
  } | null
): void {
  document.body.classList.toggle('boss-active', Boolean(state));
  if (!state) {
    bossBar.hidden = true;
    return;
  }
  bossBar.hidden = false;
  bossBarName.textContent = state.name;
  const index = Math.max(0, Math.min(2, state.phase - 1));
  bossBarPhase.textContent = state.enraged
    ? 'PHASE III · 暴走'
    : `PHASE ${PHASE_NUMERALS[index]} · ${PHASE_LABELS[index]}`;
  bossBarPhase.dataset.phase = String(state.phase);
  bossBar.classList.toggle('is-enraged', Boolean(state.enraged));
  bossBarFill.style.width = `${Math.max(0, Math.min(100, (state.hp / state.maxHp) * 100))}%`;
  bossPips.forEach((pip, pipIndex) => pip.classList.toggle('active', pipIndex < state.phase));
}

export function setMutation(def: MutationDef | null): void {
  mutationLine.hidden = !def;
  bindItemTip(mutationLine, () =>
    def
      ? {
          title: `突变 · ${def.name}`,
          lines: [def.description, def.detail]
        }
      : null
  );
  if (!def) return;
  mutationName.textContent = def.name;
  mutationLine.style.setProperty('--mutation-color', def.color);
  mutationIcon.setAttribute('href', def.icon);
}

export function setRelics(relics: readonly RelicDef[]): void {
  relicLine.hidden = relics.length === 0;
  relicCount.textContent = `${relics.length} / 2`;
  relicNames.textContent = relics.length ? relics.map((relic) => relic.name).join(' · ') : '—';
  bindItemTip(relicLine, () =>
    relics.length
      ? {
          title: `遗物 · ${relics.map((relic) => relic.name).join(' / ')}`,
          lines: relics.map((relic) => `${relic.name}：${relic.description}\n${relic.detail}`)
        }
      : null
  );
}

export function setLate(upgrades: readonly LateUpgradeDef[]): void {
  lateLine.hidden = upgrades.length === 0;
  lateCount.textContent = `${upgrades.length} / ${MAX_LATE_UPGRADES}`;
  const grouped = new Map<string, { def: LateUpgradeDef; level: number }>();
  for (const upgrade of upgrades) {
    const entry = grouped.get(upgrade.id);
    if (entry) entry.level += 1;
    else grouped.set(upgrade.id, { def: upgrade, level: 1 });
  }
  const entries = [...grouped.values()];
  lateNames.textContent = entries.length
    ? entries
        .map(({ def, level }) => (level > 1 ? `${def.name} Lv.${level}` : def.name))
        .join(' · ')
    : '—';
  bindItemTip(lateLine, () =>
    entries.length
      ? {
          title: `后期强化 · ${entries
            .map(({ def, level }) => `${def.name} Lv.${level}`)
            .join(' / ')}`,
          lines: entries.map(
            ({ def, level }) =>
              `${def.name} Lv.${level}：${def.description}\n${def.detail}`
          )
        }
      : null
  );
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
  mutator?: string;
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
  const mutatorPrefix = progress.mutator ? `${progress.mutator} · ` : '';
  objectiveRoom.textContent = `${mutatorPrefix}${chapterPrefix}ROOM ${progress.index} / ${progress.total}`;
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

export function setWaveStatus(wave: number, total: number, alive: number): void {
  objectiveWave.hidden = total <= 0;
  waveLabel.textContent = 'WAVE';
  waveProgress.textContent = total > 0 ? `${Math.max(1, wave)} / ${total}` : '—';
  aliveCount.textContent = String(alive);
}

export function setSurgeStatus(remaining: number, alive: number): void {
  objectiveWave.hidden = false;
  waveLabel.textContent = '高压';
  waveProgress.textContent = `${Math.max(0, Math.ceil(remaining))}s`;
  aliveCount.textContent = String(alive);
}

export function setKillStreak(count: number, best: number): void {
  killStreak.hidden = count < 2;
  if (count < 2) return;
  killStreakCount.textContent = `×${count}`;
  killStreakBest.textContent = `BEST ${Math.max(count, best)}`;
  killStreakKicker.textContent =
    count >= 25 ? 'MASSACRE' : count >= 10 ? 'FRENZY' : 'KILL STREAK';
  killStreak.classList.toggle('is-hot', count >= 10);
  killStreak.classList.toggle('is-blazing', count >= 25);
  killStreak.classList.remove('is-pop');
  void killStreak.offsetWidth;
  killStreak.classList.add('is-pop');
}

export function showWaveBanner(wave: number, total: number): void {
  waveBannerText.textContent = `${wave} / ${total}`;
  waveBannerSub.textContent = wave === total ? 'FINAL WAVE' : 'HOSTILES INBOUND';
  waveBanner.hidden = false;
  waveBanner.classList.remove('is-in');
  void waveBanner.offsetWidth;
  waveBanner.classList.add('is-in');
  window.clearTimeout(waveBannerTimeout);
  waveBannerTimeout = window.setTimeout(() => {
    waveBanner.hidden = true;
  }, 1400);
}

export function resetHordeHud(): void {
  window.clearTimeout(waveBannerTimeout);
  killStreak.hidden = true;
  waveBanner.hidden = true;
  objectiveWave.hidden = true;
}

function updateSlot(
  slot: HTMLElement,
  icon: SVGUseElement,
  iconBox: HTMLElement,
  nameEl: HTMLElement,
  statusEl: HTMLElement,
  descEl: HTMLElement,
  ref: RuleRef | null,
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
  updateSlot(
    slotSecondary,
    slotSecondaryIcon,
    slotSecondaryIco,
    slotSecondaryName,
    slotSecondaryStatus,
    slotSecondaryDesc,
    build.secondary ?? null,
    '#i-shard',
    '未装备',
    '主槽满后可装备第三条规则，按完整效果触发',
    '副规则'
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
  const secondaryRef = build.secondary ?? null;
  if (secondaryRef) {
    const color = RULE_COLORS[secondaryRef.key];
    miniSecondary.classList.remove('is-locked');
    miniSecondary.classList.add('is-owned');
    miniSecondary.style.setProperty('--rule-color', color);
    miniSecondaryIcon.setAttribute('href', getRuleDef(secondaryRef.key).icon);
    miniSecondaryName.textContent = getRuleDef(secondaryRef.key).name;
    miniSecondaryStatus.textContent = `Lv.${secondaryRef.level}`;
  } else {
    miniSecondary.classList.add('is-locked');
    miniSecondary.classList.remove('is-owned');
    miniSecondary.style.setProperty('--rule-color', '#60748c');
    miniSecondaryIcon.setAttribute('href', '#i-shard');
    miniSecondaryName.textContent = '副规则';
    miniSecondaryStatus.textContent = '空槽';
  }

  buildCount.textContent = `等级 ${buildLevelSum(build)} / 9`;
  const combo = getBuildCombo(build);
  comboKicker.textContent = combo.complete ? 'CURRENT RULE COMBO' : 'CURRENT RULE';
  comboName.textContent = combo.name;
  const thirdLabel = secondaryRef ? ` · 副规则 ${getRuleDef(secondaryRef.key).name}` : '';
  comboSub.textContent = `${combo.description}${thirdLabel}`;
  mobileComboName.textContent = combo.name;
  mobileComboSub.textContent = `${combo.description}${thirdLabel}`;
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
  resetHordeHud();
  setBossBar(null);
  setMutation(null);
  setSealedRule(null, false);
  hideRuleToast();
}
