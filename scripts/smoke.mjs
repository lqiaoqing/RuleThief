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
  { name: '训戒前庭', en: 'ANTECHAMBER', quota: 8, elite: false },
  { name: '余烬苗圃', en: 'EMBER NURSERY', quota: 10, elite: false },
  { name: '孢子温室', en: 'SPORE VAULT', quota: 12, elite: false },
  { name: '回声回廊', en: 'ECHO GALLERY', quota: 14, elite: false },
  { name: '裂甲竞技场', en: 'SUNDER PIT', quota: 9, elite: true },
  { name: '雷暴祭坛', en: 'THUNDER ALTAR', quota: 10, elite: true },
  { name: '审判庭', en: 'JUDGEMENT HALL', quota: 1, elite: false, boss: true }
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
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await waitReady(page);
  await sleep(350);

  check('menu visible on load', await page.$eval('#menu', (el) => !el.hidden));
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
  check('preview shows room 1 of 7', /ROOM 01 \/ 07/.test(overlay.roomKicker ?? ''), overlay.roomKicker);
  check('preview shows the room name and quota', overlay.roomTitle === ROOMS[0].name && overlay.roomQuota === '8', `${overlay.roomTitle} / ${overlay.roomQuota}`);
  check('preview pauses the run', overlay.paused, String(overlay.paused));
  check('preview lists the room enemies', overlay.enemyChips === 1, String(overlay.enemyChips));
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
      roomHud.roomTotal === '/ 07' &&
      roomHud.objective === '0 / 8' &&
      roomHud.objectiveLabel === ROOMS[0].en &&
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
  for (const kind of ['spore', 'slime', 'wisp', 'bomber']) {
    const before = Number((await snapshot(page)).enemies);
    await page.evaluate((k) => window.__RT_SPAWN_AT__?.(k, 560, 360), kind);
    await sleep(260);
    const after = Number((await snapshot(page)).enemies);
    check(`spawns ${kind}`, after > before, `${before} -> ${after}`);
  }
  const hazardSeen = await poll(page, () => (window.__RT_SNAPSHOT__?.().hazards ?? 0) > 0, 7000);
  check('slime leaves burning ground', hazardSeen);

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

  const cleared = await finishRoom(page, ROOMS[0].quota);
  overlay = await overlayState(page);
  check('clearing the quota opens rewards', cleared && overlay.rewardVisible, JSON.stringify({ cleared, visible: overlay.rewardVisible }));
  check('normal room offers three cards', overlay.cards.length === 3, String(overlay.cards.length));
  check(
    'room 1 only offers the rule its enemy carries',
    overlay.cards.filter((card) => card.kind === 'rule').every((card) => card.key === 'pierce'),
    JSON.stringify(overlay.cards)
  );

  await pickFirstCard(page);
  state = await snapshot(page);
  overlay = await overlayState(page);
  check('picking pierce equips the trajectory slot', state.build?.trajectory?.key === 'pierce', JSON.stringify(state.build));
  check('next room preview follows the reward', overlay.roomVisible && /ROOM 02 \/ 07/.test(overlay.roomKicker ?? ''), overlay.roomKicker);
  roomHud = await hud(page);
  check('codex switches to the new room enemies', roomHud.codexRows === 2, String(roomHud.codexRows));

  for (let index = 1; index < ROOMS.length - 1; index += 1) {
    const room = ROOMS[index];
    const preview = await overlayState(page);
    if (room.elite) {
      check(`room ${index + 1} preview marks the elite`, preview.eliteChips >= 1, String(preview.eliteChips));
    }

    await enterRoom(page);
    await sleep(200);
    const roomState = await snapshot(page);
    check(
      `room ${index + 1} loads (${room.name})`,
      roomState.roomIndex === index && roomState.roomQuota === room.quota,
      JSON.stringify({ roomIndex: roomState.roomIndex, quota: roomState.roomQuota })
    );
    if (index === 1) {
      check(
        'switching rooms clears bolts and enemies',
        Number(roomState.bolts) === 0 && Number(roomState.enemies) === 0,
        JSON.stringify({ bolts: roomState.bolts, enemies: roomState.enemies })
      );
    }
    if (room.elite) {
      check(
        `room ${index + 1} spawns its elite leader`,
        Number(roomState.eliteAlive) === 1,
        String(roomState.eliteAlive)
      );
    }

    await finishRoom(page, room.quota);
    overlay = await overlayState(page);
    check(`room ${index + 1} reward screen opens`, overlay.rewardVisible, JSON.stringify({ cards: overlay.cards.length }));
    if (room.elite) {
      check(`elite room ${index + 1} offers four rewards`, overlay.cards.length === 4, String(overlay.cards.length));
    } else {
      check(`room ${index + 1} offers three rewards`, overlay.cards.length === 3, String(overlay.cards.length));
    }

    const mutationCards = overlay.cards.filter((card) => card.kind === 'mutation');
    const mutationBefore = (await snapshot(page)).mutation;
    if (mutationBefore) {
      check(`room ${index + 1} stops offering mutations once equipped`, mutationCards.length === 0, String(mutationCards.length));
    } else if (room.elite) {
      check(`elite room ${index + 1} guarantees a mutation`, mutationCards.length === 1, String(mutationCards.length));
    } else {
      check(`room ${index + 1} offers no mutation`, mutationCards.length === 0, String(mutationCards.length));
    }

    if (mutationCards.length) {
      const mutationIndex = overlay.cards.findIndex((card) => card.kind === 'mutation');
      await page.evaluate((slot) => window.__RT_PICK_REWARD__?.(slot), mutationIndex);
      await sleep(380);
      const afterMutation = await snapshot(page);
      const mutationHud = await page.evaluate(() => ({
        visible: !document.getElementById('mutation-line')?.hidden,
        name: document.getElementById('mutation-name')?.textContent
      }));
      check(
        `elite room ${index + 1} mutation equips and shows in HUD`,
        Boolean(afterMutation.mutation) && mutationHud.visible && Boolean(mutationHud.name),
        JSON.stringify({ mutation: afterMutation.mutation, hud: mutationHud })
      );
    } else {
      await pickFirstCard(page);
    }
    const nextOverlay = await overlayState(page);
    check(
      `room ${index + 1} reward applies and the next room opens`,
      nextOverlay.roomVisible,
      JSON.stringify({ room: nextOverlay.roomKicker })
    );
    check(
      `room ${index + 2} preview lists enemies`,
      nextOverlay.enemyChips >= 1,
      String(nextOverlay.enemyChips)
    );
  }

  const bossPreview = await overlayState(page);
  check(
    'boss room preview opens',
    bossPreview.roomVisible && /ROOM 07 \/ 07/.test(bossPreview.roomKicker ?? ''),
    bossPreview.roomKicker
  );
  check('boss preview lists the arbiter', bossPreview.enemyChips >= 1, String(bossPreview.enemyChips));

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

  await page.evaluate(() => window.__RT_DAMAGE_BOSS__?.(600));
  await sleep(700);
  bossState = await snapshot(page);
  check('boss enters phase 3 below 35%', bossState.bossPhase === 3, JSON.stringify({ phase: bossState.bossPhase, hp: bossState.bossHp }));

  const sealSeen = await poll(page, () => Boolean(window.__RT_SNAPSHOT__?.().sealSlot), 9000);
  check('phase 3 telegraphs and seals a rule', sealSeen);

  await page.evaluate(() => window.__RT_DAMAGE_BOSS__?.(900));
  await page.waitForFunction(() => !document.getElementById('result-screen')?.hidden, { timeout: 9000 });
  const bossVictory = await page.evaluate(() => ({
    title: document.getElementById('result-title')?.textContent,
    rooms: document.getElementById('result-rooms')?.textContent,
    bossBarHidden: document.getElementById('boss-bar')?.hidden
  }));
  check('killing the arbiter wins the run', bossVictory.title === '审判完成', JSON.stringify(bossVictory));
  check('boss victory reports seven rooms', bossVictory.rooms === '7 / 7', String(bossVictory.rooms));
  check('boss bar hides after the kill', bossVictory.bossBarHidden === true, String(bossVictory.bossBarHidden));

  const finalStats = await page.evaluate(() => ({
    combo: document.getElementById('result-combo-name')?.textContent,
    time: document.getElementById('result-time')?.textContent
  }));
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
  check('restart resets the HUD and codex', roomHud.roomNum === '01' && roomHud.objective === '0 / 8' && roomHud.codexRows === 1, JSON.stringify(roomHud));

  await enterRoom(page);
  await page.evaluate(() => window.__RT_DAMAGE__?.(500));
  await page.waitForFunction(() => !document.getElementById('result-screen')?.hidden, { timeout: 6000 });
  const defeat = await page.evaluate(() => ({
    title: document.getElementById('result-title')?.textContent,
    cls: document.getElementById('result-screen')?.className,
    rooms: document.getElementById('result-rooms')?.textContent
  }));
  check('death shows the defeat result', defeat.title === '规则耗尽' && defeat.cls.includes('is-defeat'), JSON.stringify(defeat));
  check('defeat reports zero rooms cleared', defeat.rooms === '0 / 7', String(defeat.rooms));

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
  check('mobile codex renders room enemies', (await mobile.$$('#codex-list .codex-row')).length === 1);

  await mobile.evaluate(() => window.__RT_SET_ROOM_KILLS__?.(8));
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
