import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4177';
const DIST = path.resolve('dist');

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  throw new Error('dist/index.html missing — run npm run build first');
}

const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const requiredAssets = [
  'assets/sprites/player.png',
  'assets/sprites/beetle.png',
  'assets/sprites/bat.png',
  'assets/sprites/spore.png',
  'assets/sprites/slime.png',
  'assets/sprites/wisp.png',
  'assets/sprites/bomber.png',
  'assets/sprites/boss.png',
  'assets/textures/dungeon-floor.webp',
  'assets/art/menu-key.webp'
];

const bundleRefs = [...html.matchAll(/(?:src|href)="\.?(\/assets\/[^"]+)"/g)].map((m) => m[1]);
check('html references a js bundle', bundleRefs.some((ref) => ref.endsWith('.js')), bundleRefs.join(', '));
check('html references a css bundle', bundleRefs.some((ref) => ref.endsWith('.css')), bundleRefs.join(', '));

const fetchUrl = async (url) => {
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  return { status: response.status, type: response.headers.get('content-type') ?? '', size: buffer.length };
};

for (const ref of bundleRefs) {
  const result = await fetchUrl(`${BASE}${ref}`);
  check(`bundle ${ref} served`, result.status === 200 && result.size > 1000, `${result.status} ${result.size}B`);
}

for (const asset of requiredAssets) {
  const local = path.join(DIST, asset);
  const exists = fs.existsSync(local);
  const stats = exists ? fs.statSync(local) : null;
  check(`asset ${asset} packaged`, exists && (stats?.size ?? 0) > 500, stats ? `${Math.round(stats.size / 1024)}KB` : 'missing');
  const served = await fetchUrl(`${BASE}/${asset}`);
  check(`asset ${asset} served`, served.status === 200 && served.size > 500, `${served.status} ${Math.round(served.size / 1024)}KB ${served.type}`);
}

const totalBytes = fs
  .readdirSync(path.join(DIST, 'assets', 'sprites'))
  .concat([])
  .length;
check('sprite folder holds eight enemies', totalBytes >= 8, String(totalBytes));

const walk = (dir) => {
  let size = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    size += entry.isDirectory() ? walk(full) : fs.statSync(full).size;
  }
  return size;
};
const distSize = walk(DIST);
check('dist size under 8MB', distSize < 8 * 1024 * 1024, `${(distSize / 1024 / 1024).toFixed(2)}MB`);
check('no dev server references in html', !html.includes('/src/main.ts'), html.includes('/src/main.ts') ? 'src/main.ts leaked' : 'clean');

const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) process.exitCode = 1;
