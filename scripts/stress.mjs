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

const browser = await puppeteer.launch({
  executablePath,
  headless: false,
  args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required']
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__RT_READY__ === true', { timeout: 20_000 });
  await page.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 10_000 });
  await sleep(400);
  await page.evaluate(() => window.__RT_ENTER_ROOM__?.());
  await sleep(600);
  await page.evaluate(() => window.__RT_SET_BUILD__?.('spread', 'burn', 3, 3));

  await page.evaluate(() => {
    for (let i = 0; i < 40; i += 1) {
      const kind = ['beetle', 'bat', 'spore', 'slime', 'wisp', 'bomber'][i % 6];
      const x = 120 + ((i * 97) % 560);
      const y = 140 + ((i * 61) % 240);
      window.__RT_SPAWN_AT__?.(kind, x, y);
    }
  });
  await sleep(600);

  const samples = [];
  for (let i = 0; i < 10; i += 1) {
    await sleep(400);
    samples.push(
      await page.evaluate(() => {
        const snap = window.__RT_SNAPSHOT__?.() ?? {};
        return {
          fps: Math.round(window.__RT_GAME__?.loop.actualFps ?? 0),
          enemies: snap.enemies,
          bolts: snap.bolts,
          enemyBolts: snap.enemyBolts,
          numbers: snap.liveDamageNumbers,
          sparks: snap.liveHitSparks,
          hp: snap.hp
        };
      })
    );
  }

  const steady = samples.slice(3);
  const avg = steady.reduce((sum, row) => sum + row.fps, 0) / Math.max(1, steady.length);
  const peak = {
    enemies: Math.max(...samples.map((row) => row.enemies)),
    bolts: Math.max(...samples.map((row) => row.bolts)),
    enemyBolts: Math.max(...samples.map((row) => row.enemyBolts)),
    numbers: Math.max(...samples.map((row) => row.numbers)),
    sparks: Math.max(...samples.map((row) => row.sparks))
  };
  console.log(`stress fps avg=${avg.toFixed(1)} min=${Math.min(...steady.map((r) => r.fps))} peak=${JSON.stringify(peak)}`);
  console.log(`fps samples: ${steady.map((row) => row.fps).join(',')}`);
  console.log(`player hp samples: ${samples.map((row) => row.hp).join(',')}`);
} finally {
  await browser.close();
}
