# Real-time AI virtual try-on (Decart Lucy VTON)

This is the integration intended for the WhatsApp-style live clothing-replacement goal. It streams the user's actual camera and garment photo to `lucy-vton-3.6` and displays the returned generated video. It is distinct from the browser's local 2D overlay and from the FASHN still-image adapter.

**Status: implemented against the official SDK and documentation; token broker mock-tested; no funded Decart account was provided, so real paid-session connection, latency and visual quality are not yet verified.** Do not describe it as a tested match to the reference video. The public website's on-device engine works without a provider; AI live mode requires the setup below.

## Owner setup

Use your own computer's terminal. Install Node 22+ and GitHub CLI first.

```sh
gh repo clone 971jawad/drapeit
cd drapeit
npm ci
npx wrangler login
```

Create a Decart account at https://platform.decart.ai, review its live VTON pricing, set a spending limit, enable the required model, and create an API key. Keep this permanent key out of chat and frontend fields.

Wrangler's secret commands prompt locally for values. Enter the Decart key only when prompted for `DECART_API_KEY`. For `ACCESS_TOKEN`, choose a separate strong random password for your own token service; it is not the Decart key.

```sh
npx wrangler secret put DECART_API_KEY --config server/realtime.wrangler.jsonc
npx wrangler secret put ACCESS_TOKEN --config server/realtime.wrangler.jsonc
npx wrangler deploy --config server/realtime.wrangler.jsonc
```

If prompted to create the Worker before setting its first secret, accept the creation for `drapeit-live-token`. The token-only config does not need KV or a fal account. Alternatively, deploy first, then set the two secrets; until both exist the API returns 503.

Open the DrapeIt live site → **AI live try-on**, enter the resulting Worker HTTPS URL and your **service** access token, choose a garment, acknowledge streaming/cost consent, and start. Allow camera access. Do not enter your permanent provider key into the browser.

For the unpacked extension, add its exact `chrome-extension://<id>` origin to `ALLOWED_ORIGINS` (comma separated) and redeploy. Decart's origin-scoping field supports only HTTP(S), so extension-origin tokens omit that provider field while retaining model scope, short TTL, session cap, and the broker's origin/authentication checks. Native extension/provider compatibility remains a required device test.

## What is implemented

- Official `@decartai/sdk` 0.2.14, loaded only when AI mode starts.
- Actual `getUserMedia` camera with **no audio**; WebRTC-generated output is displayed only when a remote stream arrives.
- Real garment reference image and a natural-language fit preference; garment changes send an atomic prompt-plus-image update.
- Server-side permanent key; `apiKeyProvider` requests a short-lived token for connection/reconnection.
- Tokens restricted to `lucy-vton-3.6`, 120-second mint lifetime, 120-second per-session cap, and web-origin scope where supported.
- Exact broker CORS allowlist, separate bearer authentication, mint rate limit, no cache, no credential logging.
- No automatic initial connect retry. Camera tracks and provider session are released on Stop, close, tab leave, error, or the two-minute client timer.
- Explicit streaming/cost consent. No account, key, token, or provider credit is bundled.

The provider generates appearance; it does not establish true garment measurements or fit accuracy. Local 2D overlay size/tint/position controls do not drive this model. The AI dialog's regular/relaxed/close-fitting options are visual instructions only. Real garment fidelity, occlusion, face preservation, body diversity, adverse lighting, motion stability and latency need measured human testing with a configured account.

## Commercial hardening

The owner-controlled service token is not a multi-user authentication system. Before public paid usage, add per-user auth, job/session ownership, globally enforced quotas, provider spending limits, concurrency control, security/retention review and load testing. Cloudflare simple rate limits are location-scoped, not a global cost cap. Token expiry alone does not stop an established stream; the explicit session cap is essential.

## Primary references

- https://platform.decart.ai/models/lucy-vton
- https://docs.platform.decart.ai/getting-started/client-tokens
- https://docs.platform.decart.ai/sdks/javascript-realtime
- https://github.com/DecartAI/sdk
