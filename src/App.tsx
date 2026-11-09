import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpRight,
  Bookmark,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clipboard,
  Download,
  Expand,
  Eye,
  ImagePlus,
  Link2,
  LoaderCircle,
  Menu,
  MoveHorizontal,
  PackageOpen,
  Plus,
  Puzzle,
  RotateCcw,
  Ruler,
  ScanLine,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Video,
  PanelsTopLeft,
  X,
} from "lucide-react";
import { catalogue, defaultSettings } from "./data";
import type {
  Category,
  FitSettings,
  Garment,
  SavedLook,
  Size,
  TrackingState,
} from "./types";
import { Studio, type StudioHandle } from "./components/Studio";
import { RealtimeTryOn } from "./components/RealtimeTryOn";
import { GarmentEditor } from "./components/GarmentEditor";
import { importImageUrl, readFile, safeRemoteUrl } from "./engine/images";
import { recommendedSize } from "./engine/geometry";
import { requestRender } from "./engine/render-client";
const isExtension = typeof chrome !== "undefined" && !!chrome.runtime?.id;
const isShoppingWindow =
  new URLSearchParams(location.search).get("window") === "1";
const sizes: Size[] = ["XS", "S", "M", "L", "XL", "XXL"];
const swatches = [
  "",
  "#bda78b",
  "#75866c",
  "#b16c51",
  "#354e4c",
  "#eee6d7",
  "#303433",
];
function readLooks(): SavedLook[] {
  try {
    const value = JSON.parse(localStorage.getItem("drapeit:looks") || "[]");
    return Array.isArray(value)
      ? value
          .filter(
            (x) =>
              typeof x?.id === "string" &&
              typeof x.image === "string" &&
              x.image.startsWith("data:image/jpeg"),
          )
          .slice(0, 8)
      : [];
  } catch {
    return [];
  }
}
function download(src: string, name: string) {
  const a = document.createElement("a");
  a.href = src;
  a.download = name;
  a.click();
}
export default function App() {
  const [garment, setGarment] = useState<Garment>(catalogue[0]),
    [custom, setCustom] = useState<Garment[]>([]),
    [settings, setSettings] = useState<FitSettings>(defaultSettings),
    [tracking, setTracking] = useState<TrackingState>({
      status: "idle",
      fps: 0,
      confidence: 0,
    }),
    [source, setSource] = useState(""),
    [category, setCategory] = useState("All"),
    [tab, setTab] = useState<"collection" | "upload" | "link">("collection"),
    [editor, setEditor] = useState(""),
    [url, setUrl] = useState(""),
    [importing, setImporting] = useState(false),
    [importError, setImportError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState<
      | "help"
      | "extension"
      | "wardrobe"
      | "measure"
      | "render"
      | "realtime"
      | null
    >(
      new URLSearchParams(location.search).get("live") === "1"
        ? "realtime"
        : null,
    ),
    [looks, setLooks] = useState<SavedLook[]>(readLooks),
    [selectedLooks, setSelectedLooks] = useState<string[]>([]),
    [compare, setCompare] = useState(false),
    [advanced, setAdvanced] = useState(false),
    [mobilePanel, setMobilePanel] = useState<"garments" | "fit" | null>(null),
    [chest, setChest] = useState(96),
    [ease, setEase] = useState(8),
    [chart, setChart] = useState<Record<string, number>>({
      XS: 92,
      S: 98,
      M: 104,
      L: 112,
      XL: 120,
      XXL: 128,
    }),
    [backend, setBackend] = useState(""),
    [accessToken, setAccessToken] = useState(""),
    [renderBusy, setRenderBusy] = useState(false),
    [renderImage, setRenderImage] = useState(""),
    [renderError, setRenderError] = useState("");
  const studio = useRef<StudioHandle>(null),
    personFile = useRef<HTMLInputElement>(null),
    garmentFile = useRef<HTMLInputElement>(null),
    videoFile = useRef<HTMLInputElement>(null),
    stage = useRef<HTMLDivElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    renderAbort = useRef<AbortController | null>(null);
  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 7000);
  };
  const update = <K extends keyof FitSettings>(key: K, value: FitSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));
  const choose = (g: Garment) => {
    setGarment(g);
    setSettings((s) => ({ ...s, color: "", pattern: "original" }));
    setMobilePanel(null);
  };
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      renderAbort.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (isExtension || location.hostname.endsWith("github.io")) return;
    const abort = new AbortController();
    fetch("./api/hosted-status", {
      credentials: "same-origin",
      signal: abort.signal,
    })
      .then(async (r) => {
        if (r.ok && (await r.json()).hosted) {
          studio.current?.stop();
          setModal("realtime");
        }
      })
      .catch(() => {});
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (!isExtension) return;
    chrome.storage.session
      .get("pendingGarment")
      .then(({ pendingGarment }: any) => {
        if (pendingGarment?.image) {
          setUrl(pendingGarment.image);
          setTab("link");
          notify(
            "Your store selection is ready. Choose Import garment to prepare it.",
          );
          chrome.storage.session.remove("pendingGarment");
        }
      });
  }, []);
  useEffect(() => {
    if (!modal && !editor) return;
    const previous = document.activeElement as HTMLElement;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const timer = setTimeout(
      () => dialog?.querySelector<HTMLElement>("button,input,select")?.focus(),
      40,
    );
    function key(e: KeyboardEvent) {
      if (e.key === "Escape" && !renderBusy) {
        setModal(null);
        setEditor("");
      }
      if (e.key === "Tab" && dialog) {
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,a[href],[tabindex="0"]',
          ),
        ).filter((el) => el.offsetParent !== null);
        const first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [modal, editor, renderBusy]);
  async function fileChange(
    e: React.ChangeEvent<HTMLInputElement>,
    kind: "person" | "garment" | "video",
  ) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      if (kind === "video") {
        await studio.current?.setVideo(f);
        return;
      }
      const data = await readFile(f);
      if (kind === "person") await studio.current?.setPhoto(data);
      else setEditor(data);
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function importLink() {
    setImporting(true);
    setImportError("");
    try {
      let image: string;
      if (isExtension) {
        const u = safeRemoteUrl(url);
        const allowed = await chrome.permissions.request({
          origins: [`${u.origin}/*`],
        });
        if (!allowed)
          throw new Error(
            "Allow access to this store to import its product image.",
          );
        const result = await chrome.runtime.sendMessage({
          type: "FETCH_PRODUCT",
          url: u.href,
        });
        if (result.error) throw new Error(result.error);
        if (result.html) {
          const doc = new DOMParser().parseFromString(result.html, "text/html");
          let candidate = doc.querySelector<HTMLMetaElement>(
            'meta[property="og:image"]',
          )?.content;
          for (const script of doc.querySelectorAll(
            'script[type="application/ld+json"]',
          )) {
            try {
              const json = JSON.parse(script.textContent || "{}");
              const list = Array.isArray(json)
                ? json
                : [json, ...(json["@graph"] || [])];
              for (const item of list) {
                if (
                  ([].concat(item["@type"] || []) as string[]).includes(
                    "Product",
                  )
                )
                  candidate =
                    typeof item.image === "string"
                      ? item.image
                      : Array.isArray(item.image)
                        ? item.image[0]
                        : item.image?.url;
              }
            } catch {}
          }
          if (!candidate)
            throw new Error(
              "No product image was found. Use Pick from page in the extension, or upload the garment.",
            );
          const img = safeRemoteUrl(new URL(candidate, u).href);
          const permission = await chrome.permissions.request({
            origins: [`${img.origin}/*`],
          });
          if (!permission)
            throw new Error(
              "The product image is hosted separately. Allow its image host to continue.",
            );
          const result2 = await chrome.runtime.sendMessage({
            type: "FETCH_PRODUCT",
            url: img.href,
          });
          if (!result2.image)
            throw new Error(
              result2.error || "This image could not be imported.",
            );
          image = result2.image;
        } else {
          if (!result.image) throw new Error("No image was returned.");
          image = result.image;
        }
      } else image = await importImageUrl(url);
      setEditor(image);
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }
  function saveLook() {
    const image = studio.current?.snapshot();
    if (!image) {
      notify(
        "Start your camera or add a photo, and make sure your body is detected before saving.",
      );
      return;
    }
    const look: SavedLook = {
      id: crypto.randomUUID(),
      name: garment.name,
      date: new Date().toISOString(),
      image,
      size: settings.size,
    };
    const next = [look, ...looks].slice(0, 8);
    try {
      localStorage.setItem("drapeit:looks", JSON.stringify(next));
      setLooks(next);
      notify("Look saved to your wardrobe on this device.");
    } catch {
      notify(
        "Your browser storage is full. Download this look or remove an older one.",
      );
    }
  }
  function removeLook(id: string) {
    const next = looks.filter((l) => l.id !== id);
    try {
      localStorage.setItem("drapeit:looks", JSON.stringify(next));
      setLooks(next);
      setSelectedLooks(selectedLooks.filter((x) => x !== id));
    } catch {
      notify("Unable to update browser storage.");
    }
  }
  function snapshot() {
    const image = studio.current?.snapshot();
    if (!image) {
      notify("Your body must be detected before downloading a look.");
      return;
    }
    download(image, `drapeit-${garment.id}-${settings.size}.jpg`);
  }
  function openShoppingWindow() {
    const url = new URL(location.href);
    url.search = "?window=1";
    url.hash = "";
    const fittingWindow = window.open(
      url.href,
      "drapeit-shopping",
      "popup,width=560,height=850,resizable=yes,scrollbars=yes",
    );
    if (!fittingWindow) {
      notify(
        "Allow pop-ups for DrapeIt to open the shopping window, or open this site in a separate browser window.",
      );
      return;
    }
    studio.current?.stop();
    setModal(null);
    fittingWindow.focus();
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current?.requestFullscreen();
    } catch {
      notify("Fullscreen is unavailable in this browser.");
    }
  }
  async function render() {
    const person = studio.current?.snapshot(true);
    if (!person) {
      setRenderError("Add a person to the fitting room first.");
      return;
    }
    setRenderError("");
    setRenderBusy(true);
    renderAbort.current = new AbortController();
    try {
      const image = await requestRender(
        backend,
        accessToken,
        person,
        garment,
        renderAbort.current.signal,
      );
      setRenderImage(image);
    } catch (e) {
      setRenderError((e as Error).message);
    } finally {
      setRenderBusy(false);
    }
  }
  const filtered = [...custom, ...catalogue].filter(
    (g) =>
      category === "All" ||
      (category === "Tops" && g.category === "top") ||
      (category === "Dresses" && g.category === "dress") ||
      (category === "Bottoms" && g.category === "bottom"),
  );
  const fit = recommendedSize(chest, chart, ease);
  return (
    <>
      <a href="#fitting-room" className="skip-link">
        Skip to fitting room
      </a>
      <header className="site-header">
        <a className="wordmark" href="./" aria-label="DrapeIt home">
          <span className="logo-mark">d.</span>drape<span>it</span>
          <span className="studio-label">FITTING STUDIO</span>
        </a>
        <nav aria-label="Main navigation">
          <button className="nav-link current" onClick={() => setModal(null)}>
            Fitting room
          </button>
          <button className="nav-link" onClick={() => setModal("wardrobe")}>
            My wardrobe{" "}
            <span className="count">
              {looks.length.toString().padStart(2, "0")}
            </span>
          </button>
          <button className="nav-link" onClick={() => setModal("help")}>
            How it works <ArrowUpRight size={13} />
          </button>
        </nav>
        <button
          className="button extension-cta"
          onClick={() => setModal("extension")}
        >
          <Puzzle size={16} /> Get the extension <ArrowUpRight size={14} />
        </button>
        <button
          className="icon-button mobile-help"
          aria-label="How it works"
          onClick={() => setModal("help")}
        >
          <CircleHelp />
        </button>
      </header>
      <main id="fitting-room">
        <div className="page-heading">
          <div>
            <div className="breadcrumb">
              DrapeIt studio <ChevronRight size={12} /> Your fitting room
            </div>
            <h1>
              Good style starts with <em>you.</em>
            </h1>
            <p>A new look. Your own reflection. No dressing room required.</p>
          </div>
          <span className="local-badge">
            <span className="status-dot" /> PRIVATE BY DESIGN{" "}
            <ShieldCheck size={14} />
          </span>
        </div>
        <div className="mobile-switch">
          <button
            onClick={() =>
              setMobilePanel(mobilePanel === "garments" ? null : "garments")
            }
          >
            <PackageOpen size={16} /> Choose a garment <ChevronDown size={14} />
          </button>
          <button
            onClick={() => setMobilePanel(mobilePanel === "fit" ? null : "fit")}
          >
            <SlidersHorizontal size={16} /> Customise fit{" "}
            <ChevronDown size={14} />
          </button>
        </div>
        <div className="workspace">
          <aside
            className={`garment-panel ${mobilePanel === "garments" ? "mobile-open" : ""}`}
            aria-label="Garment library"
          >
            <div className="panel-title">
              <h2>Your next look</h2>
              <span>01</span>
            </div>
            <div
              className="import-tabs"
              role="tablist"
              aria-label="Garment source"
            >
              <button
                role="tab"
                aria-selected={tab === "collection"}
                className={tab === "collection" ? "active" : ""}
                onClick={() => setTab("collection")}
              >
                <PackageOpen size={16} /> Collection
              </button>
              <button
                role="tab"
                aria-selected={tab === "upload"}
                className={tab === "upload" ? "active" : ""}
                onClick={() => setTab("upload")}
              >
                <Upload size={16} /> Upload
              </button>
              <button
                role="tab"
                aria-selected={tab === "link"}
                className={tab === "link" ? "active" : ""}
                onClick={() => setTab("link")}
              >
                <Link2 size={16} /> Link
              </button>
            </div>
            {tab === "collection" && (
              <>
                <div className="category-filter">
                  {["All", "Tops", "Dresses", "Bottoms"].map((c) => (
                    <button
                      key={c}
                      className={category === c ? "active" : ""}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="collection-label">
                  <span>THE EVERYDAY EDIT</span>
                  <span>{filtered.length} pieces</span>
                </div>
                <div className="garment-grid">
                  {filtered.map((g) => (
                    <button
                      key={g.id}
                      className={`garment-card ${garment.id === g.id ? "selected" : ""}`}
                      onClick={() => choose(g)}
                      aria-pressed={garment.id === g.id}
                    >
                      <div
                        className="garment-image"
                        style={{
                          background:
                            g.id === "dress"
                              ? "#e6e9e2"
                              : g.id === "kurta"
                                ? "#ebece5"
                                : "#eeebe4",
                        }}
                      >
                        <img src={g.image} alt={g.name} />
                        {garment.id === g.id && (
                          <span className="garment-check">
                            <Check size={12} />
                          </span>
                        )}
                        {g.imported && (
                          <span className="imported-tag">YOURS</span>
                        )}
                      </div>
                      <strong>{g.name}</strong>
                      <span>{g.subtitle}</span>
                    </button>
                  ))}
                </div>
                {filtered.length === 0 && (
                  <div className="empty-category">
                    <ImagePlus size={25} />
                    <p>Bring your own {category.toLowerCase()}.</p>
                    <button
                      className="button small"
                      onClick={() => garmentFile.current?.click()}
                    >
                      Upload a garment
                    </button>
                  </div>
                )}
                <button
                  className="add-own"
                  onClick={() => garmentFile.current?.click()}
                >
                  <Plus size={17} /> Bring your own garment{" "}
                  <ArrowUpRight size={15} />
                </button>
                <p className="small-note">
                  Real garment photos, ready to try.
                  <br />
                  Or bring an item from your favourite store.
                </p>
              </>
            )}
            {tab === "upload" && (
              <div className="import-panel">
                <span className="large-icon">
                  <ImagePlus />
                </span>
                <h3>
                  Your find.
                  <br />
                  Your fitting room.
                </h3>
                <p>
                  Add a front-facing photo of any garment. A flat lay or
                  transparent image gives the cleanest preview.
                </p>
                <button
                  className="upload-zone"
                  onClick={() => garmentFile.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    try {
                      if (e.dataTransfer.files[0])
                        setEditor(await readFile(e.dataTransfer.files[0]));
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  <Upload size={23} />
                  <strong>Choose or drop a garment</strong>
                  <span>JPG, PNG, WebP · Up to 20 MB</span>
                </button>
                <div className="tip">
                  <ScissorsIcon />
                  <p>
                    Remove the background with one tap, or outline the garment
                    for more control.
                  </p>
                </div>
              </div>
            )}
            {tab === "link" && (
              <div className="import-panel">
                <span className="large-icon">
                  <Link2 />
                </span>
                <h3>
                  Found something
                  <br />
                  you love?
                </h3>
                <p>
                  {isExtension
                    ? "Paste a product page or image link. We’ll look for its product photo."
                    : "Paste a direct image link. For store product pages, use the extension to select the garment."}
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    importLink();
                  }}
                >
                  <label htmlFor="product-url">
                    {isExtension ? "Product or image URL" : "Garment image URL"}
                  </label>
                  <input
                    id="product-url"
                    type="url"
                    placeholder="https://store.com/image.jpg"
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                  <button
                    className="button primary"
                    type="submit"
                    disabled={importing}
                  >
                    {importing ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Link2 size={15} />
                    )}{" "}
                    {importing ? "Importing…" : "Import garment"}
                  </button>
                </form>
                {importError && (
                  <p className="inline-error" role="alert">
                    {importError}
                  </p>
                )}
                <div className="tip">
                  <Puzzle size={20} />
                  <p>
                    Shopping on a store website? The extension opens a fitting
                    window beside the page.
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setModal("extension")}
                >
                  Get the browser extension <ArrowUpRight size={14} />
                </button>
              </div>
            )}
            <div className="panel-bottom">
              <ShieldCheck size={15} />
              <span>No account. No camera uploads.</span>
            </div>
          </aside>
          <section className="mirror-panel" aria-label="Fitting mirror">
            <div className="mirror-toolbar">
              <div className="mirror-title">
                <span
                  className={`status-dot ${tracking.status === "tracking" ? "live" : ""}`}
                />
                <h2>Your mirror</h2>
                <span className="beta-tag">LIVE PREVIEW</span>
              </div>
              <div className="toolbar-actions">
                {!isExtension && !isShoppingWindow && (
                  <button
                    className="icon-button"
                    aria-label="Open shopping window"
                    title="Open a fitting window beside your store — no install"
                    onClick={openShoppingWindow}
                  >
                    <PanelsTopLeft size={17} />
                  </button>
                )}
                <button
                  className="ai-launch"
                  onClick={() => {
                    studio.current?.stop();
                    setModal("realtime");
                  }}
                >
                  <Sparkles size={13} /> AI live try-on
                </button>
                <button
                  className="icon-button"
                  aria-label="Upload a photo of yourself"
                  title="Upload a photo of yourself"
                  onClick={() => personFile.current?.click()}
                >
                  <ImagePlus size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Upload a human video for motion preview"
                  title="Try a video"
                  onClick={() => videoFile.current?.click()}
                >
                  <Video size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Fullscreen mirror"
                  onClick={fullscreen}
                >
                  <Expand size={16} />
                </button>
              </div>
            </div>
            <div ref={stage} className="stage-shell">
              <Studio
                ref={studio}
                garment={garment}
                settings={settings}
                compare={compare}
                onTracking={setTracking}
                onError={notify}
                onUpload={() => personFile.current?.click()}
                onSource={setSource}
              />
              {source && (
                <>
                  <div className="tracking-caption" role="status">
                    {tracking.status === "tracking" ? (
                      <>
                        <span className="status-dot live" /> Body tracked{" "}
                        {tracking.fps > 0 && <span>· {tracking.fps} fps</span>}
                      </>
                    ) : tracking.status === "loading" ? (
                      <>
                        <LoaderCircle className="spin" size={13} /> Preparing
                        tracking
                      </>
                    ) : (
                      <>
                        <ScanLine size={15} /> Step back so your shoulders and
                        hips are visible
                      </>
                    )}
                  </div>
                  <button
                    className="before-button"
                    onPointerDown={() => setCompare(true)}
                    onPointerUp={() => setCompare(false)}
                    onPointerLeave={() => setCompare(false)}
                    onPointerCancel={() => setCompare(false)}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") setCompare(true);
                    }}
                    onKeyUp={() => setCompare(false)}
                    onBlur={() => setCompare(false)}
                    aria-label="Hold to see original"
                  >
                    <Eye size={15} />
                    {compare ? "Original" : "Hold for original"}
                  </button>
                </>
              )}
            </div>
            <div className="mirror-footer">
              <div className="current-look">
                <span
                  className="color-dot"
                  style={{ background: settings.color || garment.color }}
                />
                <div>
                  <strong>{garment.name}</strong>
                  <span>
                    Size {settings.size} <i>·</i> {source || "Camera ready"}
                  </span>
                </div>
              </div>
              <button
                className="button small"
                onClick={() =>
                  source
                    ? studio.current?.stop()
                    : studio.current?.startCamera()
                }
              >
                <Camera size={15} />
                {source ? "Stop preview" : "Start camera"}
              </button>
            </div>
            <div className="preview-disclosure">
              <ScanLine size={14} />
              <span>
                Live, pose-tracked visual preview. Fabric drape and exact fit
                are not simulated.
              </span>
              <button
                aria-label="About preview accuracy"
                onClick={() => setModal("help")}
              >
                <CircleHelp size={14} />
              </button>
            </div>
          </section>
          <aside
            className={`fit-panel ${mobilePanel === "fit" ? "mobile-open" : ""}`}
            aria-label="Fit customisation"
          >
            <div className="panel-title">
              <h2>Make it yours</h2>
              <span>02</span>
            </div>
            <div className="fit-intro">
              A little adjustment. A better picture.
            </div>
            <section className="control-section">
              <div className="control-heading">
                <h3>Garment size</h3>
                <button
                  className="text-button"
                  onClick={() => setModal("measure")}
                >
                  <Ruler size={13} /> Size guide
                </button>
              </div>
              <div className="sizes" role="group" aria-label="Garment size">
                {sizes.map((s) => (
                  <button
                    key={s}
                    className={settings.size === s ? "selected" : ""}
                    aria-pressed={settings.size === s}
                    onClick={() => update("size", s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <span className="control-note">
                Visual scale · Check the brand’s size chart
              </span>
            </section>
            <section className="control-section">
              <div className="control-heading">
                <h3>Colour story</h3>
                <span>{settings.color ? "Custom tint" : "Original"}</span>
              </div>
              <div className="swatches">
                {swatches.map((c, i) => (
                  <button
                    key={i}
                    style={{ background: c || garment.color }}
                    className={settings.color === c ? "selected" : ""}
                    aria-label={
                      [
                        "Original colour",
                        "Sand tint",
                        "Sage tint",
                        "Terracotta tint",
                        "Forest tint",
                        "Ivory tint",
                        "Charcoal tint",
                      ][i]
                    }
                    aria-pressed={settings.color === c}
                    onClick={() => update("color", c)}
                  >
                    {i === 0 ? (
                      <RotateCcw size={12} />
                    ) : settings.color === c ? (
                      <Check size={13} />
                    ) : null}
                  </button>
                ))}
              </div>
            </section>
            <section className="control-section">
              <h3>Texture & pattern</h3>
              <div className="patterns">
                {(["original", "stripes", "checks", "dots"] as const).map(
                  (p) => (
                    <button
                      key={p}
                      className={settings.pattern === p ? "selected" : ""}
                      aria-pressed={settings.pattern === p}
                      onClick={() => update("pattern", p)}
                    >
                      <span className={`pattern-sample ${p}`} />
                      {p === "original"
                        ? "Original"
                        : p[0].toUpperCase() + p.slice(1)}
                    </button>
                  ),
                )}
              </div>
            </section>
            <section className="control-section fine-tune">
              <div className="control-heading">
                <h3>Fine-tune the silhouette</h3>
                <SlidersHorizontal size={14} />
              </div>
              <Range
                label="Width"
                value={settings.width}
                min={70}
                max={145}
                unit="%"
                onChange={(v) => update("width", v)}
              />
              <Range
                label="Length"
                value={settings.length}
                min={65}
                max={150}
                unit="%"
                onChange={(v) => update("length", v)}
              />
              <Range
                label="Vertical position"
                value={settings.offset}
                min={-30}
                max={30}
                unit=""
                onChange={(v) => update("offset", v)}
              />
            </section>
            <button
              className="advanced-toggle"
              aria-expanded={advanced}
              onClick={() => setAdvanced(!advanced)}
            >
              <Settings2 size={14} /> Preview settings <ChevronDown size={14} />
            </button>
            {advanced && (
              <div className="advanced-controls">
                <Toggle
                  label="Mirror camera"
                  checked={settings.mirror}
                  onChange={(v) => update("mirror", v)}
                />
                <Toggle
                  label="Hands in front"
                  checked={settings.occlusion}
                  onChange={(v) => update("occlusion", v)}
                />
                <Toggle
                  label="Tracking guides"
                  checked={settings.showGuides}
                  onChange={(v) => update("showGuides", v)}
                />
                <Range
                  label="Garment opacity"
                  value={settings.opacity}
                  min={20}
                  max={100}
                  unit="%"
                  onChange={(v) => update("opacity", v)}
                />
                <button
                  className="text-button"
                  onClick={() => setModal("render")}
                >
                  <Sparkles size={13} /> Connect photorealistic rendering
                </button>
              </div>
            )}
            <button
              className="text-button reset"
              onClick={() => {
                setSettings(defaultSettings);
                notify("Fit adjustments reset.");
              }}
            >
              <RotateCcw size={13} /> Reset adjustments
            </button>
            <div className="save-actions">
              <button
                className="button primary"
                onClick={saveLook}
                disabled={tracking.status !== "tracking"}
                title={
                  tracking.status === "tracking"
                    ? "Save this look"
                    : "Your body must be detected to save a look"
                }
              >
                <Bookmark size={16} /> Save this look <Plus size={15} />
              </button>
              <button
                className="button"
                onClick={snapshot}
                disabled={tracking.status !== "tracking"}
              >
                <ArrowDownToLine size={16} /> Download snapshot
              </button>
              <span>Saved only in this browser. Always yours.</span>
            </div>
          </aside>
        </div>
        <section className="ways-strip" aria-label="Three ways to try it on">
          <div className="ways-heading">
            <span className="eyebrow">ONE FITTING ROOM.</span>
            <h2>Three ways in.</h2>
          </div>
          <button onClick={() => setModal("extension")}>
            <span className="way-icon">
              <Puzzle size={21} />
            </span>
            <div>
              <h3>
                While you shop <ArrowUpRight size={14} />
              </h3>
              <p>Pick a piece, right from the store.</p>
            </div>
            <span className="way-number">01</span>
          </button>
          <button
            onClick={() => {
              setTab("upload");
              setMobilePanel("garments");
              garmentFile.current?.click();
            }}
          >
            <span className="way-icon">
              <ImagePlus size={21} />
            </span>
            <div>
              <h3>
                From your camera roll <ArrowUpRight size={14} />
              </h3>
              <p>Give that saved outfit a try.</p>
            </div>
            <span className="way-number">02</span>
          </button>
          <button
            onClick={() => {
              setTab("link");
              setMobilePanel("garments");
              document
                .getElementById("fitting-room")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <span className="way-icon">
              <Link2 size={21} />
            </span>
            <div>
              <h3>
                From a link <ArrowUpRight size={14} />
              </h3>
              <p>Bring your next find into view.</p>
            </div>
            <span className="way-number">03</span>
          </button>
        </section>
      </main>
      <footer className="site-footer">
        <span className="footer-brand">
          drapeit<span> / </span>See the fit. Feel like yourself.
        </span>
        <div>
          <span>
            <ShieldCheck size={12} /> On-device camera processing
          </span>
          <button onClick={() => setModal("help")}>Privacy & accuracy</button>
          <a
            href="https://github.com/971jawad/drapeit"
            target="_blank"
            rel="noreferrer"
          >
            View source <ArrowUpRight size={12} />
          </a>
        </div>
      </footer>
      <input
        ref={personFile}
        data-testid="person-file"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => fileChange(e, "person")}
      />
      <input
        ref={garmentFile}
        data-testid="garment-file"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => fileChange(e, "garment")}
      />
      <input
        ref={videoFile}
        data-testid="video-file"
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        hidden
        onChange={(e) => fileChange(e, "video")}
      />
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {editor && (
        <GarmentEditor
          source={editor}
          onClose={() => setEditor("")}
          onApply={(image, name, type, sleeves) => {
            const g: Garment = {
              id: crypto.randomUUID(),
              name,
              category: type,
              sleeves,
              image,
              subtitle: "Your import · Custom piece",
              color: "#b49778",
              imported: true,
            };
            setCustom((c) => [g, ...c]);
            choose(g);
            setTab("collection");
            setCategory("All");
            setEditor("");
            notify(
              "Your garment is ready. Start the camera or add your photo.",
            );
          }}
        />
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !renderBusy) setModal(null);
          }}
        >
          <section
            className={`modal ${modal === "wardrobe" || modal === "realtime" ? "wardrobe-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <header>
              <div>
                <span className="eyebrow">DRAPEIT STUDIO</span>
                <h2 id="modal-title">
                  {
                    {
                      help: "A fitting room, explained.",
                      extension: "Your fitting room. Any store.",
                      wardrobe: "Your personal wardrobe.",
                      measure: "Find your starting size.",
                      render: "A more realistic still image.",
                      realtime: "Your live AI fitting room.",
                    }[modal]
                  }
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close dialog"
                onClick={() => {
                  renderAbort.current?.abort();
                  setModal(null);
                }}
              >
                <X />
              </button>
            </header>
            {modal === "realtime" && (
              <RealtimeTryOn
                garment={garment}
                garments={[...custom, ...catalogue]}
                onChoose={choose}
              />
            )}
            {modal === "help" && (
              <div className="help-content">
                <div className="help-step">
                  <span>01</span>
                  <div>
                    <h3>Bring a garment</h3>
                    <p>
                      Pick a photographed garment, upload your own photo, import
                      a direct image URL, or use the extension on a product
                      page. Remove the background and any person from the
                      garment image.
                    </p>
                  </div>
                </div>
                <div className="help-step">
                  <span>02</span>
                  <div>
                    <h3>Step into the frame</h3>
                    <p>
                      Use your camera, a clear front-facing photo, or a video.
                      Show both shoulders and hips; for a dress or trousers,
                      include your knees and feet. Use even lighting and a
                      simple background.
                    </p>
                  </div>
                </div>
                <div className="help-step">
                  <span>03</span>
                  <div>
                    <h3>Adjust, compare, keep</h3>
                    <p>
                      Try sizes, colours and patterns. Adjust width, length and
                      placement. Hold “Original” to compare, then save or
                      download your look.
                    </p>
                  </div>
                </div>
                <div className="info-box">
                  <h3>What this preview can tell you</h3>
                  <p>
                    The browser engine tracks a single person and warps a 2D
                    garment image to their pose. It helps you explore colour and
                    silhouette. It does not replace clothing pixels, simulate
                    fabric, reconstruct unseen garment surfaces, or measure your
                    body. Side views and fast movement are less reliable. Size
                    labels scale the overlay; only your measurements and the
                    brand’s chart can support a size choice.
                  </p>
                </div>
                <div className="info-box">
                  <h3>Your camera belongs to you</h3>
                  <p>
                    Camera frames, imported photos and videos stay on your
                    device. Tracking models are downloaded from this site. Saved
                    looks live in your browser storage and can be deleted in My
                    wardrobe. Image-link imports contact the image host.
                    Optional photorealistic rendering sends images only after
                    you explicitly request a render from your configured
                    service.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setModal(null)}
                >
                  Back to the fitting room <ArrowUpRight size={15} />
                </button>
              </div>
            )}
            {modal === "extension" && (
              <div className="help-content">
                <div className="extension-illustration">
                  <div className="fake-browser">
                    <span />
                    <span />
                    <span />
                    <i>your favourite store</i>
                  </div>
                  <div className="extension-preview">
                    <img
                      src={catalogue[0].image}
                      alt="A shirt on a store page"
                    />
                    <div>
                      <span className="logo-mark">d.</span>
                      <strong>
                        Try it on.
                        <br />
                        Right here.
                      </strong>
                      <span>YOUR FITTING WINDOW</span>
                    </div>
                  </div>
                </div>
                <p>
                  Built for desktop Chrome and Edge. Select a product photo on a
                  store page and open a compact live fitting window alongside
                  it.
                </p>
                {!isExtension && (
                  <div className="info-box">
                    <h3>Shop with a window. No install needed.</h3>
                    <p>
                      Open a compact fitting room and keep it beside your store.
                      Save the product image and upload it, or paste its direct
                      image link when the store allows imports. Start your
                      camera and switch garments as you browse. The window
                      cannot read the store page or select its images
                      automatically.
                    </p>
                    <button className="button" onClick={openShoppingWindow}>
                      <PanelsTopLeft size={16} /> Open shopping window
                    </button>
                  </div>
                )}
                <ol className="install-steps">
                  <li>Download and unzip the extension package.</li>
                  <li>
                    Open <code>chrome://extensions</code> or{" "}
                    <code>edge://extensions</code> and enable Developer mode.
                  </li>
                  <li>
                    Choose <strong>Load unpacked</strong>, then select the
                    extracted folder containing <code>manifest.json</code>.
                  </li>
                  <li>
                    Visit a clothing store, click the DrapeIt extension, then{" "}
                    <strong>Pick a garment from this page</strong>.
                  </li>
                  <li>
                    Click the product image, allow access to its image host, and
                    start your camera in the fitting window.
                  </li>
                </ol>
                <div className="button-row">
                  <a
                    className="button primary"
                    href={`${import.meta.env.BASE_URL}drapeit-extension.zip`}
                    download
                  >
                    <Download size={16} /> Download extension
                  </a>
                  <button
                    className="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          "chrome://extensions",
                        );
                        notify("Extensions page address copied.");
                      } catch {
                        notify("Open chrome://extensions in a new tab.");
                      }
                    }}
                  >
                    <Clipboard size={15} /> Copy setup address
                  </button>
                </div>
                <p className="small-note">
                  The extension is distributed as an unpacked developer build,
                  not a Chrome Web Store listing. Access is requested only for
                  stores you choose. Browser-internal pages and protected image
                  viewers cannot be selected.
                </p>
              </div>
            )}
            {modal === "wardrobe" && (
              <>
                {looks.length === 0 ? (
                  <div className="empty-state">
                    <Bookmark size={36} />
                    <h3>A wardrobe waiting for you.</h3>
                    <p>
                      Try a garment and save your first look. Your snapshots
                      stay in this browser.
                    </p>
                    <button
                      className="button primary"
                      onClick={() => setModal(null)}
                    >
                      Create my first look
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="wardrobe-top">
                      <p>
                        {looks.length} of 8 local looks · Choose two to compare.
                      </p>
                      {selectedLooks.length > 0 && (
                        <button
                          className="text-button"
                          onClick={() => setSelectedLooks([])}
                        >
                          Clear selection
                        </button>
                      )}
                    </div>
                    <div
                      className={
                        selectedLooks.length === 2
                          ? "comparison-grid"
                          : "wardrobe-grid"
                      }
                    >
                      {(selectedLooks.length === 2
                        ? looks.filter((l) => selectedLooks.includes(l.id))
                        : looks
                      ).map((l) => (
                        <article
                          className={`saved-look ${selectedLooks.includes(l.id) ? "selected" : ""}`}
                          key={l.id}
                        >
                          <button
                            className="look-image"
                            onClick={() =>
                              setSelectedLooks((s) =>
                                s.includes(l.id)
                                  ? s.filter((x) => x !== l.id)
                                  : [...s.slice(-1), l.id],
                              )
                            }
                            aria-pressed={selectedLooks.includes(l.id)}
                            aria-label={`Select ${l.name} for comparison`}
                          >
                            <img
                              src={l.image}
                              alt={`Your saved look: ${l.name}`}
                            />
                            <span>
                              {selectedLooks.includes(l.id) ? (
                                <Check size={15} />
                              ) : (
                                <ArrowLeftRight size={15} />
                              )}
                            </span>
                          </button>
                          <div>
                            <strong>{l.name}</strong>
                            <span>
                              Size {l.size} ·{" "}
                              {new Date(l.date).toLocaleDateString()}
                            </span>
                            <div className="button-row">
                              <button
                                className="text-button"
                                onClick={() =>
                                  download(l.image, `drapeit-${l.id}.jpg`)
                                }
                              >
                                <Download size={14} /> Download
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Delete ${l.name}`}
                                onClick={() => removeLook(l.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            {modal === "measure" && (
              <div className="measure-content">
                <p>
                  Enter your chest measurement and the{" "}
                  <strong>garment chest circumference</strong> from the brand’s
                  size chart. For a flat pit-to-pit measurement, multiply it by
                  two.
                </p>
                <div className="info-box">
                  <strong>
                    Illustrative chart below — replace with the brand’s values.
                  </strong>
                  <p>
                    These are not universal sizes. The recommendation compares
                    chest circumference plus your chosen room to move.
                  </p>
                </div>
                <div className="measurement-fields">
                  <label>
                    Your chest (cm)
                    <input
                      type="number"
                      min="40"
                      max="220"
                      value={chest}
                      onChange={(e) => setChest(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Room to move (cm)
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={ease}
                      onChange={(e) =>
                        setEase(
                          Math.max(0, Math.min(30, Number(e.target.value))),
                        )
                      }
                    />
                  </label>
                </div>
                <div className="chart-inputs">
                  {sizes.map((s) => (
                    <label key={s}>
                      {s}
                      <input
                        type="number"
                        min="40"
                        max="250"
                        aria-label={`${s} garment chest in cm`}
                        value={chart[s]}
                        onChange={(e) =>
                          setChart({ ...chart, [s]: Number(e.target.value) })
                        }
                      />
                    </label>
                  ))}
                </div>
                <div className="recommendation">
                  <Ruler size={24} />
                  <div>
                    <span>BASED ON THE VALUES ABOVE</span>
                    <h3>
                      {fit
                        ? `Start with ${fit}`
                        : "No suitable size in this chart"}
                    </h3>
                    <p>
                      {fit
                        ? `${chart[fit] - chest} cm of chest ease. Check shoulders, length and fabric separately.`
                        : "Check your measurements or use the brand’s extended size chart."}
                    </p>
                  </div>
                </div>
                {fit && (
                  <button
                    className="button primary"
                    onClick={() => {
                      update("size", fit as Size);
                      setModal(null);
                    }}
                  >
                    Preview size {fit}
                  </button>
                )}
              </div>
            )}
            {modal === "render" && (
              <div className="render-content">
                <p>
                  Photorealistic try-on is a separate, asynchronous still-image
                  service. It does not turn the live camera preview into a
                  generated video.
                </p>
                <div className="info-box">
                  <h3>Bring your own secure rendering backend</h3>
                  <p>
                    No provider is connected by default. The repository includes
                    a Cloudflare Worker adapter for FASHN through fal.ai, with
                    server-side secrets, authentication and request limits.
                    Configure that worker, then connect it here.
                  </p>
                </div>
                <label>
                  Rendering service URL
                  <input
                    type="url"
                    placeholder="https://your-worker.workers.dev"
                    value={backend}
                    onChange={(e) => setBackend(e.target.value)}
                  />
                </label>
                <label>
                  Service access token (this session only)
                  <input
                    type="password"
                    autoComplete="off"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                  />
                </label>
                <p className="small-note">
                  Requesting a render sends the original person photo and
                  garment photo to your service and its AI provider. Your
                  selected tint, pattern and visual fit sliders are not sent.
                  Provider charges may apply.
                </p>
                {renderError && (
                  <p className="inline-error" role="alert">
                    {renderError}
                  </p>
                )}
                {renderImage && (
                  <div className="render-result">
                    <img src={renderImage} alt="AI-generated try-on still" />
                    <button
                      className="button"
                      onClick={() =>
                        download(renderImage, "drapeit-ai-render.png")
                      }
                    >
                      <Download size={16} /> Download render
                    </button>
                  </div>
                )}
                <button
                  className="button primary"
                  disabled={!backend || !accessToken || renderBusy || !source}
                  onClick={render}
                >
                  {renderBusy ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Sparkles size={16} />
                  )}{" "}
                  {renderBusy
                    ? "Rendering your still image…"
                    : "Send photos & render"}
                </button>
                <a
                  className="text-button"
                  href="https://github.com/971jawad/drapeit/blob/main/server/README.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  Backend setup instructions <ArrowUpRight size={14} />
                </a>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
function ScissorsIcon() {
  return <ScanLine size={20} />;
}
function Range({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="range-control">
      <span>
        {label}
        <output>
          {value}
          {unit}
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            "--progress": `${((value - min) / (max - min)) * 100}%`,
          } as React.CSSProperties
        }
      />
    </label>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <i />
    </label>
  );
}
