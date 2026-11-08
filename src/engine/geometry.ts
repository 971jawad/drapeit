import type { Point, FitSettings, Category } from "../types";
export const SIZE_SCALE = {
  XS: 0.88,
  S: 0.94,
  M: 1,
  L: 1.07,
  XL: 1.15,
  XXL: 1.23,
};
export const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export function smoothPose(
  previous: Point[] | null,
  next: Point[],
  elapsed = 50,
): Point[] {
  if (!previous || previous.length !== next.length) return next;
  // Do not interpolate a garment through empty space if the detector switches
  // people or reacquires a body after a large movement.
  const before = lerp(previous[11], previous[12], 0.5),
    after = lerp(next[11], next[12], 0.5);
  if (distance(before, after) > 0.15) return next;
  const alpha = 1 - Math.exp(-elapsed / 65);
  return next.map((p, i) => ({ ...p, ...lerp(previous[i], p, alpha) }));
}
export function poseConfidence(p: Point[]) {
  if (!p || p.length < 29) return 0;
  return Math.min(...[11, 12, 23, 24].map((i) => p[i].visibility ?? 0));
}
export function meshPoint(
  u: number,
  v: number,
  p: Point[],
  settings: FitSettings,
  category: Category,
  sleeves: "short" | "long" | "none" = "short",
): Point {
  const size = (SIZE_SCALE[settings.size] * settings.width) / 100;
  let left = p[12],
    right = p[11],
    hipL = p[24],
    hipR = p[23];
  if (left.x > right.x) {
    [left, right] = [right, left];
    [hipL, hipR] = [hipR, hipL];
  }
  const shoulderMid = lerp(left, right, 0.5),
    hipMid = lerp(hipL, hipR, 0.5);
  const torso = distance(shoulderMid, hipMid);
  if (category === "bottom") {
    const knees = lerp(p[25], p[26], 0.5),
      ankles = lerp(p[27], p[28], 0.5);
    const floor =
      (p[27].visibility ?? 0) > 0.4 && (p[28].visibility ?? 0) > 0.4
        ? ankles
        : lerp(hipMid, knees, 1.95);
    const mid = lerp(hipMid, floor, (v * settings.length) / 100);
    const width =
      Math.max(distance(hipL, hipR) * 1.45, distance(left, right) * 0.86) *
      size;
    return {
      x: mid.x + (u - 0.5) * width,
      y: mid.y + (settings.offset / 100) * torso,
    };
  }
  const bodyT = (((v - 0.12) / 0.78) * settings.length) / 100;
  const end =
    category === "dress" ? lerp(hipMid, lerp(p[25], p[26], 0.5), 1.1) : hipMid;
  const mid = lerp(shoulderMid, end, bodyT);
  const shoulderW = distance(left, right);
  const hipW = Math.max(distance(hipL, hipR) * 1.28, shoulderW * 0.88);
  const t = Math.max(0, Math.min(1, bodyT));
  const width = (shoulderW * (1 - t) + hipW * t) * size;
  const tilt = (right.y - left.y) / Math.max(shoulderW, 0.001);
  const x = ((u - 0.5) / 0.52) * width;
  let point = {
    x: mid.x + x,
    y: mid.y + x * tilt * (1 - t * 0.7) + (settings.offset / 100) * torso,
  };
  // Bend the outer sleeve mesh toward each elbow, retaining the torso anchors.
  if (
    sleeves !== "none" &&
    (sleeves === "long" || v < 0.55) &&
    (u < 0.24 || u > 0.76)
  ) {
    const screenLeft = u < 0.24,
      side = screenLeft ? left : right;
    const index = side === p[12] ? 14 : 13;
    const elbow = p[index];
    if ((elbow.visibility ?? 0) > 0.45) {
      const outer = Math.min(
        1,
        Math.abs(u - (screenLeft ? 0.24 : 0.76)) / 0.24,
      );
      const sleeveT = Math.max(0, Math.min(1, (v - 0.12) / 0.85));
      const wrist = p[index + 2];
      const natural =
        sleeves === "long"
          ? {
              x: side.x + (screenLeft ? -1 : 1) * shoulderW * 0.22,
              y: side.y + torso * sleeveT,
            }
          : {
              x: side.x + (screenLeft ? -1 : 1) * shoulderW * 0.42,
              y: side.y + torso * 0.26,
            };
      const target =
        sleeves === "long"
          ? sleeveT < 0.5
            ? lerp(side, elbow, sleeveT * 2)
            : lerp(
                elbow,
                (wrist.visibility ?? 0) > 0.45 ? wrist : lerp(side, elbow, 1.8),
                (sleeveT - 0.5) * 2,
              )
          : lerp(side, elbow, 0.72);
      const influence =
        outer *
        (sleeves === "long"
          ? 1
          : Math.sin((Math.min(1, v / 0.5) * Math.PI) / 2) * 0.75);
      point.x += (target.x - natural.x) * influence;
      point.y += (target.y - natural.y) * influence;
    }
  }
  return point;
}
export function recommendedSize(
  chest: number,
  chart: Record<string, number>,
  ease: number,
): string | null {
  if (!Number.isFinite(chest) || chest < 40 || chest > 220) return null;
  return (
    Object.entries(chart)
      .sort((a, b) => a[1] - b[1])
      .find(([, circumference]) => circumference >= chest + ease)?.[0] ?? null
  );
}
