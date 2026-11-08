import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve("dist"),
  origin = "https://drapeit.test",
  base = process.env.QA_BASE_URL || `${origin}/drapeit/`;
const output = path.resolve(process.env.QA_OUTPUT || "test-results");
await fs.mkdir(output, { recursive: true });
const camera = process.env.QA_CAMERA || `${output}/human-a.y4m`;
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
  viewport: { width: 1440, height: 1100 },
  permissions: ["camera"],
});
context.setDefaultTimeout(30000);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
if (!process.env.QA_BASE_URL)
  await page.route(`${origin}/**`, async (route) => {
    const relative = new URL(route.request().url()).pathname.replace(
      /^\/drapeit\//,
      "",
    );
    const file = path.resolve(root, relative || "index.html");
    if (!file.startsWith(root + path.sep)) return route.abort();
    try {
      const body = await fs.readFile(file);
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".wasm": "application/wasm",
        ".task": "application/octet-stream",
        ".tflite": "application/octet-stream",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".zip": "application/zip",
      };
      await route.fulfill({
        status: 200,
        body,
        contentType: types[path.extname(file)] || "application/octet-stream",
      });
    } catch {
      await route.fulfill({ status: 404, body: "Not found" });
    }
  });
const report = { base, camera: path.basename(camera), checks: [], errors };
try {
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Good style starts with you." })
    .waitFor();
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  report.checks.push("Desktop rendered");
  await page.getByRole("button", { name: "Open my camera" }).click();
  await page
    .locator('canvas[data-pose="detected"]')
    .waitFor({ timeout: 60000 });
  report.checks.push(
    "Real getUserMedia pipeline detected a human from replay camera",
  );
  await page.waitForTimeout(1500);
  report.tracking = await page.locator(".tracking-caption").innerText();
  report.canvas = await page.locator("canvas").evaluate((c) => ({
    width: c.width,
    height: c.height,
    source: c.dataset.source,
  }));
  await page.screenshot({
    path: `${output}/camera-${path.basename(camera, ".y4m")}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "XL", exact: true }).click();
  await page
    .getByRole("button", { name: "Terracotta tint", exact: true })
    .click();
  await page.getByRole("button", { name: "Checks", exact: true }).click();
  await page
    .locator('canvas[data-pose="detected"]')
    .waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Save this look" }).click();
  await page.getByRole("button", { name: "My wardrobe" }).click();
  await page.locator(".saved-look").waitFor();
  report.checks.push("Size, tint, pattern and local saved wardrobe");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .locator('canvas[data-pose="detected"]')
    .waitFor({ timeout: 30000 });
  const snapshot = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download snapshot", exact: true })
    .click();
  report.download = (await snapshot).suggestedFilename();
  await page.getByRole("button", { name: "Stop preview", exact: true }).click();
  await page.getByRole("button", { name: "Open my camera" }).waitFor();
  const stopped = await page.locator("video").evaluate((v) => !v.srcObject);
  if (!stopped) throw new Error("Camera stream was not released");
  report.checks.push("Snapshot download and camera stop");
  await page.getByRole("button", { name: "Size guide", exact: true }).click();
  await page.getByRole("heading", { name: "Start with M" }).waitFor();
  await page.getByRole("button", { name: "Preview size M" }).click();
  report.checks.push("Measurement chart guidance");
  await page.getByRole("tab", { name: "Link", exact: true }).click();
  await page
    .getByLabel("Garment image URL")
    .fill("https://invalid.example/product");
  await page
    .getByRole("button", { name: "Import garment", exact: true })
    .click();
  await page.locator(".inline-error").waitFor();
  report.checks.push("Blocked image import shows actionable error");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (overflow) throw new Error("Mobile layout overflows horizontally");
  report.checks.push("Mobile layout has no horizontal overflow");
  await page.getByRole("button", { name: "Customise fit" }).click();
  await page.getByRole("button", { name: "XL", exact: true }).click();
  report.checks.push("Mobile fit controls");
} catch (error) {
  report.failure = error.message;
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
}
await fs.writeFile(
  `${output}/report-${path.basename(camera, ".y4m")}.json`,
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (report.failure || errors.length) process.exitCode = 1;
