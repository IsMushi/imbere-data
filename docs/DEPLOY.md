# Deploying IMBERE DATA

Two services: a Python API and a Next.js frontend. Any host that runs a Dockerfile or a
Node/Python buildpack works. The instructions below use free tiers that are sufficient for a
hackathon demo.

---

## 1. Backend (FastAPI)

The API needs the repository's `data/processed/` directory — it loads `districts.json`,
`meta.json`, `calibration.json` and `households.csv` at startup and fits the model once.

### Render

The repo ships a `render.yaml` Blueprint, so the whole service can be created in one step:
**New → Blueprint → connect the GitHub repo → Apply**. It provisions a free Python web service
with the build, start and health-check settings below.

Manual equivalent:

1. New → **Web Service** → connect the GitHub repo.
2. Settings:
   - **Root directory:** *leave empty* (repository root)
   - **Build command:** `pip install -r api/requirements.txt`
   - **Start command:** `cd api && python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Health check path:** `/api/health`
   - **Environment:** `PYTHON_VERSION=3.13.5`
3. Deploy. Note the URL, e.g. `https://imbere-api.onrender.com`.

**Do not set the root directory to `api`.** Render makes nothing outside a service's root
directory available at build time or runtime, and `api/app/datastore.py` resolves the data
directory as `Path(__file__).parents[2] / "data" / "processed"` — the repository root. With
`rootDir: api` the build succeeds, the service starts, and every request fails on a missing
`data/processed/districts.json`. Keeping the root at the repository root and `cd`-ing into `api/`
for the start command leaves `data/` in reach; it is committed, so it is already in the checkout.

`PYTHON_VERSION` must be fully qualified (`3.13.5`, not `3.13`) on Render. Pinning matters here:
the default for services created after 2026-10-12 is 3.14.8, while this stack is verified on
3.13.

### Railway / Fly.io

Equivalent: build from `api/`, expose the port from the platform's `$PORT`, keep the repo
root available so `data/processed/` resolves.

### Docker (optional)

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY api/requirements.txt api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt
COPY api api
COPY data data
WORKDIR /app/api
CMD uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Verify

```bash
curl https://<api-host>/api/health          # {"status":"ok"}
curl https://<api-host>/api/meta            # 39 indicators, model card
```

CORS is currently open (`allow_origins=["*"]`) so the hosted frontend can call the API. Tighten
this to the frontend origin before any production use.

---

## 2. Frontend (Next.js)

### Vercel

1. New Project → import the repo.
2. Settings:
   - **Root directory:** `web`
   - **Framework preset:** Next.js
   - **Build command:** `npm run build`
   - **Output:** default (`.next`)
3. Environment variable:
   - `NEXT_PUBLIC_API_BASE` = the API URL from step 1 (no trailing slash)
4. Deploy.

`NEXT_PUBLIC_API_BASE` is read at build time, so set it **before** the first build; changing it
later requires a redeploy.

### Netlify / Cloudflare Pages

Build command `npm run build`, publish directory `web/.next`, Node 20.9+, with the same
`NEXT_PUBLIC_API_BASE` variable. The Next.js runtime plugin is required.

---

## 3. Local production check

```bash
cd api && python -m uvicorn app.main:app --port 8000
cd web && npm run build && npm run start
```

Then open http://localhost:3000 and click through all four pages.

---

## 4. Cold starts

Free tiers sleep after inactivity. The first request after a sleep takes 30–60 seconds because the
API refits the gradient-boosting model on load. If the demo is time-boxed, hit `/api/meta` a minute
before presenting.

To remove the cold-start penalty, precompute the model scores into `data/processed/` at build time
and load them instead of fitting on startup — a small change in `api/app/datastore.py`.

---

## 5. Checklist before submission

- [ ] API reachable at a public HTTPS URL, `/api/health` returns ok
- [ ] `NEXT_PUBLIC_API_BASE` points at that URL and the build was run after setting it
- [ ] All four pages load with real numbers (not the "Could not reach the API" panel)
- [ ] Map renders districts (not a solid rectangle)
- [ ] Repository is public and `README.md` renders
- [ ] `docs/SUBMISSION.md` has the GitHub and app links filled in
