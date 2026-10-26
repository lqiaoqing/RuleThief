export const ARENA = 800;

export const COLORS = {
  bg: 0x05080f,
  panel: 0x0b1421,
  text: 0xeaf1ff,
  sub: 0x9aabc4,
  muted: 0x6e829d,
  cyan: 0x65dcf0,
  purple: 0xb69bff,
  orange: 0xffac68,
  red: 0xff7186,
  green: 0x7edca9,
  yellow: 0xffe399,
  gold: 0xe9bd6b
} as const;

export const ASSETS = {
  floor: './assets/textures/dungeon-floor.webp',
  player: './assets/sprites/player.png',
  beetle: './assets/sprites/beetle.png',
  bat: './assets/sprites/bat.png',
  spore: './assets/sprites/spore.png',
  slime: './assets/sprites/slime.png',
  wisp: './assets/sprites/wisp.png',
  bomber: './assets/sprites/bomber.png',
  boss: './assets/sprites/boss.png'
} as const;

export function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
