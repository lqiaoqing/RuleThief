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

async function measure(page, label, sample, spawn) {
  const samples = [];
  for (let i = 0; i < 8; i += 1) {
    if (spawn) await page.evaluate(spawn);
    await sleep(500);
    samples.push(await page.evaluate(() => Math.round(window.__RT_GAME__?.loop.actualFps ?? 0)));
  }
  const steady = samples.slice(2);
  const avg = steady.reduce((sum, value) => sum + value, 0) / Math.max(1, steady.length);
  const state = await page.evaluate(() => window.__RT_SNAPSHOT__?.() ?? {});
  console.log(
    `${label}: avg=${avg.toFixed(1)} min=${Math.min(...steady)} enemies=${state.enemies} hazards=${state.hazards} fps=${steady.join(',')}`
  );
}

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
  await measure(page, 'room 1', 8, () => {
    for (let n = 0; n < 3; n += 1) window.__RT_SPAWN__?.(n % 2 === 0 ? 'beetle' : 'slime');
  });

  // advance to the boss room
  for (let i = 0; i < 6; i += 1) {
    await page.evaluate(() => window.__RT_SCENE__?.debugOpenReward());
    await sleep(260);
    await page.evaluate(() => document.querySelector('#rule-offers .rule-card')?.click());
    await sleep(320);
    await page.evaluate(() => window.__RT_ENTER_ROOM__?.());
    await sleep(320);
  }

  await page.evaluate(() => window.__RT_SET_BUILD__?.(null, null, 1, 1));
  await page.evaluate(() => window.__RT_DAMAGE_BOSS__?.(1250));
  await sleep(8000);
  await measure(page, 'boss phase 3 (with adds)', 8, null);

  console.log(`audio=${await page.evaluate(() => window.__RT_AUDIO_STATE__?.().state)}`);
} finally {
  await browser.close();
}
