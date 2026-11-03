"""The round config is the switch a new EICV round turns.

`data/reference/round.json` holds the values that change between survey rounds: the seed, the
sample size, the average household size and the published national headline rates. The poverty
lines live in `national_indicators.json`, which is the same file the API publishes them from.

These tests exist because a config file that quietly disagrees with the published output is worse
than no config file at all: it makes a round switch look done when it is not. Everything asserted
here is a value the build writes into `data/processed/meta.json`, so a drift fails the suite rather
than appearing in a judge's browser.
"""
from __future__ import annotations

import json
from pathlib import Path

from app import datastore

REPO_ROOT = Path(__file__).resolve().parents[2]
REFERENCE = REPO_ROOT / "data" / "reference"

REQUIRED_KEYS = {
    "round",
    "fieldwork",
    "published",
    "average_household_size",
    "sample_households",
    "seed",
    "headline",
}
HEADLINE_KEYS = {
    "poverty_rate_2024",
    "extreme_poverty_rate_2024",
    "poverty_rate_2017",
    "extreme_poverty_rate_2017",
}


def _round() -> dict:
    return json.loads((REFERENCE / "round.json").read_text(encoding="utf-8"))


def _indicators() -> dict:
    return json.loads((REFERENCE / "national_indicators.json").read_text(encoding="utf-8"))


def test_round_config_declares_every_key() -> None:
    config = _round()
    assert REQUIRED_KEYS <= set(config), f"round.json is missing {REQUIRED_KEYS - set(config)}"
    assert HEADLINE_KEYS <= set(config["headline"]), (
        f"round.json headline is missing {HEADLINE_KEYS - set(config['headline'])}"
    )


def test_round_config_matches_published_meta() -> None:
    config = _round()
    meta = datastore.meta()

    assert meta["round"]["id"] == config["round"]
    assert meta["round"]["fieldwork"] == config["fieldwork"]
    assert meta["round"]["published"] == config["published"]

    # The two places the config reaches the household layer.
    assert meta["microdata"]["seed"] == config["seed"]
    assert meta["microdata"]["rows"] == config["sample_households"]
    assert meta["round"]["sample_households"] == config["sample_households"]


def test_round_headline_rates_are_what_the_api_publishes() -> None:
    config = _round()
    published = datastore.meta()["national"]

    for key in sorted(HEADLINE_KEYS):
        assert published[key] == config["headline"][key], (
            f"{key}: round.json says {config['headline'][key]}, meta.json publishes {published[key]}"
        )


def test_poverty_lines_have_one_source() -> None:
    """`national_indicators.json` is the only place the lines are written down."""
    lines = _indicators()["poverty_lines"]
    published = datastore.meta()["poverty_lines"]

    assert published["total_poverty_line_rwf_per_adult_equiv_year"] == (
        lines["total_poverty_line_rwf_per_adult_equiv_year"]
    )
    assert published["extreme_poverty_line_rwf_per_adult_equiv_year"] == (
        lines["extreme_poverty_line_rwf_per_adult_equiv_year"]
    )
    assert published["total_poverty_line_rwf_per_adult_equiv_year"] == 560127
    assert published["extreme_poverty_line_rwf_per_adult_equiv_year"] == 356432

    # The round config must not re-state them: two sources of truth drift.
    assert "poverty_lines" not in _round()


def test_average_household_size_reproduces_the_district_counts() -> None:
    """The district household counts are population / average size, so a wrong config shows up."""
    config = _round()
    districts = datastore.districts()

    for d in districts:
        expected = round(d["population_2022"] / config["average_household_size"])
        assert abs(d["households"] - expected) <= 1, (
            f"{d['district']}: {d['households']} households from {d['population_2022']} people "
            f"does not follow from an average size of {config['average_household_size']}"
        )
