import { describe, it, expect } from "vitest";
import {
  meshPoint,
  poseConfidence,
  recommendedSize,
  smoothPose,
} from "../src/engine/geometry";
import { defaultSettings } from "../src/data";
import type { Point } from "../src/types";
const pose: Point[] = Array.from({ length: 33 }, () => ({
  x: 0.5,
  y: 0.5,
  visibility: 1,
}));
pose[12] = { x: 0.35, y: 0.3, visibility: 1 };
pose[11] = { x: 0.65, y: 0.3, visibility: 1 };
pose[24] = { x: 0.4, y: 0.65, visibility: 1 };
pose[23] = { x: 0.6, y: 0.65, visibility: 1 };
pose[25] = { x: 0.6, y: 0.8, visibility: 1 };
pose[26] = { x: 0.4, y: 0.8, visibility: 1 };
pose[27] = { x: 0.6, y: 0.95, visibility: 1 };
pose[28] = { x: 0.4, y: 0.95, visibility: 1 };
describe("body-driven mesh", () => {
  it("follows translations of a moving body", () => {
    const a = meshPoint(0.5, 0.5, pose, defaultSettings, "top");
    const shifted = pose.map((p) => ({ ...p, x: p.x + 0.12, y: p.y + 0.05 }));
    const b = meshPoint(0.5, 0.5, shifted, defaultSettings, "top");
    expect(b.x - a.x).toBeCloseTo(0.12);
    expect(b.y - a.y).toBeCloseTo(0.05);
  });
  it("changes garment width for size without moving its center", () => {
    const m = meshPoint(0.76, 0.5, pose, defaultSettings, "top");
    const xl = meshPoint(
      0.76,
      0.5,
      pose,
      { ...defaultSettings, size: "XL" },
      "top",
    );
    expect(xl.x).toBeGreaterThan(m.x);
    expect(meshPoint(0.5, 0.5, pose, defaultSettings, "top").x).toBe(
      meshPoint(0.5, 0.5, pose, { ...defaultSettings, size: "XL" }, "top").x,
    );
  });
  it("extends dress and bottom coverage to the lower body", () => {
    expect(
      meshPoint(0.5, 0.9, pose, defaultSettings, "dress").y,
    ).toBeGreaterThan(meshPoint(0.5, 0.9, pose, defaultSettings, "top").y);
    expect(meshPoint(0.5, 1, pose, defaultSettings, "bottom").y).toBeCloseTo(
      0.95,
    );
  });
  it("rejects low-confidence hips instead of displaying a false fit", () => {
    const missing = pose.map((p) => ({ ...p }));
    missing[23].visibility = 0.1;
    expect(poseConfidence(missing)).toBe(0.1);
    expect(poseConfidence([])).toBe(0);
  });
  it("smooths jitter without freezing movement", () => {
    const next = pose.map((p) => ({ ...p, x: p.x + 0.1 }));
    const result = smoothPose(pose, next);
    expect(result[11].x).toBeGreaterThan(pose[11].x);
    expect(result[11].x).toBeLessThan(next[11].x);
  });
});
describe("brand size guidance", () => {
  it("uses actual circumference plus ease, independent of generic size labels", () =>
    expect(recommendedSize(96, { S: 98, M: 104, L: 112 }, 8)).toBe("M"));
  it("does not claim a fit outside the supplied chart", () =>
    expect(recommendedSize(150, { S: 98, M: 104 }, 8)).toBeNull());
  it("rejects invalid measurements", () =>
    expect(recommendedSize(NaN, { M: 100 }, 8)).toBeNull());
});
