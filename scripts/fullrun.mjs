import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error('No Chrome or Edge executable found.');

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4177';
const START = Math.max(0, Math.min(3, Number(process.argv[2] ?? process.env.START ?? 0)));
const EXPECTED_STEPS = START === 0 ? 58 : START === 1 ? 48 : START === 2 ? 35 : 22;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function snapshot(page) {
  return page.evaluate(() => window.__RT_SNAPSHOT__?.() ?? {});
}

async function overlay(page) {
  return page.evaluate(() => ({
    room: !document.getElementById('room-screen')?.hidden,
    reward: !document.getElementById('altar-screen')?.hidden,
    rewardLabel: document.getElementById('reward-room')?.textContent ?? '',
    route: !document.getElementById('route-screen')?.hidden,
    event: !document.getElementById('event-screen')?.hidden,
    chapter: !document.getElementById('chapter-screen')?.hidden,
    result: !document.getElementById('result-screen')?.hidden,
    resultTitle: document.getElementById('result-title')?.textContent ?? '',
    resultRooms: document.getElementById('result-rooms')?.textContent ?? ''
  }));
}

async function finishRoom(page, quota) {
  await page.evaluate((value) => window.__RT_SET_ROOM_KILLS__?.(Math.max(0, value - 1)), quota);
  await page.evaluate(() => window.__RT_END_SURGE__?.());
  await sleep(100);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const state = await snapshot(page);
    if (state.roomState === 'reward' || state.runState === 'ended') return true;
    if (Number(state.enemies) === 0) {
      await page.evaluate(() => window.__RT_SPAWN__?.('beetle'));
      await sleep(700);
    }
    await page.evaluate(() => window.__RT_KILL_ALL__?.());
    await sleep(180);
  }
  return false;
}

async function pickBestCard(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#rule-offers .rule-card')];
      const pick =
        cards.find(
          (card) =>
            card.getAttribute('data-kind') === 'ascension' ||
            card.getAttribute('data-kind') === 'relic' ||
            card.getAttribute('data-kind') === 'late' ||
            card.getAttribute('data-kind') === 'core'
        ) ?? cards[0];
      pick?.click();
    });
    await sleep(380);
    const stillOpen = await page.evaluate(
      () => !document.getElementById('altar-screen')?.hidden
    );
    if (!stillOpen) return;
  }
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required']
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
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
        maxMutator: 0,
        selectedMutator: 0,
        maxStartChapter: 2,
        selectedStartChapter: 0,
        dailyBest: null,
        unlockedRelics: [
          'thunder-emblem',
          'bloodflame-heart',
          'frost-crown',
          'prism',
          'feather',
          'greed'
        ],
        unlockedAscensions: ['thunder-domain', 'flame-detonation', 'absolute-zero'],
        seenRules: [],
        ascendedRules: [],
        achievements: []
      })
    );
  });
  const startParam = START > 0 ? `&start=${START}` : '';
  await page.goto(`${BASE}/?arena=1&build=spread,burn,3,3${startParam}`, {
    waitUntil: 'networkidle0'
  });
  await page.waitForFunction('window.__RT_READY__ === true', { timeout: 20_000 });

  const started = Date.now();
  const chapters = [];
  const chapterRewards = [];
  const rewardStates = [];
  let roomsCleared = 0;
  let picks = 0;
  let result = null;

  for (let guard = 0; guard < 400; guard += 1) {
    const view = await overlay(page);
    if (view.result) {
      result = { title: view.resultTitle, rooms: view.resultRooms };
      break;
    }
    if (view.room) {
      roomsCleared += 1;
      await page.evaluate(() => window.__RT_HEAL__?.(200));
      await page.click('#room-enter-btn');
      await sleep(260);
      continue;
    }
    if (view.reward) {
      if (/章节奖励/.test(view.rewardLabel)) {
        chapterRewards.push(await page.evaluate(() => {
          const cards = [...document.querySelectorAll('#rule-offers .rule-card')];
          return cards.map((card) => ({
            kind: card.getAttribute('data-kind'),
            name: card.querySelector('.rule-card-name')?.textContent
          }));
        }));
      }
      await pickBestCard(page);
      picks += 1;
      const afterPick = await snapshot(page);
      rewardStates.push({
        label: view.rewardLabel,
        relics: afterPick.relics ?? [],
        ascensions: afterPick.ascensions ?? [],
        lateUpgrades: afterPick.lateUpgrades ?? [],
        build: afterPick.build ?? null
      });
      continue;
    }
    if (view.chapter) {
      chapters.push(await page.evaluate(() => document.getElementById('chapter-title')?.textContent));
      await page.click('#chapter-continue-btn');
      await sleep(360);
      continue;
    }
    if (view.route) {
      await page.evaluate(() => window.__RT_PICK_ROUTE__?.(0));
      await sleep(300);
      continue;
    }
    if (view.event) {
      await page.evaluate(() => window.__RT_PICK_EVENT__?.(0));
      await sleep(300);
      continue;
    }
    const state = await snapshot(page);
    if (state.runState === 'ended') {
      result = { title: view.resultTitle, rooms: view.resultRooms };
      break;
    }
    if (state.roomState === 'fighting') {
      await page.evaluate(() => window.__RT_HEAL__?.(200));
      await finishRoom(page, Number(state.roomQuota));
      continue;
    }
    await sleep(150);
  }

  const finalState = await snapshot(page);
  const summary = {
    result,
    chapters,
    chapterRewards,
    rewardStates,
    chapterIndex: finalState.chapterIndex,
    chaptersTotal: finalState.chaptersTotal,
    startChapter: finalState.startChapter,
    expectedSteps: EXPECTED_STEPS,
    roomsCleared,
    picks,
    seconds: Math.round((Date.now() - started) / 1000),
    relics: finalState.relics ?? [],
    ascensions: finalState.ascensions ?? [],
    lateUpgrades: finalState.lateUpgrades ?? [],
    core: finalState.core ?? null,
    errors
  };
  console.log(JSON.stringify(summary, null, 2));
  const output = START > 0 ? `docs/fullrun-start${START}.json` : 'docs/fullrun-last.json';
  fs.writeFileSync(output, JSON.stringify(summary, null, 2));
  const expected = `${EXPECTED_STEPS} / ${EXPECTED_STEPS}`;
  if (!result || result.title !== '规则终结' || result.rooms !== expected) {
    process.exitCode = 1;
  }
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
