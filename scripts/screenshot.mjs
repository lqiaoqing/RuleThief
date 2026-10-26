import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error('No Chrome or Edge executable found.');

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const OUT = path.resolve('screenshots');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createPage(browser, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.setDefaultNavigationTimeout(30_000);
  page.on('pageerror', (error) => console.warn('pageerror:', error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') console.warn('console:', message.text());
  });
  return page;
}

async function waitReady(page) {
  await page.waitForFunction('window.__RT_READY__ === true', { timeout: 20_000 });
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name) });
  console.log(`shot ${name}`);
}

async function openArena(page, room = 0) {
  await page.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await page.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(500);
  if (room > 0) {
    for (let index = 0; index < room; index += 1) {
      await page.evaluate(() => window.__RT_ENTER_ROOM__?.());
      await sleep(400);
      await page.evaluate(() => window.__RT_SCENE__?.debugOpenReward());
      await sleep(400);
      await page.evaluate(() => document.querySelector('#rule-offers .rule-card')?.click());
      await sleep(450);
    }
    return;
  }
  await page.evaluate(() => window.__RT_ENTER_ROOM__?.());
  await sleep(450);
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

async function captureMenu(viewport, name) {
  const page = await createPage(browser, viewport);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await sleep(900);
  await shot(page, name);
  await page.close();
}

async function captureRoomPreview(viewport, name) {
  const page = await createPage(browser, viewport);
  await page.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await page.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(600);
  await shot(page, name);
  await page.close();
}

async function captureCombat(viewport, name, build, posed = true) {
  const page = await createPage(browser, viewport);
  await openArena(page);
  await page.waitForFunction(
    () => (window.__RT_SNAPSHOT__?.().enemies ?? 0) > 0,
    { timeout: 12_000 }
  );
  await sleep(450);
  if (posed) {
    await page.evaluate(() => window.__RT_SET_STATS__?.(48, 9));
    await page.evaluate((b) => window.__RT_POSE__?.(b), build ?? null);
    await sleep(400);
  } else {
    await sleep(500);
  }
  await shot(page, name);
  await page.close();
}

async function captureReward(viewport, name, build) {
  const page = await createPage(browser, viewport);
  await openArena(page);
  await page.evaluate((b) => window.__RT_SET_BUILD__?.(b[0], b[1], b[2], b[3]), build);
  await page.evaluate(() => window.__RT_SET_STATS__?.(96, 14));
  await page.evaluate(() => window.__RT_SET_ROOM_KILLS__?.(7));
  await sleep(220);
  await page.evaluate(() => window.__RT_SCENE__?.debugOpenReward());
  await page.waitForFunction(() => !document.getElementById('altar-screen')?.hidden, { timeout: 6000 });
  await sleep(500);
  await shot(page, name);
  await page.close();
}

async function captureResult(viewport, name, victory, build) {
  const page = await createPage(browser, viewport);
  await openArena(page, victory ? 2 : 0);
  await page.evaluate((b) => window.__RT_SET_BUILD__?.(b[0], b[1], b[2], b[3]), build);
  await page.evaluate(
    (win) => window.__RT_SET_STATS__?.(win ? 214 : 74, win ? 36 : 11),
    victory
  );
  if (victory) {
    await page.evaluate(() => window.__RT_END__?.(true));
  } else {
    await page.evaluate(() => window.__RT_DAMAGE__?.(500));
  }
  await page.waitForFunction(
    () => !document.getElementById('result-screen')?.hidden,
    { timeout: 6000 }
  );
  await sleep(400);
  await shot(page, name);
  await page.close();
}

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const LANDSCAPE = { width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

try {
  await captureMenu(DESKTOP, 'm2-menu-desktop.png');
  await captureRoomPreview(DESKTOP, 'm2-room-preview-desktop.png');
  await captureCombat(DESKTOP, 'm2-combat-desktop.png', {
    trajectory: 'chain',
    impact: 'blast',
    trajectoryLevel: 2,
    impactLevel: 1
  });
  await captureCombat(DESKTOP, 'm2-combat-pierce-blast-desktop.png', {
    trajectory: 'pierce',
    impact: 'blast',
    trajectoryLevel: 3,
    impactLevel: 2
  });
  await captureCombat(DESKTOP, 'm2-combat-spread-burn-desktop.png', {
    trajectory: 'spread',
    impact: 'burn',
    trajectoryLevel: 2,
    impactLevel: 3
  });
  await captureReward(DESKTOP, 'm2-reward-desktop.png', ['chain', 'frost', 2, 3]);
  await captureResult(DESKTOP, 'm2-victory-desktop.png', true, ['pierce', 'frost', 3, 3]);
  await captureResult(DESKTOP, 'm2-defeat-desktop.png', false, ['chain', 'burn', 1, 1]);
  await captureMenu(PHONE, 'm2-menu-mobile.png');
  await captureRoomPreview(PHONE, 'm2-room-preview-mobile.png');
  await captureCombat(PHONE, 'm2-combat-mobile.png', null);
  await captureReward(PHONE, 'm2-reward-mobile.png', ['spread', 'burn', 1, 1]);
  await captureCombat(LANDSCAPE, 'm2-landscape.png', null);
  await captureRoomPreview(LANDSCAPE, 'm2-room-preview-landscape.png');
} finally {
  await browser.close();
}
