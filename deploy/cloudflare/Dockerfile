# IMBERE DATA — FastAPI analytical engine, packaged for Cloudflare Containers.
#
# The build context is the repository ROOT, not this directory: wrangler.jsonc sets
# build_context: "../.." because api/app/datastore.py resolves its data directory as
#
#     ROOT = Path(__file__).resolve().parents[2]      # /app/api/app/datastore.py -> /app
#     PROC = ROOT / "data" / "processed"              # hence /app/data/processed
#
# so the image has to keep the repository's api/ + data/ layout, exactly as
# docs/DEPLOY.md §1 Docker example does. Collapsing it to /app/api breaks every request
# with a missing data/processed/districts.json at startup.

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Requirements first, so editing application code reuses the ~500 MB wheel layer.
# requirements.txt deliberately uses ranges rather than pins (see its header comment); the
# manylinux wheels for numpy/pandas/scikit-learn all exist for 3.13, so no compiler is needed.
COPY api/requirements.txt api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

COPY api api
COPY data/processed data/processed
COPY scripts/freeze_model.py scripts/freeze_model.py

# Fit the model once, here, and bake the result in. Without this the container fits on every cold
# start — 20 s of CPU on a full core, far longer on the fractional one a container gets — which is
# past the 60 s POST budget the interface allows (web/lib/api.ts), so /targeting, /simulator and
# /protection would time out. Loading the pickle takes about a second.
ENV IMBERE_MODEL_CACHE=/app/model/state.pkl
RUN python scripts/freeze_model.py

WORKDIR /app/api

EXPOSE 8000

# Exactly one worker: datastore.py fits the model once and caches it, plus the PostCache and
# rate-limit windows, all in process. A second process would fit its own copy and split the
# cache. --proxy-headers lets the per-client rate limit see the real address, which the
# Worker in front of us forwards in X-Forwarded-For (sourced from CF-Connecting-IP).
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]
