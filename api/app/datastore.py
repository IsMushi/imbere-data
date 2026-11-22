"""Data access, calibration reporting and the poverty-risk model.

Real data (district poverty, national indicators, shock tables) is loaded straight from
data/processed. Household-level rows come from the calibrated synthetic file and are flagged
as such in every response that touches them.
"""
from __future__ import annotations

import json
import os
import pickle
import threading
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[2]
PROC = ROOT / "data" / "processed"
REF = ROOT / "data" / "reference"

# A frozen copy of the fitted engine, written at image build time by
# deploy/cloudflare/Dockerfile via scripts/freeze_model.py. Unset in normal development, so the
# behaviour there is unchanged: fit on first access. See `freeze()` and `_read_cache()`.
_CACHE_ENV = os.environ.get("IMBERE_MODEL_CACHE", "").strip()
CACHE_PATH: Path | None = Path(_CACHE_ENV) if _CACHE_ENV else None

CAT_COLS = ["district", "province", "head_education", "main_income_source"]
ASSET_COLS = [
    "modern_floor",
    "electricity",
    "corrugated_roof",
    "improved_sanitation",
    "owns_tv",
    "owns_radio",
    "owns_phone",
    "owns_bicycle",
    "health_insurance",
    "has_momo",
    "has_savings",
]
NUM_COLS = ["urban", "hh_size", *ASSET_COLS, "district_poverty_rate"]
FEATURES = CAT_COLS + NUM_COLS

FEATURE_LABELS = {
    "district": "District",
    "province": "Province",
    "head_education": "Head's education",
    "main_income_source": "Main income source",
    "urban": "Urban residence",
    "hh_size": "Household size",
    "modern_floor": "Modern floor",
    "electricity": "Electricity access",
    "corrugated_roof": "Corrugated iron roof",
    "improved_sanitation": "Improved sanitation",
    "owns_tv": "Owns a TV",
    "owns_radio": "Owns a radio",
    "owns_phone": "Owns a phone",
    "owns_bicycle": "Owns a bicycle",
    "health_insurance": "Health insurance",
    "has_momo": "Mobile money account",
    "has_savings": "Savings account",
    "district_poverty_rate": "District poverty rate",
}

_state: dict = {}
# FastAPI runs sync endpoints in a thread pool, so the first page load can arrive as two
# concurrent requests (meta + districts). Without the lock the second one returns while the
# first is still fitting the model and sees a half-built state.
_lock = threading.Lock()
_ready = False


def _load() -> dict:
    global _ready
    if _ready:
        return _state

    with _lock:
        if _ready:
            return _state

        # A frozen payload short-circuits the fit. deploy/cloudflare/Dockerfile writes one at
        # build time, because a container that fits on boot takes longer than the interface is
        # willing to wait (docs/DEPLOY.md §4).
        built = _read_cache()
        if built is None:
            built = _build_state()

        # Publish only once everything (including the model) exists.
        _state.update(built)
        _ready = True

    return _state


def _build_state() -> dict:
    """Read data/processed and fit the model from scratch. Never consults the cache."""
    districts = json.loads((PROC / "districts.json").read_text(encoding="utf-8"))
    meta = json.loads((PROC / "meta.json").read_text(encoding="utf-8"))
    calibration = json.loads((PROC / "calibration.json").read_text(encoding="utf-8"))
    vup = json.loads((REF / "vup.json").read_text(encoding="utf-8"))
    hh = pd.read_csv(PROC / "households.csv")

    rate = {d["district"]: d["poverty_2024"] for d in districts}
    hh["district_poverty_rate"] = hh["district"].map(rate)

    built = {
        "districts": districts,
        "meta": meta,
        "calibration": calibration,
        "vup": vup,
        "households": hh,
        "district_by_name": {d["district"]: d for d in districts},
    }
    built.update(_fit_model(hh))
    return built


def _versions() -> dict[str, str]:
    return {"numpy": np.__version__, "pandas": pd.__version__, "sklearn": sklearn.__version__}


def _read_cache() -> dict | None:
    """Load the frozen payload, or return None so the caller fits instead.

    Unpickling runs code, so this only ever reads the path an operator set in
    IMBERE_MODEL_CACHE — in practice a file baked into the image at build time. A payload built
    by different numpy/pandas/scikit-learn versions than the ones running is rejected: sklearn
    pipelines do not reliably survive that, and a wrong answer here would be invisible.
    """
    if CACHE_PATH is None or not CACHE_PATH.is_file():
        return None
    try:
        with CACHE_PATH.open("rb") as fh:
            payload = pickle.load(fh)
        built_with = payload.get("versions", {})
        running = _versions()
        if built_with != running:
            print(
                f"imbere: ignoring model cache {CACHE_PATH}: built with {built_with}, "
                f"running {running}; refitting",
                flush=True,
            )
            return None
        return payload["state"]
    except Exception as exc:  # noqa: BLE001 - a bad cache must degrade to a slow start, not a crash
        print(
            f"imbere: could not read model cache {CACHE_PATH}: {type(exc).__name__}: {exc}; "
            "refitting",
            flush=True,
        )
        return None


def freeze(path: Path) -> Path:
    """Fit from scratch and write the result to `path`.

    Called by scripts/freeze_model.py inside the deployment image, so the payload is produced by
    the exact interpreter and library versions that will unpickle it. Always refits rather than
    reusing an in-memory state, so a stale cache can never be re-stamped with current versions.
    """
    payload = {"versions": _versions(), "state": _build_state()}
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with tmp.open("wb") as fh:
        pickle.dump(payload, fh, protocol=pickle.HIGHEST_PROTOCOL)
    tmp.replace(path)
    return path


def _fit_model(hh: pd.DataFrame) -> dict:
    """Proxy-means test: predict poverty from observable household characteristics only.

    Consumption is deliberately excluded - the whole point of a proxy-means test is to rank
    households without measuring their consumption.
    """
    X = hh[FEATURES]
    y = hh["poor"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.30, random_state=42, stratify=y
    )

    pre = ColumnTransformer(
        [
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=True), CAT_COLS),
            ("num", "passthrough", NUM_COLS),
        ]
    )

    hgb = Pipeline(
        [
            ("pre", pre),
            (
                "clf",
                HistGradientBoostingClassifier(
                    max_iter=250,
                    learning_rate=0.06,
                    max_depth=5,
                    l2_regularization=1.0,
                    random_state=42,
                ),
            ),
        ]
    )
    hgb.fit(X_train, y_train)
    auc_hgb = float(roc_auc_score(y_test, hgb.predict_proba(X_test)[:, 1]))

    logit = Pipeline(
        [
            ("pre", pre),
            ("scale", StandardScaler(with_mean=False)),
            ("clf", LogisticRegression(max_iter=2000, C=0.5)),
        ]
    )
    logit.fit(X_train, y_train)
    auc_logit = float(roc_auc_score(y_test, logit.predict_proba(X_test)[:, 1]))

    imp = permutation_importance(
        hgb, X_test, y_test, n_repeats=5, random_state=42, scoring="roc_auc"
    )
    importance = sorted(
        [
            {
                "feature": FEATURE_LABELS.get(f, f),
                "key": f,
                "importance": round(float(max(m, 0.0)), 4),
            }
            for f, m in zip(FEATURES, imp.importances_mean)
        ],
        key=lambda r: r["importance"],
        reverse=True,
    )

    # Score every household so the targeting lab can rank on the PMT.
    hh_risk = hgb.predict_proba(X)[:, 1]

    return {
        "model": hgb,
        "hh_risk": hh_risk,
        "model_card": {
            "name": "IMBERE DATA proxy-means poverty risk model",
            "algorithm": "HistGradientBoostingClassifier",
            "target": "household is below the national poverty line",
            "features": [FEATURE_LABELS.get(f, f) for f in FEATURES],
            "n_train": int(len(X_train)),
            "n_test": int(len(X_test)),
            "auc_gradient_boosting": round(auc_hgb, 3),
            "auc_logistic_baseline": round(auc_logit, 3),
            "importance": importance,
            "caveat": (
                "Trained on calibrated synthetic households, so these metrics describe the "
                "prototype, not Rwanda. Re-run against EICV7 microdata for publishable "
                "accuracy figures."
            ),
        },
    }


def get() -> dict:
    return _load()


def ready() -> bool:
    """Whether the data and model are loaded. Never blocks, so health checks can ask it."""
    return _ready


def districts() -> list[dict]:
    return _load()["districts"]


def meta() -> dict:
    return _load()["meta"]


def calibration() -> dict:
    return _load()["calibration"]


def model_card() -> dict:
    return _load()["model_card"]


def households() -> pd.DataFrame:
    return _load()["households"]


def risk_scores() -> np.ndarray:
    return _load()["hh_risk"]


def district_aggregates() -> list[dict]:
    """Per-district household-level aggregates from the calibrated sample, joined onto the
    real district poverty rate and population."""
    st = _load()
    hh = st["households"]
    risk = st["hh_risk"]
    hh = hh.assign(risk=risk)

    out = []
    for d in st["districts"]:
        sub = hh[hh["district"] == d["district"]]
        if sub.empty:
            continue
        out.append(
            {
                **d,
                "sample_households": int(len(sub)),
                "resilience_index": round(float(sub["resilience_index"].mean()), 1),
                "momo_coverage": round(100 * float(sub["has_momo"].mean()), 1),
                "savings_coverage": round(100 * float(sub["has_savings"].mean()), 1),
                "insurance_coverage": round(100 * float(sub["health_insurance"].mean()), 1),
                "shock_incidence": round(100 * float(sub["shock_experienced"].mean()), 1),
                "mean_risk": round(float(sub["risk"].mean()), 3),
                "financial_health": {
                    k: round(100 * float((sub["financial_health"] == k).mean()), 1)
                    for k in ["healthy", "coping", "vulnerable", "extremely_vulnerable"]
                },
            }
        )
    return sorted(out, key=lambda r: r["poverty_2024"], reverse=True)
