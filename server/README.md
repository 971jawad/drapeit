# Optional photorealistic still rendering

The deployed browser experience works without this service. No AI provider account or key was supplied, so this adapter is **prepared and mock-tested, not deployed or validated against a paid provider**. It produces an asynchronous still image, not generated live video. It does not enforce the browser's size/tint/mesh adjustments.

## Configure

1. Create a fal.ai account, enable billing with a spending limit, and obtain a server-side API key. Review the current FASHN model terms and image retention policy.
2. In this directory, install/run the official Wrangler CLI: `npx wrangler login`.
3. Run `npx wrangler kv namespace create JOBS`. Put the returned namespace ID in `wrangler.jsonc`.
4. Set `ALLOWED_ORIGINS` to the exact web origin(s), comma separated, without paths. For the Pages deployment it is `https://971jawad.github.io`. For an unpacked extension, additionally allow its exact `chrome-extension://<id>` origin.
5. Set secrets with `npx wrangler secret put FAL_KEY` and `npx wrangler secret put ACCESS_TOKEN`. Generate a strong, distinct service access token. Never commit or paste your fal key into the frontend.
6. Run `npx wrangler deploy`. In DrapeIt → Preview settings → Connect photorealistic rendering, enter the worker HTTPS URL and the service access token. The service access token lives only in the current page's memory.
7. Add a person and garment, then explicitly select **Send photos & render**. This sends the original person image and garment image to the provider through the worker.

## Boundary and scaling

This adapter is intended for an owner-controlled deployment. It authenticates requests, uses an exact CORS allowlist, limits image sizes, fixes the model endpoint, prevents arbitrary upstream URL requests, stores only provider job URLs (one-hour TTL), and rate-limits submissions. Cloudflare's simple rate limit is local to a Cloudflare location, not a global billing cap; set the provider spending limit. API response bodies and image bytes are not logged by this code. Provider processing/retention is governed by its own policy; `X-Fal-Store-IO: 0` requests disabled input/output storage where supported and is not a retention guarantee.

Before a multi-user commercial launch, replace the shared access token with authenticated per-user sessions, bind job ownership to user IDs, add globally enforced quotas/billing controls, abuse protection, retention controls, observability, provider contract tests, and a job queue with retries/idempotency. A realtime generative-video service is a separate GPU-backed project and is not implemented by this adapter.

## Contract

- `POST /jobs`: `{person: dataURL, garment: dataURL, category: 'top'|'dress'|'bottom'}` → `{id,status}`.
- `GET /jobs/:id`: `{status:'pending'|'completed'|'failed', image?: HTTPS_URL}`.
- Both routes require `Authorization: Bearer <ACCESS_TOKEN>` and an allowed `Origin`.
- No request may contain arbitrary remote input URLs. Uploads use bounded image data URLs.

Unit tests use a mock provider. A real paid render must be tested after credentials are configured.
