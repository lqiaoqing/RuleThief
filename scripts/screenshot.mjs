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

async function view(page) {
  return page.evaluate(() => ({
    room: !document.getElementById('room-screen')?.hidden,
    reward: !document.getElementById('altar-screen')?.hidden,
    route: !document.getElementById('route-screen')?.hidden,
    event: !document.getElementById('event-screen')?.hidden
  }));
}

async function clickRoute(page) {
  await page.evaluate(() => document.querySelector('#route-options .route-option')?.click());
  await sleep(380);
}

async function clickEvent(page) {
  await page.evaluate(() => document.querySelector('#event-options .event-option')?.click());
  await sleep(380);
}

async function clickReward(page) {
  await page.evaluate(() => document.querySelector('#rule-offers .rule-card')?.click());
  await sleep(380);
}

async function goToRoom(page, roomIndex) {
  let index = 0;
  for (let guard = 0; guard < 40; guard += 1) {
    const v = await view(page);
    if (v.route) {
      await clickRoute(page);
      continue;
    }
    if (v.event) {
      await clickEvent(page);
      continue;
    }
    if (v.reward) {
      await clickReward(page);
      continue;
    }
    if (v.room) {
      if (index === roomIndex) return true;
      await page.evaluate(() => document.querySelector('#room-enter-btn')?.click());
      await sleep(420);
      await page.evaluate(() => window.__RT_SCENE__?.debugOpenReward());
      await sleep(320);
      await clickReward(page);
      index += 1;
      continue;
    }
    return false;
  }
  return false;
}

async function openArena(page) {
  await page.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await page.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(450);
  await page.evaluate(() => document.querySelector('#room-enter-btn')?.click());
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

async function captureManual(viewport, name) {
  const page = await createPage(browser, viewport);
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.removeItem('rulethief.intro.v1');
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await page.waitForFunction(() => !document.getElementById('intro-screen')?.hidden, { timeout: 8000 });
  await sleep(500);
  await shot(page, name);
  await page.click('#intro-start-btn');
  await sleep(200);
  await page.close();
}

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
  await page.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await page.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(450);
  await goToRoom(page, roomsToAdvance);
  await page.evaluate(() => document.querySelector('#room-enter-btn')?.click());
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

async function clickIf(page, selector) {
  const found = await page.$(selector);
  if (!found) return false;
  const hidden = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return !el || el.closest('[hidden]') !== null;
  }, selector);
  if (hidden) return false;
  await page.click(selector);
  await sleep(380);
  return true;
}

async function advance(page, stopAt) {
  for (let guard = 0; guard < 24; guard += 1) {
    const view = await page.evaluate(() => ({
      room: !document.getElementById('room-screen')?.hidden,
      reward: !document.getElementById('altar-screen')?.hidden,
      route: !document.getElementById('route-screen')?.hidden,
      event: !document.getElementById('event-screen')?.hidden
    }));
    if (stopAt === 'route' && view.route) return true;
    if (stopAt === 'event' && view.event) return true;
    if (view.reward) {
      await page.evaluate(() => document.querySelector('#rule-offers .rule-card')?.click());
      await sleep(400);
      continue;
    }
    if (view.route) {
      await page.evaluate(() => document.querySelector('#route-options .route-option')?.click());
      await sleep(400);
      continue;
    }
    if (view.room) {
      await page.evaluate(() => document.querySelector('#room-enter-btn')?.click());
      await sleep(500);
      await page.evaluate(() => window.__RT_SCENE__?.debugOpenReward());
      await sleep(400);
      continue;
    }
    if (view.event) {
      await page.evaluate(() => document.querySelector('#event-options .event-option')?.click());
      await sleep(400);
      continue;
    }
    return false;
  }
  return false;
}

async function captureRoute(viewport, name) {
  const page = await createPage(browser, viewport);
  await openArena(page);
  await page.evaluate(() => window.__RT_SET_STATS__?.(120, 18));
  await page.evaluate(() => window.__RT_SCENE__?.debugOpenReward());
  await page.waitForFunction(() => !document.getElementById('altar-screen')?.hidden, { timeout: 6000 });
  await sleep(300);
  await advance(page, 'route');
  await sleep(500);
  await shot(page, name);
  await page.close();
}

async function captureEvent(viewport, name) {
  const page = await createPage(browser, viewport);
  await openArena(page);
  await page.evaluate(() => window.__RT_SET_STATS__?.(186, 29));
  await page.evaluate(() => window.__RT_SET_BUILD__?.('chain', 'blast', 2, 2));
  await page.evaluate(() => window.__RT_OPEN_EVENT__?.('unstable-lab'));
  await page.waitForFunction(() => !document.getElementById('event-screen')?.hidden, { timeout: 8000 });
  await sleep(500);
  await shot(page, name);
  await page.close();
}

async function captureBoss(viewport, name, damage, phaseWait, build) {
  const page = await createPage(browser, viewport);
  await page.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await page.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(450);
  await goToRoom(page, 10);
  await page.evaluate(() => document.querySelector('#room-enter-btn')?.click());
  await sleep(900);
  await page.evaluate(
    (b) => window.__RT_SET_BUILD__?.(b[0], b[1], b[2], b[3]),
    build ?? ['pierce', 'frost', 3, 3]
  );
  await page.evaluate(() => window.__RT_SET_STATS__?.(318, 52));
  if (damage) {
    await page.evaluate((amount) => window.__RT_DAMAGE_BOSS__?.(amount), damage);
  }
  await sleep(phaseWait);
  await shot(page, name);
  await page.close();
}

async function captureBossVictory(viewport, name, build) {
  const page = await createPage(browser, viewport);
  await page.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await page.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(450);
  await goToRoom(page, 10);
  await page.evaluate(() => document.querySelector('#room-enter-btn')?.click());
  await sleep(900);
  await page.evaluate(
    (b) => window.__RT_SET_BUILD__?.(b[0], b[1], b[2], b[3]),
    build ?? ['pierce', 'frost', 3, 3]
  );
  await page.evaluate(() => window.__RT_SET_STATS__?.(402, 66));
  await page.evaluate(() => window.__RT_DAMAGE_BOSS__?.(2200));
  await page.waitForFunction(() => !document.getElementById('result-screen')?.hidden, { timeout: 9000 });
  await sleep(450);
  await shot(page, name);
  await page.close();
}

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const LANDSCAPE = { width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

try {
  await captureManual(DESKTOP, 'm7-manual-desktop.png');
  await captureMenu(DESKTOP, 'm3c-menu-desktop.png');
  await captureRoute(DESKTOP, 'm3c-route-desktop.png');
  await captureEvent(DESKTOP, 'm3c-event-desktop.png');
  await captureRoomPreview(DESKTOP, 'm3b-boss-preview-desktop.png', 6);
  await captureBoss(DESKTOP, 'm3b-boss-phase1-desktop.png', 0, 1700);
  await captureBoss(DESKTOP, 'm3b-boss-phase3-desktop.png', 1250, 2000);
  await captureReward(DESKTOP, 'm3b-mutation-reward-desktop.png', 4, ['pierce', 'burn', 2, 2]);
  await captureCombat(DESKTOP, 'm3b-combat-desktop.png', {
    trajectory: 'chain',
    impact: 'frost',
    trajectoryLevel: 2,
    impactLevel: 3
  });
  await captureTableau(DESKTOP, 'm3b-enemies-desktop.png', ['sunder', 'thunder', 'slime', 'wisp'], {
    trajectory: 'pierce',
    impact: 'burn',
    trajectoryLevel: 3,
    impactLevel: 3
  });
  await captureBossVictory(DESKTOP, 'm3c-victory-desktop.png');
  await captureManual(PHONE, 'm7-manual-mobile.png');
  await captureMenu(PHONE, 'm3c-menu-mobile.png');
  await captureRoute(PHONE, 'm3c-route-mobile.png');
  await captureEvent(PHONE, 'm3c-event-mobile.png');
  await captureBoss(PHONE, 'm3b-boss-mobile.png', 0, 1600);
  await captureReward(PHONE, 'm3b-mutation-reward-mobile.png', 4, ['pierce', 'burn', 1, 1]);
  await captureTableau(LANDSCAPE, 'm3b-landscape.png', ['arbiter', 'thunder', 'bomber'], {
    trajectory: 'chain',
    impact: 'blast',
    trajectoryLevel: 2,
    impactLevel: 2
  });
} finally {
  await browser.close();
}
