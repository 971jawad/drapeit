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
/**
 * Additional PHOTOGRAPHS of actual garments and accessories.
 * Wikimedia Commons files are linked directly rather than scraping Google Images.
 * Most Met Museum works below are CC0; check credits and license per item.
 * The original five high-quality local cutouts remain the first entries.
 */
const commons = (file: string) =>
  "https://commons.wikimedia.org/wiki/Special:Redirect/file/" +
  encodeURIComponent(file).replace(/%2F/g, "/") + "?width=480";

const source = (file: string) =>
  "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(file);

type Addition = {
  id: string; name: string; subtitle: string;
  category: Garment["category"]; sleeves?: Garment["sleeves"];
  slot: NonNullable<Garment["slot"]>; audience: NonNullable<Garment["audience"]>;
  color: string; file: string; license?: string;
};

const onlinePhotos: Addition[] = [
  { id:"met-shirt",name:"Vintage men's shirt",subtitle:"Real garment · Met Museum",category:"top",sleeves:"long",slot:"top",audience:"Men",color:"#d2c9b2",file:"Shirt_MET_1985.222.5_d1.jpg" },
  { id:"cotton-shirt",name:"Everyday cotton shirt",subtitle:"Real clothing photograph · CC0",category:"top",sleeves:"long",slot:"top",audience:"Unisex",color:"#e4dacf",file:"LIMEX_long_sleeve_shirt_2.jpg" },
  { id:"met-blouse",name:"Embroidered blouse",subtitle:"Real garment · Met Museum",category:"top",sleeves:"long",slot:"top",audience:"Women",color:"#dfcdb7",file:"Blouse_MET_53448.jpg" },
  { id:"met-blouse-2",name:"Heritage blouse",subtitle:"Real garment · Met Museum",category:"top",sleeves:"long",slot:"top",audience:"Women",color:"#bfa38e",file:"Blouse_MET_C.I.41.58.13_d.jpg" },
  { id:"met-blouse-3",name:"Classic blouse",subtitle:"Real garment · Met Museum",category:"top",sleeves:"short",slot:"top",audience:"Women",color:"#dfdbc9",file:"Blouse_MET_23.123.4_F.jpg" },
  { id:"met-vest",name:"Brocade waistcoat",subtitle:"Real garment · Met Museum",category:"top",sleeves:"none",slot:"outer",audience:"Men",color:"#ad9b74",file:"Vest_MET_1981.251.1_S2.jpg" },
  { id:"men-kurta",name:"South Asian kurta",subtitle:"Traditional clothing photo · CC BY-SA",category:"top",sleeves:"long",slot:"top",audience:"Men",color:"#c4ae8c",file:"Kurta.jpg",license:"CC BY-SA 3.0" },
  { id:"shalwar-kameez",name:"Shalwar kameez set",subtitle:"Traditional outfit photo · CC BY",category:"dress",sleeves:"long",slot:"dress",audience:"Unisex",color:"#dbaa86",file:"Shalwar_kameez_Colours.jpg",license:"CC BY 2.0" },
  { id:"met-trousers",name:"Tailored trousers",subtitle:"Real garment · Met Museum",category:"bottom",slot:"bottom",audience:"Men",color:"#a29e95",file:"Trousers_MET_20.81.5.jpg" },
  { id:"jeans-blue",name:"Blue denim jeans",subtitle:"Real denim photograph · CC BY-SA",category:"bottom",slot:"bottom",audience:"Unisex",color:"#3a5879",file:"02017_blue_jeans.jpg",license:"CC BY-SA 4.0" },
  { id:"jeans-casual",name:"Casual denim jeans",subtitle:"Real denim photograph · CC0",category:"bottom",slot:"bottom",audience:"Unisex",color:"#486782",file:"Pantalones_jeans_(versión_2).jpg" },
  { id:"met-skirt",name:"Traditional flared skirt",subtitle:"Real garment · Met Museum",category:"bottom",slot:"bottom",audience:"Women",color:"#ad8e62",file:"Skirt_MET_26.265.48.jpg" },
  { id:"met-skirt-2",name:"Historical skirt",subtitle:"Real garment · Met Museum",category:"bottom",slot:"bottom",audience:"Women",color:"#97596a",file:"Skirt_MET_1973.110.2ab_F.jpg" },
  { id:"met-skirt-3",name:"Silk skirt",subtitle:"Real garment · Met Museum",category:"bottom",slot:"bottom",audience:"Women",color:"#bb967b",file:"Skirt_MET_CI62.44.17_F.jpg" },
  { id:"met-dress",name:"Victorian day dress",subtitle:"Real garment · Met Museum",category:"dress",slot:"dress",audience:"Women",color:"#ccb69f",file:"Dress_MET_DP102008.jpg" },
  { id:"met-dress-2",name:"Statement evening gown",subtitle:"Real garment · Met Museum",category:"dress",slot:"dress",audience:"Women",color:"#a38fa5",file:"Dress_MET_DP321109.jpg" },
  { id:"met-dress-3",name:"Heritage full-length dress",subtitle:"Real garment · Met Museum",category:"dress",slot:"dress",audience:"Women",color:"#715b57",file:"Dress_MET_1989.246.7_F.jpg" },
  { id:"met-sari",name:"Historic silk sari",subtitle:"Real saree textile · Met Museum",category:"dress",slot:"dress",audience:"Women",color:"#ab5547",file:"Sari_MET_DP165253.jpg" },
  { id:"met-sari-2",name:"Traditional patterned saree",subtitle:"Real saree textile · Met Museum",category:"dress",slot:"dress",audience:"Women",color:"#af8b62",file:"Sari_MET_100475.jpg" },
  { id:"met-coat",name:"Heritage tailored coat",subtitle:"Real garment · Met Museum",category:"top",sleeves:"long",slot:"outer",audience:"Unisex",color:"#5f6e64",file:"Coat_MET_66.101.112_front_CP4.jpg" },
  { id:"medieval-plate",name:"Medieval plate armour",subtitle:"Real armour photograph · CC BY-SA",category:"top",sleeves:"long",slot:"outer",audience:"Unisex",color:"#86979c",file:"Medieval_armour.jpg",license:"CC BY-SA 2.0 FR" },
  { id:"medieval-chainmail",name:"Antique chainmail armour",subtitle:"Real historical armour photo · CC BY-SA",category:"top",sleeves:"long",slot:"outer",audience:"Unisex",color:"#666c70",file:"Antique_chainmail_armour_with_mirror.jpg",license:"CC BY-SA 2.0" },
  { id:"met-scarf",name:"Vintage silk scarf",subtitle:"Real textile · Met Museum",category:"top",sleeves:"none",slot:"scarf",audience:"Unisex",color:"#af6377",file:"Scarf_MET_CI44.64.65.jpg" },
  { id:"met-scarf-2",name:"Embroidered scarf",subtitle:"Real textile · Met Museum",category:"top",sleeves:"none",slot:"scarf",audience:"Women",color:"#bf9d5d",file:"Scarf_MET_1991.187.9_F.jpg" },
  { id:"met-scarf-3",name:"Heritage woven scarf",subtitle:"Real textile · Met Museum",category:"top",sleeves:"none",slot:"scarf",audience:"Unisex",color:"#9c7d6a",file:"Scarf_MET_1991.187.8_d.jpg" },
  { id:"fabric-mask",name:"Protective face mask",subtitle:"Real face mask · CC0",category:"top",sleeves:"none",slot:"mask",audience:"Unisex",color:"#c2d5d5",file:"A_surgical_mask_(2017).jpg" },
  { id:"met-necklace",name:"Victorian necklace",subtitle:"Real jewellery · Met Museum",category:"top",sleeves:"none",slot:"neck",audience:"Women",color:"#bc8b46",file:"Necklace_MET_CI44.30.1.jpg" },
  { id:"met-necklace-2",name:"Heritage pendant necklace",subtitle:"Real jewellery · Met Museum",category:"top",sleeves:"none",slot:"neck",audience:"Unisex",color:"#cca15e",file:"Necklace_MET_1972.188.5.jpg" },
  { id:"modern-watch",name:"Everyday wristwatch",subtitle:"Real watch photograph · CC BY-SA",category:"top",sleeves:"none",slot:"wrist",audience:"Unisex",color:"#425261",file:"Modern_wristwatch_on_a_white_background.jpg",license:"CC BY-SA 4.0" },
  { id:"met-bracelet",name:"Gold-tone wrist bracelet",subtitle:"Real jewellery · Met Museum",category:"top",sleeves:"none",slot:"wrist",audience:"Women",color:"#c9a862",file:"Bracelet_MET_1980.541.2.jpg" },
  { id:"nose-ring",name:"Traditional nose ring",subtitle:"Real nose jewellery · CC0",category:"top",sleeves:"none",slot:"nose",audience:"Women",color:"#e6b960",file:"Nose_ring,_Himachal_Pradesh,_India,_19th_century,_gold_and_enamel,_Honolulu_Academy_of_Arts.JPG" },
];

const additions: Garment[] = onlinePhotos.map(({ file, license = "CC0 1.0", ...g }) => ({
  ...g,
  image: commons(file),
  source: source(file),
  license,
  photoCutout: true,
}));
catalogue.push(...additions);

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
