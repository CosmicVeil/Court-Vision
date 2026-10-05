"""Walk-forward evaluation for the CourtVision next-season stat model."""

import argparse
import json
import os
import pickle
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.multioutput import MultiOutputRegressor
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor

BACKEND_DIR = Path(os.path.dirname(os.path.abspath(__file__)))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from nba_ai_system import (  # noqa: E402
    FEATURE_COLUMNS,
    TARGET_SPECS,
    NBAAISystem,
    _build_xgboost_model,
)

DATA_PATH = BACKEND_DIR / "nba_multi_season_data.pkl"
REPORT_PATH = BACKEND_DIR / "model_evaluation_report.json"
PARAM_NAMES = (
    "n_estimators", "max_depth", "learning_rate", "subsample",
    "colsample_bytree", "random_state", "n_jobs",
)
FAST_OVERRIDES = {"n_estimators": 200, "max_depth": 4, "learning_rate": 0.1}


def load_data(path=DATA_PATH):
    """Read a cached multi-season dataset without modifying it."""
    with open(path, "rb") as handle:
        return pickle.load(handle)


def production_params():
    """Read the production estimator settings from its canonical builder."""
    params = _build_xgboost_model().estimator.get_params()
    return {name: params[name] for name in PARAM_NAMES}


def make_model_factory(params):
    params = dict(params)

    def factory():
        return MultiOutputRegressor(XGBRegressor(**params))

    return factory


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seasons", type=int, default=3, help="number of latest target seasons")
    parser.add_argument("--fast", action="store_true", help="use a small model for quick iteration")
    parser.add_argument("--n-estimators", type=int)
    parser.add_argument("--max-depth", type=int)
    parser.add_argument("--learning-rate", type=float)
    parser.add_argument("--subsample", type=float)
    parser.add_argument("--colsample-bytree", type=float)
    parser.add_argument("--data", type=Path, default=DATA_PATH)
    parser.add_argument("--output", type=Path, default=REPORT_PATH)
    return parser.parse_args(argv)


def resolve_params(args):
    params = production_params()
    if args.fast:
        params.update(FAST_OVERRIDES)
    for name in ("n_estimators", "max_depth", "learning_rate", "subsample", "colsample_bytree"):
        value = getattr(args, name)
        if value is not None:
            params[name] = value
    return params


def _safe_ratio(numerator, denominator):
    if denominator == 0:
        return 0.0 if numerator == 0 else None
    return float(numerator / denominator)


def _score_stat(y_true, y_pred, naive, spec):
    valid = np.isfinite(y_true) & np.isfinite(y_pred) & np.isfinite(naive)
    y_true, y_pred, naive = y_true[valid], y_pred[valid], naive[valid]
    if not len(y_true):
        raise ValueError(f"No finite evaluation rows for {spec['key']}")

    scale = 100.0 if spec["kind"] == "percentage" else 1.0
    mae = float(mean_absolute_error(y_true, y_pred) * scale)
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)) * scale)
    naive_mae = float(mean_absolute_error(y_true, naive) * scale)
    r2 = float(r2_score(y_true, y_pred)) if len(y_true) >= 2 else None
    ratio = _safe_ratio(mae, naive_mae)
    improvement = None if ratio is None else float((1.0 - ratio) * 100.0)
    return {
        "mae": mae, "rmse": rmse, "r2": r2, "naive_mae": naive_mae,
        "improvement_pct": improvement, "ratio": ratio, "n": int(len(y_true)),
    }


def evaluate(data, seasons=3, model_factory=_build_xgboost_model):
    """Run leakage-free walk-forward evaluation on the latest target seasons."""
    if seasons < 1:
        raise ValueError("seasons must be at least 1")

    system = NBAAISystem()
    system.data = data
    transitions = system._build_season_transitions()
    target_seasons = sorted({item["to_season"] for item in transitions})
    candidates = [
        target for target in target_seasons
        if any(item["to_season"] < target for item in transitions)
    ]
    selected = candidates[-seasons:]
    if not selected:
        raise ValueError("At least two usable season transitions are required")
    if len(selected) < seasons:
        print(f"Warning: requested {seasons} seasons, but only {len(selected)} can be evaluated.")

    per_season = {}
    folds = []
    for target_season in selected:
        train = [item for item in transitions if item["to_season"] < target_season]
        test = [item for item in transitions if item["to_season"] == target_season]
        X_train = np.vstack([item["X"] for item in train])
        y_train = np.vstack([item["y"] for item in train])
        X_test = np.vstack([item["X"] for item in test])
        y_test = np.vstack([item["y"] for item in test])

        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)
        model = model_factory()
        model.fit(X_train_scaled, y_train)
        predictions = system._clamp_predictions(model.predict(X_test_scaled))

        stats = {}
        for index, spec in enumerate(TARGET_SPECS):
            last_index = FEATURE_COLUMNS.index(spec["last_column"])
            stats[spec["key"]] = _score_stat(
                y_test[:, index], predictions[:, index], X_test[:, last_index], spec
            )

        label = system._season_label(target_season)
        fold = {
            "target_season": int(target_season),
            "label": label,
            "train_target_seasons": sorted({int(item["to_season"]) for item in train}),
            "n_train": int(len(X_train)),
            "n_test": int(len(X_test)),
            "stats": stats,
        }
        folds.append(fold)
        per_season[label] = {
            key: fold[key] for key in ("n_train", "n_test", "train_target_seasons", "stats")
        }

    average_stats = {}
    for spec in TARGET_SPECS:
        key = spec["key"]
        fold_stats = [fold["stats"][key] for fold in folds]
        averaged = {}
        for metric in ("mae", "rmse", "r2", "naive_mae", "n"):
            values = [row[metric] for row in fold_stats if row[metric] is not None]
            averaged[metric] = float(np.mean(values)) if values else None
        averaged["n"] = int(sum(row["n"] for row in fold_stats))
        averaged["ratio"] = _safe_ratio(averaged["mae"], averaged["naive_mae"])
        averaged["improvement_pct"] = (
            None if averaged["ratio"] is None else float((1.0 - averaged["ratio"]) * 100.0)
        )
        average_stats[key] = averaged

    ratios = [row["ratio"] for row in average_stats.values() if row["ratio"] is not None]
    return {
        "folds": folds,
        "per_season": per_season,
        "average": {"stats": average_stats},
        "headline_ratio": float(np.mean(ratios)) if ratios else None,
    }


def build_report(result, params):
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "model_params": dict(params),
        "seasons_evaluated": [
            {"key": fold["target_season"], "label": fold["label"]}
            for fold in result["folds"]
        ],
        "units": {
            spec["key"]: "percentage points" if spec["kind"] == "percentage" else "stat units"
            for spec in TARGET_SPECS
        },
        "headline": {"mean_mae_ratio": result["headline_ratio"]},
        "per_season": result["per_season"],
        "average": result["average"],
    }


def _metric(value, decimals=3):
    return "n/a" if value is None or not np.isfinite(value) else f"{value:.{decimals}f}"


def format_table(report):
    lines = []
    headers = ("Stat", "MAE", "RMSE", "R²", "Naive MAE", "Δ% vs naive")
    row_format = "{:<13} {:>10} {:>10} {:>10} {:>12} {:>13}"

    def add_block(title, stats):
        lines.extend((title, row_format.format(*headers), "-" * 72))
        for spec in TARGET_SPECS:
            row = stats[spec["key"]]
            label = spec["key"] + (" (pp)" if spec["kind"] == "percentage" else "")
            improvement = "n/a" if row["improvement_pct"] is None else f"{row['improvement_pct']:.1f}%"
            lines.append(row_format.format(
                label, _metric(row["mae"]), _metric(row["rmse"]),
                _metric(row["r2"]), _metric(row["naive_mae"]), improvement,
            ))
        lines.append("")

    for season in report["seasons_evaluated"]:
        fold = report["per_season"][season["label"]]
        add_block(
            f"Target season {season['label']} (train rows: {fold['n_train']}, test rows: {fold['n_test']})",
            fold["stats"],
        )
    add_block("Average across evaluated seasons", report["average"]["stats"])
    ratio = report["headline"]["mean_mae_ratio"]
    lines.append(f"Headline mean MAE / naive MAE ratio: {_metric(ratio, 4)} (lower is better; <1 beats naive)")
    return "\n".join(lines)


def main(argv=None):
    args = parse_args(argv)
    params = resolve_params(args)
    result = evaluate(load_data(args.data), args.seasons, make_model_factory(params))
    report = build_report(result, params)
    print(format_table(report))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, allow_nan=False)
        handle.write("\n")
    print(f"\nWrote JSON report to {args.output}")
    return report


if __name__ == "__main__":
    main()
