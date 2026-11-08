const MODEL = "fal-ai/fashn/tryon/v1.6";
const MAX_BYTES = 12 * 1024 * 1024;
function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
function queueUrl(raw) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "queue.fal.run" ||
    url.username ||
    url.password
  )
    throw new Error("Invalid provider response");
  return url.href;
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!allowed.includes(origin))
      return json({ error: "Origin not allowed" }, 403, "null");
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "600",
          Vary: "Origin",
        },
      });
    if (!env.ACCESS_TOKEN || !env.RATE_LIMITER)
      return json(
        { error: "Rendering service is not configured" },
        503,
        origin,
      );
    const auth = request.headers.get("Authorization") || "";
    // Constant-time comparison of hashes prevents leaking token prefix matches.
    const digest = async (s) =>
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
      );
    const [a, b] = await Promise.all([
      digest(auth),
      digest(`Bearer ${env.ACCESS_TOKEN}`),
    ]);
    let difference = 0;
    for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
    if (difference)
      return json({ error: "Invalid service access token" }, 401, origin);
    const url = new URL(request.url),
      match = url.pathname.match(/^\/jobs\/([a-zA-Z0-9-]{8,100})$/);
    try {
      if (request.method === "POST" && url.pathname === "/realtime-token") {
        if (!env.DECART_API_KEY)
          return json(
            {
              error:
                "Live AI is not configured. Add DECART_API_KEY to the token service secrets.",
            },
            503,
            origin,
          );
        const limit = await env.RATE_LIMITER.limit({
          key: "realtime-token-mints",
        });
        if (!limit.success)
          return json(
            { error: "Session request limit reached. Try again in a minute." },
            429,
            origin,
          );
        const options = {
          expiresIn: 120,
          allowedModels: ["lucy-vton-3.6"],
          constraints: { realtime: { maxSessionDuration: 120 } },
        };
        // Decart's origin scoping accepts HTTP(S) origins only. An extension
        // still requires an exact broker origin allowlist and bearer token.
        if (/^https?:\/\//.test(origin)) options.allowedOrigins = [origin];
        const response = await fetch("https://api.decart.ai/v1/client/tokens", {
          method: "POST",
          headers: {
            "X-API-KEY": env.DECART_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(options),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok)
          return json(
            {
              error:
                "The live provider rejected the session request. Check account access, credits and model availability.",
            },
            502,
            origin,
          );
        const token = await response.json();
        if (
          typeof token.apiKey !== "string" ||
          token.apiKey === env.DECART_API_KEY ||
          token.apiKey.startsWith("dct_")
        )
          throw new Error("Invalid client token");
        return json(
          { apiKey: token.apiKey, expiresAt: token.expiresAt },
          200,
          origin,
        );
      }
      if (!env.FAL_KEY || !env.JOBS)
        return json(
          { error: "The optional still-render service is not configured" },
          503,
          origin,
        );
      if (request.method === "POST" && url.pathname === "/jobs") {
        const limit = await env.RATE_LIMITER.limit({
          key: "render-submissions",
        });
        if (!limit.success)
          return json(
            { error: "Render limit reached. Try again in a minute." },
            429,
            origin,
          );
        if (!request.headers.get("Content-Type")?.includes("application/json"))
          return json({ error: "Expected application/json" }, 415, origin);
        if (Number(request.headers.get("Content-Length") || 0) > MAX_BYTES)
          return json({ error: "Images are too large" }, 413, origin);
        const reader = request.body?.getReader();
        if (!reader) return json({ error: "Missing photos" }, 400, origin);
        let size = 0;
        const chunks = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) {
            await reader.cancel();
            return json({ error: "Images are too large" }, 413, origin);
          }
          chunks.push(value);
        }
        const input = JSON.parse(await new Blob(chunks).text());
        const validImage = (value) =>
          typeof value === "string" &&
          /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value) &&
          value.length < 8 * 1024 * 1024;
        if (!validImage(input.person) || !validImage(input.garment))
          return json(
            {
              error:
                "Provide person and garment images as PNG, JPEG or WebP data URLs",
            },
            400,
            origin,
          );
        const category = {
          top: "tops",
          dress: "one-pieces",
          bottom: "bottoms",
        }[input.category];
        if (!category)
          return json({ error: "Invalid garment category" }, 400, origin);
        const response = await fetch(`https://queue.fal.run/${MODEL}`, {
          method: "POST",
          headers: {
            Authorization: `Key ${env.FAL_KEY}`,
            "Content-Type": "application/json",
            "X-Fal-Store-IO": "0",
          },
          body: JSON.stringify({
            model_image: input.person,
            garment_image: input.garment,
            category,
            mode: "quality",
            num_samples: 1,
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (!response.ok)
          return json(
            {
              error:
                response.status === 402
                  ? "Provider credit is exhausted"
                  : "The AI provider could not accept this render",
            },
            502,
            origin,
          );
        const job = await response.json();
        if (!/^[a-zA-Z0-9-]{8,100}$/.test(job.request_id))
          throw new Error("Invalid job ID");
        await env.JOBS.put(
          job.request_id,
          JSON.stringify({
            status: queueUrl(job.status_url),
            result: queueUrl(job.response_url),
          }),
          { expirationTtl: 3600 },
        );
        return json({ id: job.request_id, status: "queued" }, 202, origin);
      }
      if (request.method === "GET" && match) {
        const job = await env.JOBS.get(match[1], { type: "json" });
        if (!job)
          return json({ error: "Render not found or expired" }, 404, origin);
        const response = await fetch(queueUrl(job.status), {
          headers: { Authorization: `Key ${env.FAL_KEY}` },
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok)
          return json({ error: "Unable to check render status" }, 502, origin);
        const status = await response.json();
        if (status.status !== "COMPLETED")
          return json(
            {
              status: ["IN_QUEUE", "IN_PROGRESS"].includes(status.status)
                ? "pending"
                : "failed",
            },
            200,
            origin,
          );
        const result = await fetch(queueUrl(job.result), {
          headers: { Authorization: `Key ${env.FAL_KEY}` },
          signal: AbortSignal.timeout(15000),
        });
        if (!result.ok)
          return json(
            {
              error: "The AI provider could not complete this render",
              status: "failed",
            },
            502,
            origin,
          );
        const output = await result.json(),
          image = output.images?.[0]?.url;
        if (typeof image !== "string" || new URL(image).protocol !== "https:")
          throw new Error("Invalid image result");
        return json({ status: "completed", image }, 200, origin);
      }
      return json({ error: "Not found" }, 404, origin);
    } catch (error) {
      return json(
        {
          error:
            error instanceof SyntaxError
              ? "Invalid JSON request"
              : "Rendering service request failed. Check your provider dashboard before retrying.",
        },
        error instanceof SyntaxError ? 400 : 502,
        origin,
      );
    }
  },
};
