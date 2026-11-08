import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
let listener: (
  message: any,
  sender: any,
  respond: (response: any) => void,
) => boolean;
const fetchMock = vi.fn();
const permission = vi.fn();
beforeAll(async () => {
  vi.stubGlobal("chrome", {
    runtime: {
      id: "test-extension",
      getURL: (p = "") => `chrome-extension://test-extension/${p}`,
      onInstalled: { addListener: vi.fn() },
      onMessage: {
        addListener: (fn: any) => {
          listener = fn;
        },
      },
    },
    contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
    storage: { session: { set: vi.fn() } },
    windows: { create: vi.fn() },
    permissions: { contains: permission },
  });
  vi.stubGlobal("fetch", fetchMock);
  // @ts-expect-error Extension service worker is native JavaScript.
  await import("../extension/background.js");
});
afterAll(() => vi.unstubAllGlobals());
const send = (
  message: any,
  url = "chrome-extension://test-extension/index.html",
) =>
  new Promise<any>((resolve) =>
    listener(message, { id: "test-extension", url }, resolve),
  );
describe("extension import boundary", () => {
  it("rejects requests from page content rather than the studio", async () => {
    const r = await send(
      { type: "FETCH_PRODUCT", url: "https://store.example/image.png" },
      "https://store.example/product",
    );
    expect(r.error).toBe("Invalid sender");
  });
  it("does not fetch private network addresses", async () => {
    const r = await send({
      type: "FETCH_PRODUCT",
      url: "https://127.0.0.1/secret",
    });
    expect(r.error).toContain("Private network");
  });
  it("requires host permission before fetching a store image", async () => {
    permission.mockResolvedValue(false);
    const r = await send({
      type: "FETCH_PRODUCT",
      url: "https://store.example/image.png",
    });
    expect(r.error).toContain("Allow this image host");
  });
  it("transfers a permitted image as bounded data, without browser credentials", async () => {
    permission.mockResolvedValue(true);
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "Content-Type": "image/png" },
      }),
    );
    // Response.url is normally supplied by the browser.
    const result = new Response(new Uint8Array([137, 80, 78, 71]), {
      headers: { "Content-Type": "image/png" },
    });
    Object.defineProperty(result, "url", {
      value: "https://store.example/image.png",
    });
    fetchMock.mockResolvedValue(result);
    const r = await send({
      type: "FETCH_PRODUCT",
      url: "https://store.example/image.png",
    });
    expect(r.image).toBe("data:image/png;base64,iVBORw==");
    expect(fetchMock.mock.calls.at(-1)?.[1].credentials).toBe("omit");
  });
  it("rejects oversized files before reading them", async () => {
    permission.mockResolvedValue(true);
    const response = new Response("x", {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(21 * 1024 * 1024),
      },
    });
    Object.defineProperty(response, "url", {
      value: "https://store.example/image.png",
    });
    fetchMock.mockResolvedValue(response);
    const r = await send({
      type: "FETCH_PRODUCT",
      url: "https://store.example/image.png",
    });
    expect(r.error).toContain("too large");
  });
});
