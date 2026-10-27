import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error('No Chrome or Edge executable found.');

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4176';
const START = Math.max(0, Math.min(2, Number(process.env.START ?? 0)));
const MUTATOR = Math.max(0, Math.min(5, Number(process.env.MUTATOR ?? 0)));
const DAILY = process.env.DAILY === '1';
const LABEL = process.env.LABEL ?? 'auto';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const PRESSED = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };

async function setKeys(page, want) {
  for (const key of Object.keys(PRESSED)) {
    if (want[key] && !PRESSED[key]) {
      await page.keyboard.down(key);
      PRESSED[key] = true;
    } else if (!want[key] && PRESSED[key]) {
      await page.keyboard.up(key);
      PRESSED[key] = false;
    }
  }
}

function decideMove(snapshot) {
  const px = Number(snapshot.playerX);
  const py = Number(snapshot.playerY);
  let fx = 0;
  let fy = 0;
  let nearest = Infinity;
  let danger = false;
  for (const enemy of snapshot.enemyList ?? []) {
    const dx = px - enemy.x;
    const dy = py - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    nearest = Math.min(nearest, dist - enemy.radius);
    if (enemy.charging && dist < 210) danger = true;
    const weight = dist < 220 ? (220 - dist) / 220 : 0;
    if (weight > 0) {
      fx += (dx / dist) * weight * 2.2;
      fy += (dy / dist) * weight * 2.2;
    }
  }
  for (const hazard of snapshot.hazardList ?? []) {
    const dx = px - hazard.x;
    const dy = py - hazard.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist < hazard.radius + 90) {
      const weight = (hazard.radius + 90 - dist) / (hazard.radius + 90);
      fx += (dx / dist) * weight * 3;
      fy += (dy / dist) * weight * 3;
    }
    if (dist < hazard.radius + 25) danger = true;
  }
  const seal = snapshot.sealZone;
  if (seal) {
    const dx = px - Number(seal.x);
    const dy = py - Number(seal.y);
    const dist = Math.hypot(dx, dy) || 1;
    if (dist < Number(seal.radius) + 60) {
      const weight = (Number(seal.radius) + 60 - dist) / (Number(seal.radius) + 60);
      fx += (dx / dist) * weight * 4.5;
      fy += (dy / dist) * weight * 4.5;
    }
    if (dist < Number(seal.radius) + 20) danger = true;
  }
  // mild pull to the arena centre so the bot does not hug walls
  fx += (400 - px) * 0.0016;
  fy += (440 - py) * 0.0016;
  if (px < 110) fx += 1.4;
  if (px > 690) fx -= 1.4;
  if (py < 130) fy += 1.4;
  if (py > 670) fy -= 1.4;

  const want = {
    KeyW: fy < -0.25,
    KeyS: fy > 0.25,
    KeyA: fx < -0.25,
    KeyD: fx > 0.25
  };
  return { want, nearest, danger };
}

async function readState(page) {
  return page.evaluate(() => ({
    overlay: {
      room: !document.getElementById('room-screen')?.hidden,
      reward: !document.getElementById('altar-screen')?.hidden,
      route: !document.getElementById('route-screen')?.hidden,
      event: !document.getElementById('event-screen')?.hidden,
      chapter: !document.getElementById('chapter-screen')?.hidden,
      rewardLabel: document.getElementById('reward-room')?.textContent ?? '',
      result: !document.getElementById('result-screen')?.hidden
    },
    result: {
      title: document.getElementById('result-title')?.textContent,
      rooms: document.getElementById('result-rooms')?.textContent,
      time: document.getElementById('result-time')?.textContent,
      combo: document.getElementById('result-combo-name')?.textContent
    },
    cards: Array.from(document.querySelectorAll('#rule-offers .rule-card')).map((card) => ({
      action: card.dataset.action,
      kind: card.dataset.kind,
      key: card.dataset.key
    })),
    routes: Array.from(document.querySelectorAll('#route-options .route-option')).map((card) => ({
      kind: card.dataset.kind,
      text: card.textContent.replace(/\s+/g, ' ').trim()
    })),
    eventEn: document.getElementById('event-en')?.textContent,
    snapshot: window.__RT_SNAPSHOT__?.() ?? {},
    paused: window.__RT_GAME__?.scene.isPaused('M0') ?? false
  }));
}

async function pickReward(page, cards, hp) {
  const priority =
    hp < 55
      ? ['support', 'mutation', 'upgrade', 'equip', 'ascension', 'relic']
      : ['ascension', 'relic', 'mutation', 'upgrade', 'equip', 'support'];
  let index = 0;
  let best = -1;
  cards.forEach((card, i) => {
    const rank = priority.indexOf(card.action);
    if (rank > best) {
      best = rank;
      index = i;
    }
  });
  if (hp < 55) {
    const healIndex = cards.findIndex(
      (card) =>
        card.kind === 'support' && (card.key === 'heal' || card.key === 'max-hp')
    );
    if (healIndex >= 0) index = healIndex;
  }
  await page.evaluate((slot) => document.querySelectorAll('#rule-offers .rule-card')[slot]?.click(), index);
  return cards[index]?.action ?? 'none';
}

async function pickRoute(page, routes, hp) {
  const wantElite = hp > 70;
  const preferred = routes.findIndex((route) =>
    wantElite ? route.text.includes('精英') : !route.text.includes('精英') && !route.text.includes('事件')
  );
  const index = preferred >= 0 ? preferred : 0;
  await page.evaluate((slot) => document.querySelectorAll('#route-options .route-option')[slot]?.click(), index);
  return routes[index]?.text ?? '';
}

async function pickEvent(page, eventEn, hp) {
  const risky =
    eventEn === 'CURSED CHEST' || eventEn === 'FORGOTTEN IDOL' ? false : hp > 90;
  const index = risky ? 0 : 1;
  await page.evaluate((slot) => document.querySelectorAll('#event-options .event-option')[slot]?.click(), index);
  return `${eventEn}:${risky ? 'A' : 'B'}`;
}

async function runOnce(browser, runIndex) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  if (START > 0 || MUTATOR > 0 || DAILY) {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.setItem(
        'rulethief.meta.v1',
        JSON.stringify({
          version: 1,
          shards: 0,
          runs: 0,
          chaptersCleared: 2,
          victories: 1,
          maxMutator: 5,
          selectedMutator: 0,
          maxStartChapter: 2,
          selectedStartChapter: 0,
          dailyBest: null,
          unlockedRelics: ['thunder-emblem', 'bloodflame-heart'],
          unlockedAscensions: ['thunder-domain'],
          seenRules: [],
          ascendedRules: [],
          achievements: []
        })
      );
    });
  }
  const extras = [
    process.env.BUILD ? `&build=${process.env.BUILD}` : '',
    START > 0 ? `&start=${START}` : '',
    MUTATOR > 0 ? `&mutator=${MUTATOR}` : '',
    DAILY ? '&daily=1' : ''
  ].join('');
  await page.goto(`${BASE}/?arena=1${extras}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__RT_READY__ === true', { timeout: 20_000 });
  await page.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(400);

  const started = Date.now();
  const rooms = [];
  let roomStart = started;
  let roomHp = 100;
  let picks = 0;
  let eventsSeen = [];
  let result = null;

  for (let tick = 0; tick < 15000; tick += 1) {
    if (Date.now() - started > 25 * 60 * 1000) break;
    const state = await readState(page);
    const snapshot = state.snapshot;

    if (state.overlay.result) {
      result = state.result;
      break;
    }
    if (state.overlay.room) {
      await setKeys(page, { KeyW: false, KeyA: false, KeyS: false, KeyD: false });
      roomStart = Date.now();
      roomHp = Number(snapshot.hp);
      await page.click('#room-enter-btn');
      await sleep(420);
      continue;
    }
    if (state.overlay.reward) {
      await setKeys(page, { KeyW: false, KeyA: false, KeyS: false, KeyD: false });
      const chapterReward = /章节奖励/.test(state.overlay.rewardLabel ?? '');
      if (!chapterReward) {
        rooms.push({
          room: snapshot.roomIndex + 1,
          seconds: Math.round((Date.now() - roomStart) / 1000),
          hpAtStart: roomHp,
          hpAtEnd: Number(snapshot.hp),
          kills: Number(snapshot.kills)
        });
      }
      await pickReward(page, state.cards, Number(snapshot.hp));
      picks += 1;
      await sleep(420);
      continue;
    }
    if (state.overlay.chapter) {
      await setKeys(page, { KeyW: false, KeyA: false, KeyS: false, KeyD: false });
      await page.click('#chapter-continue-btn');
      await sleep(450);
      continue;
    }
    if (state.overlay.route) {
      await setKeys(page, { KeyW: false, KeyA: false, KeyS: false, KeyD: false });
      await pickRoute(page, state.routes, Number(snapshot.hp));
      await sleep(380);
      continue;
    }
    if (state.overlay.event) {
      await setKeys(page, { KeyW: false, KeyA: false, KeyS: false, KeyD: false });
      eventsSeen.push(await pickEvent(page, state.eventEn, Number(snapshot.hp)));
      await sleep(380);
      continue;
    }

    if (state.paused) {
      await page.evaluate(() => window.__RT_GAME__?.scene.resume('M0'));
      await sleep(120);
      continue;
    }

    const decision = decideMove(snapshot);
    await setKeys(page, decision.want);
    if (
      (decision.nearest < 95 || decision.danger) &&
      Number(snapshot.dashCooldown) <= 0.05
    ) {
      await page.keyboard.down('Space');
      await page.keyboard.up('Space');
    } else if (tick % 3 === 0 && Number(snapshot.hp) > 0 && Number(snapshot.dashCooldown) <= 0.05) {
      await page.keyboard.down('Space');
      await page.keyboard.up('Space');
    }
    await sleep(120);
  }

  await setKeys(page, { KeyW: false, KeyA: false, KeyS: false, KeyD: false });
  const seconds = Math.round((Date.now() - started) / 1000);
  await page.close();
  return {
    run: runIndex + 1,
    label: LABEL,
    startChapter: START,
    mutator: MUTATOR,
    daily: DAILY,
    build: process.env.BUILD ?? null,
    result: result?.title ?? 'timeout',
    rooms: result?.rooms ?? '',
    time: result?.time ?? '',
    seconds,
    roomLog: rooms,
    picks,
    eventsSeen,
    errors
  };
}

const browser = await puppeteer.launch({
  executablePath,
  headless: false,
  args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required']
});

try {
  const runs = [];
  for (let index = 0; index < 1; index += 1) {
    const record = await runOnce(browser, index);
    runs.push(record);
    console.log(JSON.stringify(record, null, 2));
  }
  fs.writeFileSync(`docs/autoplay-${LABEL}.json`, JSON.stringify(runs, null, 2));
  fs.writeFileSync('docs/autoplay-last.json', JSON.stringify(runs, null, 2));
} finally {
  await browser.close();
}
