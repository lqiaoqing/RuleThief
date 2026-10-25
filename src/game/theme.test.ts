import { describe, expect, it } from 'vitest';
import { formatTime } from './theme';

describe('formatTime', () => {
  it('formats a full run duration', () => {
    expect(formatTime(180)).toBe('03:00');
  });

  it('formats seconds with zero padding', () => {
    expect(formatTime(61)).toBe('01:01');
    expect(formatTime(9.9)).toBe('00:09');
  });

  it('never renders negative time', () => {
    expect(formatTime(-1)).toBe('00:00');
  });
});
