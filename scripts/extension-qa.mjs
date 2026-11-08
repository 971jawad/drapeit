import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const output = "/workspace/drapeit-qa";
const extension = path.resolve("extension-build");
const context = await chromium.launchPersistentContext(
  `${output}/extension-profile`,
  {
    executablePath: "/usr/bin/chromium",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      "--no-sandbox",
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${output}/human-a.y4m`,
      "--use-fake-ui-for-media-stream",
    ],
    viewport: { width: 560, height: 850 },
  },
);
const report = { checks: [], errors: [] };
let page;
try {
  let [worker] = context.serviceWorkers();
  if (!worker)
    worker = await context.waitForEvent("serviceworker", { timeout: 20000 });
  const id = new URL(worker.url()).host;
  report.extensionId = id;
  page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push(e.message));
  await page.goto(`chrome-extension://${id}/index.html`);
  await page.getByRole("button", { name: "Open my camera" }).waitFor();
  report.checks.push("Actual packaged Manifest V3 extension opens its studio");
  await page.getByRole("button", { name: "Open my camera" }).click();
  await page
    .locator('canvas[data-pose="detected"]')
    .waitFor({ timeout: 60000 });
  report.checks.push("Camera and local MediaPipe WASM run under extension CSP");
  await page.screenshot({
    path: `output/extension-placeholder.png`.replace("output", output),
    fullPage: true,
  });
  report.tracking = await page.locator(".tracking-caption").innerText();
  await page.getByRole("button", { name: "Stop preview", exact: true }).click();
  report.checks.push("Extension releases camera stream");
  const response = await page.evaluate(() =>
    chrome.runtime.sendMessage({
      type: "FETCH_PRODUCT",
      url: "http://127.0.0.1/private",
    }),
  );
  if (!response.error)
    throw new Error("Extension accepted an insecure/private import");
  report.checks.push("Extension refuses insecure/private image requests");
  await page.goto(`chrome-extension://${id}/popup.html`);
  await page
    .getByRole("button", { name: "Pick a garment from this page" })
    .click();
  await page
    .locator("#error")
    .filter({ hasText: "Open a clothing store page first" })
    .waitFor();
  report.checks.push(
    "Picker refuses browser-internal pages with useful feedback",
  );
} catch (e) {
  report.failure = e.message;
  if (page)
    await page.screenshot({
      path: `${output}/extension-failure.png`,
      fullPage: true,
    });
}
await fs.writeFile(
  `${output}/report-extension.json`,
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
await context.close();
if (report.failure || report.errors.length) process.exitCode = 1;
