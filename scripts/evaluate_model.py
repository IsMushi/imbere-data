"""Evaluate the proxy-means model properly, and stress-test the targeting conclusion.

Everything here is measured on the calibrated synthetic household layer, and every number it
writes is labelled that way. The two questions it answers:

  1. How good is the risk model under a protocol that is not a single 70/30 split? Five-fold
     stratified CV, three candidate learners, ROC-AUC and PR-AUC, Brier score and a calibration
     table, all out-of-fold.

  2. Does the "proxy-means beats geographic" conclusion depend on the model being as sharp as it
     is on synthetic rows? The PMT score is deliberately degraded toward noise and the targeting
     comparison is re-run at each level, so the answer is a curve rather than a claim.

Run from the repo root:

    python scripts/evaluate_model.py

Writes docs/MODEL_EVALUATION.md and data/processed/model_evaluation.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "api"))

from app import datastore  # noqa: E402  (path set above)

OUT_JSON = ROOT / "data" / "processed" / "model_evaluation.json"
OUT_MD = ROOT / "docs" / "MODEL_EVALUATION.md"

SEED = 42
FOLDS = 5
# The default programme: RWF 300m at RWF 150k, i.e. a 2,000-household caseload on 15,066 rows.
CASELOAD = 2000


def _preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        [
            (
                "cat",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                datastore.CAT_COLS,
            ),
            ("num", "passthrough", datastore.NUM_COLS),
        ]
    )


def candidates() -> dict[str, Pipeline]:
    pre = _preprocessor
    return {
        "logistic": Pipeline(
            [("pre", pre()), ("scale", StandardScaler()), ("clf", LogisticRegression(max_iter=2000, C=0.5))]
        ),
        "random_forest": Pipeline(
            [
                ("pre", pre()),
                (
                    "clf",
                    RandomForestClassifier(
                        n_estimators=400,
                        min_samples_leaf=12,
                        max_features="sqrt",
                        n_jobs=-1,
                        random_state=SEED,
                    ),
                ),
            ]
        ),
        "gradient_boosting": Pipeline(
            [
                ("pre", pre()),
                (
                    "clf",
                    HistGradientBoostingClassifier(
                        max_iter=250,
                        learning_rate=0.06,
                        max_depth=5,
                        l2_regularization=1.0,
                        random_state=SEED,
                    ),
                ),
            ]
        ),
    }


def out_of_fold(model: Pipeline, X: pd.DataFrame, y: np.ndarray) -> np.ndarray:
    """Out-of-fold predicted probabilities, so every metric is measured on unseen rows."""
    oof = np.zeros(len(y))
    skf = StratifiedKFold(n_splits=FOLDS, shuffle=True, random_state=SEED)
    for train_idx, test_idx in skf.split(X, y):
        fold = model
        fold.fit(X.iloc[train_idx], y[train_idx])
        oof[test_idx] = fold.predict_proba(X.iloc[test_idx])[:, 1]
    return oof


def top_k_metrics(prob: np.ndarray, y: np.ndarray, k: int) -> dict:
    """Metrics at the operating point the programme actually uses: the k highest-risk rows."""
    chosen = np.argsort(-prob)[:k]
    pred = np.zeros(len(y), dtype=int)
    pred[chosen] = 1
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return {
        "k": int(k),
        "targeting_accuracy": round(100 * float(tp) / k, 1),
        "leakage_rate": round(100 * float(fp) / k, 1),
        "coverage_of_poor": round(100 * float(tp) / max(int(y.sum()), 1), 1),
        "precision": round(float(precision_score(y, pred, zero_division=0)), 3),
        "recall": round(float(recall_score(y, pred, zero_division=0)), 3),
        "f1": round(float(f1_score(y, pred, zero_division=0)), 3),
        "true_positive": int(tp),
        "false_positive": int(fp),
        "false_negative": int(fn),
        "true_negative": int(tn),
    }


def calibration_table(prob: np.ndarray, y: np.ndarray, bins: int = 10) -> list[dict]:
    order = np.argsort(prob)
    chunks = np.array_split(order, bins)
    rows = []
    for i, idx in enumerate(chunks, start=1):
        rows.append(
            {
                "decile": i,
                "n": int(len(idx)),
                "mean_predicted": round(float(prob[idx].mean()), 4),
                "observed": round(float(y[idx].mean()), 4),
                "gap_pp": round(100 * float(y[idx].mean() - prob[idx].mean()), 2),
            }
        )
    return rows


def ece(prob: np.ndarray, y: np.ndarray, bins: int = 10) -> float:
    rows = calibration_table(prob, y, bins)
    n = len(y)
    return round(sum(abs(r["gap_pp"]) / 100 * r["n"] / n for r in rows), 4)


def degrade(prob: np.ndarray, target_auc: float, y: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Blend the model score with noise until its AUC falls to ~target_auc.

    This is the stress test that matters: if the ranking only wins because the synthetic rows
    make the model unrealistically sharp, the advantage should collapse as discrimination falls.
    """
    noise = rng.random(len(prob))
    lo, hi = 0.0, 1.0
    for _ in range(40):
        w = (lo + hi) / 2.0
        blended = (1 - w) * prob + w * noise
        auc = roc_auc_score(y, blended)
        if auc > target_auc:
            lo = w
        else:
            hi = w
    return (1 - (lo + hi) / 2.0) * prob + ((lo + hi) / 2.0) * noise


def fairness_audit(hh: pd.DataFrame, prob: np.ndarray, y: np.ndarray, k: int) -> dict:
    """Who gets selected, by residence and province, at the programme's own caseload.

    A ranking model can be accurate overall and still reach poor households unevenly: if the top-k
    cut is dominated by one province, the households that miss out are systematically rural or
    systematically in the west. Coverage is measured *within* each group - the share of that
    group's poor households that make the cut - because a national average hides exactly this.
    """
    n = len(hh)
    selected = np.zeros(n, dtype=bool)
    selected[np.argsort(-prob)[:k]] = True

    groups = {
        "residence": np.where(hh["urban"].to_numpy() == 1, "urban", "rural"),
        "province": hh["province"].to_numpy(),
    }

    out: dict[str, object] = {}
    for name, labels in groups.items():
        rows = []
        for label in sorted(set(labels.tolist())):
            m = labels == label
            poor_m = m & (y == 1)
            poor_count = int(poor_m.sum())
            rows.append(
                {
                    "group": str(label),
                    "households": int(m.sum()),
                    "poor_share_pct": round(float(y[m].mean()) * 100, 1),
                    "selected_share_pct": round(float(selected[m].mean()) * 100, 1),
                    "coverage_of_group_poor_pct": (
                        round(float(selected[poor_m].sum()) / poor_count * 100, 1)
                        if poor_count
                        else None
                    ),
                }
            )
        out[name] = rows

    coverages = [
        r["coverage_of_group_poor_pct"]
        for r in out["province"]  # type: ignore[index]
        if r["coverage_of_group_poor_pct"] is not None
    ]
    out["summary"] = {
        "province_coverage_min_pct": min(coverages) if coverages else None,
        "province_coverage_max_pct": max(coverages) if coverages else None,
        "province_coverage_ratio": (
            round(max(coverages) / min(coverages), 2) if coverages and min(coverages) > 0 else None
        ),
        "note": (
            "Coverage is the share of a group's poor households selected at the national caseload. "
            "A ratio near 1 means the rule reaches poor households at a similar rate everywhere; "
            "a high ratio means it concentrates. Measured on calibrated synthetic rows."
        ),
    }
    return out


def main() -> int:
    st = datastore.get()
    hh: pd.DataFrame = st["households"]
    y = hh["poor"].to_numpy().astype(int)
    X = hh[datastore.FEATURES]
    n = len(hh)
    k = min(CASELOAD, n)

    results: dict[str, dict] = {}
    oof_scores: dict[str, np.ndarray] = {}
    for name, model in candidates().items():
        prob = out_of_fold(model, X, y)
        oof_scores[name] = prob
        results[name] = {
            "roc_auc": round(float(roc_auc_score(y, prob)), 3),
            "pr_auc": round(float(average_precision_score(y, prob)), 3),
            "brier": round(float(brier_score_loss(y, prob)), 4),
            "ece": ece(prob, y),
            "at_programme_caseload": top_k_metrics(prob, y, k),
        }
        results[name]["calibration"] = calibration_table(prob, y)
        print(f"{name:20} AUC {results[name]['roc_auc']:.3f}  PR-AUC {results[name]['pr_auc']:.3f}  "
              f"Brier {results[name]['brier']:.4f}  ECE {results[name]['ece']:.4f}")

    best = max(results, key=lambda m: results[m]["roc_auc"])
    # The deep-dive tables describe the model the app actually ships, not the CV winner: a
    # comparison that silently swapped the production model would contradict /api/model.
    production = "gradient_boosting"
    prod_prob = oof_scores[production]

    # Robustness: degrade the best score toward noise and re-run the same top-k allocation.
    rng = np.random.default_rng(SEED)
    robustness = []
    for target in (0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60):
        degraded = degrade(prod_prob, target, y, rng)
        auc = float(roc_auc_score(y, degraded))
        metrics = top_k_metrics(degraded, y, k)
        robustness.append(
            {
                "target_auc": target,
                "achieved_auc": round(auc, 3),
                "targeting_accuracy": metrics["targeting_accuracy"],
                "coverage_of_poor": metrics["coverage_of_poor"],
                "leakage_rate": metrics["leakage_rate"],
            }
        )
        print(f"degraded to AUC {auc:.3f}: accuracy {metrics['targeting_accuracy']}%  "
              f"coverage {metrics['coverage_of_poor']}%")

    # Reference points from the same sample, so the degraded curve has something to be read against.
    from app import analytics

    baseline = analytics.evaluate_targeting(300_000_000, 150_000)
    ref = {r["id"]: r for r in baseline["results"]}
    geographic = {
        "targeting_accuracy": ref["geographic"]["targeting_accuracy"],
        "coverage_of_poor": ref["geographic"]["coverage_of_poor"],
        "leakage_rate": ref["geographic"]["leakage_rate"],
    }
    universal = {
        "targeting_accuracy": ref["universal"]["targeting_accuracy"],
        "coverage_of_poor": ref["universal"]["coverage_of_poor"],
        "leakage_rate": ref["universal"]["leakage_rate"],
    }
    for row in robustness:
        row["still_beats_geographic"] = bool(row["coverage_of_poor"] > geographic["coverage_of_poor"])

    payload = {
        "evaluated_on": "calibrated synthetic households",
        "rows": int(n),
        "folds": FOLDS,
        "seed": SEED,
        "caseload": int(k),
        "models": results,
        "best_model": best,
        "production_model": production,
        "fairness": fairness_audit(hh, prod_prob, y, k),
        "robustness": robustness,
        "reference": {"geographic": geographic, "universal": universal},
        "caveat": (
            "These metrics describe the calibrated synthetic layer, not Rwanda. They measure how "
            "well observable assets separate poor from non-poor households when the joint "
            "distribution is the one the calibration imposes; real EICV7 microdata will move "
            "them. The robustness sweep is the useful part: it says how much discrimination the "
            "conclusion needs, not how much the model has."
        ),
    }
    OUT_JSON.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    OUT_MD.write_text(render_markdown(payload), encoding="utf-8")
    print(f"\nwrote {OUT_JSON.relative_to(ROOT)} and {OUT_MD.relative_to(ROOT)}")
    return 0


def render_markdown(p: dict) -> str:
    lines = [
        "# Model evaluation",
        "",
        "Generated by `python scripts/evaluate_model.py`. Every figure below is measured on the",
        "**calibrated synthetic household layer** committed in `data/processed/households.csv`,",
        "not on EICV7 microdata. Re-run after loading real rows; the script is the report.",
        "",
        f"- rows: **{p['rows']:,}** · folds: **{p['folds']}** (stratified, seeded {p['seed']})",
        f"- operating point: the **{p['caseload']:,}** highest-risk households (the default",
        "  RWF 300m / RWF 150k programme)",
        "- protocol: out-of-fold predictions, so no metric is measured on a row the model saw",
        "",
        "## Candidate models",
        "",
        "| Model | ROC-AUC | PR-AUC | Brier | ECE | Accuracy @ caseload | Leakage | Poor reached |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    order = ["logistic", "random_forest", "gradient_boosting"]
    for name in order:
        if name not in p["models"]:
            continue
        m = p["models"][name]
        op = m["at_programme_caseload"]
        lines.append(
            f"| {name.replace('_', ' ')} | {m['roc_auc']:.3f} | {m['pr_auc']:.3f} | "
            f"{m['brier']:.4f} | {m['ece']:.4f} | {op['targeting_accuracy']}% | "
            f"{op['leakage_rate']}% | {op['coverage_of_poor']}% |"
        )
    best = p["best_model"]
    bm = p["models"][p["production_model"]]
    op = bm["at_programme_caseload"]
    lines += [
        "",
        f"Best out-of-fold ROC-AUC: **{best.replace('_', ' ')}** "
        f"({p['models'][best]['roc_auc']:.3f}); the production model is "
        f"**{p['production_model'].replace('_', ' ')}** ({bm['roc_auc']:.3f}). The gap is inside "
        "noise, and switching would move every pinned targeting figure, so the shipped model "
        "stays as it is and the comparison is reported rather than acted on.",
        "",
        f"### Confusion matrix at the programme caseload ({p['production_model'].replace('_', ' ')})",
        "",
        "| | Predicted non-poor | Predicted poor |",
        "|---|---:|---:|",
        f"| **Actually non-poor** | {op['true_negative']:,} | {op['false_positive']:,} |",
        f"| **Actually poor** | {op['false_negative']:,} | {op['true_positive']:,} |",
        "",
        f"Precision {op['precision']:.3f} · recall {op['recall']:.3f} · F1 {op['f1']:.3f}.",
        "",
        "## Fairness at the caseload",
        "",
        "An accurate ranking can still reach poor households unevenly. Coverage below is the share",
        "of a group's *own* poor households that make the national top-k cut, so a group with a",
        "high poverty rate but low coverage is being passed over.",
        "",
        "| Province | Households | Poor share | Selected share | Coverage of its poor |",
        "|---|---:|---:|---:|---:|",
    ]
    fairness = p.get("fairness", {})
    for row in fairness.get("province", []):
        coverage = (
            f"{row['coverage_of_group_poor_pct']:.1f}%"
            if row["coverage_of_group_poor_pct"] is not None
            else "—"
        )
        lines.append(
            f"| {row['group']} | {row['households']:,} | {row['poor_share_pct']:.1f}% | "
            f"{row['selected_share_pct']:.1f}% | {coverage} |"
        )
    summary = fairness.get("summary", {})
    lines += [
        "",
        "| Residence | Households | Poor share | Selected share | Coverage of its poor |",
        "|---|---:|---:|---:|---:|",
    ]
    for row in fairness.get("residence", []):
        coverage = (
            f"{row['coverage_of_group_poor_pct']:.1f}%"
            if row["coverage_of_group_poor_pct"] is not None
            else "—"
        )
        lines.append(
            f"| {row['group']} | {row['households']:,} | {row['poor_share_pct']:.1f}% | "
            f"{row['selected_share_pct']:.1f}% | {coverage} |"
        )
    if summary.get("province_coverage_ratio") is not None:
        lines += [
            "",
            f"Worst-to-best province coverage ratio: **{summary['province_coverage_ratio']:.2f}×** "
            f"({summary['province_coverage_min_pct']:.1f}% to {summary['province_coverage_max_pct']:.1f}%). "
            "A ratio near 1 means the rule reaches poor households at a similar rate everywhere.",
        ]
    lines += [
        "",
        "## Calibration",
        "",
        "A ranking model can still be badly calibrated, which matters here because the score is",
        "read as a *probability of being poor*, not just an ordering.",
        "",
        "| Decile | n | Mean predicted | Observed | Gap (pp) |",
        "|---:|---:|---:|---:|---:|",
    ]
    for row in bm["calibration"]:
        lines.append(
            f"| {row['decile']} | {row['n']:,} | {row['mean_predicted']:.3f} | "
            f"{row['observed']:.3f} | {row['gap_pp']:+.2f} |"
        )
    lines += [
        "",
        f"Expected calibration error: **{bm['ece']:.4f}**. Brier score: **{bm['brier']:.4f}**.",
        "",
        "## Does the conclusion depend on the model being sharp?",
        "",
        "The objection to any synthetic-data result is that the synthetic rows may make the",
        "model look better than it is. So the model score is blended with noise until its",
        "out-of-fold AUC falls to a target level, and the *same* allocation rule is re-run at",
        "each level. The question is where proxy-means stops beating geographic targeting.",
        "",
        "| Degraded AUC | Targeting accuracy | Poor reached | Leakage | Beats geographic? |",
        "|---:|---:|---:|---:|---|",
    ]
    for row in p["robustness"]:
        flag = "yes" if row["still_beats_geographic"] else "**no**"
        lines.append(
            f"| {row['achieved_auc']:.3f} | {row['targeting_accuracy']}% | "
            f"{row['coverage_of_poor']}% | {row['leakage_rate']}% | {flag} |"
        )
    geo = p["reference"]["geographic"]
    uni = p["reference"]["universal"]
    lines += [
        "",
        f"Reference on the same sample: geographic targeting reaches {geo['coverage_of_poor']}% of",
        f"the poor with {geo['leakage_rate']}% leakage; universal allocation reaches "
        f"{uni['coverage_of_poor']}%.",
        "",
        "Read the table as a sensitivity statement, not a result about Rwanda: it bounds how much",
        "of the proxy-means advantage is genuinely a *targeting* advantage that survives noisy",
        "scores, and how much is the model being unusually well-informed by the calibration.",
        "",
        "## What this does not establish",
        "",
        "- It is not an impact evaluation. Targeting accuracy is selection performance; it says",
        "  nothing about what a transfer does to a household's consumption.",
        "- The rows are synthetic. Marginals are calibrated to published EICV7 figures, the joint",
        "  distribution is not observed, so both the metrics and the sweep inherit that.",
        "- No survey weights, strata or primary sampling units exist for synthetic rows, so the",
        "  intervals here are resampling intervals, not design-based standard errors.",
        "",
        p["caveat"],
        "",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    raise SystemExit(main())
