const STUDIO = "index.html";
function safeUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Only HTTPS links without credentials are supported.");
  if (
    /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|.*\.local$)/i.test(
      url.hostname,
    )
  )
    throw new Error("Private network image addresses are not supported.");
  return url;
}
async function openStudio() {
  return chrome.windows.create({
    url: chrome.runtime.getURL(STUDIO),
    type: "popup",
    width: 560,
    height: 850,
    focused: true,
  });
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "drapeit-image",
    title: "Try this garment with DrapeIt",
    contexts: ["image"],
  });
});
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "drapeit-image") return;
  await chrome.storage.session.set({
    pendingGarment: { image: info.srcUrl, source: info.pageUrl },
  });
  await openStudio();
});
async function fetchProduct(raw) {
  const url = safeUrl(raw);
  if (!(await chrome.permissions.contains({ origins: [`${url.origin}/*`] })))
    throw new Error(
      "Allow this image host in the fitting window before importing.",
    );
  const response = await fetch(url, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `The store returned ${response.status}. Download the image and upload it instead.`,
    );
  safeUrl(response.url);
  const type = response.headers.get("content-type")?.split(";")[0] || "";
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > 20 * 1024 * 1024)
    throw new Error("This file is too large. Use an image under 20 MB.");
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 20 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("This file is too large.");
    }
    chunks.push(value);
  }
  const blob = new Blob(chunks, { type });
  if (type.includes("text/html")) return { html: await blob.text() };
  if (!["image/jpeg", "image/png", "image/webp"].includes(type))
    throw new Error(
      "The link is not a JPG, PNG, WebP image or a product page.",
    );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { image: `data:${type};base64,${btoa(binary)}` };
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  const fromStudio = sender.url?.startsWith(chrome.runtime.getURL(""));
  (async () => {
    switch (message.type) {
      case "OPEN_STUDIO":
        if (!fromStudio) throw new Error("Invalid sender");
        await openStudio();
        return { ok: true };
      case "SELECT_GARMENT":
        if (!sender.tab || typeof message.image !== "string")
          throw new Error("Invalid garment selection");
        safeUrl(message.image);
        await chrome.storage.session.set({
          pendingGarment: {
            image: message.image,
            source: message.source,
            title: message.title,
          },
        });
        await openStudio();
        return { ok: true };
      case "FETCH_PRODUCT":
        if (!fromStudio) throw new Error("Invalid sender");
        return fetchProduct(message.url);
      default:
        throw new Error("Unknown request");
    }
  })()
    .then(respond)
    .catch((e) => respond({ error: e.message }));
  return true;
});
