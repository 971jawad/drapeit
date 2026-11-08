(() => {
  if (window.__drapeitCancel) window.__drapeitCancel();
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  const banner = document.createElement("div");
  banner.textContent =
    "DrapeIt · Click a garment image to try it on · Esc to cancel";
  banner.style.cssText =
    "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#2b4337;color:#fff;padding:16px 24px;border-radius:9px;font:13px Arial,sans-serif;box-shadow:0 8px 30px #0003;max-width:90vw;text-align:center;";
  const highlight = document.createElement("div");
  highlight.style.cssText =
    "position:fixed;border:3px solid #b68462;border-radius:8px;box-shadow:0 0 0 3px #fff9;display:none;background:#b6846210;";
  overlay.append(highlight, banner);
  document.documentElement.append(overlay);
  let candidate = null;
  const getImage = (e) => {
    let img = e.target.closest?.("img");
    if (!img) {
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      img = elements.find((x) => x instanceof HTMLImageElement);
    }
    if (img && img.naturalWidth >= 100)
      return { url: img.currentSrc || img.src, element: img };
    const bg = getComputedStyle(e.target).backgroundImage.match(
      /^url\(["']?(.*?)["']?\)$/,
    );
    if (bg) return { url: bg[1], element: e.target };
    return null;
  };
  function move(e) {
    candidate = getImage(e);
    if (!candidate) {
      highlight.style.display = "none";
      return;
    }
    const r = candidate.element.getBoundingClientRect();
    Object.assign(highlight.style, {
      display: "block",
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  }
  function cleanup() {
    document.removeEventListener("mousemove", move, true);
    document.removeEventListener("click", click, true);
    document.removeEventListener("keydown", key, true);
    overlay.remove();
    delete window.__drapeitCancel;
  }
  function click(e) {
    const chosen = getImage(e);
    if (!chosen) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const payload = {
      type: "SELECT_GARMENT",
      image: chosen.url,
      source: location.href,
      title: document.title,
    };
    cleanup();
    chrome.runtime.sendMessage(payload).catch(() => {});
  }
  function key(e) {
    if (e.key === "Escape") cleanup();
  }
  window.__drapeitCancel = cleanup;
  document.addEventListener("mousemove", move, true);
  document.addEventListener("click", click, true);
  document.addEventListener("keydown", key, true);
})();
