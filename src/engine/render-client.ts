import type { Garment } from "../types";
import { loadImage, scaledCanvas } from "./images";
export async function requestRender(
  endpoint: string,
  token: string,
  person: string,
  garment: Garment,
  signal: AbortSignal,
): Promise<string> {
  const base = new URL(endpoint);
  if (base.protocol !== "https:")
    throw new Error("Your rendering backend must use HTTPS.");
  const img = await loadImage(garment.image),
    garmentImage = scaledCanvas(img).toDataURL("image/png");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const response = await fetch(new URL("/jobs", base), {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      person,
      garment: garmentImage,
      category: garment.category,
    }),
  });
  const job = await response.json();
  if (!response.ok)
    throw new Error(
      job.error || "The rendering service rejected this request.",
    );
  if (!/^[a-zA-Z0-9-]+$/.test(job.id))
    throw new Error("The rendering service returned an invalid job ID.");
  for (let attempt = 0; attempt < 80; attempt++) {
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException("Rendering cancelled", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, 3000);
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    });
    const poll = await fetch(
      new URL(`/jobs/${encodeURIComponent(job.id)}`, base),
      { headers, signal },
    );
    const result = await poll.json();
    if (!poll.ok || result.status === "failed")
      throw new Error(result.error || "The render failed.");
    if (result.status === "completed") {
      const url = new URL(result.image);
      if (url.protocol !== "https:")
        throw new Error("Invalid render image URL.");
      const image = await fetch(url, { signal, credentials: "omit" });
      if (!image.ok)
        throw new Error("The rendered image could not be downloaded.");
      const blob = await image.blob();
      if (!blob.type.startsWith("image/") || blob.size > 20 * 1024 * 1024)
        throw new Error("Invalid rendered image.");
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  }
  throw new Error(
    "The render is taking longer than expected. Check your provider dashboard before submitting again.",
  );
}
