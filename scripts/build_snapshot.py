"""Write the browser-side snapshot the UI falls back to while the API is cold.

The deployed API runs on a free tier that sleeps. When it wakes, the first request can take
30 seconds; the page would sit on skeletons that whole time. The snapshot is the same payload,
computed from the same committed data, so the UI can paint immediately and then reconcile with
the live API when it answers.

    python scripts/build_snapshot.py           # write web/public/api/*.json
    python scripts/build_snapshot.py --check   # exit 1 if the committed snapshot has drifted

Run this after `build_data.py`; the two are the only writers of the figures the UI shows.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from app import analytics, datastore  # noqa: E402

OUT = ROOT / "web" / "public" / "api"

# path served by the API -> file the UI loads when the API does not answer in time
FILES = {
    "meta": "/api/meta.json",
    "districts": "/api/districts.json",
    "poverty": "/api/poverty.json",
    "targeting": "/api/targeting-default.json",
}


def payloads() -> dict[str, dict]:
    st = datastore.get()
    return {
        "meta": {
            **st["meta"],
            "model_card": st["model_card"],
            "calibration": st["calibration"],
            "targeting_rules": analytics.RULES,
            "shock_assumptions": analytics.SHOCK_ASSUMPTIONS,
            "severity_note": analytics.SEVERITY_NOTE,
        },
        "districts": {"districts": datastore.district_aggregates()},
        "poverty": analytics.poverty_measures(),
        "targeting": analytics.evaluate_targeting(300_000_000, 150_000),
    }


def render(value: dict) -> str:
    return json.dumps(value, indent=2, sort_keys=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report drift instead of writing")
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    drifted = []
    for key, value in payloads().items():
        target = OUT / FILES[key].lstrip("/").split("/", 1)[1]
        body = render(value)
        if args.check:
            if not target.exists() or target.read_text(encoding="utf-8") != body:
                drifted.append(target.name)
            continue
        target.write_text(body, encoding="utf-8")
        print(f"{target.relative_to(ROOT)}  {len(body):,} bytes")

    if args.check:
        if drifted:
            print(f"snapshot is stale: {', '.join(drifted)} — run scripts/build_snapshot.py")
            return 1
        print("snapshot matches the committed data")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
