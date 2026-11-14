import { useEffect, useRef, useState } from "react";
import { Camera, Download, ImagePlus, LoaderCircle, ShieldCheck, Sparkles, X } from "lucide-react";
import type { Garment } from "../types";
import { loadImage, readFile, scaledCanvas } from "../engine/images";

interface Props {
  garment: Garment;
  garments: Garment[];
  onChoose: (g: Garment) => void;
}

async function jpegDataUrl(src: string): Promise<string> {
  const image = await loadImage(src);
  const canvas = scaledCanvas(image, 1000);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing unavailable on this device.");
  // Avoid black backgrounds when garments have transparent pixels.
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function garmentCategory(category: Garment["category"]) {
  return category === "dress" ? "one-pieces" : category === "bottom" ? "bottoms" : "tops";
}

/**
 * FASHN v1.5 is image-to-image: photo + garment -> a new photo.
 * Unlike Decart's old component, this does NOT stream generated video.
 */
export function FashnTryOn({ garment, garments, onChoose }: Props) {
  const [person, setPerson] = useState("");
  const [output, setOutput] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const cameraVideo = useRef<HTMLVideoElement | null>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const request = useRef<AbortController | null>(null);
  const upload = useRef<HTMLInputElement | null>(null);

  function stopCamera() {
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    if (cameraVideo.current) cameraVideo.current.srcObject = null;
    setCameraOn(false);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/fashn-status", { signal: controller.signal, cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setConfigured(Boolean(data.configured)); })
      .catch(() => {})
      .finally(() => setChecking(false));
    return () => {
      controller.abort();
      request.current?.abort();
      cameraStream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    setOutput("");
  }, [garment.id]);

  async function openCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      cameraStream.current?.getTracks().forEach((track) => track.stop());
      cameraStream.current = stream;
      setCameraOn(true);
      // React mounts the preview conditionally after the state update.
      requestAnimationFrame(() => {
        if (cameraVideo.current) {
          cameraVideo.current.srcObject = stream;
          void cameraVideo.current.play().catch(() => {});
        }
      });
    } catch {
      setError("Could not start camera. Check camera permissions or upload a photo.");
    }
  }

  function capture() {
    const video = cameraVideo.current;
    if (!video || !video.videoWidth) {
      setError("Camera is not ready. Try again in a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setPerson(canvas.toDataURL("image/jpeg", 0.9));
    setOutput("");
    stopCamera();
  }

  async function selectPhoto(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      setPerson(await readFile(file));
      setOutput("");
      stopCamera();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function generate() {
    if (!person || !consent || busy) return;
    setError("");
    setBusy(true);
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const [personImage, garmentImage] = await Promise.all([
        jpegDataUrl(person),
        jpegDataUrl(garment.image),
      ]);
      const response = await fetch("/api/fashn-tryon", {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          person_image: personImage,
          garment_image: garmentImage,
          category: garmentCategory(garment.category),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The try-on could not be generated.");
      if (typeof data.image !== "string" || !/^data:image\/jpeg;base64,/.test(data.image)) {
        throw new Error("The GPU backend returned an invalid image.");
      }
      setOutput(data.image);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError((e as Error).message || "Generation failed. Please try again.");
    } finally {
      if (request.current === controller) request.current = null;
      setBusy(false);
    }
  }

  function save() {
    if (!output) return;
    const a = document.createElement("a");
    a.href = output;
    a.download = "drapeit2-fashn-tryon.jpg";
    a.click();
  }

  return (
    <div className="realtime-studio">
      <p className="ai-description">
        Open-source FASHN VTON v1.5 creates a realistic <strong>photo</strong> of you wearing
        the selected garment. It is not live generated video. Normal mirror mode stays free
        and works on your own device.
      </p>
      <div className="ai-view" style={{ aspectRatio: "3 / 4", maxHeight: 440 }}>
        {cameraOn ? (
          <video ref={cameraVideo} autoPlay muted playsInline
            style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }} />
        ) : (output || person) ? (
          <img src={output || person} alt={output ? "Generated virtual try-on" : "Your uploaded photo"}
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        ) : (
          <div className="ai-empty">
            <ImagePlus size={32} />
            <h3>Choose a photo of yourself</h3>
            <p>Upload a clear photo or take one with your webcam. Your selected garment will be applied to the photo.</p>
          </div>
        )}
        {busy && (
          <div className="ai-empty" style={{ background: "#1f2b23de" }}>
            <LoaderCircle className="spin" size={32} />
            <h3>Creating your try-on photo…</h3>
            <p>This model needs a running GPU server.</p>
          </div>
        )}
      </div>

      <div className="button-row" style={{ marginTop: 14, flexWrap: "wrap" }}>
        <input ref={upload} type="file" accept="image/png,image/jpeg,image/webp"
          style={{ display: "none" }}
          onChange={(event) => { void selectPhoto(event.target.files?.[0]); event.target.value = ""; }} />
        <button type="button" className="button" disabled={busy}
          onClick={() => upload.current?.click()}>
          <ImagePlus size={16} /> Upload my photo
        </button>
        {!cameraOn ? (
          <button type="button" className="button" disabled={busy} onClick={() => { void openCamera(); }}>
            <Camera size={16} /> Use camera
          </button>
        ) : (
          <>
            <button type="button" className="button primary" onClick={capture}>
              <Camera size={16} /> Take photo
            </button>
            <button type="button" className="button" onClick={stopCamera}>
              <X size={16} /> Cancel
            </button>
          </>
        )}
      </div>

      <div className="ai-garments" aria-label="Select garment for AI photo try-on">
        {garments.map((g) => (
          <button key={g.id} type="button"
            aria-label={"Try on " + g.name}
            aria-pressed={garment.id === g.id}
            className={garment.id === g.id ? "selected" : ""}
            disabled={busy} onClick={() => onChoose(g)}>
            <img src={g.image} alt={g.name} />
          </button>
        ))}
      </div>

      {!checking && !configured && (
        <p className="inline-error" role="status">
          FASHN GPU backend not connected. The free local mirror still works.
          To enable photorealistic photos, configure FASHN_BACKEND_URL and
          FASHN_BACKEND_SECRET on the Vercel project. See server/fashn/README.md.
        </p>
      )}
      <label className="ai-consent">
        <input type="checkbox" checked={consent} disabled={busy}
          onChange={(event) => setConsent(event.target.checked)} />
        <span>I agree to send my photo and garment image to the configured
          self-hosted GPU backend to generate an image. No Decart API is used.</span>
      </label>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="button-row">
        <button type="button" className="button primary"
          onClick={() => { void generate(); }}
          disabled={checking || !configured || !person || !consent || busy}>
          {busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
          Generate AI photo
        </button>
        <button type="button" className="button" onClick={save} disabled={!output || busy}>
          <Download size={16} /> Download result
        </button>
      </div>
      <p className="ai-session-note">
        <ShieldCheck size={13} />
        Free software, but GPU computing is required. An internet-facing public
        instance needs abuse protection. Generated results may not be accurate clothing fit.
      </p>
    </div>
  );
}
