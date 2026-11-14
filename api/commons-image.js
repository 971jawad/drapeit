// Same-origin thumbnail gateway so vetted Wikimedia photographs are usable in canvas.
// Explicit filenames avoid turning this endpoint into an arbitrary scraping proxy.
const files = new Set([
  "Shirt_MET_C.I.42.41.3_F.jpg",
  "Shirt_MET_C.I.46.82.10_B.jpg",
  "Blouse_MET_53448.jpg",
  "Blouse_MET_CI39.13.35_F.jpg",
  "Blouse_MET_53447.jpg",
  "Vest_MET_1981.251.1_S2.jpg",
  "Shirt_MET_DT5094.jpg",
  "Shalwar_kameez.jpg",
  "Trousers_MET_CI38.23.34_F.jpg",
  "Trousers_MET_CI40.173.9_B.jpg",
  "Trousers_MET_CI38.23.23a_F.jpg",
  "Skirt_MET_CI58.67.8_B.jpg",
  "Skirt_MET_20.81.4.jpg",
  "Skirt_MET_CI62.44.17_F.jpg",
  "Dress_MET_DP102008.jpg",
  "Dress_MET_DP321109.jpg",
  "Dress_MET_DT254881.jpg",
  "Sari_MET_DP165253.jpg",
  "Sari_MET_100475.jpg",
  "Coat_MET_wb-15.95.141b.jpeg",
  "Medieval_armour.jpg",
  "Suit_of_chain_mail_from_DHM_museum_Berlin.jpg",
  "Scarf_MET_CI44.64.65.jpg",
  "Scarf_MET_613.jpg",
  "Scarf_MET_81759.jpg",
  "Unfolded_Face_Mask.jpg",
  "Necklace_MET_DP110369.jpg",
  "Necklace_MET_1972.188.5.jpg",
  "Wrist_Watch.jpg",
  "Bracelet_MET_DP20024.jpg",
  "Nose_Ring,_One_of_a_Pair_MET_LC-15_95_129.jpg"
]);
const LIMIT = 3_500_000;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }
  const file = typeof req.query?.file === "string" ? req.query.file : "";
  if (!files.has(file)) return res.status(404).json({ error: "Unknown catalog photograph" });
  try {
    const upstream = new URL("https://commons.wikimedia.org/w/index.php");
    upstream.searchParams.set("title", "Special:Redirect/file/" + file);
    upstream.searchParams.set("width", "480");
    const image = await fetch(upstream, { signal: AbortSignal.timeout(12000), redirect: "follow",
      headers: { "User-Agent": "DrapeItHobby/1.0 (open garment catalog; Wikimedia Commons attribution in app)" } });
    if (!image.ok || new URL(image.url).hostname !== "upload.wikimedia.org")
      return res.status(502).json({ error: "Garment image unavailable" });
    const mime = (image.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime))
      return res.status(502).json({ error: "Unsupported image format" });
    if (Number(image.headers.get("content-length") || 0) > LIMIT)
      return res.status(502).json({ error: "Image too large" });
    const bytes = Buffer.from(await image.arrayBuffer());
    if (bytes.length > LIMIT) return res.status(502).json({ error: "Image too large" });
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).end(bytes);
  } catch {
    return res.status(502).json({ error: "Photo source temporarily unavailable" });
  }
}
