import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const output = path.resolve(process.env.QA_OUTPUT || "test-results");
const camera = process.env.QA_CAMERA || `${output}/human-a.y4m`;
const origin = "https://drapeit.test";
const base = process.env.QA_BASE_URL || `${origin}/drapeit/`;
const root = path.resolve("dist");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.QA_CHROMIUM || undefined,
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-video-capture=${camera}`,
    "--use-fake-ui-for-media-stream",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["camera"],
});
context.setDefaultTimeout(30000);
const report = { base, checks: [], errors: [] };
context.on("page", (page) =>
  page.on("pageerror", (e) => report.errors.push(e.message)),
);
if (!process.env.QA_BASE_URL)
  await context.route(`${origin}/**`, async (route) => {
    const relative = new URL(route.request().url()).pathname.replace(
      /^\/drapeit\//,
      "",
    );
    const file = path.resolve(root, relative || "index.html");
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
      await route.fulfill({
        body: await fs.readFile(file),
        contentType: types[path.extname(file)] || "application/octet-stream",
      });
    } catch {
      await route.fulfill({ status: 404, body: "Not found" });
    }
  });
// Observe actual browser media tracks without substituting a synthetic stream.
await context.addInitScript(() => {
  if (!navigator.mediaDevices?.getUserMedia) return;
  window.__qaStreams = [];
  const getUserMedia = navigator.mediaDevices.getUserMedia.bind(
    navigator.mediaDevices,
  );
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const stream = await getUserMedia(constraints);
    window.__qaStreams.push({ stream, constraints });
    return stream;
  };
});
const page = await context.newPage();
try {
  await page.goto(base);
  const opened = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Open shopping window", exact: true })
    .click();
  const popup = await opened;
  await popup.getByRole("button", { name: "Open my camera" }).waitFor();
  if (new URL(popup.url()).searchParams.get("window") !== "1")
    throw new Error("Compact window URL missing");
  if (await popup.locator(".page-heading").isVisible())
    throw new Error("Shopping window did not use compact layout");
  await popup.getByRole("button", { name: "Open my camera" }).click();
  await popup
    .locator('canvas[data-pose="detected"]')
    .waitFor({ timeout: 60000 });
  await popup
    .getByRole("button", { name: "Stop preview", exact: true })
    .click();
  await popup.getByRole("button", { name: "Choose a garment" }).click();
  await popup.getByRole("tab", { name: "Upload", exact: true }).click();
  await popup
    .getByTestId("garment-file")
    .setInputFiles("public/garments/field-jacket.png");
  await popup.getByRole("dialog", { name: "Prepare your garment" }).waitFor();
  await popup
    .getByRole("button", { name: "Use this garment", exact: true })
    .click();
  await popup.screenshot({
    path: `${output}/shopping-window.png`,
    fullPage: true,
  });
  await popup.close();
  report.checks.push(
    "No-install compact shopping window opens, tracks a human camera feed and accepts a garment upload",
  );

  await page
    .getByRole("button", { name: "AI live try-on", exact: true })
    .click();
  await page
    .getByLabel("Token service URL", { exact: true })
    .fill("https://token.example");
  await page
    .getByLabel("Service access token", { exact: true })
    .fill("qa-service-token");
  if (
    !(await page
      .getByRole("button", { name: "Start live AI try-on" })
      .isDisabled())
  )
    throw new Error("AI session does not require consent");
  await page.getByRole("checkbox").check();
  let requested = false;
  await context.route("https://token.example/realtime-token", async (route) => {
    if (route.request().method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": new URL(base).origin,
          "Access-Control-Allow-Headers": "authorization",
          "Access-Control-Allow-Methods": "POST",
        },
      });
    if (route.request().headers().authorization !== "Bearer qa-service-token")
      throw new Error("Missing service authentication");
    requested = true;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": new URL(base).origin },
      body: JSON.stringify({
        error: "Live provider is not configured (QA response).",
      }),
    });
  });
  // No provider network requests or billable sessions are allowed in this test.
  await context.route(/https:\/\/[^/]*decart\.ai\//, (route) => route.abort());
  await page.getByRole("button", { name: "Start live AI try-on" }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Live provider is not configured" })
    .waitFor();
  if (!requested) throw new Error("Token broker was not called");
  if (
    !(await page.getByRole("button", { name: "Save AI snapshot" }).isDisabled())
  )
    throw new Error("Failed session allows a fake snapshot");
  const media = await page.evaluate(() =>
    window.__qaStreams.map(({ stream, constraints }) => ({
      audioRequested: constraints.audio,
      tracks: stream.getTracks().map((t) => t.readyState),
    })),
  );
  if (
    !media.length ||
    media.some(
      (s) =>
        s.audioRequested !== false ||
        s.tracks.some((state) => state !== "ended"),
    )
  )
    throw new Error(
      "Failed AI connection did not release the video-only camera",
    );
  report.checks.push(
    "AI consent, authenticated token request, honest service failure, no fake output, and camera cleanup",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();

  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    };
  });
  await page.getByRole("button", { name: "Open my camera" }).click();
  await page
    .getByText("Camera permission was denied.", { exact: false })
    .waitFor();
  await page.getByRole("button", { name: "Open my camera" }).waitFor();
  report.checks.push(
    "Denied camera permission gives actionable feedback and permits a retry",
  );
} catch (error) {
  report.failure = error.message;
  await page.screenshot({
    path: `${output}/session-failure.png`,
    fullPage: true,
  });
}
await fs.writeFile(
  `${output}/report-sessions.json`,
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (report.failure || report.errors.length) process.exitCode = 1;
