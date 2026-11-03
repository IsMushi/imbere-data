"""The household-file contract, as code rather than as an instruction.

`data/processed/households.csv` is the swap point for real EICV7 microdata: the analytical engines
read these column names and nothing else, so replacing the file is a substitution rather than a
refactor. That only holds if something checks the file. `scripts/import_eicv7.py` runs
`validate_households` before it writes, and `api/tests/test_contract.py` runs it against whatever
is currently committed, so a substitution that would break the engines fails at the boundary
instead of producing a quietly wrong dashboard.

Deliberately dependency-light: this module takes a DataFrame and a mapping of valid districts, and
returns a list of human-readable problems. No I/O, no global state, no pandas imports at module
level beyond the type alias, so it is cheap to import from a build script or a test.
"""
from __future__ import annotations

from typing import Iterable, Mapping

# Columns the analytical layer reads. `hh_id` and `province` are carried for joins and display;
# everything else is a feature, a target or a derived label (see docs/DATA_DICTIONARY.md).
REQUIRED_COLUMNS: tuple[str, ...] = (
    "district",
    "urban",
    "hh_size",
    "head_education",
    "main_income_source",
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
    "shock_experienced",
    "shock_type",
    "coping_response",
    "consumption_ae",
    "poor",
    "extreme_poor",
    "resilience_index",
    "financial_health",
)

# Binary indicator columns: 0 or 1, never a blank, never 2.
BINARY_COLUMNS: tuple[str, ...] = (
    "urban",
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
    "shock_experienced",
    "poor",
    "extreme_poor",
)

# Optional design columns. A real EICV7 extract carries these; the calibrated layer does not, and
# its absence is reported as a limitation rather than silently assumed away.
OPTIONAL_DESIGN_COLUMNS: tuple[str, ...] = ("weight", "stratum", "psu")

# Bounds that catch a mis-mapped file rather than a genuinely unusual household.
MAX_HOUSEHOLD_SIZE = 40
MAX_PLAUSIBLE_CONSUMPTION = 500_000_000.0


def validate_households(
    columns: Iterable[str],
    districts: Iterable[str],
    *,
    rows: int | None = None,
    sample: Mapping[str, object] | None = None,
    poverty_line: float | None = None,
) -> list[str]:
    """Return a list of problems; an empty list means the file satisfies the contract.

    `sample` is an optional mapping of column -> a small collection of observed values, used for
    the cheap categorical and range checks. Passing it is what lets the importer reject a file
    before it overwrites anything; the test suite passes a sample read from the committed file.
    """
    problems: list[str] = []
    present = set(columns)

    missing = [c for c in REQUIRED_COLUMNS if c not in present]
    if missing:
        problems.append(f"missing required columns: {', '.join(missing)}")

    valid_districts = {d.strip().lower() for d in districts}
    if not valid_districts:
        problems.append("no valid district list supplied; cannot check geography")

    if rows is not None and rows == 0:
        problems.append("file has no rows")

    if sample:
        seen = sample.get("district")
        if seen is not None and valid_districts:
            # A file keyed on something other than one of the 30 districts is almost always a
            # wrong column mapping, not a new administrative unit.
            unknown = sorted({str(v).strip() for v in seen if str(v).strip().lower() not in valid_districts})
            if unknown:
                problems.append(
                    "district values not in the 30-district reference: "
                    + ", ".join(unknown[:5])
                    + ("…" if len(unknown) > 5 else "")
                )

        for col in BINARY_COLUMNS:
            values = sample.get(col)
            if values is None:
                continue
            try:
                bad = sorted({v for v in values if int(v) not in (0, 1)})
            except (TypeError, ValueError):
                problems.append(f"{col}: non-numeric values in a 0/1 column")
                continue
            if bad:
                problems.append(f"{col}: values outside 0/1: {bad[:5]}")

        sizes = sample.get("hh_size")
        if sizes is not None:
            try:
                bad_sizes = sorted({v for v in sizes if not (1 <= int(v) <= MAX_HOUSEHOLD_SIZE)})
            except (TypeError, ValueError):
                problems.append("hh_size: non-numeric values")
                bad_sizes = []
            if bad_sizes:
                problems.append(
                    f"hh_size: outside 1..{MAX_HOUSEHOLD_SIZE}: {bad_sizes[:5]}"
                )

        cons = sample.get("consumption_ae")
        if cons is not None:
            bad_cons = [v for v in cons if v is None or float(v) <= 0]
            if bad_cons:
                problems.append("consumption_ae: non-positive or missing values")
            elif any(float(v) > MAX_PLAUSIBLE_CONSUMPTION for v in cons):
                problems.append(
                    f"consumption_ae: values above {MAX_PLAUSIBLE_CONSUMPTION:,.0f} "
                    "(probably a different currency scale)"
                )
            elif poverty_line:
                # A monthly figure, or one in thousands, is far below the annual line. Left
                # unchecked it would silently report almost every household as destitute.
                ordered = sorted(float(v) for v in cons)
                median = ordered[len(ordered) // 2]
                if median < 0.25 * float(poverty_line):
                    problems.append(
                        f"consumption_ae: median {median:,.0f} is far below the annual line "
                        f"{float(poverty_line):,.0f} - probably a different currency scale "
                        "(monthly, or in thousands)"
                    )

    return problems


def design_columns_present(columns: Iterable[str]) -> bool:
    """True when the file carries survey design variables, so intervals can be design-based."""
    return all(c in set(columns) for c in OPTIONAL_DESIGN_COLUMNS)
