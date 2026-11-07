# Verification

## Automated checks

- `npm test`: geometry movement/size/lower-body mapping, confidence gating, smoothing, brand chart sizing, backend origin/authentication/input/rate-limit/job boundaries.
- `npm run build`: TypeScript validation, production asset generation, self-contained MV3 extension packaging.
- Browser verification is performed against the deployed app. Its results and known limitations are recorded below after execution.

## Manual device acceptance

A replayed human video is useful for repeatable tracking verification; it is not evidence of a physical webcam test on the user's device. Before relying on a particular device:

1. Start the camera in HTTPS Chrome/Edge; allow camera access. Confirm no audio permission is requested.
2. Step back until shoulders/hips are tracked. Move left/right, raise each arm, then leave and re-enter frame. The garment should follow or disappear on tracking loss.
3. Try a garment upload and its cutout tools. Test size, tint, pattern, placement, original comparison and snapshot.
4. Save two looks, compare, reload and delete. Confirm the camera stops on Stop preview.
5. Load the unpacked extension, select an actual retailer's product image, grant that image host, and repeat the camera test.
6. Check mobile portrait/landscape, Safari behavior, low-light and low-end-device performance. These cannot be inferred from a desktop Chromium test.

## Optional provider

No paid AI provider was supplied. The worker is mock-tested; a real provider render, provider latency, visual fidelity, billing and retention behavior remain unverified.
