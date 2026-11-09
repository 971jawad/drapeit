# Connect once: hosted live AI fitting room

This is the recommended owner setup for ongoing use. The provider account is configured once on Cloudflare. Browser sessions obtain fresh Decart tokens automatically on connection and reconnection, with no repeated token copying or two-minute application cutoff. The camera stops on Stop, closing the fitting room, or leaving/hiding the tab. Provider credits, outages, revoked keys and platform limits can still interrupt service; zero maintenance or permanent availability cannot be guaranteed.

## One-time Windows setup

Have your Decart API key ready locally. Run this in Command Prompt:

```bat
powershell -NoProfile -Command "& ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/971jawad/drapeit/main/scripts/setup-live.ps1').Content))"
```

The [reviewable helper](../scripts/setup-live.ps1):

1. Installs Node.js LTS with winget if needed and uses a pinned official Wrangler CLI.
2. Opens Cloudflare authorization in your browser. Sign in or create a Cloudflare account, then allow deployment to your account. If Cloudflare asks you to choose an account or workers.dev subdomain, complete that step.
3. Deploys `drapeit-live` as a persistent Cloudflare Worker.
4. Prompts privately for your Decart key and stores it as the `DECART_API_KEY` Worker secret. The key never goes into GitHub or the browser application.
5. Creates a separate service access code, stores it as `ACCESS_TOKEN`, and keeps a Windows DPAPI-protected copy under your local user profile.
6. Copies that service code and opens your new `https://drapeit-live.<your-subdomain>.workers.dev` URL. Paste into **Service access code** and select **Remember this browser** once.

Choose a garment, check the streaming/cost consent, and select **Start live AI try-on**. Allow the camera. You can close the setup terminal: it is not a server and does not need to remain open. Bookmark the **workers.dev URL**, which contains the hosted AI service; GitHub Pages alone cannot run this backend.

Your camera video goes directly to Decart over WebRTC. Cloudflare handles authentication and temporary credentials, not video rendering. Standard Lucy VTON 3.6 is [currently priced](https://docs.platform.decart.ai/getting-started/pricing) at $0.02 per active generation second ($1.20/minute). Trial credits and billing are managed in your Decart account. This setup does not purchase credits or enable automatic top-ups.

## What persists

- The permanent provider key stays in Cloudflare secrets until you replace/revoke it.
- Sign-in uses a signed, Secure, HttpOnly, SameSite=Strict cookie. Active use renews its 30-day lifetime. Clearing cookies, a new browser, or 30 days of inactivity requires the service access code again; it does not require re-entering the Decart key or redeploying.
- Token TTL is two minutes for opening a connection. Expiration does not end an established stream. Hosted sessions do not set the separate two-minute maximum-session constraint used by the earlier test broker.
- The SDK requests new tokens on every connect/reconnect. Provider rejection stops the camera and shows an error; it never substitutes an overlay for generated video.
- Frontend updates continue through the existing GitHub Pages deployment. The Worker serves those public assets without forwarding browser credentials. Backend upgrades may still require redeployment; it is not a promise of unattended self-maintenance.

## Recover the browser access code

In PowerShell on the same Windows user account:

```powershell
$drapeitCode = Get-Content -Raw "$env:LOCALAPPDATA\DrapeIt\service\access-code.dpapi" | ConvertTo-SecureString
$drapeitPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($drapeitCode)
try { Set-Clipboard ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($drapeitPointer)) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($drapeitPointer); $drapeitCode.Dispose() }
```

This is your private service access code, not your permanent Decart key. Do not publish either. Revoke access by changing the `ACCESS_TOKEN` Cloudflare secret; this invalidates all old browser cookies. Provider/API errors, exhausted credits and actual visual fidelity require a real account/session test.

## Scope and verification

This service protects an owner's paid inference with a private access code. It is not multi-tenant billing or a public free-inference endpoint. Before opening paid usage to customers, add per-user accounts, globally enforced quotas, concurrent session controls and a spending policy. The provided Cloudflare rate limiter is regional and is not a global budget cap.

Backend tests cover origin checks, credential comparison, signed-cookie login, renewals, tamper rejection, rate limiting, key isolation and static-proxy boundaries. The Worker package passed Wrangler's dry run. Browser tests use the real Worker handler and SDK with a mocked provider rejection; a successful funded session and its realism still need to be observed. PowerShell syntax was checked with PowerShell 7; actual Windows installation, Cloudflare login and deployment require the account owner's computer.
