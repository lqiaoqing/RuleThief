import { describe, expect, it } from 'vitest';
import { segmentIntersectsCircle } from './geometry';

const circle = { x: 10, y: 0, radius: 3 };

describe('segment circle intersection', () => {
  it('blocks a segment that crosses the cover', () => {
    expect(segmentIntersectsCircle(0, 0, 20, 0, circle)).toBe(true);
    expect(segmentIntersectsCircle(0, 5, 20, 5, circle)).toBe(false);
  });

  it('treats a segment ending inside the cover as blocked', () => {
    expect(segmentIntersectsCircle(0, 0, 10, 0, circle)).toBe(true);
    expect(segmentIntersectsCircle(10, 0, 20, 0, circle)).toBe(true);
  });

  it('supports padding for projectile/cover collision', () => {
    expect(segmentIntersectsCircle(0, 4, 20, 4, circle)).toBe(false);
    expect(segmentIntersectsCircle(0, 4, 20, 4, circle, 2)).toBe(true);
  });
});
