# DrapeIt

A browser-based virtual fitting studio inspired by Jawad Ahmed Khan's DrapeIt proposal and three supplied try-on reference videos.

**Live app:** https://971jawad.github.io/drapeit/

DrapeIt offers real on-device pose tracking and a deformable 2D garment preview. It is **not photorealistic live clothing replacement**, physical cloth simulation, or a guarantee of garment fit. No paid inference provider is configured. A dedicated [Decart Lucy VTON live-video integration](server/REALTIME.md) is implemented with a secure token broker, but a real provider session and its visual quality remain unverified until credentials are configured. An optional FASHN still-image adapter is also included.

## Three ways to bring a garment

1. **Shop with the extension.** Install the bundled Chrome/Edge extension, select a garment image on a store page, and open a live fitting window alongside the store. Product metadata imports run through extension permissions requested for the chosen host.
2. **Upload a garment.** JPG, PNG and WebP images can be isolated with on-device interactive segmentation or a manually drawn outline. Choose a top, dress/kurta, or bottom.
3. **Import a link.** Direct image URLs work when the image host allows cross-origin requests. Product page URLs work through the extension's metadata extractor. Sites with access controls, unusual product markup, unavailable images, or blocked requests may require a manual upload.

Each path uses the same camera/photo/video fitting engine. Uploaded human videos are optional motion previews; they are not live webcam sessions.

## Features

- MediaPipe Pose Landmarker tracking, GPU preference with CPU fallback, temporal smoothing, and explicit tracking-loss behavior.
- Piecewise affine garment mesh anchored to shoulders and hips, sleeve deformation, and approximate hand/forearm occlusion.
- Top, dress/kurta and bottom preview layouts; size, colour tint, pattern, width, length, vertical placement, opacity and mirror controls.
- Original/preview comparison, local saved wardrobe (up to eight looks), side-by-side comparison, JPEG downloads.
- Size guidance from user-entered chest measurements and a user-editable brand garment chart. The starting chart is explicitly illustrative.
- No account, no analytics, and no camera uploads in the browser engine. Self-hosted fonts, WASM and model assets.
- Responsive interface, labelled controls, keyboard-focus trapping in dialogs, reduced-motion support, explicit permission/error feedback.
- GitHub Actions verifies tests/builds and deploys the web app plus extension ZIP to GitHub Pages.

## Run locally

Node 22 or later and Python 3 (used only to ZIP the extension) are required.

```sh
npm ci
npm run dev
npm test
npm run build
```

The build produces `dist/` and `dist/drapeit-extension.zip`. Open the app through localhost or HTTPS; browser cameras do not work on arbitrary insecure HTTP origins. Model assets are loaded lazily on first use.

## AI live clothing replacement

Open **AI live try-on** in the mirror toolbar. This uses a separate real-time WebRTC provider, not the local overlay. Follow [the complete live backend setup](server/REALTIME.md) to deploy the token service and add a Decart key as a server secret. The browser receives only short-lived session tokens. Camera streaming and provider costs require explicit consent. No paid session was run during implementation.

## Install the extension

**No-install alternative:** choose the **Open shopping window** icon beside the mirror (or open it from **Get the extension**). A compact browser window runs the same live camera engine beside your store. Upload a saved garment image or import a direct image link from a host that permits it. This works without extension installation; it cannot automatically inspect another store tab. You can also open [the compact fitting room](https://971jawad.github.io/drapeit/?window=1) directly and place it beside your store.

Download the ZIP from the app's **Get the extension** dialog, unzip it, open `chrome://extensions` (or `edge://extensions`), enable Developer mode, choose **Load unpacked**, and select the extracted folder containing `manifest.json`.

Visit a normal HTTPS product page, click DrapeIt → **Pick a garment from this page**, and click the product image. In the fitting window, select **Import garment**, approve access to the chosen image host, isolate the garment, and start the camera. You can also right-click a product image → **Try this garment with DrapeIt**.

This is an unpacked desktop extension, not a Chrome Web Store release. Mobile Chrome does not support it. Do not install from an untrusted ZIP.

Managed browsers may prohibit extension installation. Use the no-install shopping window there, or install the extension in your own Chrome/Edge profile where allowed. The cloud browser's management policy was not changed; native extension execution could not be validated in that environment.

## Quality and practical limits

The visual engine follows one person facing the camera. Shoulders and hips must be visible; dresses and bottoms also need lower-body visibility. Camera perspective, model confidence, existing clothing, garment cutouts, side views and rapid motion affect quality. It cannot remove the user's original outfit or invent realistic hidden fabric surfaces. The original clothing may remain visible outside the overlay. Hand occlusion is a geometric approximation.

The catalogue uses actual garment photographs, with source attribution in `public/garments/SOURCES.md`. Retailers are not affiliated with this project. You can also import a product photo from your preferred store. Interactive segmentation separates an object from its background; it cannot reliably distinguish clothing from a person wearing it. Use the manual outline to exclude the head, body, and surrounding content.

The optional [rendering service](server/README.md) is separate from live tracking. Real provider integration remains unverified until the owner configures credentials and performs a paid render.

See [architecture](docs/ARCHITECTURE.md), [privacy](docs/PRIVACY.md), [verification](docs/VERIFICATION.md), and [third-party notices](THIRD_PARTY_NOTICES.md).
