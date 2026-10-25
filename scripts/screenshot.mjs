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

async function captureArena(viewport, name, posed, build) {
  const page = await createPage(browser, viewport);
  await page.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await page.waitForFunction(
    () => (window.__RT_SNAPSHOT__?.().enemies ?? 0) > 0,
    { timeout: 10_000 }
  );
  await sleep(450);
  if (posed) {
    await page.evaluate(() => window.__RT_SET_STATS__?.(48, 9));
    await page.evaluate((b) => window.__RT_POSE__?.(b), build ?? null);
    await sleep(350);
  } else {
    await sleep(500);
  }
  await shot(page, name);
  await page.close();
}

async function captureAltar(viewport, name, before) {
  const page = await createPage(browser, viewport);
  await page.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await page.waitForFunction(
    () => (window.__RT_SNAPSHOT__?.().enemies ?? 0) > 0,
    { timeout: 10_000 }
  );
  await sleep(500);
  await page.evaluate((b) => window.__RT_SET_BUILD__?.(b[0], b[1], b[2], b[3]), before);
  await page.evaluate(() => window.__RT_SET_STATS__?.(62, 15));
  await sleep(250);
  await page.evaluate(() => window.__RT_ALTAR__?.());
  await page.waitForFunction(() => !document.getElementById('altar-screen')?.hidden, { timeout: 5000 });
  await sleep(450);
  await shot(page, name);
  await page.close();
}

async function captureResult(viewport, name, victory, build) {
  const page = await createPage(browser, viewport);
  await page.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await sleep(900);
  await page.evaluate((b) => window.__RT_SET_BUILD__?.(b[0], b[1], b[2], b[3]), build ?? ['chain', 'blast', 2, 1]);
  if (victory) {
    await page.evaluate(() => window.__RT_SET_STATS__?.(120, 23));
    await page.evaluate(() => window.__RT_END__?.(true));
  } else {
    await page.evaluate(() => window.__RT_SET_STATS__?.(96, 17));
    await page.evaluate(() => window.__RT_DAMAGE__?.(200));
  }
  await page.waitForFunction(
    () => !document.getElementById('result-screen')?.hidden,
    { timeout: 5000 }
  );
  await sleep(350);
  await shot(page, name);
  await page.close();
}

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const LANDSCAPE = { width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

try {
  await captureMenu(DESKTOP, 'm1-menu-desktop.png');
  await captureArena(DESKTOP, 'm1-arena-desktop.png', false);
  await captureArena(DESKTOP, 'm1-combat-desktop.png', true);
  await captureArena(DESKTOP, 'm1-combat-pierce-blast-desktop.png', true, {
    trajectory: 'pierce',
    impact: 'blast',
    trajectoryLevel: 3,
    impactLevel: 2
  });
  await captureArena(DESKTOP, 'm1-combat-spread-burn-desktop.png', true, {
    trajectory: 'spread',
    impact: 'burn',
    trajectoryLevel: 2,
    impactLevel: 3
  });
  await captureArena(DESKTOP, 'm1-combat-chain-frost-desktop.png', true, {
    trajectory: 'chain',
    impact: 'frost',
    trajectoryLevel: 3,
    impactLevel: 3
  });
  await captureAltar(DESKTOP, 'm1-altar-desktop.png', ['chain', 'blast', 2, 1]);
  await captureResult(DESKTOP, 'm1-defeat-desktop.png', false);
  await captureResult(DESKTOP, 'm1-victory-desktop.png', true, ['pierce', 'frost', 3, 3]);
  await captureMenu(PHONE, 'm1-menu-mobile.png');
  await captureArena(PHONE, 'm1-combat-mobile.png', true);
  await captureArena(LANDSCAPE, 'm1-landscape.png', true);
  await captureAltar(PHONE, 'm1-altar-mobile.png', ['pierce', 'burn', 1, 2]);
  await captureAltar(LANDSCAPE, 'm1-altar-landscape.png', ['spread', 'frost', 2, 1]);
} finally {
  await browser.close();
}
