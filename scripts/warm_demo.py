"""Warm the analytical engine before a demo, a mentoring session or a judging round.

The deployed API sleeps on a free tier. Waking it costs a cold Python import plus a model fit,
which is the one wait a live demo cannot afford: the two compute pages have a 60 s budget and no
snapshot fallback, because their answers depend on what the reader asked for.

This script pays that cost in advance. It waits for the background warm-up to finish, then sends
the exact requests the interface will send, so the first real click is a cache hit.

    python scripts/warm_demo.py                                  # local engine
    python scripts/warm_demo.py --base https://imbere-data.onrender.com
    python scripts/warm_demo.py --wait 180                       # slow cold container

Exit codes: 0 ready and warmed, 1 the model never became ready, 2 a request failed.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request

DEFAULT_BASE = "http://127.0.0.1:8000"

# The interface's own first requests, so the cache is primed for the state a judge lands on:
# `/simulator` opens on the highest-poverty district with drought at severity 50, and
# `/targeting` opens on the documented defaults (RWF 300m budget, RWF 150k transfer).
TARGETING_DEFAULT = {"budget_total": 300_000_000, "transfer_per_beneficiary": 150_000}
SEVERITY_DEFAULT = 50.0


def _request(url: str, payload: dict | None, timeout: float) -> tuple[int, float, dict, dict]:
    """Return (status, milliseconds, headers, body). Raises on transport failure."""
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="GET" if payload is None else "POST",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    started = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as res:
        body = json.loads(res.read().decode("utf-8"))
        return res.status, (time.perf_counter() - started) * 1000, dict(res.headers), body


def _wait_for_model(base: str, budget: float) -> bool:
    """Poll `/api/health` until the background fit reports ready.

    The health endpoint never triggers the fit itself, so this cannot be the thing that starts
    it - the container's own startup thread does. That keeps a probe cheap even on a cold box.
    """
    started = time.perf_counter()
    while True:
        elapsed = time.perf_counter() - started
        try:
            _, ms, _, body = _request(f"{base}/api/health", None, timeout=10)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            print(f"  waiting for the service to answer ({type(exc).__name__}) ...", end="\r")
            time.sleep(2)
            if elapsed > budget:
                print()
                print(f"  no answer from {base} within {budget:.0f}s")
                return False
            continue

        if body.get("model_ready"):
            warm = body.get("warm") or {}
            fit = warm.get("seconds")
            detail = f"fit took {fit}s" if fit is not None else "fit already complete"
            print(f"  model ready after {elapsed:5.1f}s  ({detail}, health {ms:.0f} ms)")
            return True

        if warm_error := (body.get("warm") or {}).get("error"):
            print(f"  warm-up failed: {warm_error}")
            return False

        if sys.stdout.isatty():
            print(f"  waiting for the model fit ... {elapsed:5.1f}s", end="\r")
        elif int(elapsed) % 10 == 0:
            print(f"  still fitting ... {elapsed:5.1f}s")
        if elapsed > budget:
            print()
            print(f"  model not ready after {budget:.0f}s; the container may be starved")
            return False
        time.sleep(2)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base", default=DEFAULT_BASE, help=f"API root (default {DEFAULT_BASE})")
    parser.add_argument(
        "--wait", type=float, default=120.0, help="seconds to wait for the model fit (default 120)"
    )
    parser.add_argument(
        "--district",
        default=None,
        help="district to prime (default: the highest-poverty one, which is what the UI opens on)",
    )
    args = parser.parse_args()

    base = args.base.rstrip("/")
    print(f"Warming {base}")

    if not _wait_for_model(base, args.wait):
        return 1

    steps: list[tuple[str, int, float, str]] = []
    failures = 0

    def call(label: str, path: str, payload: dict | None, timeout: float) -> dict | None:
        nonlocal failures
        try:
            status, ms, headers, body = _request(f"{base}{path}", payload, timeout)
        except urllib.error.HTTPError as exc:
            print(f"  {label:<34} HTTP {exc.code}")
            failures += 1
            return None
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            print(f"  {label:<34} {type(exc).__name__}")
            failures += 1
            return None
        cache = headers.get("X-Imbere-Cache") or headers.get("x-imbere-cache") or "-"
        steps.append((label, status, ms, cache))
        return body

    # Reads. Cheap once the model is up, and they populate the CDN's stale-while-revalidate copy.
    call("GET /api/meta", "/api/meta", None, 60)
    districts = call("GET /api/districts", "/api/districts", None, 60)
    call("GET /api/poverty", "/api/poverty", None, 60)

    district = args.district
    if district is None and districts:
        district = districts["districts"][0]["district"]
    district = district or "Nyamagabe"

    # The two compute endpoints, at the parameters the pages open on.
    call("POST /api/targeting (defaults)", "/api/targeting", TARGETING_DEFAULT, 90)
    call(
        f"POST /api/simulate {district}",
        "/api/simulate",
        {"district": district, "shock_type": "drought", "severity": SEVERITY_DEFAULT},
        90,
    )
    call(
        f"POST /api/simulate {district} x2",
        "/api/simulate",
        {
            "district": district,
            "shock_type": "drought",
            "severity": SEVERITY_DEFAULT,
            "additional_shocks": [{"shock_type": "flood", "severity": SEVERITY_DEFAULT}],
        },
        90,
    )

    # Second pass: these must come back as hits, and fast. If they are misses, the cache key is
    # not matching what the UI sends, and the demo will recompute instead of reusing.
    call("POST /api/targeting (again)", "/api/targeting", TARGETING_DEFAULT, 30)
    call(
        f"POST /api/simulate {district} (again)",
        "/api/simulate",
        {"district": district, "shock_type": "drought", "severity": SEVERITY_DEFAULT},
        30,
    )

    print()
    print(f"  {'step':<38} {'status':>6} {'ms':>8}  cache")
    for label, status, ms, cache in steps:
        print(f"  {label:<38} {status:>6} {ms:>8.0f}  {cache}")

    hits = sum(1 for s in steps if s[3] == "hit")
    print()
    print(f"  {len(steps)} requests, {hits} cache hits, {failures} failures")
    if failures:
        print("  the demo path is not warm; fix the failures above before presenting")
        return 2
    if hits == 0:
        print("  no cache hits: the repeat requests did not match the first ones")
        return 2
    print("  ready. Keep this terminal open and avoid idling the engine for long before you present.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
