# DrapeIt2 — FASHN VTON v1.5

Open-source, image-based virtual try-on. This is **not** Decart live generative video.
Your existing browser-based live 2D overlay still works without a GPU API.

## Run the GPU backend (on your own NVIDIA GPU)

The model typically needs approximately 8 GB GPU memory and ~2 GB of weights.
Running on your own computer avoids per-image API charges. Cloud GPU hosting
may still incur compute and bandwidth charges. Vercel cannot run this CUDA
PyTorch model in its ordinary serverless functions.

Follow the official model instructions: https://github.com/fashn-AI/fashn-vton-1.5

```bash
git clone https://github.com/fashn-AI/fashn-vton-1.5.git
cd fashn-vton-1.5
python -m venv .venv
source .venv/bin/activate
pip install -e .
python scripts/download_weights.py --weights-dir ./weights
pip install fastapi 'uvicorn[standard]' pillow
```

On Windows, activate with .venv\Scripts\activate.
Copy server/fashn/app.py from DrapeIt2 into this folder, then:

```bash
export FASHN_WEIGHTS_DIR='./weights'
export FASHN_BACKEND_SECRET='YOUR_LONG_RANDOM_PRIVATE_SECRET'
uvicorn app:app --host 127.0.0.1 --port 8000
```

On Windows PowerShell set the same values using $env:FASHN_WEIGHTS_DIR
and $env:FASHN_BACKEND_SECRET. Run the GPU server whenever inference is needed.

## Vercel connection

Expose the local GPU server through a protected HTTPS tunnel or gateway.
Do NOT expose an unauthenticated port publicly. Keep the backend secret private.
In the **new DrapeIt2 Vercel project**, add Production environment variables:

- FASHN_BACKEND_URL — HTTPS origin of the private GPU API
- FASHN_BACKEND_SECRET — the exact same private random secret (32+ characters)

Do NOT copy DECART_API_KEY or ACCESS_TOKEN from the original project.
Deploy, then verify /api/fashn-status returns configured: true.
That check only verifies settings, not that GPU inference is available.
Open /?live=1 on the new website, upload a photo or capture from webcam,
select a garment, consent to image transfer, and generate an AI photo.

## Public access warning

This demonstration gateway has basic same-origin and size checks, but NOT
a globally enforced quota, concurrency control, or protection against automated
abuse. Do not expose unlimited public GPU usage without controls. Hosting
an always-on GPU can cost money even when the model itself is open source.

The backend processes photos in memory and does not deliberately store them.
Obtain consent before uploading other people's photos. Results are visual
previews only, not reliable measurements of clothing fit.

FASHN repository and licensing: https://github.com/fashn-AI/fashn-vton-1.5
