export type Category = "top" | "dress" | "bottom";
export type Size = "XS" | "S" | "M" | "L" | "XL" | "XXL";
export interface Point {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}
export interface Garment {
  id: string;
  name: string;
  subtitle: string;
  category: Category;
  sleeves?: "short" | "long" | "none";
  image: string;
  color: string;
  imported?: boolean;
  source?: string;
  /** Optional layering slot; imported garments default to their category. */
  slot?: "top" | "bottom" | "dress" | "outer" | "scarf" | "mask" | "wrist" | "wrist-right" | "neck" | "nose";
  audience?: "Men" | "Women" | "Unisex";
  license?: string;
  /** Commons photographs may have visible backgrounds; remove light backgrounds heuristically. */
  photoCutout?: boolean;
}
export interface FitSettings {
  size: Size;
  width: number;
  length: number;
  offset: number;
  opacity: number;
  color: string;
  pattern: "original" | "stripes" | "checks" | "dots";
  mirror: boolean;
  occlusion: boolean;
  showGuides: boolean;
}
export interface SavedLook {
  id: string;
  name: string;
  date: string;
  image: string;
  size: Size;
}
export interface TrackingState {
  status: "idle" | "loading" | "tracking" | "searching" | "error";
  fps: number;
  confidence: number;
  message?: string;
}
