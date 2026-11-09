const COOKIE = "__Host-drapeit";
const LOGIN_DAYS = 30;
const MODEL = "lucy-vton-3.6";
const encoder = new TextEncoder();
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
async function equal(a, b) {
  const hash = async (s) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(s)));
  const [x, y] = await Promise.all([hash(a), hash(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
async function signature(payload, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(`drapeit-session:${payload}`),
      ),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
async function sessionCookie(secret) {
  const payload = `${Math.floor(Date.now() / 1000) + LOGIN_DAYS * 86400}-${crypto.randomUUID()}`;
  return `${COOKIE}=${payload}.${await signature(payload, secret)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${LOGIN_DAYS * 86400}`;
}
async function authenticated(request, secret) {
  if (!secret) return false;
  const cookie = (request.headers.get("Cookie") || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!cookie || cookie.length > 200) return false;
  const [payload, sig, extra] = cookie.split(".");
  if (extra || !sig || !/^\d+-[a-f0-9-]{36}$/.test(payload)) return false;
  const expiry = Number(payload.split("-")[0]),
    now = Date.now() / 1000;
  return (
    expiry > now &&
    expiry <= now + LOGIN_DAYS * 86400 + 60 &&
    (await equal(sig, await signature(payload, secret)))
  );
}
async function boundedJson(request) {
  if (!request.headers.get("Content-Type")?.includes("application/json"))
    throw new Error("Expected JSON");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing request body");
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2048) {
      await reader.cancel();
      throw new Error("Request too large");
    }
    chunks.push(value);
  }
  return JSON.parse(await new Blob(chunks).text());
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      if (!["GET", "HEAD"].includes(request.method))
        return new Response("Method not allowed", { status: 405 });
      // Keep frontend updates automatic through the existing GitHub deployment.
      // Forward no cookies, credentials, or visitor-supplied headers upstream.
      const upstream = new URL(
        `https://971jawad.github.io/drapeit${url.pathname === "/" ? "/" : url.pathname}`,
      );
      const response = await fetch(upstream, {
        method: request.method,
        redirect: "follow",
        cf: { cacheTtl: 60 },
      });
      const headers = new Headers(response.headers);
      headers.delete("set-cookie");
      headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      headers.set("Permissions-Policy", "camera=(self), microphone=()");
      return new Response(response.body, { status: response.status, headers });
    }
    const configured =
      !!env.DECART_API_KEY && !!env.ACCESS_TOKEN && !!env.RATE_LIMITER;
    if (request.method === "GET" && url.pathname === "/api/hosted-status")
      return json({
        hosted: true,
        configured,
        authenticated: await authenticated(request, env.ACCESS_TOKEN),
      });
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    if (request.headers.get("Origin") !== url.origin)
      return json({ error: "Origin not allowed" }, 403);
    if (!configured)
      return json({ error: "Finish the one-time service setup." }, 503);
    try {
      if (url.pathname === "/api/login") {
        const limit = await env.RATE_LIMITER.limit({
          key: `login:${request.headers.get("CF-Connecting-IP") || "unknown"}`,
        });
        if (!limit.success)
          return json(
            { error: "Too many login attempts. Wait a minute." },
            429,
          );
        const body = await boundedJson(request);
        if (
          typeof body.code !== "string" ||
          !(await equal(body.code, env.ACCESS_TOKEN))
        )
          return json({ error: "The access code is incorrect." }, 401);
        return json({ authenticated: true }, 200, {
          "Set-Cookie": await sessionCookie(env.ACCESS_TOKEN),
        });
      }
      if (url.pathname === "/api/logout")
        return json({ authenticated: false }, 200, {
          "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
        });
      if (url.pathname !== "/api/realtime-token")
        return json({ error: "Not found" }, 404);
      if (!(await authenticated(request, env.ACCESS_TOKEN)))
        return json(
          { error: "Sign in to your live service on this browser." },
          401,
        );
      const limit = await env.RATE_LIMITER.limit({ key: "live-session-mints" });
      if (!limit.success)
        return json({ error: "Connection limit reached. Wait a minute." }, 429);
      const response = await fetch("https://api.decart.ai/v1/client/tokens", {
        method: "POST",
        headers: {
          "X-API-KEY": env.DECART_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expiresIn: 120,
          allowedModels: [MODEL],
          allowedOrigins: [url.origin],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        return json(
          {
            error:
              "Decart rejected the connection. Check provider credits or key access.",
          },
          502,
        );
      const token = await response.json();
      if (
        typeof token.apiKey !== "string" ||
        token.apiKey.startsWith("dct_") ||
        token.apiKey === env.DECART_API_KEY
      )
        throw new Error("Invalid provider token");
      return json({ apiKey: token.apiKey, expiresAt: token.expiresAt }, 200, {
        "Set-Cookie": await sessionCookie(env.ACCESS_TOKEN),
      });
    } catch {
      return json(
        { error: "The request could not be completed. Please retry." },
        400,
      );
    }
  },
};
