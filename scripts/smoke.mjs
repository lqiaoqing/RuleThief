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
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
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
  check('preview shows room 1 of 13', /ROOM 01 \/ 13/.test(overlay.roomKicker ?? ''), overlay.roomKicker);
  check(
    'preview shows the room name and quota',
    overlay.roomTitle === '训戒前庭' && overlay.roomQuota === '10',
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
      roomHud.roomTotal === '/ 13' &&
      roomHud.objective === '0 / 10' &&
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

  await page.evaluate(() => window.__RT_SET_BUILD__?.('chain', 'burn', 2, 2));
  await sleep(150);
  await page.evaluate(() => window.__RT_VOLLEY__?.());
  await sleep(900);
  const beforeStatus = await snapshot(page);
  const burningBefore = (beforeStatus.enemyList ?? []).filter((enemy) => enemy.burning).length;
  await page.evaluate(() => window.__RT_SET_BUILD__?.('chain', 'frost', 2, 2));
  await sleep(150);
  const afterStatus = await snapshot(page);
  check(
    'switching impact clears burning and slowed enemies',
    burningBefore > 0 &&
      (afterStatus.enemyList ?? []).every((enemy) => !enemy.burning && !enemy.slowed),
    JSON.stringify({
      burningBefore,
      burningAfter: (afterStatus.enemyList ?? []).filter((enemy) => enemy.burning).length
    })
  );
  await page.evaluate(() => window.__RT_KILL_ALL__?.());
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

  const countKind = (state, kind) => Number((state.enemyCounts ?? {})[kind] ?? 0);
  for (const kind of ['spore', 'slime', 'wisp', 'bomber']) {
    const beforeState = await snapshot(page);
    const before = countKind(beforeState, kind);
    await page.evaluate((k) => window.__RT_SPAWN_AT__?.(k, 560, 360), kind);
    await sleep(300);
    const afterState = await snapshot(page);
    const after = countKind(afterState, kind);
    check(
      `spawns ${kind}`,
      after === before + 1,
      `${kind} ${before} -> ${after} all=${JSON.stringify(afterState.enemyCounts)}`
    );
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

  await finishRoom(page, Number((await snapshot(page)).roomQuota));
  const firstReward = await overlayState(page);
  check('room 1 opens rewards', firstReward.rewardVisible, JSON.stringify({ cards: firstReward.cards.length }));
  await page.evaluate(() => document.querySelector('#rule-offers .rule-card')?.click());
  await sleep(420);

  const planInfo = await snapshot(page);
  check(
    'run plan has thirteen steps',
    Array.isArray(planInfo.plan) && planInfo.plan.length === 13,
    String(planInfo.plan?.length)
  );
  const planNodes = (planInfo.plan ?? []).reduce(
    (sum, step) => sum + (step.kind === 'choice' ? step.options.length : 1),
    0
  );
  check('plan exposes eighteen nodes', planNodes === 18, String(planNodes));
  const planEvents = (planInfo.plan ?? [])
    .filter((step) => step.kind === 'encounter' && EVENT_IDS.includes(step.encounter))
    .map((step) => step.encounter);
  check(
    'plan contains two distinct events',
    planEvents.length === 2 && new Set(planEvents).size === 2,
    JSON.stringify(planEvents)
  );
  check(
    'plan contains five branching steps',
    (planInfo.plan ?? []).filter((step) => step.kind === 'choice').length === 5,
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
      if (/ROOM 13 \/ 13/.test(view.roomKicker ?? '')) {
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
  check('run entered ten combat rooms', roomsEntered === 10, String(roomsEntered));
  check('boss preview reached', Boolean(bossPreview), bossPreview?.roomKicker);

  check(
    'boss room preview opens',
    Boolean(bossPreview) && /ROOM 13 \/ 13/.test(bossPreview.roomKicker ?? ''),
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
    6000
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
    const released = await poll(page, () => !window.__RT_SNAPSHOT__?.().sealSlot, 7000);
    check('sealed rule is restored automatically', released);

    // second seal: walk out of the telegraph and stay unsealed
    let zone = null;
    for (let tick = 0; tick < 90; tick += 1) {
      await page.evaluate(() => window.__RT_HEAL__?.(40));
      const sample = await snapshot(page);
      if (sample.sealZone) {
        zone = sample.sealZone;
        break;
      }
      await sleep(160);
    }
    check('boss telegraphs the next seal zone', Boolean(zone), JSON.stringify(zone));
    if (zone) {
      const current = await snapshot(page);
      const dx = Number(current.playerX) - Number(zone.x);
      const dy = Number(current.playerY) - Number(zone.y);
      const key =
        Math.abs(dx) < 5 && Math.abs(dy) < 5
          ? 'KeyD'
          : Math.abs(dx) > Math.abs(dy)
            ? dx >= 0
              ? 'KeyD'
              : 'KeyA'
            : dy >= 0
              ? 'KeyS'
              : 'KeyW';
      await page.keyboard.down(key);
      await sleep(1500);
      await page.keyboard.up(key);
      const dodged = await snapshot(page);
      const distanceFromZone = Math.hypot(
        Number(dodged.playerX) - Number(zone.x),
        Number(dodged.playerY) - Number(zone.y)
      );
      check(
        'avoiding the seal zone prevents the seal',
        !dodged.sealSlot &&
          distanceFromZone > Number(zone.radius) + 20 &&
          Number(dodged.bossHp) > 0,
        JSON.stringify({
          zone,
          sealSlot: dodged.sealSlot,
          distance: Math.round(distanceFromZone),
          bossHp: dodged.bossHp
        })
      );
    }
  }

  await page.evaluate(() => window.__RT_DAMAGE_BOSS__?.(900));
  await page.waitForFunction(() => !document.getElementById('result-screen')?.hidden, { timeout: 9000 });
  const bossVictory = await page.evaluate(() => ({
    title: document.getElementById('result-title')?.textContent,
    rooms: document.getElementById('result-rooms')?.textContent,
    bossBarHidden: document.getElementById('boss-bar')?.hidden
  }));
  check('killing the arbiter wins the run', bossVictory.title === '审判完成', JSON.stringify(bossVictory));
  const leftover = await snapshot(page);
  check(
    'boss death clears the summoned adds',
    Number(leftover.enemies) === 0,
    String(leftover.enemies)
  );
  check('boss victory reports thirteen steps', bossVictory.rooms === '13 / 13', String(bossVictory.rooms));
  check('boss bar hides after the kill', bossVictory.bossBarHidden === true, String(bossVictory.bossBarHidden));

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
  check('restart resets the HUD and codex', roomHud.roomNum === '01' && roomHud.objective === '0 / 10' && roomHud.codexRows === 1, JSON.stringify(roomHud));

  await enterRoom(page);
  await page.evaluate(() => window.__RT_DAMAGE__?.(500));
  await page.waitForFunction(() => !document.getElementById('result-screen')?.hidden, { timeout: 6000 });
  const defeat = await page.evaluate(() => ({
    title: document.getElementById('result-title')?.textContent,
    cls: document.getElementById('result-screen')?.className,
    rooms: document.getElementById('result-rooms')?.textContent
  }));
  check('death shows the defeat result', defeat.title === '规则耗尽' && defeat.cls.includes('is-defeat'), JSON.stringify(defeat));
  check('defeat reports zero rooms cleared', defeat.rooms === '0 / 13', String(defeat.rooms));

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
  await page.click('#resume-btn');
  await sleep(220);
  check('pause overlay hidden after resume', await page.$eval('#pause-screen', (el) => el.hidden));

  check('desktop no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.close();

  const buildPreset = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await buildPreset.goto(`${BASE}/?arena=1&build=spread,burn,3,3`, { waitUntil: 'networkidle0' });
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

  const bossPractice = await newPage(browser, { width: 1280, height: 800, deviceScaleFactor: 1 });
  await bossPractice.goto(`${BASE}/?arena=1&boss=1`, { waitUntil: 'networkidle0' });
  await waitReady(bossPractice);
  await bossPractice.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(400);
  const bossPreviewKicker = await bossPractice.$eval('#room-kicker', (el) => el.textContent);
  check('boss practice jumps to room 13', /ROOM 13 \/ 13/.test(bossPreviewKicker ?? ''), String(bossPreviewKicker));
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
  await bossPractice.close();

  const compact = await newPage(browser, {
    width: 360,
    height: 640,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true
  });
  await compact.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
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
  await landscape.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
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
  await maxed.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
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

  await sleep(4300);
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
