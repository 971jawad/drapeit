import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error Cloudflare Worker is authored as portable JavaScript.
import worker from "../server/hosted-worker.js";
const origin = "https://drapeit-live.example.workers.dev";
const env = () => ({
  DECART_API_KEY: "dct_server_only",
  ACCESS_TOKEN: "long-owner-access-code",
  RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
});
function request(path: string, body?: unknown, cookie?: string, from = origin) {
  return new Request(origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: from,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function login(e: ReturnType<typeof env>) {
  const response = await worker.fetch(
    request("/api/login", { code: e.ACCESS_TOKEN }),
    e,
  );
  expect(response.status).toBe(200);
  return response.headers.get("Set-Cookie")!;
}
afterEach(() => vi.unstubAllGlobals());
describe("persistent hosted live service", () => {
  it("reports configured status without exposing secrets", async () => {
    const response = await worker.fetch(request("/api/hosted-status"), env());
    expect(await response.json()).toEqual({
      hosted: true,
      configured: true,
      authenticated: false,
    });
  });
  it("fails closed when setup is incomplete", async () => {
    expect(
      (await worker.fetch(request("/api/login", { code: "x" }), {})).status,
    ).toBe(503);
  });
  it("rejects cross-origin login and wrong access codes", async () => {
    const e = env();
    expect(
      (
        await worker.fetch(
          request(
            "/api/login",
            { code: e.ACCESS_TOKEN },
            undefined,
            "https://other.example",
          ),
          e,
        )
      ).status,
    ).toBe(403);
    expect(
      (await worker.fetch(request("/api/login", { code: "wrong" }), e)).status,
    ).toBe(401);
  });
  it("stores a signed HttpOnly browser session rather than a provider key", async () => {
    const e = env(),
      cookie = await login(e);
    expect(cookie).toContain("HttpOnly; Secure; SameSite=Strict");
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).not.toContain(e.ACCESS_TOKEN);
    expect(cookie).not.toContain(e.DECART_API_KEY);
    expect(
      (
        await (
          await worker.fetch(
            request("/api/hosted-status", undefined, cookie.split(";")[0]),
            e,
          )
        ).json()
      ).authenticated,
    ).toBe(true);
  });
  it("refuses altered cookies and unauthenticated token minting", async () => {
    const e = env(),
      cookie = (await login(e)).split(";")[0];
    const tampered = cookie.slice(0, -1) + (cookie.endsWith("a") ? "b" : "a");
    expect(
      (await worker.fetch(request("/api/realtime-token", {}, tampered), e))
        .status,
    ).toBe(401);
    expect(
      (await worker.fetch(request("/api/realtime-token", {}), e)).status,
    ).toBe(401);
  });
  it("automatically mints fresh scoped credentials and renews login without ending active streams after two minutes", async () => {
    const e = env(),
      cookie = (await login(e)).split(";")[0];
    const upstream = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ apiKey: "ek_fresh_session", expiresAt: "later" }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", upstream);
    const response = await worker.fetch(
      request("/api/realtime-token", {}, cookie),
      e,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      apiKey: "ek_fresh_session",
      expiresAt: "later",
    });
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    const [url, options] = upstream.mock.calls[0];
    expect(url).toBe("https://api.decart.ai/v1/client/tokens");
    expect(options.headers["X-API-KEY"]).toBe(e.DECART_API_KEY);
    expect(JSON.parse(options.body)).toEqual({
      expiresIn: 120,
      allowedModels: ["lucy-vton-3.6"],
      allowedOrigins: [origin],
    });
  });
  it("never returns a permanent provider key, even if an upstream response is wrong", async () => {
    const e = env(),
      cookie = (await login(e)).split(";")[0];
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ apiKey: e.DECART_API_KEY })),
        ),
    );
    const response = await worker.fetch(
      request("/api/realtime-token", {}, cookie),
      e,
    );
    expect(response.status).not.toBe(200);
    expect(await response.text()).not.toContain(e.DECART_API_KEY);
  });
  it("limits login and token requests", async () => {
    const e = env();
    e.RATE_LIMITER.limit.mockResolvedValue({ success: false });
    expect(
      (await worker.fetch(request("/api/login", { code: e.ACCESS_TOKEN }), e))
        .status,
    ).toBe(429);
  });
  it("does not forward cookies or authorization while serving GitHub frontend assets", async () => {
    const upstream = vi
      .fn()
      .mockResolvedValue(
        new Response("app", { headers: { "Content-Type": "text/html" } }),
      );
    vi.stubGlobal("fetch", upstream);
    await worker.fetch(
      new Request(origin + "/", {
        headers: { Cookie: "private", Authorization: "secret" },
      }),
      env(),
    );
    expect(String(upstream.mock.calls[0][0])).toBe(
      "https://971jawad.github.io/drapeit/",
    );
    expect(upstream.mock.calls[0][1].headers).toBeUndefined();
  });
});
