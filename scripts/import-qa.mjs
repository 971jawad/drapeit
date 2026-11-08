import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const output = "/workspace/drapeit-qa",
  root = path.resolve("dist"),
  origin = "https://drapeit.test";
const report = { checks: [], errors: [] };
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.on("pageerror", (e) => report.errors.push(e.message));
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
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
    };
    await route.fulfill({
      body,
      contentType: types[path.extname(file)] || "application/octet-stream",
    });
  } catch {
    await route.fulfill({ status: 404, body: "Not found" });
  }
});
try {
  await page.goto(`${origin}/drapeit/`);
  await page.getByRole("heading", { name: "Your next look" }).waitFor();
  await page
    .locator(".garment-image")
    .first()
    .screenshot({ path: `${output}/garment-fixture.png` });
  await page
    .getByTestId("person-file")
    .setInputFiles(
      process.env.QA_PERSON_PHOTO || "/workspace/reference-review/person-3.png",
    );
  await page
    .locator('canvas[data-pose="detected"]')
    .waitFor({ timeout: 60000 });
  report.checks.push("Uploaded human photograph detected without a camera");
  await page.screenshot({
    path: `${output}/photo-preview.png`,
    fullPage: true,
  });
  await page
    .getByTestId("garment-file")
    .setInputFiles(`${output}/garment-fixture.png`);
  await page.getByRole("dialog", { name: "Prepare your garment" }).waitFor();
  const box = await page.locator(".editor-image").boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.getByText("Preparing cutout…").waitFor();
  await page
    .getByText("Preparing cutout…")
    .waitFor({ state: "hidden", timeout: 60000 });
  const error = await page.locator(".inline-error").count();
  if (error) throw new Error(await page.locator(".inline-error").innerText());
  await page.getByLabel("Garment name").fill("Uploaded linen");
  await page.getByRole("button", { name: "Use this garment" }).click();
  await page
    .getByRole("button", { name: /Uploaded linen Your import/ })
    .waitFor();
  report.checks.push(
    "Real interactive segmentation generated a garment cutout",
  );
  const alpha = await page
    .locator(".garment-card")
    .first()
    .locator("img")
    .evaluate(async (image) => {
      await image.decode();
      const c = document.createElement("canvas");
      c.width = image.naturalWidth;
      c.height = image.naturalHeight;
      const ctx = c.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let clear = 0,
        opaque = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 20) clear++;
        if (data[i] > 230) opaque++;
      }
      return {
        clear,
        opaque,
        centerAlpha:
          data[
            (Math.floor(c.height / 2) * c.width + Math.floor(c.width / 2)) * 4 +
              3
          ],
      };
    });
  if (alpha.clear < 100 || alpha.opaque < 100 || alpha.centerAlpha < 230)
    throw new Error(
      "Cutout did not contain both transparent background and garment",
    );
  report.alpha = alpha;
  await page
    .getByTestId("garment-file")
    .setInputFiles(`${output}/garment-fixture.png`);
  await page.getByRole("button", { name: "Draw outline" }).click();
  const bounds = await page.locator(".editor-image").boundingBox();
  for (const [x, y] of [
    [0.25, 0.1],
    [0.75, 0.1],
    [0.8, 0.9],
    [0.2, 0.9],
  ])
    await page.mouse.click(
      bounds.x + bounds.width * x,
      bounds.y + bounds.height * y,
    );
  await page.getByRole("button", { name: "Apply outline" }).click();
  await page.getByLabel("Garment name").fill("Outlined linen");
  await page.getByRole("button", { name: "Use this garment" }).click();
  report.checks.push("Manual garment outline works");
  await page.getByRole("tab", { name: "Link", exact: true }).click();
  await page.route("https://shop.example/garment.png", async (route) =>
    route.fulfill({
      body: await fs.readFile(`${output}/garment-fixture.png`),
      contentType: "image/png",
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page
    .getByLabel("Garment image URL")
    .fill("https://shop.example/garment.png");
  await page
    .getByRole("button", { name: "Import garment", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Prepare your garment" }).waitFor();
  await page.getByRole("button", { name: "Close garment editor" }).click();
  report.checks.push("Direct image link import works with CORS-capable host");
  await page
    .getByTestId("person-file")
    .setInputFiles(`${output}/garment-fixture.png`);
  await page.locator('canvas[data-pose="missing"]').waitFor({ timeout: 30000 });
  if (
    !(await page.getByRole("button", { name: "Save this look" }).isDisabled())
  )
    throw new Error("No-person source still permits a saved try-on");
  report.checks.push(
    "No-person image hides the garment and prevents misleading snapshots",
  );
  await page
    .getByTestId("video-file")
    .setInputFiles(
      process.env.QA_PERSON_VIDEO ||
        "/workspace/attachments/e7dcd124-f5f4-4600-97ce-74068df01ff4/snapgram.io_p1nudupbuanr.mp4",
    );
  await page
    .locator('canvas[data-pose="detected"][data-source="Video"]')
    .waitFor({ timeout: 60000 });
  report.checks.push(
    "Uploaded human video uses motion tracking and is labelled Video preview",
  );
} catch (e) {
  report.failure = e.message;
  await page.screenshot({
    path: `${output}/import-failure.png`,
    fullPage: true,
  });
}
await fs.writeFile(
  `${output}/report-imports.json`,
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (report.failure || report.errors.length) process.exitCode = 1;
