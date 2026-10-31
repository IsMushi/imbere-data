# System architecture

## Shape

Two deployables and one shared data directory. There is no database and no message queue: the API
is a pure function of committed files plus the request body.

```
                     browser
                        │
        ┌───────────────┴────────────────┐
        │                                │
  Next.js (static)                 fetch /api/* (JSON)
  Vercel CDN                       │
        │                          ▼
        │                  FastAPI (uvicorn)
        │                   ├─ datastore.py   data + model
        │                   ├─ analytics.py   targeting, FGT, shocks
        │                   └─ main.py        routes, limits, headers
        │                          │
        │                  data/processed/*  (committed CSV/JSON)
        │                          ▲
        │                  scripts/build_data.py
        │                  data/raw + data/reference (transcribed)
        │
        └─ /api/*.json snapshots (web/public/api)
           used when the API does not answer in 2.5 s
```

## Modules

| File | Responsibility | Not responsible for |
|---|---|---|
| `api/app/datastore.py` | Load processed data, validate the household contract, fit and cache the HGB model, expose district aggregates and the model card | HTTP, presentation |
| `api/app/analytics.py` | Five targeting rules, bootstrap intervals, fairness, FGT measures, shock simulation (single and compound) | Data loading, HTTP |
| `api/app/main.py` | Routes, Pydantic contracts, CORS, rate limit, cache headers, server timing | Analytical logic |
| `web/lib/api.ts` | Typed fetch, 2.5 s timeout, snapshot fallback, response types | Rendering |
| `web/app/*/page.tsx` | One page per workflow; client-side fetch; charts and tables | Computation |
| `web/components/*` | Domain components (`Kpi`, `Ledger`, `SourceNote`, `BarList`, map, nav) | Business logic |
| `scripts/build_data.py` | Regenerate `data/processed` from raw + reference, with assertions | Serving |
| `scripts/build_snapshot.py` | Write `web/public/api/*.json`; `--check` fails on drift | Serving |
| `scripts/evaluate_model.py` | Cross-validated model comparison and sensitivity sweep | Runtime |

## Request lifecycle

**GET `/api/poverty`**

1. `demo_guard` middleware starts a timer and checks the rate limiter (POST only).
2. `analytics.poverty_measures()` reads the cached datastore state.
3. FGT measures are computed with household-size weights; districts are iterated in published order.
4. Response gets `Cache-Control: public, max-age=300, stale-while-revalidate=86400` and
   `Server-Timing: app;dur=…`.

**POST `/api/targeting`**

1. Pydantic validates `budget_total > 0`, `transfer_per_beneficiary > 0`, rule ids.
2. `evaluate_targeting` draws from one seeded RNG per rule **in `RULES` order** (reordering changes
   the figures; the endpoint builds its list from the tuple, never a set).
3. Each rule produces accuracy, coverage, leakage, exclusion error, cost per poor household reached
   and a 95% bootstrap interval; a fairness block and a coverage curve are added.
4. Response is not cached (it depends on the body); rate limit applies.

**POST `/api/simulate`**

1. Pydantic validates district, shock id, severity 0–100, at most six additional shocks.
2. `simulate` selects the district's household rows, scales to the published household count, and
   runs each shock alone for attribution plus the combined set.
3. Unknown district or shock id raises `KeyError`, mapped to 400 with the offending value.

## Caching and cold start

The API host sleeps. The UI therefore has two data paths:

- **Live** — `apiGet` waits up to 2.5 s for the real endpoint.
- **Snapshot** — on timeout or non-2xx, the same page loads `web/public/api/<name>.json`, generated
  by `scripts/build_snapshot.py` from the same engine and data.

The snapshot is not a cached copy of a stale deployment: `--check` compares its bytes to a fresh
computation and fails the build step if they differ. POST endpoints (targeting at custom parameters,
simulation) always require the live API and show their own loading and error states; there is no
snapshot for a computation that depends on the user's inputs.

## Data contract

`data/processed/households.csv` is validated at load time:

- exactly 30 districts, each present in the published district table;
- no missing values in any model feature;
- `poor` and `extreme_poor` consistent with consumption against the published lines;
- binary asset columns ∈ {0, 1};
- share columns sum to 1 within tolerance.

`api/tests/test_datastore.py` asserts these, plus that the fitted model reproduces the documented
AUC and that concurrent first requests publish one finished state rather than a half-built one.

## Security posture

- **No auth, by design.** Read-only public data; no user records, no writes. A login would protect
  nothing and add friction to a demo.
- **Input validation** at the Pydantic boundary: numeric bounds, enum-like ids checked against
  `RULES` / `SHOCK_ASSUMPTIONS`, list length caps.
- **Rate limiting** 90 requests/minute per client on POST, configurable with
  `IMBERE_RATE_LIMIT` (0 disables). In-process, so it resets on restart and does not coordinate
  across workers — adequate for a demo, not for production.
- **CORS** from `IMBERE_ALLOW_ORIGINS` (default `*` for the public demo). Tighten before any real
  deployment.
- **No secrets in the repo.** `.env*` is gitignored; the API has no credentials to leak.
- **No SQL, no ORM, no user input in file paths** — the only file reads are fixed paths under
  `data/processed`, so injection surface is limited to the validated request body.

## Deployment

- **UI**: Vercel, static prerender. `NEXT_PUBLIC_API_BASE` is read at build time; changing the API
  URL requires a redeploy.
- **API**: container host per `docs/DEPLOY.md`; `uvicorn app.main:app`. Data files ship in the
  image; the model fits on first request (a few seconds) and is cached in module state.
- **Failure modes**: API asleep → snapshot render, POST endpoints show an inline retry; API down
  entirely → the same error state with the reason; stale snapshot → `build_snapshot.py --check`
  fails before commit.

## Why this shape

The alternative was a database plus a precomputed table service. That would add operational
surface (credentials, migrations, backups) to serve 15,066 rows and a few hundred kilobytes of
JSON. Committed files keep the whole analytical state reproducible from the repository, which is
the property a statistical office should be able to audit.
