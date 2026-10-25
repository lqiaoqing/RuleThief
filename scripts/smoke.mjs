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

async function ensureNotPaused(page) {
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

  await page.click('#enter-btn');
  await sleep(900);
  check('menu hidden after start', await page.$eval('#menu', (el) => el.hidden));
  check('hud visible after start', await page.$eval('#hud', (el) => !el.hidden));
  check('sidebar visible after start', await page.$eval('#sidebar', (el) => !el.hidden));

  let state = await snapshot(page);
  check('run is playing after start', state.runState === 'playing', JSON.stringify(state));
  check('timer starts near 03:00', Number(state.timeLeft) > 175, String(state.timeLeft));

  await page.waitForFunction(
    () => (window.__RT_SNAPSHOT__?.().enemies ?? 0) > 0,
    { timeout: 10_000 }
  );
  check('enemies spawn', true);

  await page.evaluate(() => window.__RT_KILL_ALL__?.());
  const rulesDropped = await poll(
    page,
    () => {
      const rules = window.__RT_SNAPSHOT__?.().rules;
      return Boolean(rules && rules.chain && rules.blast);
    },
    10_000
  );
  check('killing enemies drops and grants both rules', rulesDropped);

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

  await sleep(150);
  const hudRules = await page.evaluate(() => ({
    chain: document.getElementById('slot-chain-status')?.textContent,
    blast: document.getElementById('slot-blast-status')?.textContent,
    count: document.getElementById('build-count')?.textContent,
    combo: document.getElementById('combo-name')?.textContent,
    mini: document.getElementById('mobile-combo-name')?.textContent
  }));
  check(
    'rules update HUD',
    hudRules.chain === 'Lv.1' && hudRules.blast === 'Lv.1' && hudRules.count === '掠夺 2 / 2',
    JSON.stringify(hudRules)
  );
  check('combo becomes thunder chain', hudRules.combo === '雷暴连锁', String(hudRules.combo));

  await page.evaluate(() => window.__RT_SPAWN__?.('beetle'));
  await sleep(300);
  await page.evaluate(() => window.__RT_KILL_ALL__?.());
  await sleep(200);
  state = await snapshot(page);
  check('kills register', Number(state.kills) > 0, String(state.kills));
  const killText = await page.$eval('#kills-text', (el) => el.textContent);
  check('kill HUD updates', Number(killText) > 0, String(killText));

  await page.click('#pause-btn');
  await sleep(200);
  check('pause overlay visible', await page.$eval('#pause-screen', (el) => !el.hidden));
  await page.click('#resume-btn');
  await sleep(200);
  check('pause overlay hidden after resume', await page.$eval('#pause-screen', (el) => el.hidden));

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
    snap: window.__RT_SNAPSHOT__?.()
  }));
  check('defeat shows result', defeat.title === '规则耗尽' && defeat.cls.includes('is-defeat'), JSON.stringify(defeat));
  check('defeat stats populated', Boolean(defeat.time && defeat.kills && defeat.rules), JSON.stringify(defeat));

  await page.click('#restart-btn');
  await sleep(350);
  state = await snapshot(page);
  const restartedHud = await page.evaluate(() => ({
    resultHidden: document.getElementById('result-screen')?.hidden,
    hp: document.getElementById('hp-text')?.textContent,
    time: document.getElementById('timer')?.textContent,
    chain: document.getElementById('slot-chain-status')?.textContent,
    kills: document.getElementById('kills-text')?.textContent
  }));
  check(
    'restart resets run state',
    state.runState === 'playing' &&
      state.hp === 100 &&
      state.kills === 0 &&
      state.rules.chain === false &&
      state.rules.blast === false &&
      restartedHud.resultHidden === true,
    JSON.stringify({ state, restartedHud })
  );
  check('restart resets HUD', restartedHud.hp === '100 / 100' && restartedHud.chain === '未掠夺', JSON.stringify(restartedHud));

  await page.evaluate(() => window.__RT_GRANT_ALL__?.());
  await page.evaluate(() => window.__RT_SET_STATS__?.(179.9, 23));
  await page.waitForFunction(() => !document.getElementById('result-screen')?.hidden, { timeout: 10_000 });
  const victory = await page.evaluate(() => ({
    title: document.getElementById('result-title')?.textContent,
    cls: document.getElementById('result-screen')?.className,
    time: document.getElementById('result-time')?.textContent
  }));
  check('victory shows result', victory.title === '审判完成' && victory.cls.includes('is-victory'), JSON.stringify(victory));
  check('victory time is 03:00', victory.time === '03:00', String(victory.time));

  await page.click('#result-menu-btn');
  await sleep(250);
  check('result menu returns to menu', await page.$eval('#menu', (el) => !el.hidden));
  check('result menu hides hud', await page.$eval('#hud', (el) => el.hidden));

  await page.click('#enter-btn');
  await sleep(800);
  state = await snapshot(page);
  check('re-enter starts a fresh run', state.runState === 'playing' && state.hp === 100, JSON.stringify(state));

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

  check('mobile run starts', (await snapshot(mobile)).runState === 'playing');
  check('mobile controls visible', await mobile.$eval('#joystick', (el) => getComputedStyle(el).display !== 'none'));
  check('mobile boss strip visible', await mobile.$eval('.mobile-boss', (el) => getComputedStyle(el).display !== 'none'));
  check('mobile combo dock visible', await mobile.$eval('.mobile-combo', (el) => getComputedStyle(el).display !== 'none'));
  check('mobile no horizontal overflow', await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

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

  await mobile.evaluate(() => window.__RT_GRANT_ALL__?.());
  await sleep(120);
  const mobileCombo = await mobile.$eval('#mobile-combo-name', (el) => el.textContent);
  check('mobile rules update', mobileCombo === '雷暴连锁', String(mobileCombo));
  await mobile.close();

  check('no console/page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
}

const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) {
  process.exitCode = 1;
}
