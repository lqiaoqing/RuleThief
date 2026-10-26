import { getRuleSlotLabel, type RuleOffer } from '../game/rules';
import { ENEMY_SPECS, getRoomEnemyKinds, type Reward, type RoomPreview } from '../game/rooms';
import { RULE_COLORS } from './hud';

const ACTION_LABEL: Record<RuleOffer['action'], string> = {
  equip: '装备',
  upgrade: '升级',
  replace: '替换'
};

const rewardScreen = requireId<HTMLElement>('altar-screen');
const offersWrap = requireId<HTMLElement>('rule-offers');
const rewardRoom = requireId<HTMLElement>('reward-room');

const roomScreen = requireId<HTMLElement>('room-screen');
const roomKicker = requireId<HTMLElement>('room-kicker');
const roomTitle = requireId<HTMLElement>('room-title');
const roomEn = requireId<HTMLElement>('room-en');
const roomSub = requireId<HTMLElement>('room-sub');
const roomEnemies = requireId<HTMLElement>('room-enemies');
const roomQuota = requireId<HTMLElement>('room-quota');
const roomHp = requireId<HTMLElement>('room-hp');
const roomKills = requireId<HTMLElement>('room-kills');

function requireId<T extends Element>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing M2 markup: #${id}`);
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

function iconSvg(href: string, size = 22): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', href);
  svg.append(use);
  return svg;
}

function ruleCard(offer: RuleOffer, index: number) {
  const card = el('button', `rule-card action-${offer.action}`);
  card.type = 'button';
  card.style.setProperty('--rule-color', RULE_COLORS[offer.key]);
  card.dataset.key = offer.key;
  card.dataset.action = offer.action;
  card.dataset.kind = 'rule';

  const head = el('div', 'rule-card-head');
  const iconBox = el('div', 'rule-card-icon');
  iconBox.append(iconSvg(offer.icon));
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

  card.append(el('span', 'rule-card-key', String(index + 1)));
  return card;
}

function supportCard(reward: Extract<Reward, { kind: 'support' }>, index: number) {
  const card = el('button', 'rule-card action-support');
  card.type = 'button';
  card.style.setProperty('--rule-color', '#7edca9');
  card.dataset.key = reward.support.id;
  card.dataset.action = 'support';
  card.dataset.kind = 'support';

  const head = el('div', 'rule-card-head');
  const iconBox = el('div', 'rule-card-icon');
  iconBox.append(iconSvg(reward.support.icon));
  const title = el('div', 'rule-card-title');
  title.append(
    el('span', 'rule-card-slot', '基础强化 · SUPPORT'),
    el('span', 'rule-card-name', reward.support.name)
  );
  head.append(iconBox, title, el('span', 'rule-card-action support', '强化'));

  const body = el('p', 'rule-card-desc', reward.support.description);
  const note = el('span', 'rule-card-now', reward.support.detail);
  card.append(head, body, note, el('div', 'rule-card-combo support-note', '不占用规则槽位 · 立即生效'));
  card.append(el('span', 'rule-card-key', String(index + 1)));
  return card;
}

function mutationCard(reward: Extract<Reward, { kind: 'mutation' }>, index: number) {
  const mutation = reward.mutation;
  const card = el('button', 'rule-card action-mutation');
  card.type = 'button';
  card.style.setProperty('--rule-color', mutation.color);
  card.dataset.key = mutation.id;
  card.dataset.action = 'mutation';
  card.dataset.kind = 'mutation';

  const head = el('div', 'rule-card-head');
  const iconBox = el('div', 'rule-card-icon');
  iconBox.append(iconSvg(mutation.icon));
  const title = el('div', 'rule-card-title');
  title.append(
    el('span', 'rule-card-slot', '突变 · MUTATION'),
    el('span', 'rule-card-name', mutation.name)
  );
  head.append(iconBox, title, el('span', 'rule-card-action mutation', '突变'));

  card.append(head, el('p', 'rule-card-desc', mutation.description));
  card.append(el('span', 'rule-card-now', mutation.detail));
  card.append(el('div', 'rule-card-combo mutation-note', '每局仅能装备 1 项突变 · 第三构筑维度'));
  card.append(el('span', 'rule-card-key', String(index + 1)));
  return card;
}

export function renderRewards(rewards: readonly Reward[], onPick: (reward: Reward) => void): void {
  offersWrap.textContent = '';
  offersWrap.dataset.count = String(rewards.length);
  rewards.forEach((reward, index) => {
    const card =
      reward.kind === 'rule'
        ? ruleCard(reward.offer, index)
        : reward.kind === 'mutation'
          ? mutationCard(reward, index)
          : supportCard(reward, index);
    card.addEventListener('click', () => onPick(reward));
    offersWrap.append(card);
  });
}

export function setRewardVisible(visible: boolean, roomLabel = ''): void {
  rewardScreen.hidden = !visible;
  if (roomLabel) rewardRoom.textContent = roomLabel;
  if (visible) {
    offersWrap.querySelector<HTMLElement>('.rule-card')?.focus({ preventScroll: true });
  }
}

export function isRewardVisible(): boolean {
  return !rewardScreen.hidden;
}

export function pickReward(index: number): boolean {
  const card = offersWrap.children[index] as HTMLElement | undefined;
  if (!card) return false;
  card.click();
  return true;
}

export function renderRoomPreview(payload: RoomPreview): void {
  const pad = (value: number) => String(value).padStart(2, '0');
  const elite = Boolean(payload.room.elite);
  roomKicker.textContent = `ROOM ${pad(payload.index + 1)} / ${pad(payload.total)}${elite ? ' · ELITE' : ''}`;
  roomTitle.textContent = payload.room.name;
  roomEn.textContent = payload.room.en;
  roomSub.textContent = payload.room.subtitle;
  roomQuota.textContent = String(payload.room.quota);
  roomHp.textContent = `${Math.ceil(payload.hp)} / ${payload.maxHp}`;
  roomKills.textContent = String(payload.kills);
  roomKicker.classList.toggle('is-elite', elite);

  roomEnemies.textContent = '';
  for (const kind of getRoomEnemyKinds(payload.room)) {
    const spec = ENEMY_SPECS[kind];
    const chip = el('div', `room-enemy${spec.elite ? ' is-elite' : ''}`);
    const img = el('img');
    img.src = `./assets/sprites/${spec.sprite}.png`;
    img.alt = spec.name;
    const copy = el('div', 'room-enemy-copy');
    copy.append(
      el('b', undefined, `${spec.elite ? '★ ' : ''}${spec.name}`),
      el('small', undefined, spec.hint)
    );
    const rule = el('span', 'codex-rule', spec.ruleName);
    rule.style.color = RULE_COLORS[spec.rule];
    rule.style.borderColor = `${RULE_COLORS[spec.rule]}59`;
    chip.append(img, copy, rule);
    roomEnemies.append(chip);
  }

  const foot = roomScreen.querySelector<HTMLElement>('.room-foot span');
  if (foot) {
    foot.textContent = elite
      ? '精英房：清场后四选一，规则奖励 + 基础强化。构筑与生命保留到下一房。'
      : '清空配额后进入三选一奖励，构筑与生命保留到下一房。';
  }
}

export function setRoomVisible(visible: boolean): void {
  roomScreen.hidden = !visible;
  if (visible) {
    document.getElementById('room-enter-btn')?.focus({ preventScroll: true });
  }
}

export function isRoomVisible(): boolean {
  return !roomScreen.hidden;
}
