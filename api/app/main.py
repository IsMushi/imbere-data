"""IMBERE DATA API.

Read-only decision support: there is no database and no user account, so there is nothing to
authenticate. What the service does need is to stay up under a demo's worth of traffic on a free
tier, so there is a small in-process rate limit and cacheable GETs.
"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import analytics, datastore

ALLOW_ORIGINS = [
    o.strip() for o in os.environ.get("IMBERE_ALLOW_ORIGINS", "*").split(",") if o.strip()
]
# Requests per minute per client, applied to the compute endpoints only. 0 disables the limiter.
RATE_LIMIT = int(os.environ.get("IMBERE_RATE_LIMIT", "90"))
CACHE_SECONDS = int(os.environ.get("IMBERE_CACHE_SECONDS", "300"))

app = FastAPI(
    title="IMBERE DATA API",
    description=(
        "Financial resilience and social-protection targeting intelligence for Rwanda. "
        "District poverty and national indicators are published NISR / FinScope figures; "
        "household rows are calibrated synthetic microdata until EICV7 access is granted."
    ),
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def demo_guard(request: Request, call_next):
    """Rate limit the compute endpoints, cache the static ones, and time every response."""
    started = time.perf_counter()
    path = request.url.path
    if RATE_LIMIT > 0 and request.method == "POST":
        client = request.client.host if request.client else "unknown"
        now = time.monotonic()
        window = _HITS[client]
        while window and now - window[0] > 60.0:
            window.popleft()
        if len(window) >= RATE_LIMIT:
            return JSONResponse(
                status_code=429,
                content={"detail": "too many requests; slow down and retry in a minute"},
                headers={"Retry-After": "60"},
            )
        window.append(now)

    response = await call_next(request)
    response.headers["Server-Timing"] = f"app;dur={(time.perf_counter() - started) * 1000:.0f}"
    if request.method == "GET" and path.startswith("/api/"):
        response.headers["Cache-Control"] = (
            f"public, max-age={CACHE_SECONDS}, stale-while-revalidate=86400"
        )
    return response


_HITS: dict[str, deque[float]] = defaultdict(deque)


@app.get("/api/health")
@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/meta")
def meta() -> dict:
    st = datastore.get()
    return {
        **st["meta"],
        "model_card": st["model_card"],
        "calibration": st["calibration"],
        "targeting_rules": analytics.RULES,
        "shock_assumptions": analytics.SHOCK_ASSUMPTIONS,
        "severity_note": analytics.SEVERITY_NOTE,
    }


@app.get("/api/districts")
def districts() -> dict:
    return {"districts": datastore.district_aggregates()}


@app.get("/api/districts/{name}")
def district(name: str) -> dict:
    for d in datastore.district_aggregates():
        if d["district"].lower() == name.lower():
            return d
    raise HTTPException(status_code=404, detail=f"district not found: {name}")


@app.get("/api/model")
def model() -> dict:
    return datastore.model_card()


@app.get("/api/poverty")
def poverty() -> dict:
    """FGT headcount, depth and severity on the calibrated layer, with the weighting caveat."""
    return analytics.poverty_measures()


class TargetingRequest(BaseModel):
    budget_total: float = Field(300_000_000, gt=0, description="Total programme budget in RWF")
    transfer_per_beneficiary: float = Field(
        150_000, gt=0, description="Transfer per beneficiary per year, in RWF"
    )
    rules: list[str] | None = None


@app.post("/api/targeting")
def targeting(req: TargetingRequest) -> dict:
    valid = [r["id"] for r in analytics.RULES]
    rules = req.rules or valid
    unknown = [r for r in rules if r not in valid]
    if unknown:
        raise HTTPException(status_code=400, detail=f"unknown rules: {unknown}")
    return analytics.evaluate_targeting(req.budget_total, req.transfer_per_beneficiary, rules)


class AdditionalShock(BaseModel):
    shock_type: str = Field(..., description="one of the seven shock ids")
    severity: float = Field(50, ge=0, le=100)


class SimulationRequest(BaseModel):
    district: str
    shock_type: str = Field(..., description="drought | flood | storm | pest | health | food_price | income_loss")
    severity: float = Field(50, ge=0, le=100)
    additional_shocks: list[AdditionalShock] = Field(
        default_factory=list,
        max_length=6,
        description="further shocks applied to the same households in the same period",
    )


@app.post("/api/simulate")
def simulate(req: SimulationRequest) -> dict:
    try:
        return analytics.simulate(
            req.district,
            req.shock_type,
            req.severity,
            additional=[s.model_dump() for s in req.additional_shocks],
        )
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
