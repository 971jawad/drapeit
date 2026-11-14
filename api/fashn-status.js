export default function handler(req, res) {
  const url = process.env.FASHN_BACKEND_URL || "";
  let configured = false;
  try {
    const parsed = new URL(url);
    configured = parsed.protocol === "https:" && !parsed.username && !parsed.password &&
      typeof process.env.FASHN_BACKEND_SECRET === "string" &&
      process.env.FASHN_BACKEND_SECRET.length >= 32;
  } catch {}
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ model: "fashn-vton-1.5", configured, mode: "photo" });
}
