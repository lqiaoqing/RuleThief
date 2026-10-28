import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error('No Chrome or Edge executable found.');

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4176';
const MINUTES = Number(process.env.MINUTES ?? 8);
const SAMPLE_MS = 10_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.launch({
  executablePath,
  headless: false,
  args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required']
});

const samples = [];
try {
  const page = await browser.newPage();
  await page.bringToFront();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/?arena=1&build=spread,burn,3,3`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__RT_READY__ === true', { timeout: 25_000 });
  await page.waitForFunction(() => !document.getElementById('room-screen')?.hidden, { timeout: 12_000 });
  await sleep(400);
  await page.tap('#room-enter-btn');
  await sleep(600);
  await page.evaluate(() => window.__RT_SET_THIRD__?.('frost', 3));
  await page.evaluate(() => window.__RT_FREEZE_ATTACK__?.());

  const started = Date.now();
  const total = MINUTES * 60_000;
  let tick = 0;
  while (Date.now() - started < total) {
    // keep combat churning: heal, reset quota, kill everything, respawn a wave
    await page.evaluate((wave) => {
      window.__RT_HEAL__?.(200);
      window.__RT_SET_ROOM_KILLS__?.(0);
      window.__RT_KILL_ALL__?.();
      const kinds = ['beetle', 'bat', 'spore', 'slime', 'wisp', 'bomber'];
      for (let i = 0; i < 6; i += 1) {
        const kind = kinds[(wave + i) % kinds.length];
        window.__RT_SPAWN_AT__?.(kind, 200 + ((wave * 53 + i * 97) % 400), 220 + ((wave * 37 + i * 61) % 300));
      }
      window.__RT_VOLLEY__?.();
    }, tick);
    await sleep(2000);
    tick += 1;

    if (tick % 5 === 0) {
      const metrics = await page.metrics();
      const snapshot = await page.evaluate(() => ({
        fps: Math.round(window.__RT_GAME__?.loop.actualFps ?? 0),
        pool: window.__RT_SNAPSHOT__?.().damageLabelPool ?? 0,
        enemies: window.__RT_SNAPSHOT__?.().enemies ?? 0,
        hazards: window.__RT_SNAPSHOT__?.().hazards ?? 0
      }));
      const sample = {
        atSeconds: Math.round((Date.now() - started) / 1000),
        heapMB: Number((metrics.JSHeapUsedSize / 1024 / 1024).toFixed(1)),
        nodes: metrics.Nodes,
        listeners: metrics.JSEventListeners,
        fps: snapshot.fps,
        enemies: snapshot.enemies,
        hazards: snapshot.hazards,
        damagePool: snapshot.pool
      };
      samples.push(sample);
      console.log(
        `t=${sample.atSeconds}s heap=${sample.heapMB}MB nodes=${sample.nodes} listeners=${sample.listeners} fps=${sample.fps} enemies=${sample.enemies} hazards=${sample.hazards} pool=${sample.damagePool}`
      );
    }
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const mid = samples[Math.floor(samples.length / 2)];
  const summary = {
    minutes: MINUTES,
    samples: samples.length,
    heapStartMB: first?.heapMB ?? 0,
    heapMidMB: mid?.heapMB ?? 0,
    heapEndMB: last?.heapMB ?? 0,
    heapGrowthMB: Number(((last?.heapMB ?? 0) - (first?.heapMB ?? 0)).toFixed(1)),
    nodeGrowth: (last?.nodes ?? 0) - (first?.nodes ?? 0),
    listenerGrowth: (last?.listeners ?? 0) - (first?.listeners ?? 0),
    minFps: Math.min(...samples.map((sample) => sample.fps)),
    avgFps: Number((samples.reduce((sum, sample) => sum + sample.fps, 0) / samples.length).toFixed(1))
  };
  console.log(JSON.stringify(summary));
  fs.writeFileSync('docs/soak.json', JSON.stringify({ summary, samples }, null, 2));
} finally {
  await browser.close();
}
