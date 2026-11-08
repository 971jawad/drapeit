import type { Garment, FitSettings } from "./types";
const image = (name: string) =>
  `${import.meta.env.BASE_URL}garments/${name}.png`;
export const catalogue: Garment[] = [
  {
    id: "field-jacket",
    name: "The field jacket",
    subtitle: "Cotton jacket · Sand",
    category: "top",
    sleeves: "long",
    image: image("field-jacket"),
    color: "#b49a7d",
  },
  {
    id: "raglan-henley",
    name: "The weekend henley",
    subtitle: "Raglan tee · Monochrome",
    category: "top",
    sleeves: "long",
    image: image("raglan-henley"),
    color: "#d8d8d5",
  },
  {
    id: "navy-knit",
    name: "The navy essential",
    subtitle: "Long sleeve knit · Navy",
    category: "top",
    sleeves: "long",
    image: image("navy-knit"),
    color: "#344c6b",
  },
  {
    id: "navy-coat",
    name: "The city raincoat",
    subtitle: "Lightweight coat · Navy",
    category: "top",
    sleeves: "long",
    image: image("navy-coat"),
    color: "#233950",
  },
  {
    id: "red-vneck",
    name: "A brighter everyday",
    subtitle: "V-neck tee · Red",
    category: "top",
    sleeves: "short",
    image: image("red-vneck"),
    color: "#bf2040",
  },
];
export const defaultSettings: FitSettings = {
  size: "M",
  width: 100,
  length: 100,
  offset: 0,
  opacity: 100,
  color: "",
  pattern: "original",
  mirror: true,
  occlusion: true,
  showGuides: false,
};
