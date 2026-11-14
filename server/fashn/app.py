"""FASHN VTON v1.5 self-hosted image generation (requires CUDA GPU)."""
import base64
import binascii
import hmac
import io
import os
import threading
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

MAX_INPUT = 1_800_000
MAX_PIXELS = 4_000_000
LOCK = threading.Lock()
pipeline = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline
    from fashn_vton import TryOnPipeline
    pipeline = TryOnPipeline(weights_dir=os.environ.get("FASHN_WEIGHTS_DIR", "./weights"))
    yield
    pipeline = None

app = FastAPI(title="DrapeIt2 FASHN v1.5", docs_url=None, redoc_url=None, lifespan=lifespan)

class TryOnRequest(BaseModel):
    person_image: str = Field(max_length=MAX_INPUT)
    garment_image: str = Field(max_length=MAX_INPUT)
    category: Literal["tops", "bottoms", "one-pieces"]

def decode_image(raw: str) -> Image.Image:
    if not raw.startswith("data:image/jpeg;base64,") or len(raw) > MAX_INPUT:
        raise ValueError("Only resized JPEG data URLs are accepted.")
    try:
        data = base64.b64decode(raw.split(",", 1)[1], validate=True)
        if len(data) > 1_350_000:
            raise ValueError("Image is too large.")
        Image.MAX_IMAGE_PIXELS = MAX_PIXELS
        with Image.open(io.BytesIO(data)) as img:
            if img.format != "JPEG" or img.width * img.height > MAX_PIXELS:
                raise ValueError("Invalid JPEG dimensions.")
            img.load()
            return ImageOps.exif_transpose(img).convert("RGB")
    except (binascii.Error, UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValueError("Invalid input image.") from exc

def run_model(person: Image.Image, garment: Image.Image, category: str) -> str:
    if not LOCK.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="GPU busy")
    try:
        result = pipeline(person_image=person, garment_image=garment, category=category)
        if not result.images:
            raise RuntimeError("No output returned.")
        image = result.images[0].convert("RGB")
        image.thumbnail((1024, 1024))
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=85)
        return "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode("ascii")
    finally:
        LOCK.release()

@app.get("/health")
async def health():
    return {"ready": pipeline is not None, "model": "fashn-vton-1.5"}

@app.post("/tryon")
async def tryon(data: TryOnRequest, authorization: str | None = Header(default=None)):
    secret = os.environ.get("FASHN_BACKEND_SECRET", "")
    if len(secret) < 32 or authorization is None or not hmac.compare_digest(
        authorization, "Bearer " + secret
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        person = decode_image(data.person_image)
        garment = decode_image(data.garment_image)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        image = await run_in_threadpool(run_model, person, garment, data.category)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Try-on failed") from None
    return {"image": image}
