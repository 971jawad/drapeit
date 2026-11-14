import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Camera,
  ImagePlus,
  ShieldCheck,
  ScanLine,
  Video,
  LoaderCircle,
  MoveUpRight,
} from "lucide-react";
import type { FitSettings, Garment, Point, TrackingState } from "../types";
import { getTracker } from "../engine/tracker";
import { loadImage } from "../engine/images";
import { poseConfidence, smoothPose } from "../engine/geometry";
import { renderAccessory, renderGarment, texture } from "../engine/renderer";
export interface StudioHandle {
  startCamera: () => Promise<void>;
  stop: () => void;
  setPhoto: (src: string) => Promise<void>;
  setVideo: (file: File) => Promise<void>;
  snapshot: (original?: boolean) => string | null;
}
interface Props {
  garment: Garment;
  layers?: { garment: Garment; color: string }[];
  settings: FitSettings;
  compare: boolean;
  onTracking: (s: TrackingState) => void;
  onError: (m: string) => void;
  onUpload: () => void;
  onSource: (s: string) => void;
}
export const Studio = forwardRef<StudioHandle, Props>(function Studio(
  { garment, layers, settings, compare, onTracking, onError, onUpload, onSource },
  ref,
) {
  const canvas = useRef<HTMLCanvasElement>(null),
    video = useRef<HTMLVideoElement>(null),
    media = useRef<HTMLVideoElement | HTMLImageElement | null>(null),
    stream = useRef<MediaStream | null>(null),
    frame = useRef(0),
    generation = useRef(0),
    videoUrl = useRef(""),
    pose = useRef<Point[] | null>(null),
    lastSeen = useRef(0),
    textures = useRef<Map<string, HTMLCanvasElement>>(new Map()),
    latest = useRef({ settings, garment, layers, compare, onTracking, onError }),
    [source, setSource] = useState(""),
    [loading, setLoading] = useState(false);
  latest.current = { settings, garment, layers, compare, onTracking, onError };
  useEffect(() => {
    let alive = true;
    const pieces = layers?.length ? layers : [{ garment, color: settings.color }];
    const cache = new Map<string, HTMLCanvasElement>();
    Promise.all(pieces.map(async (piece) => {
      try {
        const img = await loadImage(piece.garment.image);
        const tinted = texture(img, { ...settings, color: piece.color }, piece.garment.photoCutout);
        if (alive) cache.set(piece.garment.id, tinted);
      } catch (e) {
        if (alive) onError("Could not load " + piece.garment.name + ": " + (e as Error).message);
      }
    })).then(() => {
      if (alive) textures.current = cache;
    });
    return () => { alive = false; };
  }, [garment, layers, settings.color, settings.pattern]);
  const stop = () => {
    generation.current++;
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) {
      video.current.pause();
      video.current.srcObject = null;
      video.current.removeAttribute("src");
      video.current.load();
    }
    if (videoUrl.current) {
      URL.revokeObjectURL(videoUrl.current);
      videoUrl.current = "";
    }
    media.current = null;
    pose.current = null;
    setSource("");
    setLoading(false);
    onSource("");
    onTracking({ status: "idle", fps: 0, confidence: 0 });
  };
  useEffect(
    () => () => {
      generation.current++;
      cancelAnimationFrame(frame.current);
      stream.current?.getTracks().forEach((t) => t.stop());
      if (videoUrl.current) URL.revokeObjectURL(videoUrl.current);
    },
    [],
  );
  async function run(
    input: HTMLVideoElement | HTMLImageElement,
    label: string,
    token: number,
  ) {
    media.current = input;
    setSource(label);
    onSource(label);
    setLoading(true);
    onTracking({ status: "loading", fps: 0, confidence: 0 });
    let tracker;
    try {
      tracker = await getTracker();
    } catch {
      if (generation.current === token) {
        setLoading(false);
        onError(
          "Body tracking could not load. Check your connection, then restart the camera.",
        );
        onTracking({ status: "error", fps: 0, confidence: 0 });
      }
      return;
    }
    if (generation.current !== token) return;
    // Reset temporal tracker state when switching source. A new still photo
    // must run detection from scratch, not inherit the preceding video's ROI.
    await tracker.setOptions({ runningMode: "IMAGE" });
    if (input instanceof HTMLVideoElement)
      await tracker.setOptions({ runningMode: "VIDEO" });
    if (generation.current !== token) return;
    setLoading(false);
    let detectionTime = 0,
      lastReport = performance.now(),
      count = 0,
      lastVideoTime = -1,
      photoDone = false,
      lastTimestamp = 0;
    let reportedStatus = "loading";
    const captured = document.createElement("canvas");
    const loop = (now: number) => {
      if (generation.current !== token || !canvas.current) return;
      const w =
          input instanceof HTMLVideoElement
            ? input.videoWidth
            : input.naturalWidth,
        h =
          input instanceof HTMLVideoElement
            ? input.videoHeight
            : input.naturalHeight;
      if (!w || !h) {
        frame.current = requestAnimationFrame(loop);
        return;
      }
      const out = canvas.current,
        scale = Math.min(1, 1280 / Math.max(w, h));
      if (
        out.width !== Math.round(w * scale) ||
        out.height !== Math.round(h * scale)
      ) {
        out.width = Math.round(w * scale);
        out.height = Math.round(h * scale);
      }
      const changed =
        input instanceof HTMLVideoElement
          ? input.currentTime !== lastVideoTime
          : !photoDone;
      if (changed && now - detectionTime >= 50) {
        try {
          // Capture once: inference, compositing and limb occlusion must use
          // the same pixels, even if inference takes longer than a video frame.
          const capturedVideoTime =
            input instanceof HTMLVideoElement ? input.currentTime : -1;
          captured.width = out.width;
          captured.height = out.height;
          captured
            .getContext("2d")!
            .drawImage(input, 0, 0, captured.width, captured.height);
          const ts = Math.max(performance.now(), lastTimestamp + 1);
          lastTimestamp = ts;
          const result =
            input instanceof HTMLImageElement
              ? tracker.detect(captured)
              : tracker.detectForVideo(captured, ts);
          const next = result.landmarks[0] as Point[] | undefined;
          const face = next
            ? Math.max(...[0, 2, 5, 7, 8].map((i) => next[i].visibility ?? 0))
            : 0;
          if (next && poseConfidence(next) > 0.5 && face > 0.55) {
            pose.current = smoothPose(pose.current, next, now - detectionTime);
            // Inference can exceed a frame interval on CPU. The rendered
            // image and pose still match; start loss expiry when it completes.
            lastSeen.current = performance.now();
          } else pose.current = null;
          result.close();
          photoDone = true;
          if (input instanceof HTMLVideoElement)
            // Record the frame we actually inferred, not a newer video frame
            // that arrived while synchronous inference blocked the main thread.
            lastVideoTime = capturedVideoTime;
          count++;
        } catch (e) {
          cancelAnimationFrame(frame.current);
          latest.current.onError(
            "Tracking stopped. Please restart your camera or choose another photo.",
          );
          latest.current.onTracking({
            status: "error",
            fps: 0,
            confidence: 0,
            message: String(e),
          });
          return;
        }
        detectionTime = now;
      }
      if (input instanceof HTMLVideoElement && now - lastSeen.current > 450)
        pose.current = null;
      const ctx = out.getContext("2d")!;
      ctx.clearRect(0, 0, out.width, out.height);
      ctx.save();
      if (latest.current.settings.mirror && label === "Camera") {
        ctx.translate(out.width, 0);
        ctx.scale(-1, 1);
      }
      if (captured.width && captured.height)
        ctx.drawImage(captured, 0, 0, out.width, out.height);
      if (pose.current && !latest.current.compare) {
        const chosen = latest.current.layers?.length
          ? latest.current.layers
          : [{ garment: latest.current.garment, color: latest.current.settings.color }];
        // Bottoms -> main layers -> outer layers -> accessories.
        const priority: Record<string, number> = {
          bottom: 0, dress: 1, top: 2, outer: 3,
          scarf: 4, neck: 5, wrist: 6, mask: 7, nose: 8,
        };
        const sorted = [...chosen].sort((a, b) =>
          (priority[a.garment.slot || a.garment.category] ?? 2) -
          (priority[b.garment.slot || b.garment.category] ?? 2));
        for (const piece of sorted) {
          const img = textures.current.get(piece.garment.id);
          if (!img) continue;
          const slot = piece.garment.slot || piece.garment.category;
          if (slot === "scarf" || slot === "mask" || slot === "wrist" ||
              slot === "neck" || slot === "nose") {
            renderAccessory(ctx, img, pose.current, latest.current.settings,
              slot, out.width, out.height);
          } else {
            renderGarment(ctx, img, pose.current,
              { ...latest.current.settings, color: piece.color },
              slot === "outer" ? "top" : piece.garment.category,
              captured, out.width, out.height, piece.garment.sleeves);
          }
        }
      }
      ctx.restore();
      const status = pose.current ? "tracking" : "searching";
      if (status !== reportedStatus || now - lastReport > 500) {
        latest.current.onTracking({
          status,
          fps:
            input instanceof HTMLImageElement
              ? 0
              : Math.round((count * 1000) / Math.max(1, now - lastReport)),
          confidence: pose.current ? poseConfidence(pose.current) : 0,
        });
        count = 0;
        lastReport = now;
        reportedStatus = status;
        out.dataset.pose = pose.current ? "detected" : "missing";
        out.dataset.source = label;
      }
      frame.current = requestAnimationFrame(loop);
    };
    frame.current = requestAnimationFrame(loop);
  }
  async function startCamera() {
    stop();
    const token = generation.current;
    setLoading(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera access requires HTTPS and a supported browser.",
        );
      const camera = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      if (generation.current !== token) {
        camera.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = camera;
      const v = video.current!;
      v.srcObject = camera;
      v.muted = true;
      await v.play();
      await run(v, "Camera", token);
    } catch (e) {
      if (generation.current !== token) return;
      stop();
      const name = (e as Error).name;
      onError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in your browser settings, then try again."
          : name === "NotFoundError"
            ? "No camera was found. Connect one, or upload a photo or video."
            : name === "NotReadableError"
              ? "Your camera is busy. Close other camera apps and try again."
              : (e as Error).message,
      );
    }
  }
  async function setPhoto(src: string) {
    stop();
    const token = generation.current;
    try {
      const i = await loadImage(src);
      if (generation.current === token) await run(i, "Photo", token);
    } catch (e) {
      onError((e as Error).message);
    }
  }
  async function setVideo(file: File) {
    stop();
    const token = generation.current;
    if (!file.type.startsWith("video/")) {
      onError("Choose a video file.");
      return;
    }
    if (file.size > 150 * 1024 * 1024) {
      onError("Choose a video smaller than 150 MB.");
      return;
    }
    try {
      videoUrl.current = URL.createObjectURL(file);
      const v = video.current!;
      v.src = videoUrl.current;
      v.loop = true;
      v.muted = true;
      await v.play();
      await run(v, "Video", token);
    } catch {
      stop();
      onError("This video format could not be played. Try an MP4 video.");
    }
  }
  function snapshot(original = false) {
    if (!canvas.current || !media.current || !pose.current) return null;
    const out = document.createElement("canvas");
    const scale = Math.min(1, 1000 / canvas.current.width);
    out.width = canvas.current.width * scale;
    out.height = canvas.current.height * scale;
    const ctx = out.getContext("2d")!;
    if (original && latest.current.settings.mirror && source === "Camera") {
      ctx.translate(out.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(
      original ? media.current : canvas.current,
      0,
      0,
      out.width,
      out.height,
    );
    return out.toDataURL("image/jpeg", 0.88);
  }
  useImperativeHandle(ref, () => ({
    startCamera,
    stop,
    setPhoto,
    setVideo,
    snapshot,
  }));
  return (
    <div className={`studio-stage ${source ? "has-source" : ""}`}>
      <video
        ref={video}
        className="source-video"
        playsInline
        muted
        aria-hidden="true"
      />
      <canvas
        ref={canvas}
        aria-label="Your virtual try-on preview"
        style={{ display: source ? "block" : "none" }}
      />
      {!source && (
        <div className="stage-welcome">
          <div className="mirror-art real-garment-art">
            <img src={garment.image} alt={garment.name} />
            <span className="art-label">
              <ScanLine size={13} /> REAL GARMENT · YOUR CAMERA
            </span>
          </div>
          <span className="eyebrow">YOUR PERSONAL FITTING ROOM</span>
          <h2>
            See it on you.
            <br />
            <em>In real time.</em>
          </h2>
          <p>
            Turn on your camera. Find your silhouette.
            <br />
            See a look move with you.
          </p>
          <button
            className="button primary"
            onClick={startCamera}
            disabled={loading}
          >
            {loading ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Camera size={17} />
            )}{" "}
            {loading ? "Opening camera…" : "Open my camera"}
            <MoveUpRight size={16} />
          </button>
          <button className="text-button" onClick={onUpload}>
            <ImagePlus size={15} /> Or try with a photo
          </button>
          <span className="privacy-note">
            <ShieldCheck size={13} /> Your camera stays on your device
          </span>
        </div>
      )}
      {source && loading && (
        <div className="stage-loading">
          <LoaderCircle className="spin" />
          <span>Loading body tracking…</span>
          <small>The first start downloads the on-device model.</small>
        </div>
      )}
      {source && (
        <span className="source-label">
          {source === "Camera" ? (
            <Camera size={13} />
          ) : source === "Video" ? (
            <Video size={13} />
          ) : (
            <ImagePlus size={13} />
          )}{" "}
          {source === "Camera"
            ? "LIVE CAMERA"
            : source === "Video"
              ? "VIDEO PREVIEW"
              : "PHOTO PREVIEW"}
        </span>
      )}
    </div>
  );
});
