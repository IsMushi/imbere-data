# IMBERE DATA on Cloudflare Containers

The FastAPI engine (`api/`) running as one Cloudflare Container behind a Worker, instead of on
Render. The Next.js interface is deployed separately; this directory only covers the API.

```
deploy/cloudflare/
├── Dockerfile      # builds the FastAPI image from the repo root context
├── wrangler.jsonc  # Worker + Durable Object + container definition
├── src/index.ts    # Worker: starts the container, waits for the model, proxies requests
├── package.json    # wrangler + typescript (installed with --no-bin-links)
└── tsconfig.json
```

## Before you start

| Requirement | Why |
|---|---|
| **Workers Paid plan** ($5/month) | Containers have **no free tier**. The plan includes 25 GiB-hours of memory, 375 vCPU-minutes and 200 GB-hours of disk per month. |
| **Docker wherever the deploy runs** | `wrangler deploy` builds and pushes the image. Workers Builds provides it; locally, wrangler refuses to run at all — even `--dry-run` — if the Docker CLI is unreachable. |
| The repository connected to a Worker | Workers Builds deploys on push. It authenticates with an auto-generated token, so no repository secrets are needed. |

Docker may be replaced by a Docker-compatible CLI: set `WRANGLER_DOCKER_BIN` (for example to
Podman) and `DOCKER_HOST`. It is not verified here.

## Deploy

Deployment is **Workers Builds**, not GitHub Actions. `.github/workflows/verify-api.yml` runs the
typecheck and the test suite only — two pipelines deploying the same Worker would race on the
container image.

In the dashboard, on the `imbere-data` Worker → **Settings → Build**:

| Setting | Value |
|---|---|
| Git branch | your production branch (`main`, or `test` to rehearse) |
| Root directory | `deploy/cloudflare` |
| Build command | `npm ci` |
| Deploy command | `npx wrangler deploy` |

**Root directory is the one that breaks the build if it is wrong.** Left at the repository root,
`wrangler deploy` finds no `wrangler.jsonc` (this one is a directory down), falls back to automatic
project configuration, and fails with *"Could not detect a directory containing static files"*.
The whole repository is still checked out, so `build_context: "../.."` keeps working from there.

Workers Builds runs the **deploy** command on the production branch and the **preview** command
on everything else. The default preview command, `wrangler versions upload`, does not update
container images — so either make the branch you push to the production branch, or set the
preview command to `npx wrangler deploy` as well.

### Deploying from a machine instead

Only possible where Docker runs:

```powershell
cd deploy/cloudflare
npm install --no-bin-links          # this Windows machine cannot create .bin links
npm run types                       # regenerates worker-configuration.d.ts from wrangler.jsonc
npm run typecheck                   # tsc --noEmit
npm run deploy                      # builds the image, pushes it, deploys the Worker
```

`npx wrangler login` before the first `deploy`. The first deploy is slow: the image pulls
`python:3.13-slim` and installs numpy, pandas and scikit-learn. Later deploys reuse the Docker
layer cache and only push changed layers.

### After either route

Cloudflare still has to provision container instances across its network. The Worker URL can
answer while container routes fail — that is expected for a few minutes, not a bug.

```powershell
curl https://imbere-data.<your-subdomain>.workers.dev/api/health
curl https://imbere-data.<your-subdomain>.workers.dev/api/meta
```

Then set the interface's build-time variable and redeploy the frontend:

```
NEXT_PUBLIC_API_BASE=https://imbere-data.<your-subdomain>.workers.dev
```

## What the Worker actually does

`src/index.ts` exports one Durable Object class and one `fetch` handler:

1. Every request is routed to the single Durable Object named `imbere-data`, which owns the
   single container. Routing is deliberately **not** load balanced: `datastore.py` fits the
   model once and keeps it, plus the POST cache and rate-limit windows, in process memory.
2. On a cold start the container is started with `instance: "basic"` and `enableInternet: false`,
   then polled on `/api/health` until it reports `model_ready`. The app answers health checks in
   milliseconds while fitting in a background thread, so a plain 200 is not readiness.
3. The request is forwarded to port 8000 with `X-Forwarded-For` set from `CF-Connecting-IP`, so
   the API's per-client rate limit does not collapse into one shared bucket.
4. Every response carries `x-imbere-boot-ms`, which separates "the container was booting" from
   "the engine was slow".

## Cost shape

Containers bill **provisioned** memory for every second an instance runs; CPU is billed on active
use only. With `basic` (1 GiB) the included 25 GiB-hours covers roughly 25 hours of uptime per
month, so the inactivity timeout is the cost control, not an optimisation:

- `INACTIVITY_TIMEOUT_MS` in `src/index.ts` is 5 minutes. Raise it for a demo day (fewer cold
  starts, more spend), lower it to 60 s to cut the bill.
- `lite` (256 MiB, 2 GB disk) is cheaper and may now be enough — the build-time freeze removed
  the training peak — but has not been measured. Try it, watch for an OOM restart, fall back to
  `basic`.
- `standard-1` (4 GiB) is comfortable but divides the included memory by four.

## Known constraints

- **Cold start is seconds, because the model is frozen at build time.** `Dockerfile` runs
  `scripts/freeze_model.py`, which fits once and writes `/app/model/state.pkl`; `datastore.py`
  loads that instead of refitting. It matters because the fit takes ~20 s of CPU on a full core
  and the interface allows a POST 60 s (`web/lib/api.ts`), so a container with a quarter core
  would time out on /targeting, /simulator and /protection. The payload is rejected and the
  engine refits if numpy/pandas/scikit-learn differ from the build — slower, never wrong.
- **Image size is capped by instance disk** — 4 GB for `basic`. This image should land well
  under that (slim Python plus the numerical wheels), but it has not been built here; if
  `wrangler deploy` rejects the image size, raise the instance type rather than trimming data.
- **Beta.** Instance selection, image references and the `exports` config shape have all changed
  during 2026. Check <https://developers.cloudflare.com/containers/> before editing
  `wrangler.jsonc`.
- **`data/processed/` and `data/reference/` are baked into the image.** Changing either means
  rebuilding and redeploying, not restarting a service. `data/reference/vup.json` is needed at
  runtime as well as build time, because a rejected frozen payload falls back to refitting. That
  is fine here because both trees are committed and change only when `scripts/build_data.py` runs.
- Disk is ephemeral. The container writes nothing outside `/tmp`; the engine is read-only.

## Removing it

```powershell
npx wrangler delete
npx wrangler containers images list          # find the tag
npx wrangler containers images delete <IMAGE>:<TAG>
```

Deleting the Worker does not free the image's storage quota (50 GB per account).
