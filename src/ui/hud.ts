import { formatTime } from '../game/theme';

export interface RuleState {
  chain: boolean;
  blast: boolean;
}

export type RuleToastKind = 'chain' | 'blast' | 'heal';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing HUD element: ${id}`);
  }
  return node as T;
}

const hpText = byId<HTMLElement>('hp-text');
const hpFill = byId<HTMLElement>('hp-fill');
const dashText = byId<HTMLElement>('dash-text');
const dashFill = byId<HTMLElement>('dash-fill');
const dashButton = byId<HTMLButtonElement>('dash-btn');
const timer = byId<HTMLElement>('timer');
const mobileTime = byId<HTMLElement>('mobile-time');
const objectiveTime = byId<HTMLElement>('objective-time');
const survivalFill = byId<HTMLElement>('survival-fill');
const killsText = byId<HTMLElement>('kills-text');
const objectiveKills = byId<HTMLElement>('objective-kills');
const mobileKills = byId<HTMLElement>('mobile-kills');
const threatLevel = byId<HTMLElement>('threat-level');
const buildCount = byId<HTMLElement>('build-count');
const slotChain = byId<HTMLElement>('slot-chain');
const slotBlast = byId<HTMLElement>('slot-blast');
const slotChainStatus = byId<HTMLElement>('slot-chain-status');
const slotBlastStatus = byId<HTMLElement>('slot-blast-status');
const miniChain = byId<HTMLElement>('mini-chain');
const miniBlast = byId<HTMLElement>('mini-blast');
const miniChainStatus = byId<HTMLElement>('mini-chain-status');
const miniBlastStatus = byId<HTMLElement>('mini-blast-status');
const comboKicker = byId<HTMLElement>('combo-kicker');
const comboName = byId<HTMLElement>('combo-name');
const comboSub = byId<HTMLElement>('combo-sub');
const comboBanner = document.querySelector('.combo-banner') as HTMLElement;
const mobileComboName = byId<HTMLElement>('mobile-combo-name');
const mobileComboSub = byId<HTMLElement>('mobile-combo-sub');
const codexBeetle = byId<HTMLElement>('codex-beetle');
const codexBat = byId<HTMLElement>('codex-bat');
const codexBeetleState = byId<HTMLElement>('codex-beetle-state');
const codexBatState = byId<HTMLElement>('codex-bat-state');
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

export function setTimer(secondsRemaining: number): void {
  const text = formatTime(Math.max(0, Math.ceil(secondsRemaining)));
  timer.textContent = text;
  objectiveTime.textContent = text;
  mobileTime.textContent = text;
  timer.classList.toggle('is-urgent', secondsRemaining <= 30);
}

export function setKills(kills: number): void {
  killsText.textContent = String(kills);
  objectiveKills.textContent = String(kills);
  mobileKills.textContent = String(kills);
}

export function setThreat(level: 1 | 2 | 3): void {
  threatLevel.textContent = level === 1 ? 'I' : level === 2 ? 'II' : 'III';
  phasePips.forEach((pip, index) => {
    pip.classList.toggle('active', index < level);
  });
}

export function setObjective(elapsed: number, duration: number, kills: number): void {
  const pct = Math.max(0, Math.min(100, (elapsed / duration) * 100));
  survivalFill.style.width = `${pct}%`;
  setKills(kills);
  setThreat(elapsed < 60 ? 1 : elapsed < 120 ? 2 : 3);
}

export function setRules(rules: RuleState): void {
  const owned = Number(rules.chain) + Number(rules.blast);
  buildCount.textContent = `掠夺 ${owned} / 2`;

  slotChain.classList.toggle('is-owned', rules.chain);
  slotChain.classList.toggle('is-locked', !rules.chain);
  slotBlast.classList.toggle('is-owned', rules.blast);
  slotBlast.classList.toggle('is-locked', !rules.blast);
  slotChainStatus.textContent = rules.chain ? 'Lv.1' : '未掠夺';
  slotBlastStatus.textContent = rules.blast ? 'Lv.1' : '未掠夺';

  miniChain.classList.toggle('is-owned', rules.chain);
  miniChain.classList.toggle('is-locked', !rules.chain);
  miniBlast.classList.toggle('is-owned', rules.blast);
  miniBlast.classList.toggle('is-locked', !rules.blast);
  miniChainStatus.textContent = rules.chain ? 'Lv.1' : '未掠夺';
  miniBlastStatus.textContent = rules.blast ? 'Lv.1' : '未掠夺';

  codexBeetle.classList.toggle('is-owned', rules.blast);
  codexBeetle.classList.toggle('is-locked', !rules.blast);
  codexBat.classList.toggle('is-owned', rules.chain);
  codexBat.classList.toggle('is-locked', !rules.chain);
  codexBeetleState.textContent = rules.blast ? '已掠夺' : '未掠夺';
  codexBatState.textContent = rules.chain ? '已掠夺' : '未掠夺';

  comboBanner.classList.toggle('is-empowered', rules.chain && rules.blast);

  if (rules.chain && rules.blast) {
    comboKicker.textContent = 'CURRENT RULE COMBO';
    comboName.textContent = '雷暴连锁';
    comboSub.textContent = '弹射 × 爆裂 · 每个落点都会爆炸';
    mobileComboName.textContent = '雷暴连锁';
    mobileComboSub.textContent = '弹射 × 爆裂 · 每个落点爆炸';
  } else if (rules.chain) {
    comboKicker.textContent = 'CURRENT RULE COMBO';
    comboName.textContent = '链式魔弹';
    comboSub.textContent = '弹射 · 命中后跳跃最多 2 个其他目标';
    mobileComboName.textContent = '链式魔弹';
    mobileComboSub.textContent = '弹射 · 命中后跳跃最多 2 个目标';
  } else if (rules.blast) {
    comboKicker.textContent = 'CURRENT RULE COMBO';
    comboName.textContent = '爆裂魔弹';
    comboSub.textContent = '爆裂 · 有效命中点产生一次范围伤害';
    mobileComboName.textContent = '爆裂魔弹';
    mobileComboSub.textContent = '爆裂 · 每个命中点产生范围伤害';
  } else {
    comboKicker.textContent = 'CURRENT ATTACK';
    comboName.textContent = '基础魔弹';
    comboSub.textContent = '尚未掠夺规则 · 自动锁定最近目标';
    mobileComboName.textContent = '基础魔弹';
    mobileComboSub.textContent = '击败敌人，掠夺第一条规定';
  }
}

export function showRuleToast(
  kind: RuleToastKind,
  name: string,
  sub: string
): void {
  const iconUse = toastIcon.querySelector('use');
  const iconHref = kind === 'chain' ? '#i-chain' : kind === 'blast' ? '#i-blast' : '#i-heart';
  iconUse?.setAttribute('href', iconHref);
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
  setTimer(180);
  setKills(0);
  setObjective(0, 180, 0);
  setRules({ chain: false, blast: false });
  hideRuleToast();
}
