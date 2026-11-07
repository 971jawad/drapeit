import type { Point, FitSettings, Category } from '../types';
export const SIZE_SCALE = { XS: .88, S: .94, M: 1, L: 1.07, XL: 1.15, XXL: 1.23 };
export const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function smoothPose(previous: Point[] | null, next: Point[], elapsed = 50): Point[] {
  if (!previous || previous.length !== next.length) return next;
  const alpha = 1 - Math.exp(-elapsed / 65);
  return next.map((p, i) => ({ ...p, ...lerp(previous[i], p, alpha) }));
}
export function poseConfidence(p: Point[]) {
  if (!p || p.length < 29) return 0;
  return Math.min(...[11, 12, 23, 24].map(i => p[i].visibility ?? 0));
}
export function meshPoint(u: number, v: number, p: Point[], settings: FitSettings, category: Category): Point {
  const size = SIZE_SCALE[settings.size] * settings.width / 100;
  let left = p[12], right = p[11], hipL = p[24], hipR = p[23];
  if (left.x > right.x) { [left, right] = [right, left]; [hipL, hipR] = [hipR, hipL]; }
  const shoulderMid = lerp(left, right, .5), hipMid = lerp(hipL, hipR, .5);
  const torso = distance(shoulderMid, hipMid);
  if (category === 'bottom') {
    const knees = lerp(p[25], p[26], .5), ankles = lerp(p[27], p[28], .5);
    const floor = ((p[27].visibility ?? 0) > .4 && (p[28].visibility ?? 0) > .4) ? ankles : lerp(hipMid, knees, 1.95);
    const mid = lerp(hipMid, floor, v * settings.length / 100);
    const width = Math.max(distance(hipL, hipR) * 1.45, distance(left, right) * .86) * size;
    return { x: mid.x + (u - .5) * width, y: mid.y + settings.offset / 100 * torso };
  }
  const bodyT = (v - .12) / .78 * settings.length / 100;
  const end = category === 'dress' ? lerp(hipMid, lerp(p[25], p[26], .5), 1.1) : hipMid;
  const mid = lerp(shoulderMid, end, bodyT);
  const shoulderW = distance(left, right);
  const hipW = Math.max(distance(hipL, hipR) * 1.28, shoulderW * .88);
  const t = Math.max(0, Math.min(1, bodyT));
  const width = (shoulderW * (1 - t) + hipW * t) * size;
  const tilt = (right.y - left.y) / Math.max(shoulderW, .001);
  const x = (u - .5) / .52 * width;
  let point = { x: mid.x + x, y: mid.y + x * tilt * (1 - t * .7) + settings.offset / 100 * torso };
  // Bend the outer sleeve mesh toward each elbow, retaining the torso anchors.
  if (v < .55 && (u < .24 || u > .76)) {
    const screenLeft = u < .24, side = screenLeft ? left : right;
    const index = side === p[12] ? 14 : 13;
    const elbow = p[index];
    if ((elbow.visibility ?? 0) > .45) {
      const outer = Math.min(1, Math.abs(u - (screenLeft ? .24 : .76)) / .24);
      const natural = { x: side.x + (screenLeft ? -1 : 1) * shoulderW * .42, y: side.y + torso * .26 };
      const target = lerp(side, elbow, .72);
      const influence = outer * Math.sin(Math.min(1, v / .5) * Math.PI / 2) * .75;
      point.x += (target.x - natural.x) * influence;
      point.y += (target.y - natural.y) * influence;
    }
  }
  return point;
}
export function recommendedSize(chest: number, chart: Record<string, number>, ease: number): string | null {
  if (!Number.isFinite(chest) || chest < 40 || chest > 220) return null;
  return Object.entries(chart).sort((a,b) => a[1]-b[1]).find(([, circumference]) => circumference >= chest + ease)?.[0] ?? null;
}
