// FASHN open-weight model adapter. No Decart key, credit billing, or SDK.
const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 110_000;
const categories = new Set(["tops", "bottoms", "one-pieces"]);

function respond(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(data));
}
function configured() {
  try {
    const url = new URL(process.env.FASHN_BACKEND_URL || "");
    return url.protocol === "https:" &&
      !url.username && !url.password &&
      !!process.env.FASHN_BACKEND_SECRET &&
      process.env.FASHN_BACKEND_SECRET.length >= 32;
  } catch { return false; }
}
function validImage(image) {
  return typeof image === "string" &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image) &&
    image.length <= 1_800_000;
}
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return respond(res, 405, { error: "Method not allowed" });
  }
  // Only use this for the project's own browser origin.
  if (!req.headers.host || req.headers.origin !== "https://" + req.headers.host)
    return respond(res, 403, { error: "Origin not allowed" });
  if (!configured()) return respond(res, 503, { error: "Self-hosted FASHN GPU backend is not configured." });
  try {
    if (Number(req.headers["content-length"] || 0) > MAX_BYTES)
      return respond(res, 413, { error: "Images are too large." });
    if (!String(req.headers["content-type"] || "").includes("application/json"))
      return respond(res, 415, { error: "Expected JSON images." });
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || !validImage(body.person_image) || !validImage(body.garment_image) ||
      !categories.has(body.category))
      return respond(res, 400, { error: "Please supply valid resized JPEG photos and clothing category." });
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_BYTES)
      return respond(res, 413, { error: "Images are too large." });
    const upstream = new URL("/tryon", process.env.FASHN_BACKEND_URL);
    const response = await fetch(upstream, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.FASHN_BACKEND_SECRET,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return respond(res, response.status === 429 ? 429 : 502, {
      error: response.status === 429
        ? "The GPU is busy. Try again later."
        : "GPU server unavailable or generation failed.",
    });
    const data = await response.json();
    if (!validImage(data.image))
      return respond(res, 502, { error: "GPU server returned an invalid image." });
    return respond(res, 200, { image: data.image });
  } catch {
    return respond(res, 502, { error: "GPU generation failed or timed out. Try again later." });
  }
}
