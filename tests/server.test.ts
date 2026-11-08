import { describe, it, expect, vi, afterEach } from "vitest";
// @ts-expect-error Worker is plain JavaScript for native deployment.
import worker from "../server/worker.js";
const origin = "https://971jawad.github.io";
const makeEnv = () => ({
  ALLOWED_ORIGINS: origin,
  FAL_KEY: "test-provider-secret",
  ACCESS_TOKEN: "test-access",
  JOBS: { put: vi.fn(), get: vi.fn() },
  RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
});
const req = (path: string, body?: object, token = "test-access") =>
  new Request(`https://worker.test${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: origin,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
afterEach(() => vi.unstubAllGlobals());
describe("secure rendering adapter", () => {
  it("rejects requests from an unapproved website", async () => {
    const r = await worker.fetch(
      new Request("https://worker.test/jobs", {
        headers: { Origin: "https://evil.test" },
      }),
      makeEnv(),
    );
    expect(r.status).toBe(403);
  });
  it("requires the service token", async () => {
    const r = await worker.fetch(req("/jobs", {}, "wrong"), makeEnv());
    expect(r.status).toBe(401);
  });
  it("rejects arbitrary remote image URLs", async () => {
    const r = await worker.fetch(
      req("/jobs", {
        person: "https://internal/",
        garment: "x",
        category: "top",
      }),
      makeEnv(),
    );
    expect(r.status).toBe(400);
  });
  it("enforces submission rate limits before contacting the provider", async () => {
    const env = makeEnv();
    env.RATE_LIMITER.limit.mockResolvedValue({ success: false });
    const r = await worker.fetch(req("/jobs", {}), env);
    expect(r.status).toBe(429);
  });
  it("queues a bounded request and stores canonical provider URLs only", async () => {
    const env = makeEnv();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        request_id: "abc-12345678",
        status_url:
          "https://queue.fal.run/fal-ai/fashn/requests/abc-12345678/status",
        response_url:
          "https://queue.fal.run/fal-ai/fashn/requests/abc-12345678",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await worker.fetch(
      req("/jobs", {
        person: "data:image/jpeg;base64,YQ==",
        garment: "data:image/png;base64,YQ==",
        category: "top",
      }),
      env,
    );
    expect(r.status).toBe(202);
    expect(env.JOBS.put).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      "Key test-provider-secret",
    );
    expect(JSON.stringify(await r.json())).not.toContain(
      "test-provider-secret",
    );
  });
  it("does not poll a job that was not created by this service", async () => {
    const r = await worker.fetch(req("/jobs/unknown-job"), makeEnv());
    expect(r.status).toBe(404);
  });
});

describe("live AI token broker", () => {
  it("mints only a short-lived, model-scoped, origin-scoped session token", async () => {
    const env = {
      ...makeEnv(),
      FAL_KEY: undefined,
      JOBS: undefined,
      DECART_API_KEY: "dct_server_secret",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          apiKey: "ek_short_lived",
          expiresAt: "2026-11-08T00:02:00Z",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const r = await worker.fetch(req("/realtime-token", {}), env);
    expect(r.status).toBe(200);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.allowedModels).toEqual(["lucy-vton-3.6"]);
    expect(sent.allowedOrigins).toEqual([origin]);
    expect(sent.expiresIn).toBe(120);
    expect(sent.constraints.realtime.maxSessionDuration).toBe(120);
    expect(await r.json()).toEqual({
      apiKey: "ek_short_lived",
      expiresAt: "2026-11-08T00:02:00Z",
    });
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });
  it("never forwards a permanent key even if an upstream response is malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ apiKey: "dct_server_secret" })),
    );
    const r = await worker.fetch(req("/realtime-token", {}), {
      ...makeEnv(),
      DECART_API_KEY: "dct_server_secret",
    });
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain("dct_server_secret");
  });
  it("clearly reports that live AI is not configured without provider credentials", async () => {
    const r = await worker.fetch(req("/realtime-token", {}), makeEnv());
    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain("DECART_API_KEY");
  });
});
