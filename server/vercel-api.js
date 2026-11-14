// Vercel Functions backend for the owner-only DrapeIt live AI studio.
// All provider credentials stay in Vercel environment variables.
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const COOKIE = "__Host-drapeit";
const LOGIN_SECONDS = 30 * 86400;
const MODEL = "lucy-vton-3.6";
const MAX_JSON_BYTES = 2048;

// Extra best-effort defense only. A serverless instance does not provide global
// rate limiting; enable Vercel Firewall rules and provider spending controls.
const buckets = new Map();
function permit(key, max, seconds) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter((t) => now - t < seconds * 1000);
  if (list.length >= max) {
    buckets.set(key, list);
    return false;
  }
  list.push(now);
  buckets.set(key, list);
  if (buckets.size > 1000) {
    for (const [k, times] of buckets) {
      if (!times.length || now - times[times.length - 1] > 60_000) buckets.delete(k);
    }
  }
  return true;
}
function same(a, b) {
  const left = createHash("sha256").update(String(a)).digest();
  const right = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(left, right);
}
function sign(payload, secret) {
  return createHmac("sha256", secret)
    .update("drapeit-session:" + payload)
    .digest("hex");
}
function sessionCookie(secret) {
  const payload = String(Math.floor(Date.now() / 1000) + LOGIN_SECONDS) +
    "-" + randomUUID();
  return COOKIE + "=" + payload + "." + sign(payload, secret) +
    "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + LOGIN_SECONDS;
}
function authenticated(req, secret) {
  if (!secret) return false;
  const raw = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  if (!raw || raw.length > 200) return false;
  const parts = raw.split(".");
  if (parts.length !== 2 || !/^\d+-[a-f0-9-]{36}$/.test(parts[0]) ||
    !/^[0-9a-f]{64}$/.test(parts[1])) return false;
  const expiry = Number(parts[0].split("-")[0]);
  const now = Date.now() / 1000;
  return expiry > now && expiry <= now + LOGIN_SECONDS + 60 &&
    same(parts[1], sign(parts[0], secret));
}
function respond(res, code, data, headers = {}) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(data));
}
function readBody(req) {
  if (!(req.headers["content-type"] || "").includes("application/json"))
    throw new Error("Expected JSON");
  if (Number(req.headers["content-length"] || 0) > MAX_JSON_BYTES)
    throw new Error("Request too large");
  const body = req.body;
  const raw = Buffer.isBuffer(body)
    ? body.toString("utf8")
    : typeof body === "string"
      ? body
      : JSON.stringify(body ?? {});
  if (Buffer.byteLength(raw, "utf8") > MAX_JSON_BYTES)
    throw new Error("Request too large");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Invalid JSON object");
  return parsed;
}
export default async function handler(req, res) {
  const path = new URL(req.url || "/", "https://vercel.invalid").pathname;
  const secret = process.env.ACCESS_TOKEN || "";
  const apiKey = process.env.DECART_API_KEY || "";
  // A weak access code is not suitable for protecting a paid AI endpoint.
  const configured = apiKey.length > 0 && secret.length >= 32;
  if (path === "/api/hosted-status" && req.method === "GET") {
    return respond(res, 200, {
      hosted: true,
      configured,
      authenticated: configured && authenticated(req, secret),
    });
  }
  if (req.method !== "POST")
    return respond(res, 405, { error: "Method not allowed" });
  // The browser uses same-origin POSTs; never allow third-party websites to mint tokens.
  const host = req.headers.host || "";
  if (!host || req.headers.origin !== "https://" + host)
    return respond(res, 403, { error: "Origin not allowed" });
  if (path === "/api/logout") {
    return respond(res, 200, { authenticated: false }, {
      "Set-Cookie": COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
    });
  }
  if (!configured)
    return respond(res, 503, { error: "Set DECART_API_KEY and a strong ACCESS_TOKEN in Vercel project settings." });
  try {
    if (path === "/api/login") {
      const ip = String(req.headers["x-vercel-forwarded-for"] ||
        req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
      if (!permit("login:" + ip, 10, 60))
        return respond(res, 429, { error: "Too many login attempts. Try again later." });
      const body = readBody(req);
      if (typeof body.code !== "string" || !same(body.code, secret))
        return respond(res, 401, { error: "The access code is incorrect." });
      return respond(res, 200, { authenticated: true }, {
        "Set-Cookie": sessionCookie(secret),
      });
    }
    if (path !== "/api/realtime-token")
      return respond(res, 404, { error: "Not found" });
    if (!authenticated(req, secret))
      return respond(res, 401, { error: "Sign in to your live service on this browser." });
    if (!permit("live-mints", 10, 60))
      return respond(res, 429, { error: "Connection limit reached. Try again later." });
    const origin = "https://" + host;
    const upstream = await fetch("https://api.decart.ai/v1/client/tokens", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        expiresIn: 120,
        allowedModels: [MODEL],
        allowedOrigins: [origin],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok)
      return respond(res, 502, {
        error: "Decart rejected the connection. Check provider credits or key access.",
      });
    const token = await upstream.json();
    if (typeof token.apiKey !== "string" || token.apiKey.startsWith("dct_") ||
      token.apiKey === apiKey) throw new Error("Invalid provider token");
    return respond(res, 200, {
      apiKey: token.apiKey,
      expiresAt: token.expiresAt,
    }, { "Set-Cookie": sessionCookie(secret) });
  } catch {
    return respond(res, 400, { error: "The request could not be completed. Please retry." });
  }
}
