export type RandomSource = () => number;

let storedSeed: string | null = null;
let runSource: RandomSource = Math.random;
let combatSource: RandomSource = Math.random;

export function setRandomSeed(seed: string | null): void {
  storedSeed = seed && seed.length ? seed : null;
  resetRandomStreams();
}

export function resetRandomStreams(): void {
  if (!storedSeed) {
    runSource = Math.random;
    combatSource = Math.random;
    return;
  }
  const base = seedFromString(storedSeed);
  runSource = mulberry32(base);
  combatSource = mulberry32((base ^ 0x9e3779b9) >>> 0);
}

/** Route, reward and event randomness. */
export function random(): number {
  return runSource();
}

/** Combat timing, spawn placement and in-fight choices. */
export function combatRandom(): number {
  return combatSource();
}

export function combatBetween(min: number, max: number): number {
  return min + combatRandom() * (max - min);
}

export function combatInt(min: number, max: number): number {
  return min + Math.floor(combatRandom() * (max - min + 1));
}

export function mulberry32(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
