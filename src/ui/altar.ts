import { getRuleSlotLabel, type RuleOffer } from '../game/rules';
import { RULE_COLORS } from './hud';

const ACTION_LABEL: Record<RuleOffer['action'], string> = {
  equip: '装备',
  upgrade: '升级',
  replace: '替换'
};

const altarScreen = requireId<HTMLElement>('altar-screen');
const offersWrap = requireId<HTMLElement>('rule-offers');

function requireId<T extends Element>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing altar markup: #${id}`);
  return node as unknown as T;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildCard(offer: RuleOffer, index: number, onPick: (offer: RuleOffer) => void) {
  const card = el('button', `rule-card action-${offer.action}`);
  card.type = 'button';
  card.style.setProperty('--rule-color', RULE_COLORS[offer.key]);
  card.dataset.key = offer.key;
  card.dataset.action = offer.action;

  const head = el('div', 'rule-card-head');
  const iconBox = el('div', 'rule-card-icon');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', offer.icon);
  svg.append(use);
  iconBox.append(svg);

  const title = el('div', 'rule-card-title');
  title.append(
    el('span', 'rule-card-slot', getRuleSlotLabel(offer.slot)),
    el('span', 'rule-card-name', offer.name)
  );
  head.append(iconBox, title, el('span', `rule-card-action ${offer.action}`, ACTION_LABEL[offer.action]));

  const levels = el('div', 'rule-card-levels');
  for (let level = 1; level <= 3; level += 1) {
    levels.append(el('span', `level-pip${level <= offer.nextLevel ? ' active' : ''}`));
  }
  levels.append(
    el(
      'span',
      undefined,
      offer.action === 'equip' ? `Lv.${offer.nextLevel}` : `Lv.${offer.currentLevel} → Lv.${offer.nextLevel}`
    )
  );

  const body = el('p', 'rule-card-desc', offer.nextDescription);
  const note = el(
    'span',
    offer.replacesRule ? 'rule-card-replace' : 'rule-card-now',
    offer.replacesRule
      ? `将替换 ${offer.replacesRule}，重置为 Lv.1`
      : offer.description
  );

  card.append(head, levels, body, note);

  if (offer.comboName) {
    const combo = el('div', 'rule-card-combo');
    combo.append(el('b', undefined, offer.comboName));
    if (offer.comboDescription) {
      combo.append(document.createElement('br'), el('span', undefined, offer.comboDescription));
    }
    card.append(combo);
  } else {
    card.append(el('div', 'rule-card-combo', '另一槽仍为空 · 组合未成型'));
  }

  const keyHint = el('span', 'rule-card-key', String(index + 1));
  card.append(keyHint);

  card.addEventListener('click', () => onPick(offer));
  return card;
}

export function renderRuleOffers(offers: readonly RuleOffer[], onPick: (offer: RuleOffer) => void): void {
  offersWrap.textContent = '';
  offers.forEach((offer, index) => {
    offersWrap.append(buildCard(offer, index, onPick));
  });
}

export function setAltarVisible(visible: boolean): void {
  altarScreen.hidden = !visible;
  altarScreen.dataset.open = visible ? '1' : '0';
  if (visible) {
    offersWrap.querySelector<HTMLElement>('.rule-card')?.focus({ preventScroll: true });
  }
}

export function isAltarVisible(): boolean {
  return !altarScreen.hidden;
}

export function pickAltarOffer(index: number): boolean {
  const card = offersWrap.children[index] as HTMLElement | undefined;
  if (!card) return false;
  card.click();
  return true;
}
