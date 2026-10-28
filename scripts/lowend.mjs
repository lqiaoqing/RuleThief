import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error('No Chrome or Edge executable found.');

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4176';
const RATES = (process.env.RATES ?? '1,4,6').split(',').map(Number);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.launch({
  executablePath,
  headless: false,
  args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required']
});

const rows = [];
try {
  for (const rate of RATES) {
    const page = await browser.newPage();
    await page.bringToFront();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/?arena=1`, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__RT_READY__ === true', { timeout: 25_000 });
    await page.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 12_000 });
    await sleep(400);
    await page.evaluate(() => window.__RT_ENTER_ROOM__?.());
    await sleep(700);

    const client = await page.target().createCDPSession();
    await client.send('Emulation.setCPUThrottlingRate', { rate });

    await page.evaluate(() => window.__RT_SET_BUILD__?.('spread', 'burn', 3, 3));
    await page.evaluate(() => window.__RT_SET_THIRD__?.('frost', 3));
    await page.evaluate(() => {
      for (let i = 0; i < 30; i += 1) {
        const kind = ['beetle', 'bat', 'spore', 'slime', 'wisp', 'bomber'][i % 6];
        window.__RT_SPAWN_AT__?.(kind, 120 + ((i * 97) % 520), 150 + ((i * 61) % 220));
      }
    });
    await sleep(500);

    const samples = [];
    for (let i = 0; i < 8; i += 1) {
      await sleep(500);
      samples.push(
        await page.evaluate(() => ({
          fps: Math.round(window.__RT_GAME__?.loop.actualFps ?? 0),
          enemies: window.__RT_SNAPSHOT__?.().enemies ?? 0,
          hp: window.__RT_SNAPSHOT__?.().hp ?? 0
        }))
      );
    }
    const steady = samples.slice(2);
    const avg = steady.reduce((sum, row) => sum + row.fps, 0) / Math.max(1, steady.length);
    rows.push({
      cpuThrottle: rate,
      avgFps: Number(avg.toFixed(1)),
      minFps: Math.min(...steady.map((row) => row.fps)),
      enemies: Math.max(...samples.map((row) => row.enemies))
    });
    console.log(
      `CPU x${rate}: avg=${avg.toFixed(1)} min=${Math.min(...steady.map((r) => r.fps))} enemies=${rows[rows.length - 1].enemies} fps=${steady.map((r) => r.fps).join(',')}`
    );

    await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.close();
  }
  fs.writeFileSync('docs/lowend.json', JSON.stringify(rows, null, 2));
} finally {
  await browser.close();
}
