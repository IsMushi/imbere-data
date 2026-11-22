"""The frozen-model path that the Cloudflare container image depends on.

deploy/cloudflare/Dockerfile bakes a pickle at build time so a cold start loads the engine
instead of fitting it: the fit is ~20 s of CPU on a full core, which is past the 60 s POST
budget the interface allows once a container only gets a fraction of one (web/lib/api.ts).

Two properties make that safe, and both are pinned here:

1. the frozen state is numerically identical to a fresh fit, so the headline figures in
   README.md / METHODOLOGY.md / SUBMISSION.md do not move; and
2. a payload built by different numpy / pandas / scikit-learn versions is refused, not trusted.
"""
from __future__ import annotations

import pickle
import shutil
from pathlib import Path

import numpy as np
import pytest

from app import datastore


@pytest.fixture(scope="module")
def frozen(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, dict]:
    """Freeze once, and return the path plus the state that was already loaded and fitted.

    Module-scoped because freezing refits the model, and the comparison target is the fit the
    session fixture already performed.
    """
    baseline = datastore.get()
    target = tmp_path_factory.mktemp("model") / "state.pkl"
    datastore.freeze(target)
    return target, baseline


@pytest.fixture
def load_from_cache(frozen: tuple[Path, dict], monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the module at the frozen payload and drop the in-memory state, so the next
    `get()` really goes through `_read_cache` rather than returning what is already loaded."""
    target, _ = frozen
    monkeypatch.setattr(datastore, "CACHE_PATH", target)
    monkeypatch.setattr(datastore, "_state", {})
    monkeypatch.setattr(datastore, "_ready", False)
    return target


def test_frozen_state_is_identical_to_a_fresh_fit(
    frozen: tuple[Path, dict], load_from_cache: Path
) -> None:
    _, baseline = frozen
    loaded = datastore.get()

    assert loaded["model_card"] == baseline["model_card"], "the frozen model card drifted"
    np.testing.assert_allclose(loaded["hh_risk"], baseline["hh_risk"], rtol=0, atol=0)
    assert loaded["households"].equals(baseline["households"])
    assert loaded["districts"] == baseline["districts"]
    assert loaded["calibration"] == baseline["calibration"]


def test_frozen_state_satisfies_the_household_contract(load_from_cache: Path) -> None:
    """A cache that loads but drops a column would break the engines silently."""
    hh = datastore.households()
    assert "district_poverty_rate" in hh.columns, "the joined poverty rate is fitted, not read"
    assert len(hh) > 10_000
    assert len(datastore.risk_scores()) == len(hh)


def test_payload_from_other_library_versions_is_refused(
    frozen: tuple[Path, dict], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target, _ = frozen
    stale = tmp_path / "stale.pkl"
    shutil.copyfile(target, stale)

    payload = pickle.loads(stale.read_bytes())
    payload["versions"] = {"numpy": "0.0.0", "pandas": "0.0.0", "sklearn": "0.0.0"}
    stale.write_bytes(pickle.dumps(payload))

    monkeypatch.setattr(datastore, "CACHE_PATH", stale)
    assert datastore._read_cache() is None, "a mismatched payload must fall back to refitting"


def test_unreadable_payload_degraded_to_a_refit(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """A truncated or corrupt cache must slow startup down, not take the service offline."""
    broken = tmp_path / "broken.pkl"
    broken.write_bytes(b"not a pickle")
    monkeypatch.setattr(datastore, "CACHE_PATH", broken)
    assert datastore._read_cache() is None
