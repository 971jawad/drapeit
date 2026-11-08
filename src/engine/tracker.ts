import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
let pending: Promise<PoseLandmarker> | null = null;
export function getTracker() {
  if (!pending)
    pending = (async () => {
      const files = await FilesetResolver.forVisionTasks(
        `${import.meta.env.BASE_URL}wasm`,
      );
      const options = {
        baseOptions: {
          modelAssetPath: `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`,
        },
        runningMode: "VIDEO" as const,
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      };
      // Software WebGL is dramatically slower than WASM CPU inference. Prefer
      // GPU only when the browser exposes an actual hardware renderer.
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl2");
      const debug = gl?.getExtension("WEBGL_debug_renderer_info");
      const renderer = debug
        ? String(gl!.getParameter(debug.UNMASKED_RENDERER_WEBGL))
        : "";
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      if (
        renderer &&
        !/swiftshader|llvmpipe|software|lavapipe/i.test(renderer)
      ) {
        try {
          return await PoseLandmarker.createFromOptions(files, {
            ...options,
            baseOptions: { ...options.baseOptions, delegate: "GPU" },
          });
        } catch {
          /* Use CPU when GPU creation is unsupported. */
        }
      }
      return PoseLandmarker.createFromOptions(files, options);
    })().catch((e) => {
      pending = null;
      throw e;
    });
  return pending;
}
