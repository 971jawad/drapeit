# Verification

## Automated checks

- `npm test`: geometry movement/size/lower-body mapping, confidence gating, smoothing, brand chart sizing, backend origin/authentication/input/rate-limit/job boundaries.
- `npm run build`: TypeScript validation, production asset generation, self-contained MV3 extension packaging.
- Browser verification uses Chromium with the real `getUserMedia` and MediaPipe pipeline, supplying prerecorded human footage as the browser's camera device. Local builds are served through intercepted HTTPS requests; deployed-site checks load the actual GitHub Pages URL without intercepting its assets.

## Observed results

- 22 unit checks passed: geometry (8), extension import boundaries (5), backend/provider token boundaries (9).
- TypeScript, production build, and self-contained extension ZIP packaging passed. GitHub Actions deployed successfully and the public HTTPS page returned 200.
- On the deployed site, the first human camera fixture passed detection, size/tint/pattern controls, wardrobe save, JPEG download, camera shutdown, measurement guidance, failed-import feedback and mobile layout/controls. One standalone cloud run reported 14 fps; this is a measurement of that fixture/environment, not a performance guarantee.
- Upload tests passed: human photo detection, actual model-driven garment cutout (transparent background and opaque garment centre), manual outline, direct CORS image link, no-person rejection, and uploaded human video with a distinct Video label.
- The final local build passed all eight camera/UI checks with both the longer first fixture and a four-second front-facing segment (11–12 fps in those runs). A timing fix records the actual captured video's timestamp before inference and starts tracking expiry after inference completes. This avoids treating an unprocessed newer frame as already processed on a slow CPU.
- The no-install shopping window opened, ran the camera tracker and accepted a garment upload. Browser checks also passed AI consent gating, the real SDK's authenticated request to a mocked unavailable token broker, no fake generated output, release of every camera track on failure, and actionable feedback for denied camera permission.
- A second human fixture with a phone obscuring the face detected a body and saved a look, but its snapshot-download test timed out during intermittent tracking. Earlier runs with rapid scene changes also intermittently failed to save. These cases are **not** a full pass; the engine requires a clearly visible front-facing person and does not promise robust occlusion or multiple-person tracking.
- Native MV3 installation was blocked by the cloud browser's managed extension policy. Packaged files and mocked import boundaries were checked, but native installation, retailer selection and extension camera behavior still require a real Chrome/Edge device test.
- No physical webcam on the user's computer, Safari/iOS device, low-end device, paid AI provider, or production multi-user load was tested.

## Reproduce browser checks

Install Playwright's Chromium with `npx playwright install chromium`, or set `QA_CHROMIUM` to an installed Chromium executable. Use your own consented human footage; private reference media and captured human screenshots are deliberately excluded from the repository. A fixture should show a front-facing person with shoulders and hips visible and avoid cuts between scenes.

```sh
npm ci
npm run build
mkdir -p test-results
ffmpeg -i your-human-video.mp4 -t 8 -vf 'scale=360:640,fps=15' -pix_fmt yuv420p test-results/human-a.y4m
ffmpeg -i your-human-video.mp4 -frames:v 1 test-results/person.png
```

Set `QA_PERSON_VIDEO` to the human video path (or copy it to `test-results/person.mp4`) and run `npm run test:e2e`. `QA_OUTPUT`, `QA_CAMERA`, and `QA_PERSON_PHOTO` override the output directory and private fixtures. Reports and screenshots are written only to `QA_OUTPUT` (default `test-results`, git-ignored).

`QA_BASE_URL=https://971jawad.github.io/drapeit/ node scripts/browser-qa.mjs` checks the deployed site. The session test also accepts `QA_BASE_URL`; import checks use the local built assets and an explicitly mocked CORS image host. `node scripts/extension-qa.mjs` requires a browser environment that permits unpacked extensions. Browser tests are optional owner-run checks; CI runs unit tests and the build without private footage.

## Manual device acceptance

A replayed human video is useful for repeatable tracking verification; it is not evidence of a physical webcam test on the user's device. Before relying on a particular device:

1. Start the camera in HTTPS Chrome/Edge; allow camera access. Confirm no audio permission is requested.
2. Step back until shoulders/hips are tracked. Move left/right, raise each arm, then leave and re-enter frame. The garment should follow or disappear on tracking loss.
3. Try a garment upload and its cutout tools. Test size, tint, pattern, placement, original comparison and snapshot.
4. Save two looks, compare, reload and delete. Confirm the camera stops on Stop preview.
5. Load the unpacked extension, select an actual retailer's product image, grant that image host, and repeat the camera test.
6. Check mobile portrait/landscape, Safari behavior, low-light and low-end-device performance. These cannot be inferred from a desktop Chromium test.

## Optional provider

No paid AI provider was supplied. The worker is mock-tested; a real provider render, provider latency, visual fidelity, billing and retention behavior remain unverified. The browser session test exercises the real SDK's token request against a mocked unavailable broker and checks consent, no fake output, and camera cleanup; it does not connect to Decart or prove generated-video quality. See [live provider setup](../server/REALTIME.md).
