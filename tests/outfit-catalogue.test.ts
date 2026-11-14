import { describe, expect, it } from "vitest";
import { catalogue } from "../src/data";

describe("expanded wardrobe catalog", () => {
  it("keeps the five original garments", () => {
    expect(catalogue.slice(0, 5).map((g) => g.id)).toEqual([
      "field-jacket", "raglan-henley", "navy-knit", "navy-coat", "red-vneck",
    ]);
  });

  it("includes real photographs of everyday, traditional and historical clothing", () => {
    expect(catalogue.length).toBeGreaterThanOrEqual(30);
    const slots = new Set(catalogue.map((g) => g.slot || g.category));
    for (const slot of ["top","bottom","dress","outer","mask","scarf","wrist","wrist-right","neck","nose"])
      expect(slots.has(slot), "Missing slot " + slot).toBe(true);
    for (const g of catalogue.slice(5)) {
      expect(g.source?.startsWith("https://commons.wikimedia.org/wiki/File:")).toBe(true);
      expect(g.image).toMatch(/commons-image|commons\.wikimedia\.org/);
    }
  });

  it("keeps all catalogue IDs unique", () => {
    expect(new Set(catalogue.map((g) => g.id)).size).toBe(catalogue.length);
  });
});
