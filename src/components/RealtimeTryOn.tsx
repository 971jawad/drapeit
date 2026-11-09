import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CircleStop,
  Download,
  LoaderCircle,
  Radio,
  ShieldCheck,
} from "lucide-react";
import type { RealTimeClient } from "@decartai/sdk";
import type { Garment } from "../types";
import { loadImage, scaledCanvas } from "../engine/images";
interface Props {
  garment: Garment;
  garments: Garment[];
  onChoose: (g: Garment) => void;
}
export function RealtimeTryOn({ garment, garments, onChoose }: Props) {
  const [endpoint, setEndpoint] = useState(""),
    [access, setAccess] = useState(""),
    [fit, setFit] = useState("regular"),
    [consent, setConsent] = useState(false),
    [state, setState] = useState("idle"),
    [error, setError] = useState(""),
    [seconds, setSeconds] = useState(0),
    [hasOutput, setHasOutput] = useState(false);
  const [hosted, setHosted] = useState<{
      configured: boolean;
      authenticated: boolean;
    } | null>(null),
    [checkingHost, setCheckingHost] = useState(true),
    [loginCode, setLoginCode] = useState(""),
    [loginBusy, setLoginBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("./api/hosted-status", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          if (data.hosted) setHosted(data);
        }
      })
      .catch(() => {})
      .finally(() => setCheckingHost(false));
    return () => controller.abort();
  }, []);
  async function login() {
    setLoginBusy(true);
    setError("");
    try {
      const response = await fetch("./api/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: loginCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not sign in.");
      setHosted({ configured: true, authenticated: true });
      setLoginCode("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoginBusy(false);
    }
  }
  const output = useRef<HTMLVideoElement>(null),
    camera = useRef<MediaStream | null>(null),
    session = useRef<RealTimeClient | null>(null),
    generation = useRef(0),
    clock = useRef<ReturnType<typeof setInterval> | null>(null),
    abort = useRef<AbortController | null>(null),
    latest = useRef({ garment, fit });
  latest.current = { garment, fit };
  const active = state !== "idle" && state !== "disconnected";
  function stop() {
    generation.current++;
    abort.current?.abort();
    abort.current = null;
    session.current?.disconnect();
    session.current = null;
    camera.current?.getTracks().forEach((t) => t.stop());
    camera.current = null;
    if (clock.current) clearInterval(clock.current);
    clock.current = null;
    if (output.current) {
      const stream = output.current.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      output.current.srcObject = null;
    }
    setState("idle");
    setHasOutput(false);
  }
  useEffect(() => {
    const leave = () => stop();
    const hidden = () => {
      if (document.hidden) stop();
    };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      leave();
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  const prompt = () =>
    `Dress the person in the exact garment shown in the reference image, with a ${latest.current.fit} fit. Preserve the person's face, identity, body proportions, background and motion. Preserve the garment's actual texture, pattern, colour and details. Replace the existing clothing naturally; do not float a flat image over the video.`;
  async function reference() {
    const image = await loadImage(latest.current.garment.image);
    const canvas = scaledCanvas(image, 1024);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Cannot prepare garment image")),
        "image/png",
      ),
    );
  }
  useEffect(() => {
    if (!session.current) return;
    const token = generation.current;
    const timer = setTimeout(async () => {
      try {
        const image = await reference();
        if (token === generation.current)
          await session.current?.set({
            prompt: prompt(),
            image,
            enhance: false,
          });
      } catch {
        setError(
          "The outfit change could not be sent. Try selecting it again.",
        );
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [garment.id, fit]);
  async function start() {
    setError("");
    if (!consent) return;
    let base: URL;
    try {
      base = new URL(hosted ? location.origin : endpoint);
      if (base.protocol !== "https:" || base.username || base.password)
        throw new Error();
    } catch {
      setError("Use the HTTPS URL of your deployed token service.");
      return;
    }
    stop();
    const token = generation.current;
    abort.current = new AbortController();
    const signal = abort.current.signal;
    setState("connecting");
    setSeconds(0);
    try {
      const { createDecartClient, models } = await import("@decartai/sdk");
      if (token !== generation.current) return;
      const model = models.realtime("lucy-vton-3.6");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          frameRate: model.fps,
          width: { ideal: model.width },
          height: { ideal: model.height },
        },
      });
      if (token !== generation.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      camera.current = stream;
      const client = createDecartClient({
        telemetry: false,
        apiKeyProvider: async () => {
          const response = await fetch(
            new URL(hosted ? "/api/realtime-token" : "/realtime-token", base),
            {
              method: "POST",
              headers: hosted ? {} : { Authorization: `Bearer ${access}` },
              signal,
              credentials: hosted ? "same-origin" : "omit",
            },
          );
          const data = await response.json();
          if (!response.ok)
            throw new Error(data.error || "Unable to start a live session");
          if (typeof data.apiKey !== "string" || data.apiKey.startsWith("dct_"))
            throw new Error(
              "The service must return a short-lived client token, never a permanent provider key.",
            );
          return data.apiKey;
        },
      });
      const image = await reference();
      if (token !== generation.current) return;
      const connected = await client.realtime.connect(stream, {
        model,
        retries: hosted ? 2 : 0,
        mirror: "auto",
        initialState: { prompt: { text: prompt(), enhance: false }, image },
        onConnectionChange: (s) => {
          if (token === generation.current) setState(s);
        },
        onRemoteStream: (remote) => {
          if (token !== generation.current) {
            remote.getTracks().forEach((t) => t.stop());
            return;
          }
          if (output.current) {
            output.current.srcObject = remote;
            output.current
              .play()
              .then(() => setHasOutput(true))
              .catch(() =>
                setError("Click the video to play the live output."),
              );
          }
        },
      });
      if (token !== generation.current) {
        connected.disconnect();
        return;
      }
      session.current = connected;
      connected.on("error", () => {
        if (token === generation.current) {
          stop();
          setError(
            "The live session failed. Check provider credits and your connection before restarting.",
          );
        }
      });
      connected.on("sessionEnded", ({ reason }) => {
        if (token === generation.current) {
          stop();
          setError(`The provider ended the session (${reason}).`);
        }
      });
      const began = Date.now();
      clock.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - began) / 1000);
        setSeconds(elapsed);
        if (!hosted && elapsed >= 120) {
          stop();
          setError(
            "The two-minute session limit was reached. Start a new session only when ready.",
          );
        }
      }, 1000);
    } catch (e) {
      if (token === generation.current) {
        stop();
        setError(
          (e as Error).name === "NotAllowedError"
            ? "Allow camera access to start live try-on."
            : (e as Error).message,
        );
      }
    }
  }
  function capture() {
    if (!output.current?.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = output.current.videoWidth;
    c.height = output.current.videoHeight;
    c.getContext("2d")!.drawImage(output.current, 0, 0);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/jpeg", 0.92);
    a.download = "drapeit-live-ai.jpg";
    a.click();
  }
  return (
    <div className="realtime-studio">
      <p className="ai-description">
        Live AI clothing replacement via Lucy Virtual Try-On. This mode streams
        video to Decart; it is separate from the private on-device preview.
        Provider setup and credits are required.
      </p>
      <div className="ai-view">
        <video
          ref={output}
          playsInline
          muted
          onClick={() => output.current?.play()}
        />
        {!hasOutput && (
          <div className="ai-empty">
            {active ? (
              <LoaderCircle className="spin" size={32} />
            ) : (
              <Radio size={32} />
            )}
            <h3>
              {active
                ? "Connecting your live fitting session…"
                : hosted?.authenticated
                  ? "Ready for your live camera"
                  : "Connect a live rendering service"}
            </h3>
            <p>
              {active
                ? "Your generated video will appear here when the provider returns it."
                : hosted?.authenticated
                  ? "Choose a garment and start. Your generated fitting video will appear here."
                  : "Connect your service before starting a generated video session."}
            </p>
          </div>
        )}
        {hasOutput && (
          <span className="ai-live-badge">
            <span className="status-dot live" /> AI LIVE ·{" "}
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            {!hosted && " / 2:00"}
          </span>
        )}
      </div>
      <div className="ai-garments" aria-label="AI garment selection">
        {garments.map((g) => (
          <button
            key={g.id}
            aria-label={`AI try on ${g.name}`}
            aria-pressed={garment.id === g.id}
            className={garment.id === g.id ? "selected" : ""}
            onClick={() => onChoose(g)}
          >
            <img src={g.image} alt={g.name} />
          </button>
        ))}
      </div>
      {hosted && (
        <div className="info-box">
          <h3>
            {hosted.authenticated
              ? "Your service is connected"
              : "Connect this browser once"}
          </h3>
          <p>
            {hosted.authenticated
              ? "Session tokens renew automatically. Your provider key stays in the hosted service. Start when ready; streaming continues until you stop or leave this tab."
              : hosted.configured
                ? "Paste the service access code copied by the setup command. This browser will remember your sign-in; you do not need to paste video-session tokens."
                : "Complete the one-time hosting setup before starting."}
          </p>
          {!hosted.authenticated && hosted.configured && (
            <div className="ai-form">
              <label>
                Service access code
                <input
                  type="password"
                  autoComplete="current-password"
                  value={loginCode}
                  onChange={(e) => setLoginCode(e.target.value)}
                />
              </label>
              <button
                className="button primary"
                disabled={loginBusy || !loginCode}
                onClick={login}
              >
                {loginBusy ? "Connecting…" : "Remember this browser"}
              </button>
            </div>
          )}
        </div>
      )}
      <div className="ai-form">
        {!hosted && (
          <>
            <label>
              Token service URL
              <input
                type="url"
                placeholder="https://your-worker.workers.dev"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                disabled={active}
              />
            </label>
            <label>
              Service access token
              <input
                type="password"
                autoComplete="off"
                value={access}
                onChange={(e) => setAccess(e.target.value)}
                disabled={active}
              />
            </label>
          </>
        )}
        <label>
          Visual fit preference
          <select value={fit} onChange={(e) => setFit(e.target.value)}>
            <option value="regular">Regular</option>
            <option value="relaxed, slightly oversized">Relaxed</option>
            <option value="close-fitting">Close-fitting</option>
          </select>
        </label>
      </div>
      <p className="small-note">
        Fit preferences guide the generated appearance. They do not measure your
        body or guarantee a retail size. Local preview sliders do not control
        this AI model.
      </p>
      <label className="ai-consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={active}
        />
        <span>
          I want to send my camera video and garment image to Decart. I
          understand this uses provider credits. Audio is never sent.
        </span>
      </label>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        {active ? (
          <button className="button primary" onClick={stop}>
            <CircleStop size={16} /> Stop AI session
          </button>
        ) : (
          <button
            className="button primary"
            onClick={start}
            disabled={
              checkingHost ||
              !consent ||
              (hosted
                ? !hosted.authenticated || !hosted.configured
                : !endpoint || !access)
            }
          >
            <Camera size={16} /> Start live AI try-on
          </button>
        )}
        <button className="button" onClick={capture} disabled={!hasOutput}>
          <Download size={16} /> Save AI snapshot
        </button>
        <a
          className="text-button"
          href="https://github.com/971jawad/drapeit/blob/main/server/REALTIME.md"
          target="_blank"
          rel="noreferrer"
        >
          Set up the live service ↗
        </a>
      </div>
      <span className="ai-session-note">
        <ShieldCheck size={13} /> Provider key stays on the server.{" "}
        {hosted
          ? "Automatic reconnects use fresh tokens. Streaming stops when you stop or leave this tab. Provider availability and credits still apply."
          : "Sessions stop after two minutes or when you leave this tab."}
      </span>
    </div>
  );
}
