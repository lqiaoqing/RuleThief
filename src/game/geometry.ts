export interface CircleObstacle {
  x: number;
  y: number;
  radius: number;
}

export function segmentIntersectsCircle(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  circle: CircleObstacle,
  padding = 0
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq > 0
    ? Math.max(0, Math.min(1, ((circle.x - x1) * dx + (circle.y - y1) * dy) / lengthSq))
    : 0;
  const closestX = x1 + dx * t;
  const closestY = y1 + dy * t;
  const radius = Math.max(0, circle.radius + padding);
  return Math.hypot(closestX - circle.x, closestY - circle.y) <= radius;
}
