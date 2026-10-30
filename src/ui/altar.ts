import { getRuleDef, getRuleName, getRuleSlotLabel, type RuleOffer } from '../game/rules';
import {
  ENEMY_SPECS,
  getRoomEnemyKinds,
  getRoomObjectiveLabel,
  getRoomRuleKeys,
  type Reward,
  type RoomPreview
} from '../game/rooms';
import type { EventPayload, RouteChoicePayload } from '../game/run';
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
const roomQuotaLabel = requireId<HTMLElement>('room-quota-label');
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

function relicCard(reward: Extract<Reward, { kind: 'relic' }>, index: number) {
  const relic = reward.relic;
  const card = el('button', 'rule-card action-relic');
  card.type = 'button';
  card.style.setProperty('--rule-color', relic.color);
  card.dataset.key = relic.id;
  card.dataset.action = 'relic';
  card.dataset.kind = 'relic';

  const head = el('div', 'rule-card-head');
  const iconBox = el('div', 'rule-card-icon');
  iconBox.append(iconSvg(relic.icon));
  const title = el('div', 'rule-card-title');
  title.append(
    el('span', 'rule-card-slot', '遗物 · RELIC'),
    el('span', 'rule-card-name', relic.name)
  );
  head.append(iconBox, title, el('span', 'rule-card-action support', '遗物'));

  card.append(head, el('p', 'rule-card-desc', relic.description));
  card.append(el('span', 'rule-card-now', relic.detail));
  card.append(el('div', 'rule-card-combo support-note', '最多装备 2 件 · 不占用规则槽'));
  card.append(el('span', 'rule-card-key', String(index + 1)));
  return card;
}

function ascensionCard(reward: Extract<Reward, { kind: 'ascension' }>, index: number) {
  const ascension = reward.ascension;
  const card = el('button', 'rule-card action-ascension');
  card.type = 'button';
  card.style.setProperty('--rule-color', ascension.color);
  card.dataset.key = ascension.id;
  card.dataset.action = 'ascension';
  card.dataset.kind = 'ascension';

  const head = el('div', 'rule-card-head');
  const iconBox = el('div', 'rule-card-icon');
  iconBox.append(iconSvg(ascension.icon));
  const title = el('div', 'rule-card-title');
  title.append(
    el('span', 'rule-card-slot', '规则升阶 · ASCENSION'),
    el('span', 'rule-card-name', ascension.name)
  );
  head.append(iconBox, title, el('span', 'rule-card-action upgrade', '升阶'));

  card.append(head, el('p', 'rule-card-desc', ascension.description));
  card.append(el('span', 'rule-card-now', ascension.detail));
  card.append(
    el(
      'div',
      'rule-card-combo',
      `${getRuleName(ascension.rule)} Lv.3 升阶形态 · 不新增规则槽`
    )
  );
  card.append(el('span', 'rule-card-key', String(index + 1)));
  return card;
}

function coreCard(reward: Extract<Reward, { kind: 'core' }>, index: number) {
  const core = reward.core;
  const card = el('button', 'rule-card action-late');
  card.type = 'button';
  card.style.setProperty('--rule-color', core.color);
  card.dataset.key = core.id;
  card.dataset.action = 'core';
  card.dataset.kind = 'core';
  const head = el('div', 'rule-card-head');
  const iconBox = el('div', 'rule-card-icon');
  iconBox.append(iconSvg(core.icon));
  const title = el('div', 'rule-card-title');
  title.append(
    el('span', 'rule-card-slot', '律核 · CORE'),
    el('span', 'rule-card-name', `${core.name} Lv.${reward.nextLevel}`)
  );
  head.append(iconBox, title, el('span', 'rule-card-action upgrade', '律核'));
  card.append(head, el('p', 'rule-card-desc', core.descriptions[reward.nextLevel - 1]));
  card.append(el('span', 'rule-card-now', core.detail));
  card.append(el('div', 'rule-card-combo', '不占规则槽 · 每 4 个战斗房出现一次'));
  card.append(el('span', 'rule-card-key', String(index + 1)));
  return card;
}

function resonanceCard(
  reward: Extract<Reward, { kind: 'resonance' }>,
  index: number
) {
  const upgrade = reward.upgrade;
  const card = el('button', 'rule-card action-late');
  card.type = 'button';
  card.style.setProperty('--rule-color', upgrade.color);
  card.dataset.key = upgrade.id;
  card.dataset.action = 'resonance';
  card.dataset.kind = 'resonance';

  const head = el('div', 'rule-card-head');
  const iconBox = el('div', 'rule-card-icon');
  iconBox.append(iconSvg(upgrade.icon));
  const title = el('div', 'rule-card-title');
  title.append(
    el('span', 'rule-card-slot', '规则共鸣 · RESONANCE'),
    el('span', 'rule-card-name', upgrade.name)
  );
  head.append(iconBox, title, el('span', 'rule-card-action upgrade', '共鸣'));

  card.append(head, el('p', 'rule-card-desc', upgrade.description));
  card.append(el('span', 'rule-card-now', upgrade.detail));
  card.append(
    el('div', 'rule-card-combo', '第 4 房后每 3 房出现 · 可重复获得 · 最高 Lv.3')
  );
  card.append(el('span', 'rule-card-key', String(index + 1)));
  return card;
}

function lateCard(reward: Extract<Reward, { kind: 'late' }>, index: number) {
  const upgrade = reward.upgrade;
  const card = el('button', 'rule-card action-late');
  card.type = 'button';
  card.style.setProperty('--rule-color', upgrade.color);
  card.dataset.key = upgrade.id;
  card.dataset.action = 'late';
  card.dataset.kind = 'late';

  const head = el('div', 'rule-card-head');
  const iconBox = el('div', 'rule-card-icon');
  iconBox.append(iconSvg(upgrade.icon));
  const title = el('div', 'rule-card-title');
  title.append(
    el('span', 'rule-card-slot', '后期强化 · LATE'),
    el('span', 'rule-card-name', upgrade.name)
  );
  head.append(iconBox, title, el('span', 'rule-card-action upgrade', '强化'));

  card.append(head, el('p', 'rule-card-desc', upgrade.description));
  card.append(el('span', 'rule-card-now', upgrade.detail));
  card.append(
    el('div', 'rule-card-combo', '章节奖励 · 与已装备规则联动 · 最高 Lv.3')
  );
  card.append(el('span', 'rule-card-key', String(index + 1)));
  return card;
}

function reforgeCard(reward: Extract<Reward, { kind: 'reforge' }>, index: number) {
  const { slot, from, to } = reward.offer;
  const card = el('button', 'rule-card action-replace');
  card.type = 'button';
  card.style.setProperty('--rule-color', RULE_COLORS[to]);
  card.dataset.key = to;
  card.dataset.action = 'reforge';
  card.dataset.kind = 'reforge';

  const head = el('div', 'rule-card-head');
  const iconBox = el('div', 'rule-card-icon');
  iconBox.append(iconSvg(getRuleDef(to).icon));
  const title = el('div', 'rule-card-title');
  title.append(
    el('span', 'rule-card-slot', '规则重铸 · REFORGE'),
    el('span', 'rule-card-name', `${getRuleName(from.key)} → ${getRuleName(to)}`)
  );
  head.append(iconBox, title, el('span', 'rule-card-action replace', '重铸'));

  const levels = el('div', 'rule-card-levels');
  levels.append(el('span', 'level-pip active'));
  levels.append(el('span', undefined, `Lv.${from.level} → Lv.1`));

  card.append(head, levels);
  card.append(
    el(
      'p',
      'rule-card-desc',
      `将${getRuleSlotLabel(slot)}的 ${getRuleName(from.key)} 替换为 ${getRuleName(to)}。`
    )
  );
  card.append(
    el('span', 'rule-card-replace', `本局剩余 ${reward.remaining} 次 · 升阶规则不会被重铸`)
  );
  card.append(
    el('div', 'rule-card-combo', `${getRuleName(to)} Lv.1 · 另外两条规则保持不变`)
  );
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
          : reward.kind === 'relic'
            ? relicCard(reward, index)
            : reward.kind === 'ascension'
              ? ascensionCard(reward, index)
              : reward.kind === 'late'
                ? lateCard(reward, index)
                : reward.kind === 'resonance'
                  ? resonanceCard(reward, index)
                  : reward.kind === 'core'
                    ? coreCard(reward, index)
                  : reward.kind === 'reforge'
                    ? reforgeCard(reward, index)
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
  const surge = Boolean(payload.room.surge);
  const tag = elite ? ' · ELITE' : surge ? ' · HIGH PRESSURE' : '';
  roomKicker.textContent = `ROOM ${pad(payload.index + 1)} / ${pad(payload.total)}${tag}`;
  roomTitle.textContent = payload.room.name;
  roomEn.textContent = payload.room.en;
  roomSub.textContent = payload.room.subtitle;
  roomQuota.textContent = surge ? `${payload.room.surgeDuration ?? 38}s` : String(payload.room.quota);
  roomQuotaLabel.textContent = surge ? '高压时长' : '清场配额';
  roomHp.textContent = `${Math.ceil(payload.hp)} / ${payload.maxHp}`;
  roomKills.textContent = String(payload.kills);
  roomKicker.classList.toggle('is-elite', elite);

  roomEnemies.textContent = '';
  const roomKinds = getRoomEnemyKinds(payload.room);
  for (const kind of roomKinds.slice(0, 8)) {
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
  if (roomKinds.length > 8) {
    roomEnemies.append(el('div', 'room-enemy-more', `+${roomKinds.length - 8}`));
  }

  const foot = roomScreen.querySelector<HTMLElement>('.room-foot span');
  if (foot) {
    const objective = getRoomObjectiveLabel(payload.room);
    const base = objective
      ? elite
        ? '完成目标后四选一；连杀会加快攻击。'
        : '完成目标后三选一；连杀会加快攻击。'
      : surge
        ? '高压遭遇：连续波次 + 保底精英，坚持到计时结束；清场后四选一。'
        : elite
          ? '精英房：怪潮与领袖一起压上，清场后四选一。连杀会加快攻击。'
          : '怪潮成组压上，清空后三选一；连杀会加快攻击，后期怪潮会混入头目。';
    foot.textContent = objective ? `${objective} · ${base}` : base;
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

const routeScreen = requireId<HTMLElement>('route-screen');
const routeKicker = requireId<HTMLElement>('route-kicker');
const routeOptions = requireId<HTMLElement>('route-options');
const routeProgress = requireId<HTMLElement>('route-progress');
const eventScreen = requireId<HTMLElement>('event-screen');
const eventKicker = requireId<HTMLElement>('event-kicker');
const eventTitle = requireId<HTMLElement>('event-title');
const eventEn = requireId<HTMLElement>('event-en');
const eventSub = requireId<HTMLElement>('event-sub');
const eventOptions = requireId<HTMLElement>('event-options');
const eventFoot = requireId<HTMLElement>('event-foot');
const eventHp = requireId<HTMLElement>('event-hp');

export function renderRoute(
  payload: RouteChoicePayload,
  onPick: (index: number) => void
): void {
  routeKicker.textContent = `ROUTE ${payload.index + 1} / ${payload.total}`;
  routeProgress.textContent = `第 ${payload.index + 1} 步 / 共 ${payload.total} 步`;
  routeOptions.textContent = '';

  payload.options.forEach((option, index) => {
    const isEvent = option.kind === 'event';
    const elite = !isEvent && Boolean(option.room.elite);
    const surge = !isEvent && Boolean(option.room.surge);
    const card = el(
      'button',
      `route-option${isEvent ? ' is-event' : surge ? ' is-surge' : elite ? ' is-elite' : ''}`
    );
    card.type = 'button';
    card.dataset.kind = option.kind;
    card.dataset.index = String(index);

    const head = el('div', 'route-option-head');
    head.append(
      el(
        'span',
        'route-option-tag',
        isEvent ? '事件' : surge ? '高压' : elite ? '精英' : '战斗'
      ),
      el('b', 'route-option-name', isEvent ? option.event.name : option.room.name)
    );
    card.append(head);
    card.append(
      el('span', 'route-option-en', isEvent ? option.event.en : option.room.en)
    );

    if (isEvent) {
      card.append(el('p', 'route-option-desc', option.event.subtitle));
      card.append(el('div', 'route-option-foot', '不战斗 · 直接二选一'));
    } else {
      const chips = el('div', 'route-enemies');
      const routeKinds = getRoomEnemyKinds(option.room);
      for (const kind of routeKinds.slice(0, 5)) {
        const spec = ENEMY_SPECS[kind];
        const chip = el('span', `route-enemy${spec.elite ? ' is-elite' : ''}`);
        const img = el('img');
        img.src = `./assets/sprites/${spec.sprite}.png`;
        img.alt = spec.name;
        chip.append(img, el('span', undefined, spec.name));
        chips.append(chip);
      }
      if (routeKinds.length > 5) {
        chips.append(el('span', 'route-enemy-more', `+${routeKinds.length - 5}`));
      }
      card.append(chips);

      const rules = el('div', 'route-rules');
      for (const key of getRoomRuleKeys(option.room)) {
        const badge = el('span', 'codex-rule', getRuleName(key));
        badge.style.color = RULE_COLORS[key];
        badge.style.borderColor = `${RULE_COLORS[key]}59`;
        rules.append(badge);
      }
      card.append(rules);
      card.append(
        el(
          'div',
          'route-option-foot',
          surge
            ? `高压 ${option.room.surgeDuration ?? 38} 秒 · 连续波次 · 四选一奖励`
            : `清场配额 ${option.room.quota} · ${elite ? '四选一奖励' : '三选一奖励'}`
        )
      );
    }

    card.addEventListener('click', () => onPick(index));
    routeOptions.append(card);
  });
}

export function setRouteVisible(visible: boolean): void {
  routeScreen.hidden = !visible;
  if (visible) {
    routeOptions.querySelector<HTMLElement>('.route-option')?.focus({ preventScroll: true });
  }
}

export function isRouteVisible(): boolean {
  return !routeScreen.hidden;
}

export function renderEvent(
  payload: EventPayload,
  onPick: (index: number) => void
): void {
  eventKicker.textContent = `EVENT ${payload.index + 1} / ${payload.total}`;
  eventTitle.textContent = payload.event.name;
  eventEn.textContent = payload.event.en;
  eventSub.textContent = payload.event.subtitle;
  eventHp.textContent = `当前生命 ${Math.ceil(payload.hp)} / ${payload.maxHp}`;
  eventFoot.textContent = '二选一，选择后立刻结算。';
  eventOptions.textContent = '';

  payload.options.forEach((option, index) => {
    const card = el('button', `event-option is-${option.tone}`);
    card.type = 'button';
    card.dataset.index = String(index);
    const head = el('div', 'event-option-head');
    head.append(el('span', 'event-option-label', option.label), el('b', undefined, option.title));
    card.append(head, el('p', 'event-option-desc', option.description));
    card.append(el('span', 'event-option-detail', option.detail));
    card.addEventListener('click', () => onPick(index));
    eventOptions.append(card);
  });
}

export function setEventVisible(visible: boolean): void {
  eventScreen.hidden = !visible;
  if (visible) {
    eventOptions.querySelector<HTMLElement>('.event-option')?.focus({ preventScroll: true });
  }
}

export function isEventVisible(): boolean {
  return !eventScreen.hidden;
}
