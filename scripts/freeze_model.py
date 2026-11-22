"""Fit the poverty-risk model once and write it to a pickle, for a fast container cold start.

Run it inside the deployment image, never on a developer machine:

    IMBERE_MODEL_CACHE=/app/model/state.pkl python scripts/freeze_model.py

`deploy/cloudflare/Dockerfile` does exactly that during `docker build`, so the payload is
produced by the interpreter and numpy/pandas/scikit-learn versions that will unpickle it —
`datastore._read_cache` rejects a payload built by anything else and refits.

Why this exists: a cold container that fits the model on boot spends 20 s of CPU on it here
(measured on a full core) and considerably longer on a fractional one. The interface gives a
POST 60 s (`web/lib/api.ts`) before it gives up, so fitting on boot turns /targeting,
/simulator and /protection into visible timeouts. Loading a pickle instead takes about a second.

The frozen file is deliberately NOT committed to data/processed/: it is a build artifact tied to
one set of library versions, and data/processed/ is the documented swap point for real EICV7
microdata (docs/METHODOLOGY.md §6).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app import datastore  # noqa: E402  (after sys.path is set up)

DEFAULT_TARGET = ROOT / "model" / "state.pkl"


def main() -> int:
    target = Path(os.environ.get("IMBERE_MODEL_CACHE", "").strip() or DEFAULT_TARGET)
    written = datastore.freeze(target)
    megabytes = written.stat().st_size / (1024 * 1024)
    card = datastore.model_card()
    print(f"froze {written} ({megabytes:.1f} MB)")
    print(f"  auc_gradient_boosting={card['auc_gradient_boosting']} rows={len(datastore.households())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
