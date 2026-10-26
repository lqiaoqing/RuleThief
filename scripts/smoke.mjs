import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error('No Chrome or Edge executable found.');

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
const errors = [];

const ROOMS = [
  { name: '训戒前庭', quota: 8 },
  { name: '回声回廊', quota: 12 },
  { name: '裂痕圣所', quota: 16 }
];

const COMBO_NAMES = {
  pierce: { burn: '赤焰穿心', frost: '极寒贯穿', blast: '爆破穿甲' },
  chain: { burn: '连锁焚烧', frost: '霜雷网络', blast: '雷暴连锁' },
  spread: { burn: '火焰弹幕', frost: '冰晶散华', blast: '裂爆风暴' }
};

function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function newPage(browser, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.setDefaultNavigationTimeout(30_000);
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return page;
}

async function waitReady(page) {
  await page.waitForFunction('window.__RT_READY__ === true', { timeout: 20_000 });
}

async function snapshot(page) {
  return page.evaluate(() => window.__RT_SNAPSHOT__?.() ?? {});
}

async function overlayState(page) {
  return page.evaluate(() => ({
    roomVisible: !document.getElementById('room-screen')?.hidden,
    rewardVisible: !document.getElementById('altar-screen')?.hidden,
    roomTitle: document.getElementById('room-title')?.textContent,
    roomKicker: document.getElementById('room-kicker')?.textContent,
    roomQuota: document.getElementById('room-quota')?.textContent,
    cards: Array.from(document.querySelectorAll('#rule-offers .rule-card')).map((card) => ({
      key: card.dataset.key,
      action: card.dataset.action,
      kind: card.dataset.kind,
      text: card.textContent.replace(/\s+/g, ' ').trim().slice(0, 70)
    })),
    paused: window.__RT_GAME__?.scene.isPaused('M0') ?? false
  }));
}

async function hud(page) {
  return page.evaluate(() => ({
    roomNum: document.getElementById('room-num')?.textContent,
    roomTotal: document.getElementById('room-total')?.textContent,
    roomName: document.getElementById('room-name')?.textContent,
    timer: document.getElementById('timer')?.textContent,
    objective: document.getElementById('objective-time')?.textContent,
    objectiveLabel: document.getElementById('objective-label')?.textContent,
    objectiveKills: document.getElementById('objective-kills')?.textContent,
    progress: document.getElementById('survival-fill')?.style.width,
    hp: document.getElementById('hp-text')?.textContent,
    combo: document.getElementById('combo-name')?.textContent,
    buildCount: document.getElementById('build-count')?.textContent,
    trajectoryStatus: document.getElementById('slot-trajectory-status')?.textContent,
    impactStatus: document.getElementById('slot-impact-status')?.textContent
  }));
}

async function poll(page, fn, timeoutMs = 6000, arg) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await page.evaluate(fn, arg)) return true;
    await sleep(150);
  }
  return false;
}

async function enterRoom(page) {
  const visible = await page.$eval('#room-screen', (el) => !el.hidden);
  if (!visible) return false;
  await page.click('#room-enter-btn');
  await sleep(320);
  return true;
}

async function finishRoom(page, quota) {
  await page.evaluate((value) => window.__RT_SET_ROOM_KILLS__?.(value), quota - 1);
  await sleep(120);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const state = await snapshot(page);
    if (state.roomState === 'reward') return true;
    if (Number(state.enemies) === 0) {
      await page.evaluate(() => window.__RT_SPAWN__?.('beetle'));
      await sleep(700);
    }
    await page.evaluate(() => window.__RT_KILL_ALL__?.());
    await sleep(200);
  }
  return (await snapshot(page)).roomState === 'reward';
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--autoplay-policy=no-user-gesture-required'
  ]
});

try {
  const page = await newPage(browser, { width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await sleep(350);

  check('menu visible on load', await page.$eval('#menu', (el) => !el.hidden));
  check('hud hidden on load', await page.$eval('#hud', (el) => el.hidden));
  check(
    'room and reward overlays hidden on load',
    await page.evaluate(() =>
      Boolean(document.getElementById('room-screen')?.hidden && document.getElementById('altar-screen')?.hidden)
    )
  );

  await page.click('#enter-btn');
  await sleep(900);
  check('menu hidden after start', await page.$eval('#menu', (el) => el.hidden));
  check('hud visible after start', await page.$eval('#hud', (el) => !el.hidden));

  let overlay = await overlayState(page);
  let state = await snapshot(page);
  check('first room preview opens', overlay.roomVisible, JSON.stringify(overlay.roomKicker));
  check('preview shows room 1 of 3', /ROOM 01 \/ 03/.test(overlay.roomKicker ?? ''), overlay.roomKicker);
  check('preview shows the room name', overlay.roomTitle === ROOMS[0].name, overlay.roomTitle);
  check('preview shows the quota', overlay.roomQuota === String(ROOMS[0].quota), overlay.roomQuota);
  check('preview pauses the run', overlay.paused, String(overlay.paused));
  check(
    'run starts with an empty build and full hp',
    state.hp === 100 && state.maxHp === 100 && state.build?.trajectory === null && state.build?.impact === null,
    JSON.stringify({ hp: state.hp, maxHp: state.maxHp, build: state.build })
  );

  await enterRoom(page);
  overlay = await overlayState(page);
  state = await snapshot(page);
  check('entering a room hides the preview', !overlay.roomVisible);
  check('entering a room resumes play', overlay.paused === false, String(overlay.paused));
  check('room 1 is fighting', state.roomState === 'fighting' && state.roomIndex === 0, JSON.stringify({ roomState: state.roomState, roomIndex: state.roomIndex }));

  const roomHud = await hud(page);
  check(
    'HUD shows room progress',
    roomHud.roomNum === '01' &&
      roomHud.roomTotal === '/ 03' &&
      roomHud.roomName === ROOMS[0].name &&
      roomHud.objective === `0 / ${ROOMS[0].quota}` &&
      roomHud.objectiveLabel === 'ANTECHAMBER',
    JSON.stringify(roomHud)
  );

  const spawned = await poll(page, () => (window.__RT_SNAPSHOT__?.().enemies ?? 0) > 0, 12_000);
  check('room 1 spawns enemies', spawned);

  const beforeX = Number((await snapshot(page)).playerX);
  await page.keyboard.down('KeyD');
  const moved = await poll(page, (startX) => (window.__RT_SNAPSHOT__?.().playerX ?? 0) > startX + 10, 6000, beforeX);
  await page.keyboard.up('KeyD');
  check('keyboard moves player', moved, String(beforeX));

  await page.keyboard.down('Space');
  const dashed = await poll(page, () => (window.__RT_SNAPSHOT__?.().dashCooldown ?? 0) > 3, 5000);
  await page.keyboard.up('Space');
  check('space triggers dash', dashed);

  await page.evaluate(() => window.__RT_KILL_ALL__?.());
  await sleep(250);
  state = await snapshot(page);
  check('kills count toward the room', Number(state.roomKills) > 0, JSON.stringify({ roomKills: state.roomKills, kills: state.kills }));
  let afterKillHud = await hud(page);
  check(
    'HUD tracks room progress',
    afterKillHud.objective === `${Math.min(ROOMS[0].quota, state.roomKills)} / ${ROOMS[0].quota}`,
    JSON.stringify({ objective: afterKillHud.objective, roomKills: state.roomKills })
  );

  const cleared = await finishRoom(page, ROOMS[0].quota);
  state = await snapshot(page);
  overlay = await overlayState(page);
  check('clearing the quota opens the reward screen', cleared && overlay.rewardVisible, JSON.stringify({ roomState: state.roomState }));
  check('reward screen pauses the run', overlay.paused, String(overlay.paused));
  check('reward offers three cards', overlay.cards.length === 3, String(overlay.cards.length));
  check(
    'room 1 only offers the rule its enemies carry',
    overlay.cards.filter((card) => card.kind === 'rule').every((card) => card.key === 'blast'),
    JSON.stringify(overlay.cards)
  );
  check(
    'reward screen mixes rules and supports',
    overlay.cards.some((card) => card.kind === 'rule') && overlay.cards.some((card) => card.kind === 'support'),
    JSON.stringify(overlay.cards.map((card) => card.kind))
  );

  const ruleIndex = overlay.cards.findIndex((card) => card.kind === 'rule');
  await page.evaluate((index) => window.__RT_PICK_REWARD__?.(index), ruleIndex);
  await sleep(400);
  state = await snapshot(page);
  overlay = await overlayState(page);
  check('picking a reward equips the rule', state.build?.impact?.key === 'blast', JSON.stringify(state.build));
  check('picking a reward hides the reward screen', !overlay.rewardVisible);
  check(
    'next room preview follows the reward',
    overlay.roomVisible && /ROOM 02 \/ 03/.test(overlay.roomKicker ?? ''),
    overlay.roomKicker
  );
  const carriedHud = await hud(page);
  check(
    'build and level carry into the next room',
    carriedHud.impactStatus === 'Lv.1' && carriedHud.buildCount === '等级 1 / 6',
    JSON.stringify(carriedHud)
  );

  await enterRoom(page);
  state = await snapshot(page);
  check(
    'room 2 loads its own quota and mix',
    state.roomIndex === 1 && state.roomQuota === ROOMS[1].quota,
    JSON.stringify({ roomIndex: state.roomIndex, roomQuota: state.roomQuota })
  );
  check('switching rooms clears in-flight bolts', Number(state.bolts) === 0 && Number(state.enemies) === 0, JSON.stringify({ bolts: state.bolts, enemies: state.enemies }));
  const room2Hud = await hud(page);
  check('HUD shows room 2', room2Hud.roomNum === '02' && room2Hud.roomName === ROOMS[1].name, JSON.stringify(room2Hud));

  await page.evaluate(() => {
    window.__RT_ORIG_RANDOM__ = Math.random;
    Math.random = () => 0.99;
  });
  await finishRoom(page, ROOMS[1].quota);
  await page.evaluate(() => {
    if (window.__RT_ORIG_RANDOM__) Math.random = window.__RT_ORIG_RANDOM__;
  });
  overlay = await overlayState(page);
  const supportCard = overlay.cards.find((card) => card.kind === 'support');
  check('room 2 reward screen opens', overlay.rewardVisible && overlay.cards.length === 3, JSON.stringify(overlay.cards));
  check('room 2 can offer a support', Boolean(supportCard), JSON.stringify(overlay.cards.map((c) => c.key)));

  await page.evaluate((id) => window.__RT_PICK_SUPPORT__?.(id), supportCard?.key ?? 'max-hp');
  await sleep(400);
  state = await snapshot(page);
  check(
    'support reward raises the hp cap',
    state.maxHp === 120 && state.hp === 120,
    JSON.stringify({ support: supportCard?.key, hp: state.hp, maxHp: state.maxHp })
  );
  const hpText = await page.$eval('#hp-text', (el) => el.textContent);
  check('HUD shows the new hp cap', hpText === '120 / 120', String(hpText));

  overlay = await overlayState(page);
  check('room 3 preview follows', overlay.roomVisible && /ROOM 03 \/ 03/.test(overlay.roomKicker ?? ''), overlay.roomKicker);

  await enterRoom(page);
  await finishRoom(page, ROOMS[2].quota);
  overlay = await overlayState(page);
  check('final reward screen opens', overlay.rewardVisible && overlay.cards.length === 3, String(overlay.cards.length));

  const finalRuleIndex = overlay.cards.findIndex((card) => card.kind === 'rule');
  await page.evaluate((index) => window.__RT_PICK_REWARD__?.(index >= 0 ? index : 0), finalRuleIndex);
  await page.waitForFunction(() => !document.getElementById('result-screen')?.hidden, { timeout: 6000 });
  const victory = await page.evaluate(() => ({
    title: document.getElementById('result-title')?.textContent,
    cls: document.getElementById('result-screen')?.className,
    rooms: document.getElementById('result-rooms')?.textContent,
    combo: document.getElementById('result-combo-name')?.textContent,
    kills: document.getElementById('result-kills')?.textContent,
    time: document.getElementById('result-time')?.textContent
  }));
  check('finishing room 3 wins the run', victory.title === '审判完成' && victory.cls.includes('is-victory'), JSON.stringify(victory));
  check('victory reports three rooms cleared', victory.rooms === '3 / 3', String(victory.rooms));
  check('victory reports a combo', Boolean(victory.combo), String(victory.combo));
  check('victory reports total time', /^\d\d:\d\d$/.test(victory.time ?? ''), String(victory.time));

  await page.click('#restart-btn');
  await sleep(600);
  state = await snapshot(page);
  const restartedHud = await hud(page);
  overlay = await overlayState(page);
  check(
    'restart resets the whole run',
    state.hp === 100 &&
      state.maxHp === 100 &&
      state.roomIndex === 0 &&
      state.kills === 0 &&
      state.build?.trajectory === null &&
      state.build?.impact === null,
    JSON.stringify({ hp: state.hp, maxHp: state.maxHp, roomIndex: state.roomIndex, kills: state.kills, build: state.build })
  );
  check('restart reopens room 1 preview', overlay.roomVisible, String(overlay.roomVisible));
  check(
    'restart resets the HUD',
    restartedHud.roomNum === '01' &&
      restartedHud.objective === `0 / ${ROOMS[0].quota}` &&
      restartedHud.buildCount === '等级 0 / 6',
    JSON.stringify(restartedHud)
  );

  await enterRoom(page);
  await page.evaluate(() => window.__RT_DAMAGE__?.(500));
  await page.waitForFunction(() => !document.getElementById('result-screen')?.hidden, { timeout: 6000 });
  const defeat = await page.evaluate(() => ({
    title: document.getElementById('result-title')?.textContent,
    cls: document.getElementById('result-screen')?.className,
    rooms: document.getElementById('result-rooms')?.textContent
  }));
  check('death shows the defeat result', defeat.title === '规则耗尽' && defeat.cls.includes('is-defeat'), JSON.stringify(defeat));
  check('defeat reports zero rooms cleared', defeat.rooms === '0 / 3', String(defeat.rooms));

  await page.click('#result-menu-btn');
  await sleep(300);
  check('result menu returns to menu', await page.$eval('#menu', (el) => !el.hidden));
  check('result menu hides hud', await page.$eval('#hud', (el) => el.hidden));

  await page.click('#enter-btn');
  await sleep(800);
  state = await snapshot(page);
  check('re-enter starts a fresh run', state.roomState === 'preview' && state.hp === 100, JSON.stringify({ roomState: state.roomState, hp: state.hp }));
  await enterRoom(page);

  const comboResults = [];
  for (const [trajectory, impacts] of Object.entries(COMBO_NAMES)) {
    for (const impact of Object.keys(impacts)) {
      await page.evaluate(([t, i]) => window.__RT_SET_BUILD__?.(t, i, 1, 1), [trajectory, impact]);
      await sleep(70);
      const combo = await page.$eval('#combo-name', (el) => el.textContent);
      comboResults.push({ key: `${trajectory}+${impact}`, expected: impacts[impact], actual: combo });
    }
  }
  const badCombos = comboResults.filter((row) => row.actual !== row.expected);
  check(
    'all 9 rule combos still render their names',
    badCombos.length === 0,
    badCombos.length ? JSON.stringify(badCombos) : `${comboResults.length} combos ok`
  );

  await page.evaluate(() => window.__RT_SET_BUILD__?.('pierce', 'frost', 3, 3));
  await sleep(120);
  const ariaBefore = await page.$eval('#sound-btn', (el) => el.getAttribute('aria-pressed'));
  await page.click('#sound-btn');
  await sleep(220);
  const ariaAfter = await page.$eval('#sound-btn', (el) => el.getAttribute('aria-pressed'));
  check('sound button toggles', ariaBefore !== ariaAfter, `${ariaBefore} -> ${ariaAfter}`);

  await page.click('#pause-btn');
  await sleep(220);
  check('pause overlay visible', await page.$eval('#pause-screen', (el) => !el.hidden));
  check('pause offers no rule lab', await page.evaluate(() => !document.getElementById('open-altar-btn')));
  await page.click('#resume-btn');
  await sleep(220);
  check('pause overlay hidden after resume', await page.$eval('#pause-screen', (el) => el.hidden));

  check('desktop no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.close();

  const mobile = await newPage(browser, {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true
  });
  await mobile.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
  await waitReady(mobile);
  await sleep(900);

  const mobileRoom = await mobile.evaluate(() => {
    const card = document.querySelector('#room-screen .altar-card');
    const box = card?.getBoundingClientRect();
    return {
      visible: !document.getElementById('room-screen')?.hidden,
      fits: Boolean(box && box.height <= window.innerHeight + 1),
      overflow: document.documentElement.scrollWidth <= window.innerWidth + 1
    };
  });
  check('mobile room preview fits', mobileRoom.visible && mobileRoom.fits && mobileRoom.overflow, JSON.stringify(mobileRoom));

  await mobile.tap('#room-enter-btn');
  await sleep(400);
  check('mobile can enter a room', (await snapshot(mobile)).roomState === 'fighting');
  check('mobile controls visible', await mobile.$eval('#joystick', (el) => getComputedStyle(el).display !== 'none'));
  check('mobile room label updates', (await mobile.$eval('#mobile-room-name', (el) => el.textContent)) === ROOMS[0].name);

  await mobile.evaluate(() => window.__RT_SET_ROOM_KILLS__?.(8));
  await mobile.evaluate(() => window.__RT_SPAWN__?.('beetle'));
  await sleep(750);
  await mobile.evaluate(() => window.__RT_KILL_ALL__?.());
  const mobileReward = await poll(
    mobile,
    () => !document.getElementById('altar-screen')?.hidden,
    8000
  );
  check('mobile reward screen opens', mobileReward);
  const mobileCards = await mobile.evaluate(() => {
    const card = document.querySelector('#rule-offers .rule-card');
    const box = card?.getBoundingClientRect();
    return {
      count: document.querySelectorAll('#rule-offers .rule-card').length,
      fits: Boolean(box && box.width > 0 && box.bottom <= window.innerHeight + 1),
      overflow: document.documentElement.scrollWidth <= window.innerWidth + 1
    };
  });
  check('mobile reward cards fit', mobileCards.count === 3 && mobileCards.overflow, JSON.stringify(mobileCards));
  await mobile.evaluate(() => document.querySelector('#rule-offers .rule-card')?.click());
  await sleep(400);
  check(
    'mobile reward choice advances the run',
    (await mobile.$eval('#altar-screen', (el) => el.hidden)) &&
      (await mobile.$eval('#room-screen', (el) => !el.hidden))
  );
  await mobile.close();

  check('no console/page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
}

const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) {
  console.log('Failed checks:');
  for (const item of failed) console.log(`  - ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
  process.exitCode = 1;
}
