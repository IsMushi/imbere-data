"""IMBERE DATA API.

Read-only decision support: there is no database and no user account, so there is nothing to
authenticate. What the service does need is to stay up under a demo's worth of traffic on a free
tier, so there is a small in-process rate limit and cacheable GETs.
"""
from __future__ import annotations

import json
import os
import threading
import time
from collections import OrderedDict, defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
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

# Free-tier containers sleep, and the first request after idle pays for a cold Python import plus
# a model fit. Fitting in a background thread at startup means `/api/health` still answers in
# milliseconds (so Render's health check never cycles the container for being slow) while the
# engine becomes ready behind it. Set IMBERE_WARM_ON_STARTUP=0 to keep the old lazy behaviour.
WARM_ON_STARTUP = os.environ.get("IMBERE_WARM_ON_STARTUP", "1").strip() != "0"
# Both compute endpoints are deterministic functions of their request: targeting derives each
# rule's RNG from the seed and the rule id, and the simulator draws no random numbers at all. The
# same payload therefore always produces the same response, so repeating one - which is exactly
# what a demo or a rehearsal does - need not recompute it.
POST_CACHE_SIZE = int(os.environ.get("IMBERE_POST_CACHE", "128"))

_BOOTED_AT = time.time()
_WARM: dict = {"ready": False, "seconds": None, "error": None}


def _warm_model() -> None:
    started = time.perf_counter()
    try:
        datastore.get()
    except Exception as exc:  # a failed warm must not kill the server; the next request retries
        _WARM.update(ready=False, error=f"{type(exc).__name__}: {exc}")
        return
    _WARM.update(ready=True, seconds=round(time.perf_counter() - started, 2), error=None)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if WARM_ON_STARTUP:
        threading.Thread(target=_warm_model, name="imbere-warm", daemon=True).start()
    yield


app = FastAPI(
    title="IMBERE DATA API",
    description=(
        "Financial resilience and social-protection targeting intelligence for Rwanda. "
        "District poverty and national indicators are published NISR / FinScope figures; "
        "household rows are calibrated synthetic microdata until EICV7 access is granted."
    ),
    version="0.2.0",
    lifespan=lifespan,
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


class _PostCache:
    """Bounded LRU over deterministic POST responses.

    Only correct because neither engine reads a clock, a random source that is not seeded from the
    request, or any mutable state. `analytics._rule_rng` derives each rule's stream from the seed
    and the rule id; `analytics.simulate` draws no random numbers. If either ever gains
    request-dependent randomness, this cache must be removed rather than seeded around.
    """

    def __init__(self, capacity: int) -> None:
        self._data: OrderedDict[str, dict] = OrderedDict()
        self.capacity = capacity
        self.hits = 0
        self.misses = 0

    def get(self, key: str) -> dict | None:
        if self.capacity <= 0:
            return None
        value = self._data.get(key)
        if value is None:
            self.misses += 1
            return None
        self._data.move_to_end(key)
        self.hits += 1
        return value

    def put(self, key: str, value: dict) -> None:
        if self.capacity <= 0:
            return
        self._data[key] = value
        self._data.move_to_end(key)
        while len(self._data) > self.capacity:
            self._data.popitem(last=False)

    def clear(self) -> None:
        self._data.clear()
        self.hits = 0
        self.misses = 0

    def stats(self) -> dict:
        return {"size": len(self._data), "capacity": self.capacity, "hits": self.hits,
                "misses": self.misses}


_POST_CACHE = _PostCache(POST_CACHE_SIZE)


def _cache_key(path: str, parts: list) -> str:
    return json.dumps([path, *parts], separators=(",", ":"), sort_keys=True)


def _cached_or_compute(
    response: Response, key: str, compute
) -> dict:
    """Serve a deterministic POST from the LRU, else compute it and store the answer."""
    hit = _POST_CACHE.get(key)
    if hit is not None:
        response.headers["X-Imbere-Cache"] = "hit"
        return hit
    value = compute()
    _POST_CACHE.put(key, value)
    response.headers["X-Imbere-Cache"] = "miss"
    return value


@app.get("/api/health")
@app.get("/health")
def health() -> dict:
    """Liveness plus enough readiness detail for a demo script to wait on.

    Kept cheap and side-effect free: it never triggers the model fit itself, so a health probe
    cannot make a cold container slower to answer than it already is.
    """
    return {
        "status": "ok",
        "model_ready": datastore.ready(),
        "uptime_s": round(time.time() - _BOOTED_AT, 1),
        "warm": dict(_WARM),
        "post_cache": _POST_CACHE.stats(),
    }


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
def targeting(req: TargetingRequest, response: Response) -> dict:
    valid = [r["id"] for r in analytics.RULES]
    rules = req.rules or valid
    unknown = [r for r in rules if r not in valid]
    if unknown:
        raise HTTPException(status_code=400, detail=f"unknown rules: {unknown}")
    # Rule order is part of the result, so the key keeps it rather than sorting.
    key = _cache_key(
        "/api/targeting", [req.budget_total, req.transfer_per_beneficiary, list(rules)]
    )
    return _cached_or_compute(
        response,
        key,
        lambda: analytics.evaluate_targeting(
            req.budget_total, req.transfer_per_beneficiary, rules
        ),
    )


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
def simulate(req: SimulationRequest, response: Response) -> dict:
    key = _cache_key(
        "/api/simulate",
        [
            req.district,
            req.shock_type,
            req.severity,
            [[s.shock_type, s.severity] for s in req.additional_shocks],
        ],
    )
    try:
        return _cached_or_compute(
            response,
            key,
            lambda: analytics.simulate(
                req.district,
                req.shock_type,
                req.severity,
                additional=[s.model_dump() for s in req.additional_shocks],
            ),
        )
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class ProtectionRequest(BaseModel):
    district: str
    shock_type: str = Field("drought", description="one of the seven shock ids")
    severity: float = Field(50, ge=0, le=100)
    transfers: list[float] | None = Field(
        default=None,
        max_length=8,
        description="transfer levels in RWF per household per year; defaults to the published ladder",
    )


@app.post("/api/protection")
def protection(req: ProtectionRequest, response: Response) -> dict:
    """Social protection: what a transfer of a given size protects after a shock."""
    key = _cache_key(
        "/api/protection",
        [req.district, req.shock_type, req.severity, req.transfers],
    )
    try:
        return _cached_or_compute(
            response,
            key,
            lambda: analytics.protection(
                req.district, req.shock_type, req.severity, transfers=req.transfers
            ),
        )
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
