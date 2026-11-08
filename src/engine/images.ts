import { FilesetResolver, InteractiveSegmenter } from "@mediapipe/tasks-vision";
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error(
          "This image could not be loaded. Download it and use Upload garment instead.",
        ),
      );
    image.src = src;
  });
}
export function readFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES)
    return Promise.reject(new Error("Choose an image smaller than 20 MB."));
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    return Promise.reject(new Error("Choose a JPG, PNG or WebP image."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Unable to read this file."));
    reader.readAsDataURL(file);
  });
}
export function scaledCanvas(image: HTMLImageElement, max = 1024) {
  const scale = Math.min(1, max / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}
export function trimTransparent(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!,
    pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let x0 = canvas.width,
    y0 = canvas.height,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++)
      if (pixels.data[(y * canvas.width + x) * 4 + 3] > 40) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  if (x1 <= x0 || y1 <= y0)
    throw new Error(
      "No garment was selected. Tap inside the garment or outline it manually.",
    );
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out
    .getContext("2d")!
    .drawImage(
      canvas,
      x0,
      y0,
      out.width,
      out.height,
      0,
      0,
      out.width,
      out.height,
    );
  return out.toDataURL("image/png");
}
let segmenterPromise: Promise<InteractiveSegmenter> | null = null;
export async function cutout(
  image: HTMLImageElement,
  point: { x: number; y: number },
) {
  if (!segmenterPromise)
    segmenterPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        `${import.meta.env.BASE_URL}wasm`,
      );
      return InteractiveSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `${import.meta.env.BASE_URL}models/magic_touch.tflite`,
        },
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
    })().catch((e) => {
      segmenterPromise = null;
      throw e;
    });
  const segmenter = await segmenterPromise,
    canvas = scaledCanvas(image);
  const result = segmenter.segment(canvas, { keypoint: point });
  try {
    if (!result.categoryMask)
      throw new Error("Automatic cutout unavailable. Use outline mode.");
    const mask = result.categoryMask.getAsUint8Array(),
      mw = result.categoryMask.width,
      mh = result.categoryMask.height;
    // Magic Touch's foreground category is model-specific. Preserve the class
    // at the user's positive click rather than assuming a numeric label.
    const foreground =
      mask[
        Math.min(mh - 1, Math.floor(point.y * mh)) * mw +
          Math.min(mw - 1, Math.floor(point.x * mw))
      ];
    const ctx = canvas.getContext("2d")!,
      data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++)
      for (let x = 0; x < canvas.width; x++) {
        const selected =
          mask[
            Math.floor((y / canvas.height) * mh) * mw +
              Math.floor((x / canvas.width) * mw)
          ];
        if (selected !== foreground)
          data.data[(y * canvas.width + x) * 4 + 3] = 0;
      }
    ctx.putImageData(data, 0, 0);
    return trimTransparent(canvas);
  } finally {
    result.close();
  }
}
export function polygonCutout(
  image: HTMLImageElement,
  points: { x: number; y: number }[],
) {
  if (points.length < 3)
    throw new Error("Add at least three points around the garment.");
  const canvas = scaledCanvas(image),
    ctx = canvas.getContext("2d")!;
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  points.forEach((p, i) =>
    i
      ? ctx.lineTo(p.x * canvas.width, p.y * canvas.height)
      : ctx.moveTo(p.x * canvas.width, p.y * canvas.height),
  );
  ctx.closePath();
  ctx.fill();
  return trimTransparent(canvas);
}
export function safeRemoteUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:")
    throw new Error("Use a secure https:// image or product link.");
  if (url.username || url.password)
    throw new Error("Links must not contain credentials.");
  return url;
}
export async function importImageUrl(raw: string) {
  const url = safeRemoteUrl(raw),
    controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url.href, {
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok)
      throw new Error(
        "The store did not allow this image request. Use the browser extension or upload the image.",
      );
    const type = response.headers.get("content-type")?.split(";")[0];
    if (!["image/jpeg", "image/png", "image/webp"].includes(type ?? ""))
      throw new Error(
        "This is a product page. Open it with the DrapeIt extension to select the garment image, or paste a direct JPG, PNG or WebP link.",
      );
    const blob = await response.blob();
    return readFile(new File([blob], "product", { type: type! }));
  } catch (e) {
    if (e instanceof TypeError)
      throw new Error(
        "This store blocks direct imports. Use the DrapeIt extension on its product page, or upload the garment image.",
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
