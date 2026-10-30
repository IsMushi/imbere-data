"""IMBERE DATA API."""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import analytics, datastore

app = FastAPI(
    title="IMBERE DATA API",
    description=(
        "Financial resilience and social-protection targeting intelligence for Rwanda. "
        "District poverty and national indicators are published NISR / FinScope figures; "
        "household rows are calibrated synthetic microdata until EICV7 access is granted."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


class SimulationRequest(BaseModel):
    district: str
    shock_type: str = Field(..., description="drought | flood | storm | pest | health | food_price | income_loss")
    severity: float = Field(50, ge=0, le=100)


@app.post("/api/simulate")
def simulate(req: SimulationRequest) -> dict:
    try:
        return analytics.simulate(req.district, req.shock_type, req.severity)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
