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

async function captureArena(viewport, name, posed) {
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
    await page.evaluate(() => window.__RT_POSE__?.());
    await sleep(350);
  } else {
    await sleep(500);
  }
  await shot(page, name);
  await page.close();
}

async function captureResult(viewport, name, victory) {
  const page = await createPage(browser, viewport);
  await page.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await sleep(900);
  await page.evaluate(() => window.__RT_GRANT_ALL__?.());
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

try {
  await captureMenu({ width: 1440, height: 900, deviceScaleFactor: 1 }, 'm0-menu-desktop.png');
  await captureArena({ width: 1440, height: 900, deviceScaleFactor: 1 }, 'm0-arena-desktop.png', false);
  await captureArena({ width: 1440, height: 900, deviceScaleFactor: 1 }, 'm0-combat-desktop.png', true);
  await captureResult({ width: 1440, height: 900, deviceScaleFactor: 1 }, 'm0-defeat-desktop.png', false);
  await captureResult({ width: 1440, height: 900, deviceScaleFactor: 1 }, 'm0-victory-desktop.png', true);
  await captureMenu(
    { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    'm0-menu-mobile.png'
  );
  await captureArena(
    { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    'm0-combat-mobile.png',
    true
  );
  await captureArena(
    { width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    'm0-landscape.png',
    true
  );
} finally {
  await browser.close();
}
