import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error('No Chrome or Edge executable found.');

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4176';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SAMPLE_MS = Number(process.env.SAMPLE_MS ?? 5000);
const SAMPLES = Number(process.env.SAMPLES ?? 2);

const COMBOS = [];
for (const trajectory of ['pierce', 'chain', 'spread']) {
  for (const impact of ['burn', 'frost', 'blast']) {
    COMBOS.push([trajectory, impact]);
  }
}

const browser = await puppeteer.launch({
  executablePath,
  headless: false,
  args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required']
});

try {
  const page = await browser.newPage();
  await page.bringToFront();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/?arena=1&horde=0`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__RT_READY__ === true', { timeout: 20_000 });
  await page.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(400);
  await page.evaluate(() => window.__RT_ENTER_ROOM__?.());
  await sleep(600);

  const rows = [];
  for (const [trajectory, impact] of COMBOS) {
    const third = impact === 'frost' ? 'blast' : 'frost';
    const samples = [];
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      await page.evaluate(() => {
        window.__RT_KILL_ALL__?.();
        window.__RT_SET_ROOM_KILLS__?.(0);
      });
      await page.evaluate(() => window.__RT_SET_BUILD__?.(null, null, 1, 1));
      await sleep(120);
      await page.evaluate(() => window.__RT_HEAL__?.(100));
      for (const [x, y] of [[540, 380], [660, 430], [600, 540]]) {
        await page.evaluate(([px, py]) => window.__RT_SPAWN_AT__?.('sunder', px, py), [x, y]);
      }
      await page.evaluate(() => window.__RT_SET_ROOM_KILLS__?.(0));
      await page.evaluate(([t, i]) => window.__RT_SET_BUILD__?.(t, i, 3, 3), [trajectory, impact]);
      await page.evaluate(() => window.__RT_SET_BUILD__?.(null, null, 1, 1));
      await page.evaluate(([t, i]) => window.__RT_SET_BUILD__?.(t, i, 3, 3), [trajectory, impact]);
      await page.evaluate((key) => window.__RT_SET_THIRD__?.(key, 3), third);
      await sleep(200);
      const before = await page.evaluate(() => window.__RT_SNAPSHOT__?.().damageDealt ?? 0);
      const ticks = Math.ceil(SAMPLE_MS / 500);
      for (let tick = 0; tick < ticks; tick += 1) {
        await sleep(500);
        await page.evaluate(() => window.__RT_HEAL__?.(40));
      }
      const after = await page.evaluate(() => {
        const snap = window.__RT_SNAPSHOT__?.() ?? {};
        return { dealt: snap.damageDealt ?? 0, hp: snap.hp, enemies: snap.enemies, roomState: snap.roomState };
      });
      samples.push(Math.round(((Number(after.dealt) - Number(before)) / SAMPLE_MS) * 1000));
      await page.evaluate(() => window.__RT_SET_ROOM_KILLS__?.(0));
    }
    const avg = Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
    rows.push({ combo: `${trajectory}+${impact}+${third}`, samples, avgDps: avg });
    console.log(`${trajectory}+${impact}+${third}: samples=[${samples.join(', ')}] avg=${avg} dps`);
  }

  fs.writeFileSync('docs/combo-bench.json', JSON.stringify({ sampleMs: SAMPLE_MS, rows }, null, 2));
} finally {
  await browser.close();
}
