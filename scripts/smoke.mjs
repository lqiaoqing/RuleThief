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

async function hud(page) {
  return page.evaluate(() => ({
    trajectoryName: document.getElementById('slot-trajectory-name')?.textContent,
    trajectoryStatus: document.getElementById('slot-trajectory-status')?.textContent,
    impactName: document.getElementById('slot-impact-name')?.textContent,
    impactStatus: document.getElementById('slot-impact-status')?.textContent,
    count: document.getElementById('build-count')?.textContent,
    combo: document.getElementById('combo-name')?.textContent,
    mobileCombo: document.getElementById('mobile-combo-name')?.textContent
  }));
}

async function altarState(page) {
  return page.evaluate(() => ({
    visible: !document.getElementById('altar-screen')?.hidden,
    cards: Array.from(document.querySelectorAll('#rule-offers .rule-card')).map((card) => ({
      key: card.dataset.key,
      action: card.dataset.action,
      text: card.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)
    })),
    paused: window.__RT_GAME__?.scene.isPaused('M0') ?? false,
    snapshot: window.__RT_SNAPSHOT__?.()
  }));
}

async function dismissAltar(page) {
  const state = await altarState(page);
  if (!state.visible) return false;
  await page.click('#altar-skip-btn');
  await sleep(200);
  return true;
}

async function ensureNotPaused(page) {
  await dismissAltar(page);
  const info = await page.evaluate(() => ({
    paused: window.__RT_GAME__?.scene.isPaused('M0') ?? false,
    pauseHidden: document.getElementById('pause-screen')?.hidden ?? true
  }));
  if (info.paused) {
    if (!info.pauseHidden) {
      await page.click('#resume-btn');
    } else {
      await page.evaluate(() => window.__RT_GAME__?.scene.resume('M0'));
    }
    await sleep(180);
  }
}

async function poll(page, fn, timeoutMs = 5000, arg) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await page.evaluate(fn, arg)) return true;
    await sleep(150);
  }
  return false;
}

async function holdKeyUntil(page, key, fn, timeoutMs = 5000, arg) {
  await ensureNotPaused(page);
  await page.keyboard.down(key);
  try {
    return await poll(page, fn, timeoutMs, arg);
  } finally {
    await page.keyboard.up(key);
  }
}

async function waitForEnemies(page, count = 1, timeoutMs = 12_000) {
  const ok = await poll(
    page,
    (needed) => (window.__RT_SNAPSHOT__?.().enemies ?? 0) >= needed,
    timeoutMs,
    count
  );
  return ok;
}

async function killUntilCount(page, target, budget = 8) {
  for (let i = 0; i < budget; i += 1) {
    const state = await snapshot(page);
    if (Number(state.kills) >= target) return Number(state.kills);
    if (Number(state.enemies) === 0) {
      await waitForEnemies(page, 1, 6000);
    }
    await page.evaluate(() => window.__RT_KILL_ALL__?.());
    await sleep(220);
  }
  return Number((await snapshot(page)).kills);
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
  check('altar hidden on load', await page.$eval('#altar-screen', (el) => el.hidden));

  await page.click('#enter-btn');
  await sleep(900);
  check('menu hidden after start', await page.$eval('#menu', (el) => el.hidden));
  check('hud visible after start', await page.$eval('#hud', (el) => !el.hidden));
  check('sidebar visible after start', await page.$eval('#sidebar', (el) => !el.hidden));

  let state = await snapshot(page);
  check('run is playing after start', state.runState === 'playing', JSON.stringify(state));
  check(
    'run starts with an empty build',
    state.build?.trajectory === null && state.build?.impact === null,
    JSON.stringify(state.build)
  );
  check('timer starts near 03:00', Number(state.timeLeft) > 175, String(state.timeLeft));

  const emptyHud = await hud(page);
  check(
    'empty build shows two locked slots',
    emptyHud.trajectoryStatus === '空槽' &&
      emptyHud.impactStatus === '空槽' &&
      emptyHud.count === '等级 0 / 6' &&
      emptyHud.combo === '基础魔弹',
    JSON.stringify(emptyHud)
  );

  check('enemies spawn', await waitForEnemies(page, 1));

  const beforeX = Number((await snapshot(page)).playerX);
  const moved = await holdKeyUntil(
    page,
    'KeyD',
    (startX) => (window.__RT_SNAPSHOT__?.().playerX ?? 0) > startX + 10,
    6000,
    beforeX
  );
  const afterX = Number((await snapshot(page)).playerX);
  check('keyboard moves player', moved, `${beforeX.toFixed(1)} -> ${afterX.toFixed(1)}`);

  const dashed = await holdKeyUntil(
    page,
    'Space',
    () => (window.__RT_SNAPSHOT__?.().dashCooldown ?? 0) > 3,
    5000
  );
  check('space triggers dash', dashed);

  await page.evaluate(() => window.__RT_SPAWN__?.('beetle'));
  await sleep(300);
  await page.evaluate(() => window.__RT_KILL_ALL__?.());
  await sleep(200);
  state = await snapshot(page);
  check('kills register', Number(state.kills) > 0, String(state.kills));

  await dismissAltar(page);
  const acquired = await poll(
    page,
    () => {
      const snap = window.__RT_SNAPSHOT__?.();
      return Boolean(snap?.build?.trajectory && snap?.build?.impact);
    },
    14_000
  );
  state = await snapshot(page);
  check(
    'training shards grant one rule per slot',
    acquired &&
      state.build?.trajectory?.key === 'chain' &&
      state.build?.impact?.key === 'blast',
    JSON.stringify(state.build)
  );
  check(
    'acquired set records both rules',
    state.acquired?.includes('chain') && state.acquired?.includes('blast'),
    JSON.stringify(state.acquired)
  );

  const shardHud = await hud(page);
  check(
    'rules update HUD slots',
    shardHud.trajectoryStatus === 'Lv.1' &&
      shardHud.impactStatus === 'Lv.1' &&
      shardHud.count === '等级 2 / 6',
    JSON.stringify(shardHud)
  );
  check('combo becomes thunder chain', shardHud.combo === '雷暴连锁', String(shardHud.combo));
  check('mobile combo mirrors build', shardHud.mobileCombo === '雷暴连锁', String(shardHud.mobileCombo));

  let altar;
  await page.evaluate(() => window.__RT_ALTAR__?.());
  await page.waitForFunction(() => !document.getElementById('altar-screen')?.hidden, { timeout: 5000 });
  const frozen = await poll(page, () => window.__RT_GAME__?.scene.isPaused('M0') === true, 2500);
  altar = await altarState(page);
  check('altar pauses the scene', frozen && altar.paused, JSON.stringify({ frozen, paused: altar.paused }));
  const elapsedBeforeChoice = Number(altar.snapshot?.elapsed);
  await sleep(400);
  const elapsedAfterWait = Number((await snapshot(page)).elapsed);
  check(
    'run clock is frozen while the altar is open',
    elapsedAfterWait - elapsedBeforeChoice < 0.05,
    `${elapsedBeforeChoice} -> ${elapsedAfterWait}`
  );
  check('altar renders three cards', altar.cards.length === 3, String(altar.cards.length));
  check(
    'altar offers never repeat a rule',
    new Set(altar.cards.map((card) => card.key)).size === altar.cards.length,
    JSON.stringify(altar.cards.map((card) => card.key))
  );
  const upgradeCard = altar.cards.find((card) => card.action === 'upgrade');
  check('occupied build offers an upgrade', Boolean(upgradeCard), JSON.stringify(altar.cards));
  check(
    'upgrade card advertises Lv.2',
    Boolean(upgradeCard) && /Lv\.1\s*→\s*Lv\.2/.test(upgradeCard.text),
    upgradeCard?.text
  );

  const upgradeIndex = altar.cards.findIndex((card) => card.action === 'upgrade');
  const upgradeBefore = state.build;
  const upgradeIsTrajectory = ['pierce', 'chain', 'spread'].includes(upgradeCard.key);
  await page.evaluate((index) => window.__RT_PICK_ALTAR__?.(index), upgradeIndex);
  await sleep(300);
  altar = await altarState(page);
  state = altar.snapshot;
  check('choosing an offer closes the altar', !altar.visible, String(altar.visible));
  check('choosing an offer resumes the scene', altar.paused === false, String(altar.paused));
  const upgradedSlot = upgradeIsTrajectory ? state.build?.trajectory : state.build?.impact;
  const untouchedSlot = upgradeIsTrajectory ? state.build?.impact : state.build?.trajectory;
  const untouchedBefore = upgradeIsTrajectory ? upgradeBefore.impact : upgradeBefore.trajectory;
  check(
    'upgrade raises the offered rule to Lv.2',
    upgradedSlot?.key === upgradeCard.key && upgradedSlot?.level === 2,
    JSON.stringify({ key: upgradeCard.key, build: state.build })
  );
  check(
    'upgrade keeps the other slot intact',
    JSON.stringify(untouchedSlot) === JSON.stringify(untouchedBefore),
    JSON.stringify({ untouchedSlot, untouchedBefore })
  );
  const levelHud = await hud(page);
  const upgradedStatus = upgradeIsTrajectory ? levelHud.trajectoryStatus : levelHud.impactStatus;
  check(
    'HUD reflects the upgraded level',
    upgradedStatus === 'Lv.2' && levelHud.count === '等级 3 / 6',
    JSON.stringify({ upgradedStatus, hud: levelHud })
  );

  await page.evaluate(() => window.__RT_ALTAR__?.());
  await page.waitForFunction(() => !document.getElementById('altar-screen')?.hidden, { timeout: 5000 });
  altar = await altarState(page);
  const replaceIndex = altar.cards.findIndex((card) => card.action === 'replace');
  const replaceKey = altar.cards[replaceIndex]?.key;
  check('full build offers a replacement', replaceIndex >= 0, JSON.stringify(altar.cards));
  check(
    'replace card warns about the lost rule',
    replaceIndex >= 0 && /将替换/.test(altar.cards[replaceIndex].text),
    altar.cards[replaceIndex]?.text
  );
  await page.evaluate((index) => window.__RT_PICK_ALTAR__?.(index), replaceIndex);
  await sleep(300);
  state = await snapshot(page);
  const replacedIntoTrajectory = replaceKey === 'pierce' || replaceKey === 'spread';
  check(
    'replace swaps the slot rule and resets to Lv.1',
    replacedIntoTrajectory
      ? state.build?.trajectory?.key === replaceKey && state.build?.trajectory?.level === 1
      : state.build?.impact?.key === replaceKey && state.build?.impact?.level === 1,
    JSON.stringify({ replaceKey, build: state.build })
  );
  check(
    'replace leaves the opposite slot untouched',
    replacedIntoTrajectory
      ? state.build?.impact?.key === 'blast'
      : state.build?.trajectory?.key === 'chain',
    JSON.stringify(state.build)
  );
  check(
    'replacement records the new rule but keeps the old codex entry',
    state.acquired?.includes(replaceKey) && state.acquired?.includes('blast'),
    JSON.stringify({ acquired: state.acquired, replaceKey })
  );

  await dismissAltar(page);
  await page.evaluate(() => window.__RT_SET_STATS__?.(20, 14));
  await killUntilCount(page, 15);
  const autoAltar = await poll(
    page,
    () => !document.getElementById('altar-screen')?.hidden,
    6000
  );
  check('altar opens automatically at 15 kills', autoAltar);
  altar = await altarState(page);
  check(
    'automatic altar is playable',
    altar.visible && altar.cards.length > 0 && altar.paused,
    JSON.stringify({ visible: altar.visible, cards: altar.cards.length, paused: altar.paused })
  );
  await page.click('#altar-skip-btn');
  await sleep(250);
  state = await snapshot(page);
  check(
    'skip leaves the build unchanged',
    (await page.$eval('#altar-screen', (el) => el.hidden)) && state.altarOpen === false,
    JSON.stringify({ altarOpen: state.altarOpen, build: state.build })
  );

  await page.evaluate(() => window.__RT_GRANT__?.('pierce'));
  await page.evaluate(() => window.__RT_GRANT__?.('burn'));
  await sleep(200);
  await page.click('#pause-btn');
  await sleep(200);
  check('pause overlay visible', await page.$eval('#pause-screen', (el) => !el.hidden));
  await page.click('#open-altar-btn');
  await sleep(300);
  altar = await altarState(page);
  check('pause menu opens the rule lab', altar.visible && altar.cards.length === 3, String(altar.cards.length));
  await page.click('#altar-skip-btn');
  await sleep(250);
  check(
    'rule lab closes back into play',
    (await page.$eval('#altar-screen', (el) => el.hidden)) &&
      (await page.evaluate(() => window.__RT_GAME__?.scene.isPaused('M0') ?? true)) === false,
    'resumed after skip'
  );

  await page.click('#pause-btn');
  await sleep(200);
  await page.click('#resume-btn');
  await sleep(200);
  check('pause overlay hidden after resume', await page.$eval('#pause-screen', (el) => el.hidden));

  const comboResults = [];
  for (const [trajectory, impacts] of Object.entries(COMBO_NAMES)) {
    for (const impact of Object.keys(impacts)) {
      await page.evaluate(
        ([t, i]) => window.__RT_SET_BUILD__?.(t, i, 1, 1),
        [trajectory, impact]
      );
      await sleep(70);
      const view = await page.evaluate(() => ({
        combo: document.getElementById('combo-name')?.textContent,
        mobile: document.getElementById('mobile-combo-name')?.textContent,
        trajectory: document.getElementById('slot-trajectory-name')?.textContent,
        impact: document.getElementById('slot-impact-name')?.textContent
      }));
      comboResults.push({
        key: `${trajectory}+${impact}`,
        expected: impacts[impact],
        actual: view.combo,
        ok: view.combo === impacts[impact] && view.mobile === impacts[impact]
      });
    }
  }
  const badCombos = comboResults.filter((row) => !row.ok);
  check(
    'all 9 rule combos render the designed name',
    badCombos.length === 0,
    badCombos.length
      ? JSON.stringify(badCombos)
      : comboResults.map((row) => `${row.key}=${row.actual}`).join(' ')
  );

  const partial = await (async () => {
    await page.evaluate(() => window.__RT_SET_BUILD__?.('pierce', null, 3, 1));
    await sleep(80);
    const view = await hud(page);
    await page.evaluate(() => window.__RT_SET_BUILD__?.(null, 'frost', 1, 2));
    await sleep(80);
    const impactOnly = await hud(page);
    return {
      trajectoryOnly: view.combo,
      impactOnly: impactOnly.combo,
      trajectoryLevel: view.trajectoryStatus,
      impactLevel: impactOnly.impactStatus,
      count: impactOnly.count
    };
  })();
  check(
    'single-slot builds show partial names',
    partial.trajectoryOnly === '贯穿魔弹' && partial.impactOnly === '冰霜魔弹',
    JSON.stringify(partial)
  );
  check(
    'levels persist per slot',
    partial.trajectoryLevel === 'Lv.3' && partial.impactLevel === 'Lv.2',
    JSON.stringify(partial)
  );

  await page.evaluate(() => window.__RT_SET_BUILD__?.('pierce', 'frost', 3, 3));
  await sleep(150);
  const maxed = await page.evaluate(() => {
    window.__RT_ALTAR__?.();
    return { open: !document.getElementById('altar-screen')?.hidden };
  });
  await sleep(250);
  const maxedAltar = await altarState(page);
  const maxedCards = maxedAltar.cards.filter((card) => card.action === 'upgrade').length;
  if (maxedAltar.visible) {
    await page.click('#altar-skip-btn');
  } else {
    await page.evaluate(() => window.__RT_GAME__?.scene.resume('M0'));
  }
  await sleep(220);
  check(
    'fully maxed build offers no empty upgrade',
    maxed.open === false || maxedCards < 3,
    JSON.stringify({ open: maxed.open, upgradeCards: maxedCards })
  );

  const ariaBefore = await page.$eval('#sound-btn', (el) => el.getAttribute('aria-pressed'));
  await page.click('#sound-btn');
  await sleep(250);
  const ariaAfter = await page.$eval('#sound-btn', (el) => el.getAttribute('aria-pressed'));
  check('sound button toggles', ariaBefore !== ariaAfter, `${ariaBefore} -> ${ariaAfter}`);

  await page.evaluate(() => window.__RT_DAMAGE__?.(200));
  await page.waitForFunction(() => !document.getElementById('result-screen')?.hidden, { timeout: 5000 });
  const defeat = await page.evaluate(() => ({
    title: document.getElementById('result-title')?.textContent,
    cls: document.getElementById('result-screen')?.className,
    time: document.getElementById('result-time')?.textContent,
    kills: document.getElementById('result-kills')?.textContent,
    rules: document.getElementById('result-rules')?.textContent,
    combo: document.getElementById('result-combo-name')?.textContent,
    level: document.getElementById('result-combo-level')?.textContent,
    comboComplete: document.getElementById('result-combo')?.classList.contains('is-complete'),
    snap: window.__RT_SNAPSHOT__?.()
  }));
  check(
    'defeat shows result',
    defeat.title === '规则耗尽' && defeat.cls.includes('is-defeat'),
    JSON.stringify({ title: defeat.title, cls: defeat.cls })
  );
  check(
    'defeat reports the final combo and level sum',
    defeat.combo === '极寒贯穿' && defeat.level === '等级 6 / 6' && defeat.comboComplete === true,
    JSON.stringify({ combo: defeat.combo, level: defeat.level, complete: defeat.comboComplete })
  );

  await page.click('#restart-btn');
  await sleep(350);
  state = await snapshot(page);
  const restartedHud = await hud(page);
  check(
    'restart resets run state',
    state.runState === 'playing' &&
      state.hp === 100 &&
      state.kills === 0 &&
      state.build?.trajectory === null &&
      state.build?.impact === null &&
      state.acquired?.length === 0 &&
      state.nextAltarKills === 15,
    JSON.stringify(state)
  );
  check(
    'restart resets HUD',
    restartedHud.combo === '基础魔弹' &&
      restartedHud.count === '等级 0 / 6' &&
      restartedHud.trajectoryStatus === '空槽' &&
      restartedHud.impactStatus === '空槽',
    JSON.stringify(restartedHud)
  );
  check(
    'restart hides the altar',
    await page.$eval('#altar-screen', (el) => el.hidden)
  );

  await page.evaluate(() => window.__RT_SET_BUILD__?.('spread', 'burn', 2, 3));
  await page.evaluate(() => window.__RT_SET_STATS__?.(179.9, 23));
  await page.waitForFunction(() => !document.getElementById('result-screen')?.hidden, { timeout: 10_000 });
  const victory = await page.evaluate(() => ({
    title: document.getElementById('result-title')?.textContent,
    cls: document.getElementById('result-screen')?.className,
    time: document.getElementById('result-time')?.textContent,
    combo: document.getElementById('result-combo-name')?.textContent
  }));
  check(
    'victory shows result',
    victory.title === '审判完成' && victory.cls.includes('is-victory'),
    JSON.stringify(victory)
  );
  check('victory time is 03:00', victory.time === '03:00', String(victory.time));
  check('victory reports the combo', victory.combo === '火焰弹幕', String(victory.combo));

  await page.click('#result-menu-btn');
  await sleep(250);
  check('result menu returns to menu', await page.$eval('#menu', (el) => !el.hidden));
  check('result menu hides hud', await page.$eval('#hud', (el) => el.hidden));

  await page.click('#enter-btn');
  await sleep(800);
  state = await snapshot(page);
  check(
    're-enter starts a fresh run',
    state.runState === 'playing' && state.hp === 100 && state.build?.trajectory === null,
    JSON.stringify(state)
  );

  check(
    'desktop no horizontal overflow',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  );
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

  check('mobile run starts', (await snapshot(mobile)).runState === 'playing');
  check('mobile controls visible', await mobile.$eval('#joystick', (el) => getComputedStyle(el).display !== 'none'));
  check('mobile boss strip visible', await mobile.$eval('.mobile-boss', (el) => getComputedStyle(el).display !== 'none'));
  check('mobile combo dock visible', await mobile.$eval('.mobile-combo', (el) => getComputedStyle(el).display !== 'none'));
  check(
    'mobile no horizontal overflow',
    await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  );

  const mobileBefore = Number((await snapshot(mobile)).playerX);
  const joyBox = await mobile.$eval('#joystick', (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await mobile.mouse.move(joyBox.x, joyBox.y);
  await mobile.mouse.down();
  await mobile.mouse.move(joyBox.x + 32, joyBox.y, { steps: 5 });
  const mobileMoved = await poll(
    mobile,
    (startX) => (window.__RT_SNAPSHOT__?.().playerX ?? 0) > startX + 10,
    5000,
    mobileBefore
  );
  await mobile.mouse.up();
  const mobileAfter = Number((await snapshot(mobile)).playerX);
  check('virtual joystick moves player', mobileMoved, `${mobileBefore.toFixed(1)} -> ${mobileAfter.toFixed(1)}`);

  await mobile.click('#dash-btn');
  const mobileDashed = await poll(
    mobile,
    () => (window.__RT_SNAPSHOT__?.().dashCooldown ?? 0) > 3,
    5000
  );
  check('mobile dash works', mobileDashed);

  await mobile.evaluate(() => window.__RT_SET_BUILD__?.('chain', 'blast', 1, 1));
  await sleep(120);
  check(
    'mobile rules update',
    (await mobile.$eval('#mobile-combo-name', (el) => el.textContent)) === '雷暴连锁'
  );

  await mobile.evaluate(() => window.__RT_ALTAR__?.());
  await mobile.waitForFunction(() => !document.getElementById('altar-screen')?.hidden, { timeout: 5000 });
  const mobileAltar = await mobile.evaluate(() => {
    const card = document.querySelector('#rule-offers .rule-card');
    const box = card?.getBoundingClientRect();
    return {
      cards: document.querySelectorAll('#rule-offers .rule-card').length,
      fitsViewport: Boolean(box && box.width > 0 && box.bottom <= window.innerHeight + 1),
      overflow: document.documentElement.scrollWidth <= window.innerWidth + 1
    };
  });
  check('mobile altar fits the viewport', mobileAltar.cards === 3 && mobileAltar.overflow, JSON.stringify(mobileAltar));
  await mobile.screenshot({ path: 'screenshots/m1-altar-mobile.png' });
  const pickedOnMobile = await mobile.evaluate(() => {
    document.querySelector('#rule-offers .rule-card')?.click();
    return true;
  });
  await sleep(300);
  check(
    'mobile altar choice applies',
    pickedOnMobile && (await mobile.$eval('#altar-screen', (el) => el.hidden)),
    'tapped first card'
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
