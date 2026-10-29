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
const warnings = [];

const EVENT_IDS = ['blood-altar', 'unstable-lab', 'forgotten-idol', 'cursed-chest'];

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
  await page.bringToFront();
  page.setDefaultNavigationTimeout(30_000);
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    if (message.type() === 'warning' || message.type() === 'warn') {
      warnings.push(message.text());
    }
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
    routeVisible: !document.getElementById('route-screen')?.hidden,
    eventVisible: !document.getElementById('event-screen')?.hidden,
    routeOptions: document.querySelectorAll('#route-options .route-option').length,
    eventTitle: document.getElementById('event-title')?.textContent,
    eventEn: document.getElementById('event-en')?.textContent,
    eventOptions: document.querySelectorAll('#event-options .event-option').length,
    roomTitle: document.getElementById('room-title')?.textContent,
    roomKicker: document.getElementById('room-kicker')?.textContent,
    roomQuota: document.getElementById('room-quota')?.textContent,
    enemyChips: document.querySelectorAll('#room-enemies .room-enemy').length,
    eliteChips: document.querySelectorAll('#room-enemies .room-enemy.is-elite').length,
    cards: Array.from(document.querySelectorAll('#rule-offers .rule-card')).map((card) => ({
      key: card.dataset.key,
      action: card.dataset.action,
      kind: card.dataset.kind
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
    hp: document.getElementById('hp-text')?.textContent,
    combo: document.getElementById('combo-name')?.textContent,
    buildCount: document.getElementById('build-count')?.textContent,
    codexRows: document.querySelectorAll('#codex-list .codex-row').length,
    codexOwned: document.querySelectorAll('#codex-list .codex-row.is-owned').length
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
  await sleep(340);
  return true;
}

async function finishRoom(page, quota) {
  await page.evaluate((value) => window.__RT_SET_ROOM_KILLS__?.(value), quota - 1);
  await sleep(120);
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const state = await snapshot(page);
    if (state.roomState === 'reward' || state.runState === 'ended') return true;
    if (Number(state.enemies) === 0) {
      await page.evaluate(() => window.__RT_SPAWN__?.('beetle'));
      await sleep(720);
    }
    await page.evaluate(() => window.__RT_KILL_ALL__?.());
    await sleep(200);
  }
  return (await snapshot(page)).roomState === 'reward';
}

async function pickFirstCard(page) {
  await page.evaluate(() => document.querySelector('#rule-offers .rule-card')?.click());
  await sleep(380);
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
  // seed 5 always rolls cursed-chest + unstable-lab, so both event assertions run
  await page.goto(`${BASE}/?seed=5&horde=0`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await sleep(350);

  check('first-run manual is shown', await page.evaluate(() => window.__RT_INTRO__?.() === true));
  check(
    'manual explains dash invulnerability and rule flow',
    await page.evaluate(() => {
      const text = document.getElementById('intro-screen')?.textContent ?? '';
      return text.includes('0.3 秒无敌') && text.includes('清空房间才拿规则');
    })
  );
  await page.click('#intro-start-btn');
  await sleep(220);
  check(
    'manual dismisses and is remembered',
    await page.evaluate(
      () => window.__RT_INTRO__?.() === false && localStorage.getItem('rulethief.intro.v1') === '1'
    )
  );

  check('menu visible on load', await page.$eval('#menu', (el) => !el.hidden));
  await page.click('#menu-meta-btn');
  await sleep(180);
  const metaPanel = await page.evaluate(() => ({
    visible: !document.getElementById('meta-screen')?.hidden,
    shards: document.getElementById('meta-shards')?.textContent,
    unlocks: document.querySelectorAll('#meta-unlocks .meta-unlock').length,
    achievements: document.querySelectorAll('#meta-achievements .meta-achievement').length,
    mutators: document.querySelectorAll('#meta-mutators .meta-mutator').length,
    starts: document.querySelectorAll('#meta-starts .meta-mutator').length,
    startLocked: [...document.querySelectorAll('#meta-starts .meta-mutator')].map(
      (button) => button.disabled
    ),
    codex: document.querySelectorAll('#meta-codex .meta-codex-row').length,
    daily: document.getElementById('meta-daily')?.textContent
  }));
  check(
    'meta screen lists shards, unlocks, achievements, mutators and starts',
    metaPanel.visible &&
      metaPanel.shards === '0' &&
      metaPanel.unlocks === 6 &&
      metaPanel.achievements === 9 &&
      metaPanel.mutators === 6 &&
      metaPanel.starts === 3 &&
      metaPanel.startLocked.join(',') === 'false,true,true' &&
      metaPanel.codex === 6 &&
      /每日挑战/.test(metaPanel.daily ?? ''),
    JSON.stringify(metaPanel)
  );
  await page.click('#meta-close-btn');
  check(
    'meta screen closes back to the menu',
    await page.evaluate(() => document.getElementById('meta-screen')?.hidden === true)
  );

  const modePage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await modePage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await modePage.evaluate(() => {
    localStorage.setItem(
      'rulethief.meta.v1',
      JSON.stringify({
        version: 1,
        shards: 0,
        runs: 0,
        chaptersCleared: 0,
        victories: 0,
        maxMutator: 5,
        selectedMutator: 0,
        dailyBest: null,
        unlockedRelics: ['thunder-emblem', 'bloodflame-heart'],
        unlockedAscensions: ['thunder-domain'],
        achievements: []
      })
    );
  });
  await modePage.goto(`${BASE}/?arena=1&horde=0&mutator=3`, { waitUntil: 'networkidle0' });
  await waitReady(modePage);
  await modePage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await sleep(250);
  const modeState = await modePage.evaluate(() => ({
    snapshot: window.__RT_SNAPSHOT__?.(),
    daily: window.__RT_DAILY__?.(),
    objective: document.getElementById('objective-room')?.textContent
  }));
  check(
    'mutator level applies to a run',
    modeState.snapshot?.mutatorLevel === 3 &&
      /M3/.test(modeState.objective ?? '') &&
      modeState.daily === false,
    JSON.stringify({
      mutator: modeState.snapshot?.mutatorLevel,
      objective: modeState.objective,
      daily: modeState.daily
    })
  );
  await modePage.close();

  const dailyPage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await dailyPage.goto(`${BASE}/?arena=1&horde=0&daily=1`, { waitUntil: 'networkidle0' });
  await waitReady(dailyPage);
  await dailyPage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await sleep(250);
  const dailyState = await dailyPage.evaluate(() => ({
    snapshot: window.__RT_SNAPSHOT__?.(),
    daily: window.__RT_DAILY__?.(),
    objective: document.getElementById('objective-room')?.textContent
  }));
  check(
    'daily challenge applies a deterministic mutator',
    dailyState.daily === true &&
      Number(dailyState.snapshot?.mutatorLevel) >= 1 &&
      Number(dailyState.snapshot?.mutatorLevel) <= 3 &&
      /M[1-3]/.test(dailyState.objective ?? ''),
    JSON.stringify({
      mutator: dailyState.snapshot?.mutatorLevel,
      objective: dailyState.objective,
      daily: dailyState.daily
    })
  );
  await dailyPage.close();

  const startPage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await startPage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await startPage.evaluate(() => {
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
        unlockedRelics: ['thunder-emblem', 'bloodflame-heart'],
        unlockedAscensions: ['thunder-domain'],
        seenRules: [],
        ascendedRules: [],
        achievements: []
      })
    );
  });
  await startPage.goto(`${BASE}/?arena=1&horde=0&start=2`, { waitUntil: 'networkidle0' });
  await waitReady(startPage);
  await startPage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await sleep(250);
  const startState = await startPage.evaluate(() => ({
    snapshot: window.__RT_SNAPSHOT__?.(),
    title: document.getElementById('room-title')?.textContent,
    objective: document.getElementById('objective-room')?.textContent
  }));
  check(
    'third-world start inherits a maxed build and two relics',
    startState.snapshot?.startChapter === 2 &&
      startState.snapshot?.chapterIndex === 2 &&
      startState.snapshot?.worldTheme === 'abyss' &&
      startState.snapshot?.build?.trajectory?.level === 3 &&
      startState.snapshot?.build?.impact?.level === 3 &&
      (startState.snapshot?.relics?.length ?? 0) === 2 &&
      /W3/.test(startState.objective ?? ''),
    JSON.stringify({
      startChapter: startState.snapshot?.startChapter,
      build: startState.snapshot?.build,
      relics: startState.snapshot?.relics,
      title: startState.title,
      objective: startState.objective
    })
  );
  await startPage.close();
  await page.evaluate(() => localStorage.removeItem('rulethief.meta.v1'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__RT_READY__ === true', { timeout: 20_000 });
  check('hud hidden on load', await page.$eval('#hud', (el) => el.hidden));
  check(
    'overlays hidden on load',
    await page.evaluate(() =>
      Boolean(document.getElementById('room-screen')?.hidden && document.getElementById('altar-screen')?.hidden)
    )
  );

  await page.click('#enter-btn');
  await sleep(900);
  check('menu hidden after start', await page.$eval('#menu', (el) => el.hidden));

  let overlay = await overlayState(page);
  let state = await snapshot(page);
  check('first room preview opens', overlay.roomVisible, overlay.roomKicker);
  check('preview shows room 1 of 10', /ROOM 01 \/ 10/.test(overlay.roomKicker ?? ''), overlay.roomKicker);
  check(
    'preview shows the room name and quota',
    overlay.roomTitle === '训戒前庭' && overlay.roomQuota === '13',
    `${overlay.roomTitle} / ${overlay.roomQuota}`
  );
  check('preview pauses the run', overlay.paused, String(overlay.paused));
  check(
    'run starts empty with full hp',
    state.hp === 100 && state.maxHp === 100 && state.build?.trajectory === null && state.build?.impact === null,
    JSON.stringify({ hp: state.hp, build: state.build })
  );

  await enterRoom(page);
  overlay = await overlayState(page);
  state = await snapshot(page);
  check('entering room 1 resumes play', !overlay.roomVisible && overlay.paused === false);
  check('room 1 is fighting', state.roomState === 'fighting' && state.roomIndex === 0, JSON.stringify({ roomState: state.roomState, roomIndex: state.roomIndex }));

  let roomHud = await hud(page);
  check(
    'HUD shows room 1 and the codex',
    roomHud.roomNum === '01' &&
      roomHud.roomTotal === '/ 10' &&
      roomHud.objective === '0 / 13' &&
      roomHud.objectiveLabel === 'ANTECHAMBER' &&
      roomHud.codexRows === 1,
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

  await page.evaluate(() => {
    window.__RT_KILL_ALL__?.();
  });
  await sleep(200);

  // elite behaviours: sunder double charge, thunder three-bolt fan
  await page.evaluate(() => window.__RT_SET_ROOM_KILLS__?.(0));
  await page.evaluate(() => window.__RT_FREEZE_ATTACK__?.());
  const playerAt = await snapshot(page);
  await page.evaluate(
    (pos) => window.__RT_SPAWN_AT__?.('sunder', pos.x + 150, pos.y),
    { x: Number(playerAt.playerX), y: Number(playerAt.playerY) }
  );
  let chargeCount = 0;
  let wasCharging = false;
  for (let tick = 0; tick < 90; tick += 1) {
    const sample = await snapshot(page);
    const sunder = (sample.enemyList ?? []).find((enemy) => enemy.kind === 'sunder');
    if (sunder?.charging && !wasCharging) chargeCount += 1;
    wasCharging = Boolean(sunder?.charging);
    if (chargeCount >= 2) break;
    await page.evaluate(() => window.__RT_HEAL__?.(25));
    await sleep(80);
  }
  check('sunder elite charges twice in a row', chargeCount >= 2, String(chargeCount));
  await page.evaluate(() => window.__RT_KILL_ALL__?.());
  await page.evaluate(() => window.__RT_SET_ROOM_KILLS__?.(0));

  const playerAt2 = await snapshot(page);
  await page.evaluate(
    (pos) => window.__RT_SPAWN_AT__?.('thunder', pos.x + 320, pos.y),
    { x: Number(playerAt2.playerX), y: Number(playerAt2.playerY) }
  );
  let maxBolts = 0;
  for (let tick = 0; tick < 80; tick += 1) {
    const sample = await snapshot(page);
    maxBolts = Math.max(maxBolts, Number(sample.enemyBolts));
    if (maxBolts >= 3) break;
    await page.evaluate(() => window.__RT_HEAL__?.(25));
    await sleep(80);
  }
  check('thunder elite fires a three-bolt fan', maxBolts >= 3, String(maxBolts));
  await page.evaluate(() => window.__RT_KILL_ALL__?.());
  await page.evaluate(() => window.__RT_SET_ROOM_KILLS__?.(0));

  // replace takes effect immediately and leaves no stale state
  await page.evaluate(() => window.__RT_SET_ROOM_KILLS__?.(0));
  await page.evaluate(() => window.__RT_KILL_ALL__?.());
  for (const [x, y] of [[700, 600], [740, 540], [660, 660]]) {
    await page.evaluate(([px, py]) => window.__RT_SPAWN_AT__?.('beetle', px, py), [x, y]);
  }
  await page.evaluate(() => window.__RT_SET_BUILD__?.('chain', 'burn', 2, 2));
  await page.evaluate(() => window.__RT_FREEZE_ATTACK__?.());
  await sleep(150);
  await page.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(150);
  const beforeReplace = await snapshot(page);
  await page.evaluate(() => window.__RT_SET_BUILD__?.('pierce', 'frost', 1, 2));
  await sleep(120);
  const afterReplace = await snapshot(page);
  check(
    'switching trajectory clears in-flight bolts immediately',
    Number(beforeReplace.bolts) > 0 && Number(afterReplace.bolts) === 0,
    JSON.stringify({ before: beforeReplace.bolts, after: afterReplace.bolts })
  );
  check(
    'replaced rule starts at Lv.1 while the other slot keeps its level',
    afterReplace.build?.trajectory?.key === 'pierce' &&
      afterReplace.build?.trajectory?.level === 1 &&
      afterReplace.build?.impact?.key === 'frost' &&
      afterReplace.build?.impact?.level === 2,
    JSON.stringify(afterReplace.build)
  );

  await page.evaluate(() => {
    window.__RT_SET_BUILD__?.('chain', 'burn', 2, 2);
    const snap = window.__RT_SNAPSHOT__?.() ?? {};
    window.__RT_SPAWN_AT__?.('beetle', Number(snap.playerX) + 200, Number(snap.playerY));
  });
  await sleep(150);
  await page.evaluate(() => window.__RT_VOLLEY__?.());
  await poll(
    page,
    () => (window.__RT_SNAPSHOT__?.().enemyList ?? []).some((enemy) => enemy.burning),
    3000
  );
  const beforeStatus = await snapshot(page);
  const burningBefore = (beforeStatus.enemyList ?? []).filter((enemy) => enemy.burning).length;

  await page.evaluate(() => window.__RT_SET_BUILD__?.('chain', 'frost', 2, 2));
  await sleep(150);
  const afterStatus = await snapshot(page);
  check(
    'switching impact clears existing burn stacks',
    burningBefore > 0 &&
      (afterStatus.enemyList ?? []).every((enemy) => !enemy.burning),
    JSON.stringify({
      burningBefore,
      burningAfter: (afterStatus.enemyList ?? []).filter((enemy) => enemy.burning).length
    })
  );
  await page.evaluate(() => window.__RT_SET_BUILD__?.('chain', 'frost', 2, 2));
  await page.evaluate(() => {
    const snap = window.__RT_SNAPSHOT__?.() ?? {};
    window.__RT_SET_ROOM_KILLS__?.(0);
    window.__RT_FREEZE_ATTACK__?.();
    window.__RT_SPAWN_AT__?.('sunder', Number(snap.playerX) + 220, Number(snap.playerY) + 40);
  });
  await sleep(200);
  await page.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(900);
  const frosted = await snapshot(page);
  check(
    'frost impact slows a live enemy in game',
    (frosted.enemyList ?? []).some((enemy) => enemy.slowed),
    JSON.stringify({
      slowed: (frosted.enemyList ?? []).filter((enemy) => enemy.slowed).length
    })
  );
  await page.evaluate(() => window.__RT_PURGE_ENEMIES__?.());
  await page.evaluate(() => window.__RT_SET_ROOM_KILLS__?.(0));

  await page.evaluate(() => {
    const snap = window.__RT_SNAPSHOT__?.() ?? {};
    window.__RT_SET_ROOM_KILLS__?.(0);
    window.__RT_FREEZE_ATTACK__?.();
    window.__RT_SPAWN_AT__?.('wisp', Number(snap.playerX) + 260, Number(snap.playerY));
  });
  let slowedByWisp = false;
  for (let tick = 0; tick < 90; tick += 1) {
    const sample = await snapshot(page);
    if (Number(sample.slowTime) > 0) {
      slowedByWisp = true;
      break;
    }
    await page.evaluate(() => window.__RT_HEAL__?.(40));
    await sleep(150);
  }
  check('frost wisp bolt slows the player', slowedByWisp, String((await snapshot(page)).slowTime));
  await page.evaluate(() => window.__RT_PURGE_ENEMIES__?.());
  await page.evaluate(() => window.__RT_SET_ROOM_KILLS__?.(0));

  // keep the quota from being reached while probing combat rules
  await page.evaluate(() => window.__RT_SET_ROOM_KILLS__?.(0));
  await page.evaluate(() => window.__RT_SET_BUILD__?.('chain', 'blast', 3, 3));
  await page.evaluate(() => window.__RT_FREEZE_ATTACK__?.());
  for (const [x, y] of [[500, 420], [560, 440], [620, 470], [680, 500], [740, 530], [500, 520]]) {
    await page.evaluate(([px, py]) => window.__RT_SPAWN_AT__?.('spore', px, py), [x, y]);
  }
  await sleep(320);
  const beforeVolley = await snapshot(page);
  await page.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(1500);
  const afterVolley = await snapshot(page);
  const volleyProcs = Number(afterVolley.impactProcs) - Number(beforeVolley.impactProcs);
  check(
    'single volley never exceeds the 3-impact budget',
    volleyProcs >= 1 && volleyProcs <= 3,
    JSON.stringify({
      procs: volleyProcs,
      blastEvents: Number(afterVolley.blastDamageEvents) - Number(beforeVolley.blastDamageEvents)
    })
  );

  await page.evaluate(() => window.__RT_SET_BUILD__?.('chain', 'burn', 3, 3));
  await page.evaluate(() => window.__RT_FREEZE_ATTACK__?.());
  for (const [x, y] of [[520, 430], [580, 470], [640, 500], [700, 530]]) {
    await page.evaluate(([px, py]) => window.__RT_SPAWN_AT__?.('beetle', px, py), [x, y]);
  }
  await sleep(320);
  const beforeDot = await snapshot(page);
  await page.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(900);
  const midDot = await snapshot(page);
  await sleep(2600);
  const afterDot = await snapshot(page);
  const dotProcs = Number(afterDot.impactProcs) - Number(midDot.impactProcs);
  const hpSum = (state) => (state.enemyList ?? []).reduce((sum, enemy) => sum + Number(enemy.hp), 0);
  check(
    'burn DOT keeps dealing damage without new impact procs',
    dotProcs === 0 && hpSum(afterDot) < hpSum(midDot),
    JSON.stringify({
      procs: dotProcs,
      hpMid: hpSum(midDot),
      hpAfter: hpSum(afterDot)
    })
  );

  const poolState = await snapshot(page);
  check(
    'damage numbers are pooled and bounded',
    Number(poolState.damageLabelPool) > 0 &&
      Number(poolState.damageLabelPool) <= 48 &&
      Number(poolState.liveDamageNumbers) <= Number(poolState.damageLabelPool),
    JSON.stringify({
      pool: poolState.damageLabelPool,
      live: poolState.liveDamageNumbers
    })
  );

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(300);
  check('window blur pauses the run', await page.$eval('#pause-screen', (el) => !el.hidden));
  await page.click('#resume-btn');
  await sleep(300);
  check('resuming after blur works', await page.$eval('#pause-screen', (el) => el.hidden));

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await sleep(300);
  check('backgrounding the tab pauses the run', await page.$eval('#pause-screen', (el) => !el.hidden));
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });
  await page.click('#resume-btn');
  await sleep(300);
  check('resuming after background works', await page.$eval('#pause-screen', (el) => el.hidden));

  for (const kind of ['spore', 'slime', 'wisp', 'bomber']) {
    const beforeState = await snapshot(page);
    await page.evaluate((k) => window.__RT_SPAWN_AT__?.(k, 560, 360), kind);
    await sleep(250);
    const afterState = await snapshot(page);
    const spawned = Number(afterState.spawnedTotal) - Number(beforeState.spawnedTotal);
    const present = Number((afterState.enemyCounts ?? {})[kind] ?? 0);
    check(
      `spawns ${kind}`,
      spawned === 1 && present >= 1,
      `spawned=${spawned} present=${present}`
    );
  }
  const hazardSeen = await poll(page, () => (window.__RT_SNAPSHOT__?.().hazards ?? 0) > 0, 7000);
  check('slime leaves burning ground', hazardSeen);

  // standing inside a fire patch must damage the player
  await page.evaluate(() => {
    window.__RT_PURGE_ENEMIES__?.();
    window.__RT_SET_ROOM_KILLS__?.(0);
    window.__RT_FREEZE_ATTACK__?.();
  });
  await poll(page, () => (window.__RT_SNAPSHOT__?.().invuln ?? 0) === 0, 4000);
  await page.evaluate(() => window.__RT_HEAL__?.(200));
  const hazardDamageStart = Number((await snapshot(page)).damageTaken?.hazard ?? 0);
  let hazardDamage = 0;
  let hazardCount = 0;
  let hazardState = '';
  let hazardInvuln = 0;
  for (let tick = 0; tick < 12; tick += 1) {
    await page.evaluate(() => {
      const snap = window.__RT_SNAPSHOT__?.() ?? {};
      window.__RT_SET_ROOM_KILLS__?.(0);
      window.__RT_SPAWN_HAZARD__?.(Number(snap.playerX), Number(snap.playerY));
    });
    await sleep(300);
    const sample = await snapshot(page);
    hazardCount = Number(sample.hazards ?? 0);
    hazardState = String(sample.roomState ?? '');
    hazardInvuln = Number(sample.invuln ?? 0);
    hazardDamage = Number(sample.damageTaken?.hazard ?? 0) - hazardDamageStart;
    if (hazardDamage > 0 && Number(sample.hp) < 100) break;
  }
  check(
    'standing in fire damages the player',
    hazardDamage > 0 && hazardCount >= 1,
    JSON.stringify({ hazardDamage, hazards: hazardCount, state: hazardState, invuln: hazardInvuln })
  );
  await poll(page, () => (window.__RT_SNAPSHOT__?.().hazards ?? 0) === 0, 5000);
  await page.evaluate(() => window.__RT_HEAL__?.(200));
  await poll(page, () => (window.__RT_SNAPSHOT__?.().invuln ?? 0) === 0, 3000);
  const hpBeforeBomber = Number((await snapshot(page)).hp);
  const playerPos = await snapshot(page);
  await page.evaluate(
    (pos) => window.__RT_SPAWN_AT__?.('bomber', pos.x + 58, pos.y),
    { x: Number(playerPos.playerX), y: Number(playerPos.playerY) }
  );
  await sleep(180);
  await page.evaluate(() => window.__RT_KILL_ALL__?.());
  await sleep(300);
  const hpAfterBomber = Number((await snapshot(page)).hp);
  check(
    'bomber death explosion damages the player',
    hpAfterBomber < hpBeforeBomber,
    `${hpBeforeBomber} -> ${hpAfterBomber}`
  );

  await finishRoom(page, Number((await snapshot(page)).roomQuota));
  const firstReward = await overlayState(page);
  check('room 1 opens rewards', firstReward.rewardVisible, JSON.stringify({ cards: firstReward.cards.length }));
  await page.evaluate(() => document.querySelector('#rule-offers .rule-card')?.click());
  await sleep(420);

  const planInfo = await snapshot(page);
  check(
    'run plan has ten steps',
    Array.isArray(planInfo.plan) && planInfo.plan.length === 10,
    String(planInfo.plan?.length)
  );
  const planNodes = (planInfo.plan ?? []).reduce(
    (sum, step) => sum + (step.kind === 'choice' ? step.options.length : 1),
    0
  );
  check('plan exposes thirteen nodes', planNodes === 13, String(planNodes));
  const planEvents = (planInfo.plan ?? [])
    .filter((step) => step.kind === 'encounter' && EVENT_IDS.includes(step.encounter))
    .map((step) => step.encounter);
  check(
    'plan contains two distinct events',
    planEvents.length === 2 && new Set(planEvents).size === 2,
    JSON.stringify(planEvents)
  );
  check(
    'plan contains three branching steps',
    (planInfo.plan ?? []).filter((step) => step.kind === 'choice').length === 3,
    String((planInfo.plan ?? []).filter((step) => step.kind === 'choice').length)
  );

  const seenEvents = [];
  let pendingSpeedRisk = false;
  let pendingCurse = false;
  let roomsEntered = 1;
  let supportChecked = false;
  let bossPreview = null;

  for (let guard = 0; guard < 40; guard += 1) {
    const view = await overlayState(page);
    if (view.roomVisible) {
      if (/ROOM 10 \/ 10/.test(view.roomKicker ?? '')) {
        bossPreview = view;
        break;
      }
      check(
        `room preview lists its enemies (${view.roomKicker})`,
        view.enemyChips >= 1,
        String(view.enemyChips)
      );
      const speedRisk = pendingSpeedRisk;
      const curse = pendingCurse;
      await enterRoom(page);
      roomsEntered += 1;
      const inside = await snapshot(page);
      if (/ELITE/.test(view.roomKicker ?? '')) {
        check(
          `elite room ${inside.roomIndex + 1} spawns its leader immediately`,
          Number(inside.eliteAlive) === 1,
          String(inside.eliteAlive)
        );
      }
      if (roomsEntered === 2) {
        const codexRows = await page.$$eval('#codex-list .codex-row', (rows) => rows.length);
        check('codex follows the new room', codexRows === 2, String(codexRows));
        check(
          'switching rooms clears bolts, enemies, hazards and slow',
          Number(inside.bolts) === 0 &&
            Number(inside.enemies) === 0 &&
            Number(inside.hazards) === 0 &&
            Number(inside.slowTime) === 0,
          JSON.stringify({
            bolts: inside.bolts,
            enemies: inside.enemies,
            hazards: inside.hazards,
            slow: inside.slowTime
          })
        );
      }
      if (speedRisk) {
        check(
          `event speed modifier applies to the next room only (room ${inside.roomIndex + 1})`,
          Math.abs(Number(inside.roomSpeedMult) - 1.2) < 0.001,
          String(inside.roomSpeedMult)
        );
        pendingSpeedRisk = false;
      } else if (roomsEntered > 1) {
        check(
          `room ${inside.roomIndex + 1} has no leftover speed modifier`,
          Math.abs(Number(inside.roomSpeedMult) - 1) < 0.001,
          String(inside.roomSpeedMult)
        );
      }
      if (curse) {
        check(
          `curse chest adds an extra elite in room ${inside.roomIndex + 1}`,
          Number(inside.eliteAlive) >= 1 && Number(inside.roomBonusCards) === 1,
          JSON.stringify({ elite: inside.eliteAlive, bonus: inside.roomBonusCards })
        );
        pendingCurse = false;
      }
      check(
        `room ${inside.roomIndex + 1} loads its quota`,
        Number(inside.roomQuota) > 0 && inside.roomState === 'fighting',
        JSON.stringify({ quota: inside.roomQuota })
      );

      await finishRoom(page, Number(inside.roomQuota));
      const reward = await overlayState(page);
      check(
        `room ${inside.roomIndex + 1} opens rewards`,
        reward.rewardVisible,
        JSON.stringify({ cards: reward.cards.length })
      );
      if (inside.roomElite) {
        const mutationBefore = Boolean((await snapshot(page)).mutation);
        const mutationCards = reward.cards.filter((card) => card.kind === 'mutation').length;
        check(
          `elite room ${inside.roomIndex + 1} offers four cards and a guaranteed mutation`,
          reward.cards.length === 4 &&
            (mutationBefore ? mutationCards === 0 : mutationCards === 1),
          JSON.stringify({ mutationBefore, mutationCards, cards: reward.cards.length })
        );
      } else {
        check(
          `room ${inside.roomIndex + 1} offers three cards`,
          reward.cards.length === 3 + (curse ? 1 : 0),
          JSON.stringify({ cards: reward.cards.length, curse })
        );
      }
      if (!supportChecked) {
        const supportIndex = reward.cards.findIndex((card) => card.kind === 'support');
        if (supportIndex >= 0) {
          supportChecked = true;
          const preSupport = await snapshot(page);
          const chip = Math.max(0.5, Math.min(10, Number(preSupport.hp) - 1));
          await page.evaluate((amount) => window.__RT_DAMAGE__?.(amount), chip);
          await sleep(80);
          const statsBefore = await snapshot(page);
          await page.evaluate(
            (slot) => document.querySelectorAll('#rule-offers .rule-card')[slot]?.click(),
            supportIndex
          );
          await sleep(420);
          const statsAfter = await snapshot(page);
          const changed =
            Number(statsAfter.maxHp) !== Number(statsBefore.maxHp) ||
            Number(statsAfter.hp) !== Number(statsBefore.hp) ||
            Math.abs(Number(statsAfter.moveSpeed) - Number(statsBefore.moveSpeed)) > 0.01 ||
            Math.abs(Number(statsAfter.dashCdMax) - Number(statsBefore.dashCdMax)) > 0.01;
          check(
            'support reward applies a stat change',
            changed,
            JSON.stringify({
              hp: [statsBefore.hp, statsAfter.hp],
              maxHp: [statsBefore.maxHp, statsAfter.maxHp],
              speed: [statsBefore.moveSpeed, statsAfter.moveSpeed],
              dashCd: [statsBefore.dashCdMax, statsAfter.dashCdMax]
            })
          );
          continue;
        }
      }
      await page.evaluate(() => document.querySelector('#rule-offers .rule-card')?.click());
      await sleep(400);
      continue;
    }

    if (view.routeVisible) {
      check('route choice shows two options', view.routeOptions === 2, String(view.routeOptions));
      check('route choice pauses the run', view.paused, String(view.paused));
      await page.evaluate(() => window.__RT_PICK_ROUTE__?.(0));
      await sleep(420);
      continue;
    }

    if (view.eventVisible) {
      seenEvents.push(view.eventEn);
      check(`event ${view.eventEn} shows two options`, view.eventOptions === 2, String(view.eventOptions));
      const hpBefore = Number((await snapshot(page)).hp);
      await page.evaluate(() => window.__RT_PICK_EVENT__?.(0));
      await sleep(440);
      const after = await snapshot(page);
      if (view.eventEn === 'BLOOD ALTAR') {
        check('blood altar trades hp for an upgrade', Number(after.hp) <= hpBefore, `${hpBefore} -> ${after.hp}`);
      }
      if (view.eventEn === 'UNSTABLE LAB') {
        pendingSpeedRisk = true;
        check('unstable lab queues a speed risk', Number(after.roomSpeedMult) === 1, String(after.roomSpeedMult));
      }
      if (view.eventEn === 'FORGOTTEN IDOL') {
        check('forgotten idol keeps the run alive', after.runState === 'playing', String(after.runState));
      }
      if (view.eventEn === 'CURSED CHEST') {
        pendingCurse = true;
      }
      continue;
    }

    const stuck = await snapshot(page);
    check(
      'run is still progressing',
      stuck.runState === 'playing',
      JSON.stringify({ runState: stuck.runState, roomState: stuck.roomState })
    );
    break;
  }

  check('run visited two events', seenEvents.length === 2, JSON.stringify(seenEvents));
  check('visited events are distinct', new Set(seenEvents).size === 2, JSON.stringify(seenEvents));
  check('run entered seven combat rooms', roomsEntered === 7, String(roomsEntered));
  check('boss preview reached', Boolean(bossPreview), bossPreview?.roomKicker);

  check(
    'boss room preview opens',
    Boolean(bossPreview) && /ROOM 10 \/ 10/.test(bossPreview.roomKicker ?? ''),
    bossPreview?.roomKicker
  );

  await enterRoom(page);
  await sleep(700);
  let bossState = await snapshot(page);
  check(
    'boss room starts with phase 1',
    bossState.bossPhase === 1 && Number(bossState.bossHp) > 0,
    JSON.stringify({ phase: bossState.bossPhase, hp: bossState.bossHp })
  );
  check('boss bar is visible', await page.evaluate(() => !document.getElementById('boss-bar')?.hidden));
  check(
    'boss bar shows phase 1',
    (await page.$eval('#boss-bar-phase', (el) => el.textContent))?.includes('秩序'),
    await page.$eval('#boss-bar-phase', (el) => el.textContent)
  );

  await page.evaluate(() => window.__RT_DAMAGE_BOSS__?.(600));
  await sleep(600);
  bossState = await snapshot(page);
  check('boss enters phase 2 below 70%', bossState.bossPhase === 2, JSON.stringify({ phase: bossState.bossPhase, hp: bossState.bossHp }));
  check(
    'boss bar follows phase 2',
    (await page.$eval('#boss-bar-phase', (el) => el.textContent))?.includes('混乱'),
    await page.$eval('#boss-bar-phase', (el) => el.textContent)
  );

  await page.evaluate(() => window.__RT_HEAL__?.(100));
  const summoned = await poll(
    page,
    () => (window.__RT_SNAPSHOT__?.().enemies ?? 0) >= 2,
    10000
  );
  check('phase 2 summons adds', summoned, String((await snapshot(page)).enemies));

  await page.evaluate(() => window.__RT_DAMAGE_BOSS__?.(600));
  await sleep(700);
  bossState = await snapshot(page);
  check('boss enters phase 3 below 35%', bossState.bossPhase === 3, JSON.stringify({ phase: bossState.bossPhase, hp: bossState.bossHp }));

  await page.evaluate(() => window.__RT_FREEZE_ATTACK__?.());
  const sealSeen = await poll(page, () => Boolean(window.__RT_SNAPSHOT__?.().sealSlot), 9000);
  check('phase 3 telegraphs and seals a rule', sealSeen);
  if (sealSeen) {
    const sealed = await snapshot(page);
    check(
      'sealed rule is disabled for about four seconds',
      Number(sealed.sealTime) > 2 && Number(sealed.sealTime) <= 4.2,
      String(sealed.sealTime)
    );
    let released = false;
    for (let tick = 0; tick < 30; tick += 1) {
      await page.evaluate(() => window.__RT_HEAL__?.(40));
      if (!(await snapshot(page)).sealSlot) {
        released = true;
        break;
      }
      await sleep(300);
    }
    check('sealed rule is restored automatically', released);

    // deterministic dodge: trigger a seal at the player, then dash out immediately
    await poll(page, () => (window.__RT_SNAPSHOT__?.().dashCooldown ?? 1) === 0, 6000);
    const beforeCast = await snapshot(page);
    await page.evaluate(() => window.__RT_CAST_SEAL__?.());
    const cast = await snapshot(page);
    const zone = cast.sealZone;
    // run towards the arena centre: always open space, unlike the nearest wall
    const toCentreX = 400 - Number(beforeCast.playerX);
    const toCentreY = 400 - Number(beforeCast.playerY);
    const key =
      Math.abs(toCentreX) > Math.abs(toCentreY)
        ? toCentreX > 0
          ? 'KeyD'
          : 'KeyA'
        : toCentreY > 0
          ? 'KeyS'
          : 'KeyW';
    await page.keyboard.down(key);
    await sleep(60);
    await page.keyboard.down('Space');
    await page.keyboard.up('Space');
    await sleep(1400);
    await page.keyboard.up(key);
    const dodged = await snapshot(page);
    const distanceFromZone = Math.hypot(
      Number(dodged.playerX) - Number(zone?.x ?? dodged.playerX),
      Number(dodged.playerY) - Number(zone?.y ?? dodged.playerY)
    );
    check(
      'avoiding the seal zone prevents the seal',
      Boolean(zone) &&
        !dodged.sealSlot &&
        distanceFromZone > Number(zone?.radius ?? 0) + 10 &&
        Number(dodged.bossHp) > 0,
      JSON.stringify({
        zone,
        sealSlot: dodged.sealSlot,
        distance: Math.round(distanceFromZone),
        bossHp: dodged.bossHp
      })
    );
  }

  await page.evaluate(() => window.__RT_DAMAGE_BOSS__?.(900));
  await page.evaluate(() => {
    window.__RT_SPAWN__?.('beetle');
    window.__RT_KILL_ALL__?.();
  });
  await page.waitForFunction(
    () =>
      !document.getElementById('altar-screen')?.hidden ||
      !document.getElementById('chapter-screen')?.hidden,
    { timeout: 9000 }
  );
  const chapterReward = await page.evaluate(() => ({
    visible: !document.getElementById('altar-screen')?.hidden,
    label: document.getElementById('reward-room')?.textContent,
    cards: [...document.querySelectorAll('#rule-offers .rule-card')].map((card) => ({
      kind: card.getAttribute('data-kind'),
      name: card.querySelector('.rule-card-name')?.textContent
    }))
  }));
  check(
    'chapter one clear offers a chapter reward',
    chapterReward.visible && /章节奖励/.test(chapterReward.label ?? ''),
    JSON.stringify(chapterReward)
  );
  check(
    'chapter reward includes a relic or ascension',
    chapterReward.cards.some((card) => card.kind === 'relic' || card.kind === 'ascension'),
    JSON.stringify(chapterReward.cards)
  );
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#rule-offers .rule-card')];
    const pick =
      cards.find(
        (card) =>
          card.getAttribute('data-kind') === 'relic' ||
          card.getAttribute('data-kind') === 'ascension'
      ) ?? cards[0];
    pick?.click();
  });
  await page.waitForFunction(() => !document.getElementById('chapter-screen')?.hidden, {
    timeout: 9000
  });
  const chapterUpgrade = await snapshot(page);
  check(
    'picking a chapter reward keeps it for the next chapter',
    (chapterUpgrade.relics?.length ?? 0) + (chapterUpgrade.ascensions?.length ?? 0) >= 1,
    JSON.stringify({ relics: chapterUpgrade.relics, ascensions: chapterUpgrade.ascensions })
  );
  const chapterClear = await page.evaluate(() => ({
    kicker: document.getElementById('chapter-kicker')?.textContent,
    title: document.getElementById('chapter-title')?.textContent,
    next: document.getElementById('chapter-continue-btn')?.textContent,
    hp: document.getElementById('chapter-hp')?.textContent,
    level: document.getElementById('chapter-level')?.textContent
  }));
  check(
    'killing the arbiter clears chapter one',
    /CHAPTER 1 \/ 3 CLEAR/.test(chapterClear.kicker ?? '') &&
      /审判废墟/.test(chapterClear.title ?? ''),
    JSON.stringify(chapterClear)
  );
  check(
    'chapter clear offers the workshop and keeps the build',
    /失序工坊/.test(chapterClear.next ?? '') && /等级 \d+ \/ 9/.test(chapterClear.level ?? ''),
    JSON.stringify({ next: chapterClear.next, level: chapterClear.level })
  );
  const leftover = await snapshot(page);
  check(
    'boss death clears the summoned adds',
    Number(leftover.enemies) === 0,
    String(leftover.enemies)
  );
  check(
    'chapter clear keeps the boss bar hidden',
    (await page.evaluate(() => document.getElementById('boss-bar')?.hidden)) === true
  );
  await page.click('#chapter-stop-btn');
  await page.waitForFunction(() => !document.getElementById('result-screen')?.hidden, {
    timeout: 9000
  });
  const bossVictory = await page.evaluate(() => ({
    title: document.getElementById('result-title')?.textContent,
    kicker: document.getElementById('result-kicker')?.textContent,
    rooms: document.getElementById('result-rooms')?.textContent,
    shards: document.getElementById('result-shards')?.textContent,
    meta: JSON.parse(localStorage.getItem('rulethief.meta.v1') ?? 'null')
  }));
  check(
    'stopping after chapter one settles as a stage clear',
    bossVictory.kicker === 'CHAPTER COMPLETE' &&
      /阶段完成/.test(bossVictory.title ?? '') &&
      bossVictory.rooms === '10 / 10',
    JSON.stringify(bossVictory)
  );
  check(
    'stage clear awards shards and persists meta progression',
    /法则碎片 \+\d+/.test(bossVictory.shards ?? '') &&
      Number(bossVictory.meta?.shards) > 0 &&
      Number(bossVictory.meta?.runs) === 1 &&
      Number(bossVictory.meta?.maxStartChapter) === 1,
    JSON.stringify({ shards: bossVictory.shards, meta: bossVictory.meta })
  );
  const exported = await page.evaluate(() => JSON.parse(window.__RT_EXPORT__?.() ?? '{}'));
  check(
    'playtest export bundles runs, meta and build data',
    Array.isArray(exported.runs) &&
      exported.runs.length >= 1 &&
      Boolean(exported.meta) &&
      typeof exported.agent === 'string' &&
      Boolean(exported.runs[0]?.build) &&
      Number(exported.runs[0]?.chaptersCleared) === 1 &&
      Number(exported.runs[0]?.startChapter) === 0 &&
      exported.runs[0]?.stageOnly === true,
    JSON.stringify({
      runs: exported.runs?.length,
      meta: Boolean(exported.meta),
      build: exported.runs?.[0]?.build,
      cleared: exported.runs?.[0]?.chaptersCleared,
      start: exported.runs?.[0]?.startChapter,
      stageOnly: exported.runs?.[0]?.stageOnly
    })
  );

  const finalStats = await page.evaluate(() => ({
    combo: document.getElementById('result-combo-name')?.textContent,
    time: document.getElementById('result-time')?.textContent
  }));
  check(
    'result shows the mutation line',
    /^突变 · /.test(await page.$eval('#result-mutation', (el) => el.textContent ?? '')),
    await page.$eval('#result-mutation', (el) => el.textContent ?? '')
  );
  check(
    'victory reports a combo and time',
    Boolean(finalStats.combo) && /^\d\d:\d\d$/.test(finalStats.time ?? ''),
    `${finalStats.combo} / ${finalStats.time}`
  );

  await page.click('#restart-btn');
  await sleep(700);
  state = await snapshot(page);
  roomHud = await hud(page);
  overlay = await overlayState(page);
  check(
    'restart resets the whole run',
    state.hp === 100 &&
      state.maxHp === 100 &&
      state.roomIndex === 0 &&
      state.kills === 0 &&
      state.build?.trajectory === null &&
      state.build?.impact === null,
    JSON.stringify({ hp: state.hp, roomIndex: state.roomIndex, kills: state.kills, build: state.build })
  );
  check('restart reopens room 1 preview', overlay.roomVisible, String(overlay.roomVisible));
  check('restart resets the HUD and codex', roomHud.roomNum === '01' && roomHud.objective === '0 / 13' && roomHud.codexRows === 1, JSON.stringify(roomHud));
  check(
    'restart with the same seed recreates the plan',
    Array.isArray(leftover.plan) &&
      leftover.plan.length > 0 &&
      JSON.stringify(leftover.plan) === JSON.stringify(state.plan),
    JSON.stringify({ before: leftover.plan?.length, after: state.plan?.length })
  );
  check(
    'restart resets run damage totals',
    Object.values(state.damageTaken ?? {}).every((value) => Number(value) === 0),
    JSON.stringify(state.damageTaken)
  );

  await enterRoom(page);
  await page.evaluate(() => window.__RT_DAMAGE__?.(10));
  await sleep(120);
  const damagedRoom = await snapshot(page);
  await page.evaluate(() => window.__RT_ENTER_ROOM__?.());
  await sleep(220);
  const reenteredRoom = await snapshot(page);
  check(
    'damage totals survive a room transition',
    Number(damagedRoom.damageTaken?.other) === 10 &&
      Number(reenteredRoom.damageTaken?.other) === 10,
    JSON.stringify({ before: damagedRoom.damageTaken, after: reenteredRoom.damageTaken })
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
  check('defeat reports zero rooms cleared', defeat.rooms === '0 / 10', String(defeat.rooms));

  const damageLine = await page.$eval('#result-damage', (el) => el.textContent);
  check(
    'defeat shows the damage source breakdown',
    /承伤构成：.+%/.test(damageLine ?? ''),
    String(damageLine)
  );
  const telemetry = await page.evaluate(() => ({
    line: document.getElementById('result-record')?.textContent,
    stored: JSON.parse(localStorage.getItem('rulethief.runs.v1') ?? '[]').length
  }));
  check('run is recorded in localStorage', telemetry.stored >= 1, String(telemetry.stored));
  check(
    'result shows the running record',
    /累计 \d+ 局/.test(telemetry.line ?? ''),
    String(telemetry.line)
  );

  await page.click('#result-menu-btn');
  await sleep(300);
  check('result menu returns to menu', await page.$eval('#menu', (el) => !el.hidden));

  await page.click('#enter-btn');
  await sleep(800);
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
  const pauseSummary = await page.$eval('#pause-stats', (el) => el.textContent ?? '');
  check(
    'pause shows build and run progress',
    pauseSummary.includes('突变') && /第 \d+ \/ \d+ 步/.test(pauseSummary),
    pauseSummary.split(String.fromCharCode(10)).join(' | ')
  );
  await page.click('#pause-restart-btn');
  await sleep(600);
  const restartedFromPause = await snapshot(page);
  check(
    'pause menu can restart the run',
    restartedFromPause.roomIndex === 0 &&
      restartedFromPause.hp === 100 &&
      restartedFromPause.kills === 0 &&
      (await page.$eval('#pause-screen', (el) => el.hidden)),
    JSON.stringify({ roomIndex: restartedFromPause.roomIndex, hp: restartedFromPause.hp })
  );
  await enterRoom(page);
  await page.click('#pause-btn');
  await sleep(220);
  await page.click('#resume-btn');
  await sleep(220);
  check('pause overlay hidden after resume', await page.$eval('#pause-screen', (el) => el.hidden));

  check('desktop no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.close();

  const planForSeed = async (seed) => {
    const seeded = await newPage(browser, { width: 1024, height: 768, deviceScaleFactor: 1 });
    await seeded.goto(`${BASE}/?arena=1&horde=0&seed=${seed}`, { waitUntil: 'networkidle0' });
    await waitReady(seeded);
    await seeded.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
    const plan = (await snapshot(seeded)).plan;
    await seeded.close();
    return JSON.stringify(plan);
  };
  const planA = await planForSeed('demo');
  const planB = await planForSeed('demo');
  check('same seed reproduces the same run plan', planA === planB, planA.slice(0, 80));
  const otherPlans = [await planForSeed('other'), await planForSeed('third')];
  check(
    'different seeds can produce different plans',
    otherPlans.some((plan) => plan !== planA),
    JSON.stringify(otherPlans.map((plan) => plan.slice(0, 40)))
  );

  const mobileBoss = await newPage(browser, {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true
  });
  await mobileBoss.goto(`${BASE}/?arena=1&horde=0&boss=1`, { waitUntil: 'networkidle0' });
  await waitReady(mobileBoss);
  await mobileBoss.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(400);
  await mobileBoss.tap('#room-enter-btn');
  await sleep(900);
  const mobileBossLayout = await mobileBoss.evaluate(() => {
    const hud = document.querySelector('.hud-top')?.getBoundingClientRect();
    const bar = document.getElementById('boss-bar')?.getBoundingClientRect();
    return {
      hudBottom: Math.round(hud?.bottom ?? 0),
      barTop: Math.round(bar?.top ?? 0),
      barHidden: document.getElementById('boss-bar')?.hidden ?? true,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1
    };
  });
  check(
    'mobile boss bar sits below the HUD without overflow',
    !mobileBossLayout.barHidden &&
      mobileBossLayout.barTop >= mobileBossLayout.hudBottom &&
      !mobileBossLayout.overflow,
    JSON.stringify(mobileBossLayout)
  );
  await mobileBoss.close();

  const buildPreset = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await buildPreset.goto(`${BASE}/?arena=1&horde=0&build=spread,burn,3,3`, { waitUntil: 'networkidle0' });
  await waitReady(buildPreset);
  await buildPreset.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(300);
  const presetState = await snapshot(buildPreset);
  const presetCombo = await buildPreset.$eval('#combo-name', (el) => el.textContent);
  check(
    'build URL parameter loads a preset combo',
    presetState.build?.trajectory?.key === 'spread' &&
      presetState.build?.trajectory?.level === 3 &&
      presetState.build?.impact?.key === 'burn' &&
      presetCombo === '火焰弹幕',
    JSON.stringify({ build: presetState.build, combo: presetCombo })
  );
  await buildPreset.close();

  const hordePage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await hordePage.goto(`${BASE}/?arena=1&horde=1&build=spread,burn,3,3`, {
    waitUntil: 'networkidle0'
  });
  await waitReady(hordePage);
  await hordePage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await enterRoom(hordePage);
  await hordePage.evaluate(() => window.__RT_FREEZE_ATTACK__?.());
  await poll(
    hordePage,
    () => {
      window.__RT_HEAL__?.(100);
      return Number(window.__RT_SNAPSHOT__?.().enemies ?? 0) >= 10;
    },
    7_000
  );
  const hordeState = await snapshot(hordePage);
  const hordeHud = await hordePage.evaluate(() => ({
    wave: document.getElementById('wave-progress')?.textContent,
    hidden: document.getElementById('objective-wave')?.hidden,
    banner: document.getElementById('wave-banner-text')?.textContent
  }));
  check(
    'horde rooms spawn waves that overlap into a crowd',
    Boolean(hordeState.wave) &&
      Number(hordeState.wave?.waves) >= 3 &&
      Number(hordeState.wave?.spawned) >= 8 &&
      Number(hordeState.enemies) >= 8 &&
      hordeHud.hidden === false &&
      /\d+ \/ \d+/.test(hordeHud.wave ?? ''),
    JSON.stringify({ wave: hordeState.wave, alive: hordeState.alive, hud: hordeHud })
  );

  await hordePage.evaluate(() => {
    for (let index = 0; index < 10; index += 1) window.__RT_KILL_ONE__?.();
  });
  await poll(
    hordePage,
    () => Number(window.__RT_SNAPSHOT__?.().overloadSpawned ?? 0) >= 1,
    3000
  );
  const overload = await snapshot(hordePage);
  check(
    'ten kills overload the room with a bonus pack',
    Number(overload.overloadSpawned) >= 1 && Number(overload.alive) >= 3,
    JSON.stringify({ overload: overload.overloadSpawned, alive: overload.alive })
  );

  await sleep(80);
  const streakState = await snapshot(hordePage);
  const streakHud = await hordePage.evaluate(() => ({
    hidden: document.getElementById('kill-streak')?.hidden,
    count: document.getElementById('kill-streak-count')?.textContent
  }));
  check(
    'multi-kills raise the kill streak HUD',
    Number(streakState.killStreak) >= 2 &&
      streakHud.hidden === false &&
      /×\d+/.test(streakHud.count ?? ''),
    JSON.stringify({ streak: streakState.killStreak, hud: streakHud })
  );

  await hordePage.keyboard.press('Space');
  await sleep(180);
  const dashNova = await snapshot(hordePage);
  check(
    'dashing through a horde releases a shockwave',
    Number(dashNova.dashNovas) >= 1,
    String(dashNova.dashNovas)
  );

  await hordePage.evaluate(() => window.__RT_STEP__?.(6));
  await hordePage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await hordePage.tap('#room-enter-btn');
  await hordePage.evaluate(() => window.__RT_FREEZE_ATTACK__?.());
  await poll(
    hordePage,
    () => {
      window.__RT_HEAL__?.(100);
      const snap = window.__RT_SNAPSHOT__?.() ?? {};
      return Number(snap.eliteAlive) >= 1 && Number(snap.enemies) >= 27;
    },
    7000
  );
  const lateHorde = await snapshot(hordePage);
  check(
    'late first-world rooms add a horde captain',
    Number(lateHorde.roomQuota) >= 28 &&
      Number(lateHorde.enemies) >= 20 &&
      Number(lateHorde.eliteAlive) >= 1,
    JSON.stringify({
      room: lateHorde.roomId,
      quota: lateHorde.roomQuota,
      enemies: lateHorde.enemies,
      alive: lateHorde.alive,
      elites: lateHorde.eliteAlive
    })
  );

  await hordePage.evaluate(() => {
    window.__RT_HEAL__?.(100);
    for (let index = 0; index < 25; index += 1) window.__RT_KILL_ONE__?.();
  });
  await poll(
    hordePage,
    () => Number(window.__RT_SNAPSHOT__?.().hordeNovas ?? 0) >= 1,
    3000
  );
  const novaState = await snapshot(hordePage);
  check(
    'twenty-five kills release a clearing nova',
    Number(novaState.hordeNovas) >= 1,
    JSON.stringify({ novas: novaState.hordeNovas, streak: novaState.killStreak })
  );
  await hordePage.close();

  const bossPractice = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await bossPractice.goto(`${BASE}/?arena=1&horde=0&boss=1`, { waitUntil: 'networkidle0' });
  await waitReady(bossPractice);
  await bossPractice.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(400);
  const bossPreviewKicker = await bossPractice.$eval('#room-kicker', (el) => el.textContent);
  check('boss practice jumps to room 10', /ROOM 10 \/ 10/.test(bossPreviewKicker ?? ''), String(bossPreviewKicker));
  await bossPractice.tap('#room-enter-btn');
  await sleep(800);
  const practiceState = await snapshot(bossPractice);
  check(
    'boss practice starts the arbiter fight with a starter build',
    practiceState.bossPhase === 1 &&
      Number(practiceState.bossHp) > 1600 &&
      Number(practiceState.bossHp) <= 1800 &&
      practiceState.build?.trajectory?.key === 'chain',
    JSON.stringify({ phase: practiceState.bossPhase, hp: practiceState.bossHp, build: practiceState.build })
  );

  await bossPractice.evaluate(() => {
    const snap = window.__RT_SNAPSHOT__?.() ?? {};
    window.__RT_HEAL__?.(200);
    window.__RT_SPAWN_HAZARD__?.(Number(snap.playerX), Number(snap.playerY));
    window.__RT_SPAWN_ENEMY_BOLT__?.();
    window.__RT_RACE_SETUP__ = window.__RT_SNAPSHOT__?.();
    window.__RT_DAMAGE_BOSS__?.(2000);
  });
  const raceSetup = await bossPractice.evaluate(() => window.__RT_RACE_SETUP__);
  check(
    'boss death scenario starts with residual threats',
    Number(raceSetup?.enemyBolts) >= 1 &&
      Number(raceSetup?.hazards) >= 1 &&
      Number(raceSetup?.hp) === 100,
    JSON.stringify({ bolts: raceSetup?.enemyBolts, hazards: raceSetup?.hazards, hp: raceSetup?.hp })
  );
  await sleep(150);
  const raceLocked = await snapshot(bossPractice);
  check(
    'boss death clears residual bolts and fire',
    Number(raceLocked.enemyBolts) === 0 && Number(raceLocked.hazards) === 0,
    JSON.stringify({ bolts: raceLocked.enemyBolts, hazards: raceLocked.hazards })
  );
  check('boss death locks out further damage', Number(raceLocked.hp) === 100, String(raceLocked.hp));
  await bossPractice.waitForFunction(
    () =>
      !document.getElementById('altar-screen')?.hidden ||
      !document.getElementById('chapter-screen')?.hidden,
    { timeout: 9000 }
  );
  await bossPractice.evaluate(() => {
    const cards = [...document.querySelectorAll('#rule-offers .rule-card')];
    cards[0]?.click();
  });
  await bossPractice.waitForFunction(
    () => !document.getElementById('chapter-screen')?.hidden,
    { timeout: 9000 }
  );
  const raceChapter = await bossPractice.evaluate(() => ({
    title: document.getElementById('chapter-title')?.textContent,
    hp: document.getElementById('chapter-hp')?.textContent
  }));
  check(
    'residual threats cannot turn boss victory into defeat',
    /审判废墟/.test(raceChapter.title ?? '') && raceChapter.hp === '100 / 100',
    JSON.stringify(raceChapter)
  );
  const raceAfter = await snapshot(bossPractice);
  check('player survives the boss death window', Number(raceAfter.hp) === 100, String(raceAfter.hp));
  await bossPractice.click('#chapter-stop-btn');
  await bossPractice.waitForFunction(
    () => !document.getElementById('result-screen')?.hidden,
    { timeout: 9000 }
  );
  const raceResult = await bossPractice.evaluate(() => ({
    kicker: document.getElementById('result-kicker')?.textContent,
    rooms: document.getElementById('result-rooms')?.textContent
  }));
  check(
    'boss race settles as a stage clear with all ten steps',
    raceResult.kicker === 'CHAPTER COMPLETE' && raceResult.rooms === '10 / 10',
    JSON.stringify(raceResult)
  );
  await bossPractice.close();

  const bossPreset = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await bossPreset.goto(`${BASE}/?arena=1&horde=0&boss=1&build=spread,burn,3,3`, { waitUntil: 'networkidle0' });
  await waitReady(bossPreset);
  await bossPreset.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(300);
  const bossPresetState = await snapshot(bossPreset);
  check(
    'explicit build overrides the boss-practice starter build',
    bossPresetState.build?.trajectory?.key === 'spread' &&
      bossPresetState.build?.impact?.key === 'burn' &&
      bossPresetState.build?.trajectory?.level === 3,
    JSON.stringify(bossPresetState.build)
  );
  await bossPreset.close();

  const workshop = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await workshop.goto(`${BASE}/?arena=1&horde=0&build=spread,burn,3,3`, { waitUntil: 'networkidle0' });
  await waitReady(workshop);
  await workshop.evaluate(() => window.__RT_CHAPTER_START__?.(1));
  await workshop.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await sleep(300);
  const workshopPreview = await workshop.evaluate(() => ({
    kicker: document.getElementById('room-kicker')?.textContent,
    title: document.getElementById('room-title')?.textContent,
    objective: document.getElementById('objective-room')?.textContent,
    state: window.__RT_SNAPSHOT__?.()
  }));
  check(
    'chapter two starts in the disorder workshop',
    workshopPreview.state?.chapterIndex === 1 &&
      workshopPreview.state?.chapterName === '失序工坊' &&
      workshopPreview.state?.worldTheme === 'workshop' &&
      workshopPreview.title === '装配门厅' &&
      /W2/.test(workshopPreview.objective ?? ''),
    JSON.stringify({
      chapter: workshopPreview.state?.chapterName,
      title: workshopPreview.title,
      objective: workshopPreview.objective
    })
  );

  await workshop.tap('#room-enter-btn');
  const workshopFighting = await poll(
    workshop,
    () => window.__RT_SNAPSHOT__?.().roomState === 'fighting',
    5000
  );
  check('chapter two room enters combat', workshopFighting);
  const conveyorBefore = await snapshot(workshop);
  await sleep(500);
  const conveyorAfter = await snapshot(workshop);
  check(
    'conveyor room pushes the player without input',
    Number(conveyorBefore.conveyor?.x) === 42 &&
      Number(conveyorAfter.playerX) > Number(conveyorBefore.playerX) + 8,
    JSON.stringify({
      before: conveyorBefore.playerX,
      after: conveyorAfter.playerX,
      conveyor: conveyorAfter.conveyor
    })
  );
  const shockSeen = await poll(
    workshop,
    () => Number(window.__RT_SNAPSHOT__?.().hazards ?? 0) >= 3,
    6000
  );
  const workshopCombat = await snapshot(workshop);
  check(
    'shock-grid telegraphs several zones before detonating',
    shockSeen,
    String(workshopCombat.hazards)
  );
  await workshop.evaluate(() => {
    window.__RT_SPAWN__?.('sentry');
    window.__RT_SPAWN__?.('phase');
    window.__RT_SPAWN__?.('warden');
  });
  await poll(
    workshop,
    () =>
      (window.__RT_SNAPSHOT__?.().enemyList ?? []).some(
        (enemy) => enemy.kind === 'warden' && enemy.shielded
      ),
    5000
  );
  const workshopEnemies = await snapshot(workshop);
  const warden = (workshopEnemies.enemyList ?? []).find((enemy) => enemy.kind === 'warden');
  check(
    'workshop enemies spawn with their own behaviours',
    (workshopEnemies.enemyCounts?.sentry ?? 0) >= 1 &&
      (workshopEnemies.enemyCounts?.phase ?? 0) >= 1 &&
      Boolean(warden?.shielded),
    JSON.stringify(workshopEnemies.enemyCounts)
  );

  await workshop.evaluate(() => window.__RT_CHAPTER_BOSS__?.(1));
  await workshop.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await sleep(300);
  const corePreview = await workshop.evaluate(() => ({
    title: document.getElementById('room-title')?.textContent,
    kicker: document.getElementById('room-kicker')?.textContent
  }));
  check(
    'disorder core practice jumps to the final workshop room',
    corePreview.title === '失序核心' && /ROOM 12 \/ 12/.test(corePreview.kicker ?? ''),
    JSON.stringify(corePreview)
  );
  await workshop.tap('#room-enter-btn');
  await sleep(700);
  const coreState = await snapshot(workshop);
  check(
    'disorder core starts with its own boss bar and health',
    coreState.bossPhase === 1 &&
      Number(coreState.bossHp) > 1400 &&
      Number(coreState.bossHp) <= 1600 &&
      (await workshop.$eval('#boss-bar-name', (el) => el.textContent)) === '失序核心',
    JSON.stringify({ hp: coreState.bossHp, phase: coreState.bossPhase })
  );
  await workshop.evaluate(() => window.__RT_DAMAGE_BOSS__?.(600));
  const coreLaserSeen = await poll(
    workshop,
    () => Boolean(window.__RT_SNAPSHOT__?.().coreLaserActive),
    5000
  );
  check(
    'disorder core sweeps a rotating laser in phase two',
    coreLaserSeen,
    JSON.stringify(await snapshot(workshop))
  );
  await workshop.evaluate(() => window.__RT_DAMAGE_BOSS__?.(2000));
  await workshop.waitForFunction(
    () => !document.getElementById('altar-screen')?.hidden,
    { timeout: 9000 }
  );
  const workshopReward = await workshop.evaluate(() => ({
    label: document.getElementById('reward-room')?.textContent,
    cards: [...document.querySelectorAll('#rule-offers .rule-card')].map((card) =>
      card.getAttribute('data-kind')
    )
  }));
  check(
    'clearing the workshop opens the chapter-two reward',
    /章节奖励/.test(workshopReward.label ?? '') && workshopReward.cards.length === 3,
    JSON.stringify(workshopReward)
  );
  await workshop.evaluate(() => {
    document.querySelector('#rule-offers .rule-card')?.click();
  });
  await workshop.waitForFunction(
    () => !document.getElementById('chapter-screen')?.hidden,
    { timeout: 9000 }
  );
  const chapterTwoClear = await workshop.evaluate(() => ({
    title: document.getElementById('chapter-title')?.textContent,
    kicker: document.getElementById('chapter-kicker')?.textContent,
    next: document.getElementById('chapter-continue-btn')?.textContent
  }));
  check(
    'chapter two clears into the abyss',
    /失序工坊/.test(chapterTwoClear.title ?? '') &&
      /CHAPTER 2 \/ 3 CLEAR/.test(chapterTwoClear.kicker ?? '') &&
      /逆律深渊/.test(chapterTwoClear.next ?? ''),
    JSON.stringify(chapterTwoClear)
  );
  await workshop.click('#chapter-continue-btn');
  await workshop.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await sleep(300);
  const abyssPreview = await workshop.evaluate(() => ({
    title: document.getElementById('room-title')?.textContent,
    objective: document.getElementById('objective-room')?.textContent,
    state: window.__RT_SNAPSHOT__?.()
  }));
  check(
    'chapter three starts in the inverse-law abyss',
    abyssPreview.state?.chapterIndex === 2 &&
      abyssPreview.state?.chapterName === '逆律深渊' &&
      abyssPreview.state?.worldTheme === 'abyss' &&
      abyssPreview.title === '深渊入口' &&
      /W3/.test(abyssPreview.objective ?? ''),
    JSON.stringify({
      chapter: abyssPreview.state?.chapterName,
      title: abyssPreview.title,
      objective: abyssPreview.objective
    })
  );

  await workshop.tap('#room-enter-btn');
  const voidSeen = await poll(
    workshop,
    () => Number(window.__RT_SNAPSHOT__?.().hazards ?? 0) >= 3,
    6000
  );
  const abyssHazards = await snapshot(workshop);
  check(
    'void-rift spawns larger telegraph zones',
    voidSeen && Number(abyssHazards.hazards) >= 3,
    JSON.stringify({ seen: voidSeen, hazards: abyssHazards.hazards })
  );
  const ruleNullSeen = await poll(
    workshop,
    () => Boolean(window.__RT_SNAPSHOT__?.().sealSlot),
    9000
  );
  const abyssRuleNull = await snapshot(workshop);
  check(
    'rule-null briefly seals an equipped rule',
    ruleNullSeen,
    JSON.stringify({ sealSlot: abyssRuleNull.sealSlot, sealTime: abyssRuleNull.sealTime })
  );

  await workshop.evaluate(() => window.__RT_CHAPTER_BOSS__?.(2));
  await workshop.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await sleep(300);
  const sourcePreview = await workshop.evaluate(() => ({
    title: document.getElementById('room-title')?.textContent,
    kicker: document.getElementById('room-kicker')?.textContent
  }));
  check(
    'source of rules practice jumps to the final abyss room',
    sourcePreview.title === '规则之源' && /ROOM 12 \/ 12/.test(sourcePreview.kicker ?? ''),
    JSON.stringify(sourcePreview)
  );
  await workshop.tap('#room-enter-btn');
  await sleep(700);
  const sourceState = await snapshot(workshop);
  check(
    'source of rules starts with its own boss bar and health',
    sourceState.bossPhase === 1 &&
      Number(sourceState.bossHp) > 2300 &&
      Number(sourceState.bossHp) <= 2600 &&
      (await workshop.$eval('#boss-bar-name', (el) => el.textContent)) === '规则之源',
    JSON.stringify({ hp: sourceState.bossHp, phase: sourceState.bossPhase })
  );
  await workshop.evaluate(() => window.__RT_DAMAGE_BOSS__?.(3000));
  await workshop.waitForFunction(() => !document.getElementById('result-screen')?.hidden, {
    timeout: 9000
  });
  const sourceResult = await workshop.evaluate(() => ({
    title: document.getElementById('result-title')?.textContent,
    sub: document.getElementById('result-sub')?.textContent,
    rooms: document.getElementById('result-rooms')?.textContent,
    kicker: document.getElementById('result-kicker')?.textContent
  }));
  check(
    'clearing the abyss wins the three-chapter run',
    sourceResult.title === '规则终结' &&
      sourceResult.kicker === 'RUN COMPLETE' &&
      sourceResult.rooms === '12 / 12',
    JSON.stringify(sourceResult)
  );
  check(
    'final victory names the source of rules, not the first-world arbiter',
    (sourceResult.sub ?? '').includes('规则之源') && !(sourceResult.sub ?? '').includes('规则审判者'),
    JSON.stringify(sourceResult.sub)
  );
  await workshop.close();

  const relicPage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await relicPage.goto(`${BASE}/?arena=1&horde=0&build=spread,burn,3,3`, { waitUntil: 'networkidle0' });
  await waitReady(relicPage);
  await relicPage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await enterRoom(relicPage);
  await sleep(500);
  await relicPage.evaluate(() => {
    window.__RT_FREEZE_ATTACK__?.();
    window.__RT_PURGE_ENEMIES__?.();
    window.__RT_RELIC__?.('feather');
    window.__RT_RELIC__?.('thunder-emblem');
  });
  await relicPage.keyboard.press('Space');
  await sleep(120);
  const featherState = await snapshot(relicPage);
  check(
    'swift feather opens a post-dash speed window',
    Number(featherState.featherTime) > 0,
    String(featherState.featherTime)
  );
  await relicPage.hover('#relic-line');
  await sleep(100);
  const relicTip = await relicPage.evaluate(() => ({
    hidden: document.getElementById('item-tip')?.hidden,
    text: document.getElementById('item-tip')?.textContent ?? ''
  }));
  check(
    'relic tooltip shows the full description on hover',
    relicTip.hidden === false &&
      /雷鸣徽章/.test(relicTip.text) &&
      /单次攻击命中 2 个以上目标/.test(relicTip.text),
    JSON.stringify(relicTip)
  );
  await relicPage.evaluate(() => {
    window.__RT_SPAWN_AT__?.('beetle', 400, 300);
    window.__RT_SPAWN_AT__?.('beetle', 410, 300);
    window.__RT_SPAWN_AT__?.('beetle', 420, 300);
  });
  await sleep(30);
  await relicPage.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(600);
  const thunderState = await snapshot(relicPage);
  check(
    'thunder emblem stacks from a multi-target pierce hit',
    Number(thunderState.thunderStacks) >= 1,
    String(thunderState.thunderStacks)
  );
  await relicPage.close();

  const stackPage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await stackPage.goto(`${BASE}/?arena=1&horde=0&build=pierce,burn,3,3`, { waitUntil: 'networkidle0' });
  await waitReady(stackPage);
  await stackPage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await enterRoom(stackPage);
  await sleep(500);
  await stackPage.evaluate(() => {
    window.__RT_FREEZE_ATTACK__?.();
    window.__RT_PURGE_ENEMIES__?.();
    window.__RT_RELIC__?.('thunder-emblem');
    window.__RT_SPAWN_AT__?.('sunder', 400, 300);
    window.__RT_SPAWN_AT__?.('sunder', 450, 200);
    window.__RT_SPAWN_AT__?.('sunder', 500, 100);
  });
  await sleep(200);
  const stackTrace = [];
  for (let volley = 0; volley < 4; volley += 1) {
    const expected = volley === 3 ? 1 : volley + 1;
    await stackPage.evaluate(() => window.__RT_VOLLEY__?.());
    await stackPage
      .waitForFunction(
        (target) => window.__RT_SNAPSHOT__?.().thunderStacks === target,
        { timeout: 2_500 },
        expected
      )
      .catch(() => {});
    stackTrace.push(Number((await snapshot(stackPage)).thunderStacks));
  }
  check(
    'thunder emblem accumulates three layers before consuming',
    stackTrace.join(',') === '1,2,3,1',
    stackTrace.join(',')
  );
  await stackPage.close();

  const bloodPage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await bloodPage.goto(`${BASE}/?arena=1&horde=0&build=pierce,burn,3,3`, { waitUntil: 'networkidle0' });
  await waitReady(bloodPage);
  await bloodPage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await enterRoom(bloodPage);
  await sleep(500);
  await bloodPage.evaluate(() => {
    window.__RT_FREEZE_ATTACK__?.();
    window.__RT_PURGE_ENEMIES__?.();
    window.__RT_RELIC__?.('bloodflame-heart');
    window.__RT_DAMAGE__?.(30);
    window.__RT_SPAWN_AT__?.('beetle', 430, 300);
  });
  await sleep(250);
  const hpBeforeLeech = Number((await snapshot(bloodPage)).hp);
  await bloodPage.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(550);
  const burned = await snapshot(bloodPage);
  check(
    'bloodflame target is burning before the kill',
    (burned.enemyList ?? []).some((enemy) => enemy.burning),
    JSON.stringify(burned.enemyList)
  );
  await bloodPage.evaluate(() => window.__RT_KILL_ALL__?.());
  await sleep(250);
  const hpAfterLeech = Number((await snapshot(bloodPage)).hp);
  check(
    'bloodflame heart heals on a burning kill',
    hpAfterLeech > hpBeforeLeech,
    `${hpBeforeLeech} -> ${hpAfterLeech}`
  );
  await bloodPage.close();

  const prismPage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await prismPage.goto(`${BASE}/?arena=1&horde=0&build=chain,blast,3,3`, { waitUntil: 'networkidle0' });
  await waitReady(prismPage);
  await prismPage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await enterRoom(prismPage);
  await sleep(500);
  await prismPage.evaluate(() => {
    window.__RT_FREEZE_ATTACK__?.();
    window.__RT_PURGE_ENEMIES__?.();
    window.__RT_RELIC__?.('prism');
    window.__RT_SPAWN_AT__?.('beetle', 400, 300);
    window.__RT_SPAWN_AT__?.('beetle', 410, 300);
    window.__RT_SPAWN_AT__?.('beetle', 405, 315);
  });
  await sleep(30);
  await prismPage.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(800);
  const prismState = await snapshot(prismPage);
  check(
    'rupture prism triggers from a multi-target blast',
    Number(prismState.prismTime) > 0,
    JSON.stringify({
      prismTime: prismState.prismTime,
      hits: prismState.lastExplosionHits,
      distances: prismState.lastExplosionDistances
    })
  );
  await prismPage.close();

  const flamePage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await flamePage.goto(`${BASE}/?arena=1&horde=0&build=pierce,burn,3,3`, { waitUntil: 'networkidle0' });
  await waitReady(flamePage);
  await flamePage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await enterRoom(flamePage);
  await sleep(500);
  await flamePage.evaluate(() => {
    window.__RT_FREEZE_ATTACK__?.();
    window.__RT_PURGE_ENEMIES__?.();
    window.__RT_ASCEND__?.('burn');
    window.__RT_SPAWN_AT__?.('beetle', 400, 300);
    window.__RT_SPAWN_AT__?.('beetle', 420, 300);
  });
  await sleep(250);
  await flamePage.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(500);
  const flameBurning = await snapshot(flamePage);
  const blastBefore = Number(flameBurning.blastDamageEvents);
  await flamePage.evaluate(() => window.__RT_KILL_ALL__?.());
  await sleep(300);
  const flameAfter = await snapshot(flamePage);
  check(
    'flame detonation adds blast damage on burning deaths',
    (flameBurning.enemyList ?? []).some((enemy) => enemy.burning) &&
      Number(flameAfter.blastDamageEvents) > blastBefore,
    JSON.stringify({ before: blastBefore, after: flameAfter.blastDamageEvents })
  );
  await flamePage.close();

  const frostPage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await frostPage.goto(`${BASE}/?arena=1&horde=0&build=pierce,frost,3,3`, { waitUntil: 'networkidle0' });
  await waitReady(frostPage);
  await frostPage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await enterRoom(frostPage);
  await sleep(500);
  await frostPage.evaluate(() => {
    window.__RT_FREEZE_ATTACK__?.();
    window.__RT_PURGE_ENEMIES__?.();
    window.__RT_ASCEND__?.('frost');
    window.__RT_SPAWN_AT__?.('sunder', 460, 300);
  });
  await sleep(250);
  let frozen = null;
  for (let hit = 0; hit < 8; hit += 1) {
    await frostPage.evaluate(() => window.__RT_VOLLEY__?.());
    await sleep(250);
    const sample = await snapshot(frostPage);
    frozen = (sample.enemyList ?? []).find((enemy) => enemy.kind === 'sunder') ?? frozen;
    if (frozen && Number(frozen.slow) >= 1) break;
  }
  check(
    'absolute zero freezes a target after four frost hits',
    Boolean(frozen) && Number(frozen.slow) >= 1,
    JSON.stringify(frozen)
  );
  await frostPage.close();

  const greedPage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await greedPage.goto(`${BASE}/?arena=1&horde=0&build=pierce,burn,3,3`, { waitUntil: 'networkidle0' });
  await waitReady(greedPage);
  await greedPage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await enterRoom(greedPage);
  await sleep(500);
  await greedPage.evaluate(() => {
    window.__RT_FREEZE_ATTACK__?.();
    window.__RT_PURGE_ENEMIES__?.();
    window.__RT_RELIC__?.('greed');
  });
  const greedBefore = await snapshot(greedPage);
  await greedPage.evaluate(() => window.__RT_DAMAGE__?.(10));
  await sleep(250);
  const greedAfter = await snapshot(greedPage);
  check(
    'greed pact raises damage dealt and taken by 20%',
    Math.abs(Number(greedBefore.relicDamageMultiplier) - 1.2) < 0.001 &&
      Number(greedBefore.hp) - Number(greedAfter.hp) === 12,
    JSON.stringify({
      multiplier: greedBefore.relicDamageMultiplier,
      hp: [greedBefore.hp, greedAfter.hp]
    })
  );
  await greedPage.close();

  const crownPage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await crownPage.goto(`${BASE}/?arena=1&horde=0&build=pierce,frost,3,3`, { waitUntil: 'networkidle0' });
  await waitReady(crownPage);
  await crownPage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await enterRoom(crownPage);
  await sleep(500);
  await crownPage.evaluate(() => {
    window.__RT_FREEZE_ATTACK__?.();
    window.__RT_PURGE_ENEMIES__?.();
    window.__RT_RELIC__?.('frost-crown');
    window.__RT_SPAWN_AT__?.('spore', 400, 500);
  });
  await sleep(150);
  await crownPage.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(450);
  const crownSlowed = await snapshot(crownPage);
  const crownBefore = Number(crownSlowed.hp);
  await crownPage.evaluate(() => window.__RT_DAMAGE_FROM__?.(10, 400, 500));
  await sleep(250);
  const crownAfter = await snapshot(crownPage);
  check(
    'frost crown reduces damage from a slowed source by 25%',
    (crownSlowed.enemyList ?? []).some((enemy) => enemy.slowed) &&
      crownBefore - Number(crownAfter.hp) === 8,
    JSON.stringify({ hp: [crownBefore, crownAfter.hp], enemies: crownSlowed.enemyList })
  );
  await crownPage.close();

  const domainPage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await domainPage.goto(`${BASE}/?arena=1&horde=0&build=chain,burn,3,1`, { waitUntil: 'networkidle0' });
  await waitReady(domainPage);
  await domainPage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await enterRoom(domainPage);
  await sleep(500);
  await domainPage.evaluate(() => {
    window.__RT_FREEZE_ATTACK__?.();
    window.__RT_PURGE_ENEMIES__?.();
    window.__RT_ASCEND__?.('chain');
    for (const [x, y] of [
      [400, 300],
      [450, 300],
      [500, 300],
      [400, 400],
      [450, 400],
      [500, 400]
    ]) {
      window.__RT_SPAWN_AT__?.('beetle', x, y);
    }
  });
  await sleep(250);
  await domainPage.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(450);
  await domainPage.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(1200);
  const domainState = await snapshot(domainPage);
  check(
    'thunder domain fires after six accumulated chain jumps',
    Number(domainState.thunderDomainCasts) >= 1,
    JSON.stringify({
      jumps: domainState.chainAscendJumps,
      casts: domainState.thunderDomainCasts
    })
  );
  await domainPage.close();

  const emberPage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await emberPage.goto(`${BASE}/?arena=1&horde=0&build=pierce,burn,3,3`, { waitUntil: 'networkidle0' });
  await waitReady(emberPage);
  await emberPage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await enterRoom(emberPage);
  await sleep(500);
  await emberPage.evaluate(() => {
    window.__RT_FREEZE_ATTACK__?.();
    window.__RT_PURGE_ENEMIES__?.();
    window.__RT_LATE__?.('ember-spread');
    window.__RT_SPAWN_AT__?.('beetle', 400, 300);
    window.__RT_SPAWN_AT__?.('sunder', 350, 200);
  });
  await sleep(150);
  await emberPage.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(800);
  const emberBurning = await snapshot(emberPage);
  await emberPage.evaluate(() => window.__RT_KILL_ONE__?.(0));
  await sleep(350);
  const emberAfter = await snapshot(emberPage);
  const emberTarget = (emberAfter.enemyList ?? []).find((enemy) => enemy.kind === 'sunder');
  check(
    'ember spread transfers burn on death',
    (emberBurning.enemyList ?? []).some(
      (enemy) => enemy.kind === 'beetle' && enemy.burning
    ) && Boolean(emberTarget?.burning),
    JSON.stringify({ before: emberBurning.enemyList, after: emberAfter.enemyList })
  );
  await emberPage.close();

  const echoPage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await echoPage.goto(`${BASE}/?arena=1&horde=0&build=chain,burn,3,3`, { waitUntil: 'networkidle0' });
  await waitReady(echoPage);
  await echoPage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await enterRoom(echoPage);
  await sleep(500);
  await echoPage.evaluate(() => {
    window.__RT_FREEZE_ATTACK__?.();
    window.__RT_PURGE_ENEMIES__?.();
    window.__RT_LATE__?.('rift-echo');
    window.__RT_SPAWN_AT__?.('beetle', 400, 300);
    window.__RT_SPAWN_AT__?.('beetle', 450, 300);
  });
  await sleep(150);
  await echoPage.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(950);
  const echoState = await snapshot(echoPage);
  check(
    'rift echo fires a secondary impact after the chain',
    Number(echoState.riftEchoCasts) >= 1,
    String(echoState.riftEchoCasts)
  );
  await echoPage.close();

  const ringPage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await ringPage.goto(`${BASE}/?arena=1&horde=0&build=pierce,frost,3,3`, { waitUntil: 'networkidle0' });
  await waitReady(ringPage);
  await ringPage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await enterRoom(ringPage);
  await sleep(500);
  await ringPage.evaluate(() => {
    window.__RT_FREEZE_ATTACK__?.();
    window.__RT_PURGE_ENEMIES__?.();
    window.__RT_LATE__?.('frost-ring');
    window.__RT_SPAWN_AT__?.('spore', 400, 500);
  });
  await sleep(150);
  await ringPage.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(600);
  const ringState = await snapshot(ringPage);
  check(
    'frost ring leaves a slowing field',
    Number(ringState.slowFields) >= 1,
    String(ringState.slowFields)
  );
  await ringPage.close();

  const momentumPage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await momentumPage.goto(`${BASE}/?arena=1&horde=0&build=pierce,burn,3,3`, { waitUntil: 'networkidle0' });
  await waitReady(momentumPage);
  await momentumPage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await enterRoom(momentumPage);
  await sleep(500);
  await momentumPage.evaluate(() => {
    window.__RT_FREEZE_ATTACK__?.();
    window.__RT_PURGE_ENEMIES__?.();
    window.__RT_LATE__?.('pierce-momentum');
    window.__RT_SPAWN_AT__?.('spore', 400, 300);
    window.__RT_SPAWN_AT__?.('spore', 450, 200);
    window.__RT_SPAWN_AT__?.('spore', 500, 100);
  });
  await sleep(150);
  await momentumPage.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(1000);
  const momentumState = await snapshot(momentumPage);
  check(
    'pierce momentum banks extra penetration for the next attack',
    Number(momentumState.pierceMomentum) >= 1,
    String(momentumState.pierceMomentum)
  );
  await momentumPage.close();

  const thirdPage = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await thirdPage.goto(`${BASE}/?arena=1&horde=0&build=chain,burn,3,3`, { waitUntil: 'networkidle0' });
  await waitReady(thirdPage);
  await thirdPage.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await enterRoom(thirdPage);
  await sleep(500);
  await thirdPage.evaluate(() => {
    window.__RT_FREEZE_ATTACK__?.();
    window.__RT_PURGE_ENEMIES__?.();
    window.__RT_SET_THIRD__?.('frost', 3);
    window.__RT_SPAWN_AT__?.('spore', 400, 500);
  });
  await sleep(180);
  await thirdPage.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(600);
  const thirdImpact = await snapshot(thirdPage);
  const thirdEnemy = (thirdImpact.enemyList ?? []).find((enemy) => enemy.kind === 'spore');
  const thirdHud = await thirdPage.evaluate(() => ({
    count: document.getElementById('build-count')?.textContent,
    slot: document.getElementById('slot-secondary-name')?.textContent
  }));
  check(
    'third impact rule applies alongside the main impact',
    Boolean(thirdEnemy?.burning && thirdEnemy?.slowed) &&
      thirdHud.count === '等级 9 / 9' &&
      thirdHud.slot === '冰霜',
    JSON.stringify({ thirdEnemy, thirdHud })
  );

  await thirdPage.evaluate(() => window.__RT_SWAP__?.());
  await sleep(200);
  const afterSwap = await snapshot(thirdPage);
  check(
    'forgotten idol swap preserves the third rule',
    afterSwap.build?.secondary?.key === 'frost' &&
      Number(afterSwap.build?.secondary?.level) === 3,
    JSON.stringify(afterSwap.build)
  );

  await thirdPage.evaluate(() => {
    window.__RT_SET_BUILD__?.('chain', 'burn', 3, 3);
    window.__RT_SET_THIRD__?.('frost', 3);
  });
  const reforgeResults = await thirdPage.evaluate(() => [
    window.__RT_REFORGE__?.('blast') ?? false,
    window.__RT_REFORGE__?.('spread') ?? false,
    window.__RT_REFORGE__?.('frost') ?? false,
    window.__RT_SNAPSHOT__?.().reforgeLeft ?? -1,
    window.__RT_SNAPSHOT__?.().build ?? null
  ]);
  check(
    'full build can reforge twice but no more',
    reforgeResults[0] === true &&
      reforgeResults[1] === true &&
      reforgeResults[2] === false &&
      Number(reforgeResults[3]) === 0 &&
      reforgeResults[4]?.trajectory?.key === 'chain' &&
      reforgeResults[4]?.impact?.key === 'burn' &&
      reforgeResults[4]?.secondary?.key === 'spread' &&
      Number(reforgeResults[4]?.secondary?.level) === 1,
    JSON.stringify(reforgeResults)
  );

  await thirdPage.evaluate(() => {
    window.__RT_SET_THIRD__?.('spread', 3);
    window.__RT_SPAWN_AT__?.('spore', 450, 300);
  });
  await sleep(150);
  await thirdPage.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(600);
  const thirdTrajectory = await snapshot(thirdPage);
  check(
    'third trajectory rule fires an additional volley',
    Number(thirdTrajectory.thirdVolleys) >= 1,
    JSON.stringify({ thirdVolleys: thirdTrajectory.thirdVolleys, secondary: thirdTrajectory.build?.secondary })
  );
  await thirdPage.close();

  const compact = await newPage(browser, {
    width: 360,
    height: 640,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true
  });
  await compact.goto(`${BASE}/?arena=1&horde=0`, { waitUntil: 'networkidle0' });
  await waitReady(compact);
  await compact.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(450);
  const compactMeasure = await compact.evaluate(() => {
    const card = document.querySelector('#room-screen .altar-card');
    const rect = card.getBoundingClientRect();
    return {
      h: Math.round(rect.height),
      vh: window.innerHeight,
      scrollable: getComputedStyle(card).overflowY === 'auto' || card.scrollHeight <= card.clientHeight + 1,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1
    };
  });
  check(
    'compact portrait (360x640) room preview fits or scrolls',
    compactMeasure.h <= compactMeasure.vh + 1 && compactMeasure.scrollable && !compactMeasure.overflowX,
    JSON.stringify(compactMeasure)
  );
  await compact.close();

  const landscape = await newPage(browser, {
    width: 844,
    height: 390,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true
  });
  await landscape.goto(`${BASE}/?arena=1&horde=0`, { waitUntil: 'networkidle0' });
  await waitReady(landscape);
  await landscape.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(500);
  const measureCard = async (target, selector) =>
    target.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        h: Math.round(rect.height),
        w: Math.round(rect.width),
        vh: window.innerHeight,
        vw: window.innerWidth,
        clipped: el.scrollHeight > el.clientHeight + 1
      };
    }, selector);

  const landRoom = await measureCard(landscape, '#room-screen .altar-card');
  check(
    'landscape room preview fits the viewport',
    Boolean(landRoom) && landRoom.h <= landRoom.vh + 1 && landRoom.w <= landRoom.vw + 1,
    JSON.stringify(landRoom)
  );
  await landscape.tap('#room-enter-btn');
  await sleep(500);
  await landscape.evaluate(() => window.__RT_SET_BUILD__?.('chain', 'blast', 2, 1));
  await landscape.evaluate(() => window.__RT_SCENE__?.debugOpenReward());
  await landscape.waitForFunction(() => !document.getElementById('altar-screen')?.hidden, { timeout: 6000 });
  await sleep(350);
  const landReward = await measureCard(landscape, '#altar-screen .altar-card');
  check(
    'landscape reward overlay fits the viewport',
    Boolean(landReward) && landReward.h <= landReward.vh + 1 && landReward.w <= landReward.vw + 1,
    JSON.stringify(landReward)
  );
  await landscape.evaluate(() => document.querySelector('#rule-offers .rule-card')?.click());
  await sleep(450);
  const landRoute = await measureCard(landscape, '#route-screen .altar-card');
  check(
    'landscape route overlay fits the viewport',
    Boolean(landRoute) && landRoute.h <= landRoute.vh + 1 && landRoute.w <= landRoute.vw + 1,
    JSON.stringify(landRoute)
  );
  await landscape.close();

  const maxed = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await maxed.goto(`${BASE}/?arena=1&horde=0`, { waitUntil: 'networkidle0' });
  await waitReady(maxed);
  await maxed.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(400);
  await maxed.tap('#room-enter-btn');
  await sleep(500);
  await maxed.evaluate(() => window.__RT_SET_BUILD__?.('pierce', 'blast', 3, 3));
  await maxed.evaluate(() => window.__RT_SCENE__?.debugOpenReward());
  await maxed.waitForFunction(() => !document.getElementById('altar-screen')?.hidden, { timeout: 6000 });
  await sleep(300);
  const maxedReward = await maxed.evaluate(() =>
    Array.from(document.querySelectorAll('#rule-offers .rule-card')).map((card) => card.dataset.kind)
  );
  check(
    'fully maxed build is offered supports only',
    maxedReward.length > 0 && maxedReward.every((kind) => kind === 'support'),
    JSON.stringify(maxedReward)
  );
  await maxed.close();

  const maxedEvent = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await maxedEvent.goto(`${BASE}/?arena=1&horde=0&build=spread,burn,3,3`, { waitUntil: 'networkidle0' });
  await waitReady(maxedEvent);
  await maxedEvent.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(300);
  await maxedEvent.tap('#room-enter-btn');
  await sleep(320);
  await maxedEvent.evaluate(() => window.__RT_OPEN_EVENT__?.('blood-altar'));
  await maxedEvent.waitForFunction(() => !document.getElementById('event-screen')?.hidden, { timeout: 6000 });
  const altarOptions = await maxedEvent.$$eval('#event-options .event-option', (cards) =>
    cards.map((card) => card.textContent ?? '')
  );
  check(
    'maxed blood altar rewrites its offer to a heal',
    /接受祭坛的馈赠/.test(altarOptions[0] ?? '') &&
      /回复 20 生命/.test(altarOptions[0] ?? ''),
    JSON.stringify(altarOptions)
  );
  const beforeAltar = await snapshot(maxedEvent);
  await maxedEvent.evaluate(() =>
    document.querySelectorAll('#event-options .event-option')[0]?.click()
  );
  await sleep(350);
  const afterAltar = await snapshot(maxedEvent);
  check(
    'maxed blood altar heals without charging or upgrading',
    Number(afterAltar.hp) >= Number(beforeAltar.hp) &&
      afterAltar.build?.trajectory?.level === 3 &&
      afterAltar.build?.impact?.level === 3,
    JSON.stringify({ hp: [beforeAltar.hp, afterAltar.hp], build: afterAltar.build })
  );
  await maxedEvent.close();

  const mobile = await newPage(browser, {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true
  });
  await mobile.goto(`${BASE}/?arena=1&horde=0`, { waitUntil: 'networkidle0' });
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
  check('mobile codex renders room enemies', (await mobile.$$('#codex-list .codex-row')).length === 1);

  await mobile.tap('#pause-btn');
  await sleep(280);
  const mobilePause = await mobile.evaluate(() => {
    const card = document.querySelector('.pause-card');
    const actions = document.querySelector('.pause-actions');
    const rect = card?.getBoundingClientRect();
    return {
      fits: Boolean(rect && rect.height <= window.innerHeight + 1 && rect.width <= window.innerWidth + 1),
      buttons: actions?.children.length ?? 0,
      overflow: actions ? actions.scrollWidth > actions.clientWidth + 1 : true
    };
  });
  check(
    'mobile pause menu fits with three actions',
    mobilePause.fits && mobilePause.buttons === 3 && !mobilePause.overflow,
    JSON.stringify(mobilePause)
  );
  await mobile.tap('#resume-btn');
  await sleep(280);

  const mobileBefore = Number((await snapshot(mobile)).playerX);
  const joyBox = await mobile.$eval('#joystick', (el) => {
    const rect = el.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
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
  check(
    'virtual joystick moves the player',
    mobileMoved,
    `${mobileBefore.toFixed(1)} -> ${Number((await snapshot(mobile)).playerX).toFixed(1)}`
  );

  await mobile.tap('#dash-btn');
  const mobileDashed = await poll(
    mobile,
    () => (window.__RT_SNAPSHOT__?.().dashCooldown ?? 0) > 3,
    5000
  );
  check('mobile dash button works', mobileDashed);

  await poll(mobile, () => (window.__RT_SNAPSHOT__?.().dashCooldown ?? 1) === 0, 8000);
  const touchPoints = await mobile.evaluate(() => {
    const centre = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    };
    return { joy: centre('#joystick'), dash: centre('#dash-btn') };
  });
  const beforeMulti = await snapshot(mobile);
  const cdp = await mobile.target().createCDPSession();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: touchPoints.joy.x, y: touchPoints.joy.y, id: 1 },
      { x: touchPoints.dash.x, y: touchPoints.dash.y, id: 2 }
    ]
  });
  await sleep(120);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: touchPoints.joy.x + 34, y: touchPoints.joy.y, id: 1 },
      { x: touchPoints.dash.x, y: touchPoints.dash.y, id: 2 }
    ]
  });
  await sleep(650);
  const afterMulti = await snapshot(mobile);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check(
    'multi-touch moves and dashes at the same time',
    Number(afterMulti.playerX) > Number(beforeMulti.playerX) + 8 &&
      Number(afterMulti.dashCooldown) > 3,
    JSON.stringify({
      x: [Number(beforeMulti.playerX), Number(afterMulti.playerX)],
      dashCooldown: Number(afterMulti.dashCooldown)
    })
  );

  const mobileQuota = Number((await snapshot(mobile)).roomQuota);
  await mobile.evaluate((value) => window.__RT_SET_ROOM_KILLS__?.(value), mobileQuota - 1);
  await mobile.evaluate(() => window.__RT_SPAWN__?.('beetle'));
  await sleep(760);
  await mobile.evaluate(() => window.__RT_KILL_ALL__?.());
  const mobileReward = await poll(mobile, () => !document.getElementById('altar-screen')?.hidden, 8000);
  check('mobile reward screen opens', mobileReward);
  const mobileCards = await mobile.evaluate(() => ({
    count: document.querySelectorAll('#rule-offers .rule-card').length,
    overflow: document.documentElement.scrollWidth <= window.innerWidth + 1
  }));
  check('mobile reward cards fit', mobileCards.count === 3 && mobileCards.overflow, JSON.stringify(mobileCards));
  await mobile.evaluate(() => document.querySelector('#rule-offers .rule-card')?.click());
  await sleep(400);
  const mobileRoute = await mobile.evaluate(() => ({
    route: !document.getElementById('route-screen')?.hidden,
    options: document.querySelectorAll('#route-options .route-option').length,
    overflow: document.documentElement.scrollWidth <= window.innerWidth + 1
  }));
  check(
    'mobile reward choice opens the route choice',
    mobileRoute.route && mobileRoute.options === 2 && mobileRoute.overflow,
    JSON.stringify(mobileRoute)
  );
  await mobile.evaluate(() => document.querySelector('#route-options .route-option')?.click());
  await sleep(450);
  check(
    'mobile route choice advances to a room preview',
    await mobile.$eval('#room-screen', (el) => !el.hidden)
  );
  await mobile.close();

  check(
    'no scene pause/resume warnings',
    warnings.every((text) => !/Cannot (pause|resume)/.test(text)),
    warnings.filter((text) => /Cannot (pause|resume)/.test(text)).join(' | ')
  );
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
