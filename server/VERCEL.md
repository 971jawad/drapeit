# Deploy DrapeIt on Vercel (no DigitalPlat or custom domain)

Vercel provides a free project URL ending in `vercel.app` after deployment. No custom domain, Cloudflare account, or nameserver delegation is required.

1. Open https://vercel.com/new and import GitHub repository `971jawad/drapeit`.
2. Keep root directory at the repository root. The checked-in `vercel.json` selects Vite and builds the React app to `dist/`.
3. Add these project environment variables for Production in Vercel Settings → Environment Variables:
   - `DECART_API_KEY`: the permanent Decart provider API key. Never expose this key in frontend code or commit it to Git.
   - `ACCESS_TOKEN`: a separate cryptographically random service access code containing at least 32 characters.
4. Deploy. If you add or update environment variables after an initial deploy, redeploy to apply them.
5. Open your assigned `https://YOUR-APP.vercel.app/api/hosted-status`. Confirm that `hosted` and `configured` are both `true`.
6. Open `https://YOUR-APP.vercel.app/?live=1`, paste the service access code once, choose **Remember this browser**, select a garment, agree to streaming charges, and start the live AI session.

To generate a strong access code locally with Windows PowerShell:

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
[Convert]::ToBase64String($bytes)
```

The browser streams video directly to Decart; Vercel runs only the frontend and the secure token API. The Vercel API contains signed, expiring Secure/HttpOnly/SameSite=Strict session cookies, same-origin enforcement, and short-lived origin-scoped Decart tokens. Its in-memory rate limiter is **not globally enforced**, so configure Vercel Firewall/API rate limits where available and hard spending safeguards at the AI provider before any wider use. Ensure that preview deployments do not have paid-provider credentials unless intended. Decart funded-session behavior and browser compatibility still require an actual end-to-end test.

The original Cloudflare deployment path is retained separately for rollback; it is not needed for Vercel.
