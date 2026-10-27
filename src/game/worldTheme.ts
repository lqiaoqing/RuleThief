import type { ChapterId } from './run';

export interface WorldTheme {
  id: ChapterId;
  name: string;
  floorTint: number;
  washColor: number;
  washAlpha: number;
  framePrimary: number;
  frameSecondary: number;
  frameAccent: number;
  brazier: number;
  dust: number[];
}

export const WORLD_THEMES: Record<ChapterId, WorldTheme> = {
  judgement: {
    id: 'judgement',
    name: '审判废墟',
    floorTint: 0xffffff,
    washColor: 0xffb066,
    washAlpha: 0.045,
    framePrimary: 0x65dcf0,
    frameSecondary: 0x6a4cff,
    frameAccent: 0xa6d8e6,
    brazier: 0xff7a34,
    dust: [0x65dcf0, 0x6a4cff, 0xffffff]
  },
  workshop: {
    id: 'workshop',
    name: '失序工坊',
    floorTint: 0xa8d8e8,
    washColor: 0x65dcf0,
    washAlpha: 0.07,
    framePrimary: 0x65dcf0,
    frameSecondary: 0x2f6f8f,
    frameAccent: 0xb8e8f0,
    brazier: 0x65dcf0,
    dust: [0x65dcf0, 0x8fb2c4, 0xd8f4ff]
  },
  abyss: {
    id: 'abyss',
    name: '逆律深渊',
    floorTint: 0xc4a8ff,
    washColor: 0x7a3cff,
    washAlpha: 0.09,
    framePrimary: 0xb69bff,
    frameSecondary: 0x5a2f8f,
    frameAccent: 0xe0d0ff,
    brazier: 0xb69bff,
    dust: [0xb69bff, 0x7a3cff, 0xffffff]
  }
};

export const WORLD_THEME_ORDER: readonly ChapterId[] = ['judgement', 'workshop', 'abyss'];

export function getWorldTheme(index: number): WorldTheme {
  return WORLD_THEMES[WORLD_THEME_ORDER[Math.max(0, Math.min(2, index))]];
}
