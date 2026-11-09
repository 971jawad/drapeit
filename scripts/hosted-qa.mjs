import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import worker from "../server/hosted-worker.js";
const output = path.resolve(process.env.QA_OUTPUT || "test-results"),
  root = path.resolve("dist"),
  origin = "https://drapeit.test";
await fs.mkdir(output, { recursive: true });
const env = {
  ACCESS_TOKEN: "qa-owner-access-code",
  DECART_API_KEY: "dct_never_exposed",
  RATE_LIMITER: { limit: async () => ({ success: true }) },
};
const report = { checks: [], errors: [] };
let providerCalls = 0;
globalThis.fetch = async (url, options) => {
  if (String(url) !== "https://api.decart.ai/v1/client/tokens")
    throw new Error("Unexpected provider URL");
  if (options.headers["X-API-KEY"] !== env.DECART_API_KEY)
    throw new Error("Provider key missing on server");
  const body = JSON.parse(options.body);
  if (
    body.allowedOrigins[0] !== origin ||
    body.allowedModels[0] !== "lucy-vton-3.6" ||
    body.constraints
  )
    throw new Error("Incorrect hosted token scope");
  providerCalls++;
  return new Response("No test provider credits", { status: 402 });
};
const browser = await chromium.launch({
  executablePath: process.env.QA_CHROMIUM || undefined,
  headless: true,
  args: [
    "--no-sandbox",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-video-capture=${process.env.QA_CAMERA || `${output}/human-a.y4m`}`,
    "--use-fake-ui-for-media-stream",
  ],
});
const context = await browser.newContext({
  permissions: ["camera"],
  viewport: { width: 1280, height: 1000 },
});
context.setDefaultTimeout(40000);
await context.addInitScript(() => {
  if (!navigator.mediaDevices?.getUserMedia) return;
  window.__streams = [];
  const original = navigator.mediaDevices.getUserMedia.bind(
    navigator.mediaDevices,
  );
  navigator.mediaDevices.getUserMedia = async (options) => {
    const stream = await original(options);
    window.__streams.push(stream);
    return stream;
  };
});
await context.route(`${origin}/**`, async (route) => {
  const request = route.request(),
    url = new URL(request.url());
  if (url.pathname.startsWith("/api/")) {
    const response = await worker.fetch(
      new Request(url, {
        method: request.method(),
        headers: await request.allHeaders(),
        ...(request.postData() ? { body: request.postData() } : {}),
      }),
      env,
    );
    return route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    });
  }
  const file = path.resolve(
    root,
    url.pathname === "/" ? "index.html" : url.pathname.slice(1),
  );
  if (!file.startsWith(root + path.sep)) return route.abort();
  try {
    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".wasm": "application/wasm",
      ".png": "image/png",
      ".woff2": "font/woff2",
    };
    return route.fulfill({
      body: await fs.readFile(file),
      contentType: types[path.extname(file)] || "application/octet-stream",
    });
  } catch {
    return route.fulfill({ status: 404, body: "Not found" });
  }
});
const page = await context.newPage();
page.on("pageerror", (e) => report.errors.push(e.message));
try {
  await page.goto(origin);
  await page
    .getByRole("heading", { name: "Connect this browser once" })
    .waitFor();
  await page
    .getByLabel("Service access code", { exact: true })
    .fill(env.ACCESS_TOKEN);
  await page.getByRole("button", { name: "Remember this browser" }).click();
  await page
    .getByRole("heading", { name: "Your service is connected" })
    .waitFor();
  if ((await page.locator("body").innerText()).includes(env.DECART_API_KEY))
    throw new Error("Provider key leaked into the page");
  const cookie = (await context.cookies()).find(
    (c) => c.name === "__Host-drapeit",
  );
  if (!cookie?.httpOnly || !cookie.secure || cookie.sameSite !== "Strict")
    throw new Error("Session cookie protections missing");
  await page.reload();
  await page
    .getByRole("heading", { name: "Your service is connected" })
    .waitFor();
  if (await page.getByLabel("Service access code", { exact: true }).count())
    throw new Error("Browser asks for access code again after reload");
  if (
    await page.evaluate(
      () =>
        document.cookie.includes("__Host-drapeit") ||
        JSON.stringify(localStorage).includes("qa-owner-access-code"),
    )
  )
    throw new Error("Session exposed to browser JavaScript or localStorage");
  report.checks.push(
    "Real hosted login sets a protected cookie, survives reload, and keeps keys out of frontend storage",
  );
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Start live AI try-on" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Decart rejected" })
    .waitFor();
  if (!providerCalls) throw new Error("Hosted token path was never called");
  if (
    !(await page.getByRole("button", { name: "Save AI snapshot" }).isDisabled())
  )
    throw new Error("Failed provider produced a fake result");
  const stopped = await page.evaluate(
    () =>
      window.__streams.length > 0 &&
      window.__streams.every((s) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
  );
  if (!stopped) throw new Error("Failed connection left camera active");
  report.checks.push(
    "SDK obtains token through remembered server login; provider rejection shows feedback and releases camera",
  );
  await page.screenshot({
    path: `${output}/hosted-service.png`,
    fullPage: true,
  });
} catch (e) {
  report.failure = e.message;
  await page.screenshot({
    path: `${output}/hosted-failure.png`,
    fullPage: true,
  });
}
await fs.writeFile(
  `${output}/report-hosted.json`,
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (report.failure || report.errors.length) process.exitCode = 1;
