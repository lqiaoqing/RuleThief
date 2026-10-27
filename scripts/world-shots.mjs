import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error('No Chrome or Edge executable found.');

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4177';
const OUT = path.resolve('screenshots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1']
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/?arena=1&build=spread,burn,3,3`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__RT_READY__ === true', { timeout: 20_000 });
  await page.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 12_000
  });
  await page.evaluate(() => window.__RT_ENTER_ROOM__?.());
  await sleep(1400);
  await page.screenshot({ path: path.join(OUT, 'm95-world-w1.png') });
  console.log('shot m95-world-w1.png');

  await page.evaluate(() => window.__RT_CHAPTER_START__?.(1));
  await page.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await sleep(300);
  await page.evaluate(() => window.__RT_ENTER_ROOM__?.());
  await sleep(1600);
  await page.screenshot({ path: path.join(OUT, 'm95-world-w2.png') });
  console.log('shot m95-world-w2.png');

  await page.evaluate(() => window.__RT_CHAPTER_START__?.(2));
  await page.waitForFunction(() => !document.getElementById('room-screen')?.hidden, {
    timeout: 10_000
  });
  await sleep(300);
  await page.evaluate(() => window.__RT_ENTER_ROOM__?.());
  await sleep(1600);
  await page.screenshot({ path: path.join(OUT, 'm95-world-w3.png') });
  console.log('shot m95-world-w3.png');
} finally {
  await browser.close();
}
