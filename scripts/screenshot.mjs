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

async function openArena(page, roomsToAdvance = 0) {
  await page.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await page.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(500);
  for (let index = 0; index < roomsToAdvance; index += 1) {
    await page.evaluate(() => window.__RT_ENTER_ROOM__?.());
    await sleep(320);
    await page.evaluate(() => window.__RT_SCENE__?.debugOpenReward());
    await sleep(320);
    await page.evaluate(() => document.querySelector('#rule-offers .rule-card')?.click());
    await sleep(380);
  }
  if (roomsToAdvance === 0) {
    await page.evaluate(() => window.__RT_ENTER_ROOM__?.());
    await sleep(420);
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

async function captureMenu(viewport, name) {
  const page = await createPage(browser, viewport);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await sleep(900);
  await shot(page, name);
  await page.close();
}

async function captureRoomPreview(viewport, name, roomsToAdvance = 0) {
  const page = await createPage(browser, viewport);
  await page.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await page.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(500);
  for (let index = 0; index < roomsToAdvance; index += 1) {
    await page.evaluate(() => window.__RT_ENTER_ROOM__?.());
    await sleep(300);
    await page.evaluate(() => window.__RT_SCENE__?.debugOpenReward());
    await sleep(300);
    await page.evaluate(() => document.querySelector('#rule-offers .rule-card')?.click());
    await sleep(420);
  }
  await shot(page, name);
  await page.close();
}

async function captureCombat(viewport, name, build, posed = true) {
  const page = await createPage(browser, viewport);
  await openArena(page);
  await page.waitForFunction(() => (window.__RT_SNAPSHOT__?.().enemies ?? 0) > 0, { timeout: 12_000 });
  await sleep(400);
  if (posed) {
    await page.evaluate(() => window.__RT_SET_STATS__?.(48, 9));
    await page.evaluate((b) => window.__RT_POSE__?.(b), build ?? null);
    await sleep(400);
  }
  await shot(page, name);
  await page.close();
}

async function captureTableau(viewport, name, kinds, build) {
  const page = await createPage(browser, viewport);
  await openArena(page);
  await page.evaluate(() => window.__RT_SET_STATS__?.(96, 17));
  await page.evaluate(([k, b]) => window.__RT_TABLEAU__?.(k, b), [kinds, build]);
  await sleep(700);
  await shot(page, name);
  await page.close();
}

async function captureReward(viewport, name, roomsToAdvance, build) {
  const page = await createPage(browser, viewport);
  await openArena(page, roomsToAdvance);
  await page.evaluate(() => window.__RT_ENTER_ROOM__?.());
  await sleep(520);
  await page.evaluate((b) => window.__RT_SET_BUILD__?.(b[0], b[1], b[2], b[3]), build);
  await page.evaluate(() => window.__RT_SET_STATS__?.(190, 32));
  await page.evaluate(() => window.__RT_SET_ROOM_KILLS__?.(6));
  await sleep(250);
  await page.evaluate(() => window.__RT_SCENE__?.debugOpenReward());
  await page.waitForFunction(() => !document.getElementById('altar-screen')?.hidden, { timeout: 6000 });
  await sleep(500);
  await shot(page, name);
  await page.close();
}

async function captureResult(viewport, name, victory, build) {
  const page = await createPage(browser, viewport);
  await openArena(page, victory ? 5 : 0);
  await page.evaluate((b) => window.__RT_SET_BUILD__?.(b[0], b[1], b[2], b[3]), build);
  await page.evaluate((win) => window.__RT_SET_STATS__?.(win ? 412 : 74, win ? 69 : 11), victory);
  if (victory) {
    await page.evaluate(() => window.__RT_END__?.(true));
  } else {
    await page.evaluate(() => window.__RT_DAMAGE__?.(500));
  }
  await page.waitForFunction(() => !document.getElementById('result-screen')?.hidden, { timeout: 6000 });
  await sleep(400);
  await shot(page, name);
  await page.close();
}

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const LANDSCAPE = { width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

try {
  await captureMenu(DESKTOP, 'm3a-menu-desktop.png');
  await captureRoomPreview(DESKTOP, 'm3a-room-preview-desktop.png');
  await captureRoomPreview(DESKTOP, 'm3a-elite-preview-desktop.png', 4);
  await captureCombat(DESKTOP, 'm3a-combat-desktop.png', {
    trajectory: 'pierce',
    impact: 'blast',
    trajectoryLevel: 2,
    impactLevel: 2
  });
  await captureTableau(DESKTOP, 'm3a-enemies-desktop.png', ['spore', 'slime', 'wisp', 'bomber'], {
    trajectory: 'chain',
    impact: 'frost',
    trajectoryLevel: 2,
    impactLevel: 2
  });
  await captureTableau(DESKTOP, 'm3a-elites-desktop.png', ['sunder', 'thunder', 'bomber', 'wisp'], {
    trajectory: 'spread',
    impact: 'burn',
    trajectoryLevel: 3,
    impactLevel: 3
  });
  await captureReward(DESKTOP, 'm3a-reward-desktop.png', 1, ['pierce', 'burn', 2, 1]);
  await captureReward(DESKTOP, 'm3a-elite-reward-desktop.png', 4, ['pierce', 'burn', 2, 3]);
  await captureResult(DESKTOP, 'm3a-victory-desktop.png', true, ['pierce', 'frost', 3, 3]);
  await captureResult(DESKTOP, 'm3a-defeat-desktop.png', false, ['chain', 'burn', 1, 1]);
  await captureMenu(PHONE, 'm3a-menu-mobile.png');
  await captureRoomPreview(PHONE, 'm3a-room-preview-mobile.png');
  await captureTableau(PHONE, 'm3a-combat-mobile.png', ['spore', 'slime', 'wisp'], {
    trajectory: 'pierce',
    impact: 'blast',
    trajectoryLevel: 2,
    impactLevel: 2
  });
  await captureReward(PHONE, 'm3a-reward-mobile.png', 1, ['pierce', 'burn', 1, 1]);
  await captureTableau(LANDSCAPE, 'm3a-landscape.png', ['sunder', 'spore', 'bomber'], {
    trajectory: 'chain',
    impact: 'blast',
    trajectoryLevel: 2,
    impactLevel: 2
  });
} finally {
  await browser.close();
}
