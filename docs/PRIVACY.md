# Privacy

- Camera and uploaded photo/video frames stay on the device in ordinary fitting mode. MediaPipe receives local images in browser memory.
- Fonts, code, models and WebAssembly are downloaded from the deployment origin. Hosting providers receive normal HTTP request metadata.
- Uploaded garment/person data is not written to a server. Imported garments and session sources are discarded when the page closes.
- Saved looks are JPEGs stored in localStorage on that browser origin, capped at eight. Delete them in My wardrobe or clear site data. Downloaded files remain on your device until you delete them.
- Direct image links contact the image host without browser credentials. The extension requests permission for chosen hosts and can read a selected page image or requested product metadata. It does not continuously inspect browsing history.
- The extension temporarily stores the selected garment image URL/title/page URL in extension session storage to transfer it into the fitting window, then removes the entry.
- Camera access starts only after a user action. Stop preview and closing the app release camera tracks. No audio is requested.
- The optional AI still-image feature sends person/garment images to the configured backend and AI provider only when **Send photos & render** is selected. Review that provider's retention policy before using it. Backend access tokens are kept in page memory, not localStorage.
- Reference videos and the original project PDF are not included in the public repository or deployment. Human-footage verification artifacts remain outside the repository.

- **AI live try-on** streams camera video and the selected garment image to Decart after an explicit consent checkbox and Start action. Audio is disabled. This mode is not on-device processing. The session stops on Stop, close, or tab leave. The test broker has a two-minute limit; the persistent hosted service continues while the user keeps the session active. Permanent provider keys remain server-side; short-lived tokens stay in memory. Review Decart’s privacy and retention terms before using it.
- The persistent service remembers sign-in using a Secure, HttpOnly, SameSite=Strict cookie, renewed on authenticated token requests for 30 days. It stores the provider key and separate access-code secret in Cloudflare. The one-time Windows setup retains only a DPAPI-protected service access code and public service URL locally; it does not save the permanent Decart key. The access code is copied to the clipboard during setup.
