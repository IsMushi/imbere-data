"""Swap real EICV7 microdata in for the calibrated layer, with the contract checked first.

`data/processed/households.csv` is the contract the engines read (docs/METHODOLOGY.md §6). Until
now "replace the file" was an instruction a reader had to carry out by hand. This script does the
replacement:

    python scripts/import_eicv7.py path/to/eicv7_household.csv --mapping data/reference/eicv7_map.json

and refuses to write anything the engines would misread.

What it does, in order:

  1. reads the extract (CSV, Stata `.dta`, SPSS `.sav`, Parquet), optionally renaming columns
     through a mapping file and recoding category values through the same file;
  2. recomputes `poor` and `extreme_poor` from `consumption_ae` against the published lines, so the
     targets cannot disagree with the consumption column - pass --keep-targets to trust the file;
  3. validates columns, geography, binary columns and ranges with `app.contract`;
  4. compares the result against the published marginals and prints the gap;
  5. writes `data/processed/households.csv` only when every check passes.

What it deliberately does not do: guess which EICV7 variable is which. Variable names and category
codes come from the extract's codebook, so they belong in the mapping file, not in this script.
`data/reference/eicv7_map.json` is the template; leaving a value unmapped is an error rather than a
silent default.

After a successful import, rerun the API (it refits on load) and
`python scripts/build_snapshot.py` so the browser snapshot matches.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
API_DIR = ROOT / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.contract import (  # noqa: E402  (path has to be inserted first)
    OPTIONAL_DESIGN_COLUMNS,
    REQUIRED_COLUMNS,
    design_columns_present,
    validate_households,
)

PROCESSED = ROOT / "data" / "processed"
REFERENCE = ROOT / "data" / "reference"

# Published marginals the calibrated layer reproduces. An import is not required to match them -
# real rows are allowed to differ - but the difference is the first thing a reviewer should see.
BENCHMARKS = {
    "poor": 27.4,
    "extreme_poor": 5.7,
    "has_momo": 86.9,
    "has_savings": 68.2,
    "health_insurance": 85.6,
}


def read_any(path: Path) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix in {".csv", ".txt"}:
        return pd.read_csv(path)
    if suffix == ".dta":
        return pd.read_stata(path, convert_categoricals=False)
    if suffix == ".sav":
        return pd.read_spss(path)
    if suffix in {".parquet", ".pq"}:
        return pd.read_parquet(path)
    raise SystemExit(
        f"unsupported input: {path.name}. Use .csv, .dta, .sav or .parquet."
    )


def apply_mapping(df: pd.DataFrame, mapping: dict) -> tuple[pd.DataFrame, list[str]]:
    """Rename columns and recode categories. Returns the frame and any problems found."""
    problems: list[str] = []
    columns = mapping.get("columns", {})
    out = df.rename(columns={src: dst for src, dst in columns.items() if src in df.columns})

    absent = [src for src in columns if src not in df.columns]
    if absent:
        # A mapping entry pointing at a column the extract does not have is a wrong codebook, and
        # continuing would import a file with the wrong column silently dropped.
        problems.append(f"mapping names columns absent from the extract: {', '.join(absent)}")

    for column, value_map in mapping.get("value_maps", {}).items():
        if column not in out.columns:
            continue
        lookup = {str(k): v for k, v in value_map.items()}

        def recode(v: object, lookup: dict = lookup, col: str = column) -> object:
            key = str(v)
            if key not in lookup:
                problems.append(f"{col}: unmapped category {v!r}; add it to the mapping file")
                return v
            return lookup[key]

        out[column] = out[column].map(recode)

    return out, problems


def retarget(df: pd.DataFrame, lines: dict) -> pd.DataFrame:
    """Recompute the poverty targets from consumption, so the two cannot disagree."""
    total = float(lines["total_poverty_line_rwf_per_adult_equiv_year"])
    extreme = float(lines["extreme_poverty_line_rwf_per_adult_equiv_year"])
    df["poor"] = (df["consumption_ae"] < total).astype(int)
    df["extreme_poor"] = (df["consumption_ae"] < extreme).astype(int)
    return df


def marginals(df: pd.DataFrame) -> dict[str, float]:
    return {k: round(float(df[k].mean()) * 100, 1) for k in BENCHMARKS if k in df.columns}


def report(df: pd.DataFrame) -> None:
    print(f"\nrows: {len(df):,}   districts: {df['district'].nunique()}")
    if design_columns_present(df.columns):
        print("design columns: present (weight, stratum, psu) - intervals can be design-based")
    else:
        print(
            "design columns: absent - the API reports resampling intervals, not EICV7 "
            "standard errors (docs/METHODOLOGY.md §7)"
        )

    print(f"\n{'marginal':<20}{'import':>10}{'published':>12}{'gap':>9}")
    for key, published in BENCHMARKS.items():
        if key not in df.columns:
            continue
        got = round(float(df[key].mean()) * 100, 1)
        print(f"{key:<20}{got:>9.1f}%{published:>11.1f}%{got - published:>+8.1f}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", type=Path, help="EICV7 household extract (.csv, .dta, .sav, .parquet)")
    parser.add_argument(
        "--mapping",
        type=Path,
        default=REFERENCE / "eicv7_map.json",
        help="column and category mapping (default: data/reference/eicv7_map.json)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=PROCESSED / "households.csv",
        help="where to write the contract file (default: data/processed/households.csv)",
    )
    parser.add_argument(
        "--keep-targets",
        action="store_true",
        help="trust the file's poor / extreme_poor columns instead of recomputing them",
    )
    parser.add_argument("--dry-run", action="store_true", help="validate and report, write nothing")
    args = parser.parse_args(argv)

    if not args.source.exists():
        raise SystemExit(f"input not found: {args.source}")

    df = read_any(args.source)
    print(f"read {args.source.name}: {len(df):,} rows, {len(df.columns)} columns")

    problems: list[str] = []
    if args.mapping.exists():
        mapping = json.loads(args.mapping.read_text(encoding="utf-8"))
        df, problems = apply_mapping(df, mapping)
    else:
        print(f"no mapping file at {args.mapping}; assuming the extract already uses contract names")

    lines = json.loads((REFERENCE / "national_indicators.json").read_text(encoding="utf-8"))["poverty_lines"]

    if not args.keep_targets:
        if "consumption_ae" not in df.columns:
            problems.append("cannot recompute poor/extreme_poor: consumption_ae is missing")
        else:
            df = retarget(df, lines)
            print("recomputed poor and extreme_poor from consumption_ae and the published lines")

    districts = [d["district"] for d in json.loads((PROCESSED / "districts.json").read_text(encoding="utf-8"))]
    sample = {
        col: df[col].dropna().unique()[:250].tolist()
        for col in df.columns
        if col in set(REQUIRED_COLUMNS) | set(OPTIONAL_DESIGN_COLUMNS)
    }
    problems.extend(
        validate_households(
            df.columns,
            districts,
            rows=len(df),
            sample=sample,
            poverty_line=float(lines["total_poverty_line_rwf_per_adult_equiv_year"]),
        )
    )

    if problems:
        print("\nREFUSING TO WRITE - the file does not satisfy the contract:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    report(df)
    missing_optional = [c for c in OPTIONAL_DESIGN_COLUMNS if c not in df.columns]
    if missing_optional:
        print(f"optional design columns not present: {', '.join(missing_optional)}")

    if args.dry_run:
        print("\ndry run: nothing written. Drop --dry-run to import.")
        return 0

    order = [c for c in ("hh_id", "district", "province") if c in df.columns]
    order += [c for c in REQUIRED_COLUMNS if c in df.columns and c not in order]
    order += [c for c in OPTIONAL_DESIGN_COLUMNS if c in df.columns]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    df[order].to_csv(args.out, index=False)
    print(f"\nwrote {args.out.relative_to(ROOT)} ({len(df):,} rows, {len(order)} columns)")
    print("next: restart the API (it refits on load), then python scripts/build_snapshot.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
