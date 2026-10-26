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
  await sleep(500);
  await page.evaluate(() => window.__RT_ENTER_ROOM__?.());
  await sleep(600);

  await page.evaluate(() => window.__RT_SET_BUILD__?.('spread', 'burn', 3, 3));
  await page.evaluate(() => window.__RT_SET_STATS__?.(30, 12));

  const fps = [];
  for (let i = 0; i < 10; i += 1) {
    await page.evaluate(() => {
      for (let n = 0; n < 3; n += 1) window.__RT_SPAWN__?.(n % 2 === 0 ? 'beetle' : 'bat');
    });
    await sleep(500);
    fps.push(
      await page.evaluate(() => ({
        fps: Math.round(window.__RT_GAME__?.loop.actualFps ?? 0),
        enemies: window.__RT_SNAPSHOT__?.().enemies ?? 0,
        bolts: window.__RT_SNAPSHOT__?.().bolts ?? 0
      }))
    );
  }

  const steady = fps.slice(2);
  const avg = steady.reduce((sum, row) => sum + row.fps, 0) / steady.length;
  const min = Math.min(...steady.map((row) => row.fps));
  const maxEnemies = Math.max(...fps.map((row) => row.enemies));
  console.log(
    `headed fps avg=${avg.toFixed(1)} min=${min} samples=${steady.map((r) => r.fps).join(',')} enemies<=${maxEnemies}`
  );
  console.log(`audio=${await page.evaluate(() => window.__RT_AUDIO_STATE__?.().state)}`);
} finally {
  await browser.close();
}
