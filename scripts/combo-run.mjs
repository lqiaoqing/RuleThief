import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error('No Chrome or Edge executable found.');

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4176';
const LIMIT_MS = Number(process.env.LIMIT_MS ?? 75000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const COMBOS = [];
for (const trajectory of ['pierce', 'chain', 'spread']) {
  for (const impact of ['burn', 'frost', 'blast']) {
    COMBOS.push([trajectory, impact]);
  }
}

const PRESSED = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };

async function setKeys(page, want) {
  for (const key of Object.keys(PRESSED)) {
    if (want[key] && !PRESSED[key]) {
      await page.keyboard.down(key);
      PRESSED[key] = true;
    } else if (!want[key] && PRESSED[key]) {
      await page.keyboard.up(key);
      PRESSED[key] = false;
    }
  }
}

function decideMove(snapshot) {
  const px = Number(snapshot.playerX);
  const py = Number(snapshot.playerY);
  let fx = 0;
  let fy = 0;
  let nearest = Infinity;
  for (const enemy of snapshot.enemyList ?? []) {
    const dx = px - enemy.x;
    const dy = py - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    nearest = Math.min(nearest, dist - enemy.radius);
    const weight = dist < 220 ? (220 - dist) / 220 : 0;
    if (weight > 0) {
      fx += (dx / dist) * weight * 2.2;
      fy += (dy / dist) * weight * 2.2;
    }
  }
  fx += (400 - px) * 0.0016;
  fy += (440 - py) * 0.0016;
  if (px < 110) fx += 1.4;
  if (px > 690) fx -= 1.4;
  if (py < 130) fy += 1.4;
  if (py > 670) fy -= 1.4;
  return {
    want: { KeyW: fy < -0.25, KeyS: fy > 0.25, KeyA: fx < -0.25, KeyD: fx > 0.25 },
    nearest
  };
}

const browser = await puppeteer.launch({
  executablePath,
  headless: false,
  args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required']
});

const rows = [];
try {
  const only = process.env.ONLY;
  for (const [trajectory, impact] of COMBOS) {
    if (only && `${trajectory}+${impact}` !== only) continue;
    const page = await browser.newPage();
    await page.bringToFront();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/?arena=1&build=${trajectory},${impact},3,3`, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__RT_READY__ === true', { timeout: 25_000 });
    await page.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 12_000 });
    await sleep(350);
    await page.tap('#room-enter-btn');
    await sleep(450);
    const third = impact === 'frost' ? 'blast' : 'frost';
    await page.evaluate((key) => window.__RT_SET_THIRD__?.(key, 3), third);

    const started = Date.now();
    let cleared = false;
    let died = false;
    let lastSnapshot = null;
    let peakAlive = 0;
    for (let tick = 0; tick < 700; tick += 1) {
      const state = await page.evaluate(() => ({
        snapshot: window.__RT_SNAPSHOT__?.() ?? {},
        reward: !document.getElementById('altar-screen')?.hidden,
        result: !document.getElementById('result-screen')?.hidden
      }));
      lastSnapshot = state.snapshot;
      peakAlive = Math.max(peakAlive, Number(state.snapshot.alive ?? 0));
      if (state.reward) {
        cleared = true;
        break;
      }
      if (state.result) {
        died = true;
        break;
      }
      if (Date.now() - started > LIMIT_MS) break;
      const decision = decideMove(state.snapshot);
      await setKeys(page, decision.want);
      if (decision.nearest < 95 && Number(state.snapshot.dashCooldown) <= 0.05) {
        await page.keyboard.down('Space');
        await page.keyboard.up('Space');
      }
      await sleep(120);
    }
    await setKeys(page, { KeyW: false, KeyA: false, KeyS: false, KeyD: false });

    const row = {
      combo: `${trajectory}+${impact}+${third}`,
      cleared,
      died,
      seconds: Math.round((Date.now() - started) / 1000),
      hp: Math.round(Number(lastSnapshot?.hp ?? 0)),
      kills: Number(lastSnapshot?.kills ?? 0),
      roomKills: Number(lastSnapshot?.roomKills ?? 0),
      peakAlive,
      thirdVolleys: Number(lastSnapshot?.thirdVolleys ?? 0)
    };
    rows.push(row);
    console.log(
      `${row.combo}: ${row.cleared ? 'cleared' : row.died ? 'died' : 'timeout'} in ${row.seconds}s hp=${row.hp} kills=${row.kills}`
    );
    await page.close();
  }
  fs.writeFileSync('docs/combo-run.json', JSON.stringify({ limitMs: LIMIT_MS, rows }, null, 2));
} finally {
  await browser.close();
}
