"""Walk-forward evaluation of the per-game stat model, for one or several architectures.

Games are ordered by date. The first part of the timeline is training-only; the rest is
cut into consecutive test blocks. For each block the model is retrained on every game
played before the block starts and scored on the block, so it is always tested on games
that are later than anything it learned from (the same situation as predicting tonight).
"""
import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from app import config
from app.ml import game_architectures
from app.ml.game_features import TARGET_COLUMNS, TARGETS, load_training_frame
from app.ml.game_model import GameStatModel
from app.ml.model_evaluation import _metric, _score_stat

REPORT_PATH = config.data_path(config.GAME_MODEL_EVALUATION_REPORT_FILE)
DEFAULT_FOLDS = 5
# Share of game dates, from the start of the archive, that is only ever trained on.
INITIAL_TRAIN_FRACTION = 0.5


def date_folds(frame, folds=DEFAULT_FOLDS, initial_train_fraction=INITIAL_TRAIN_FRACTION):
    """Yield (train_mask, test_mask) pairs. Whole game dates go to one side or the other."""
    if folds < 1:
        raise ValueError("folds must be at least 1")
    dates = np.sort(frame["game_date"].unique())
    first_test = int(len(dates) * initial_train_fraction)
    blocks = [block for block in np.array_split(dates[first_test:], folds) if len(block)]
    if first_test < 1 or not blocks:
        raise ValueError("Not enough game dates to evaluate")
    for block in blocks:
        train_mask = (frame["game_date"] < block[0]).to_numpy()
        test_mask = frame["game_date"].isin(block).to_numpy()
        yield train_mask, test_mask


def evaluate(frame, architecture, folds=DEFAULT_FOLDS):
    """Score one architecture on out-of-sample predictions pooled over all test blocks."""
    actual, predicted, naive, fold_rows = [], [], [], []
    for train_mask, test_mask in date_folds(frame, folds):
        train, test = frame[train_mask], frame[test_mask]
        model = GameStatModel(architecture).fit(train)
        actual.append(test[TARGET_COLUMNS].to_numpy(dtype=float))
        predicted.append(model.predict(test).to_numpy())
        naive.append(test[list(TARGETS.values())].to_numpy(dtype=float))
        fold_rows.append({
            "test_start": str(test["game_date"].min().date()),
            "test_end": str(test["game_date"].max().date()),
            "n_train": int(len(train)),
            "n_test": int(len(test)),
        })
    actual, predicted, naive = (np.vstack(part) for part in (actual, predicted, naive))
    # _score_stat skips non-finite rows. For predictions that would quietly score a broken
    # architecture on fewer (easier) rows than the others, so fail loudly instead.
    if not np.isfinite(predicted).all():
        raise ValueError(f"{architecture} produced non-finite predictions")

    stats = {
        target: _score_stat(actual[:, index], predicted[:, index], naive[:, index],
                            {"key": target, "kind": "rate"})
        for index, target in enumerate(TARGET_COLUMNS)
    }
    ratios = [row["ratio"] for row in stats.values() if row["ratio"] is not None]
    return {
        "architecture": architecture,
        "folds": fold_rows,
        "stats": stats,
        "headline_ratio": float(np.mean(ratios)) if ratios else None,
        "mean_mae": float(np.mean([row["mae"] for row in stats.values()])),
    }


def compare(frame, architectures, folds=DEFAULT_FOLDS):
    """Evaluate several architectures on identical folds, so the numbers are comparable."""
    results = {}
    for name in architectures:
        started = time.perf_counter()
        results[name] = evaluate(frame, name, folds)
        results[name]["seconds"] = round(time.perf_counter() - started, 1)
    return results


def build_report(results, frame):
    ranked = sorted(
        (name for name in results if results[name]["headline_ratio"] is not None),
        # Mean MAE breaks ties, and covers stats whose ratio is undefined (naive MAE of 0).
        key=lambda name: (results[name]["headline_ratio"], results[name]["mean_mae"]),
    )
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "rows": int(len(frame)),
        "first_game": str(frame["game_date"].min().date()),
        "last_game": str(frame["game_date"].max().date()),
        "best_architecture": ranked[0] if ranked else None,
        "architectures": results,
    }


def format_table(report):
    results = report["architectures"]
    names = list(results)
    lines = [
        f"Per-game stat model: {report['rows']} player-games, "
        f"{report['first_game']} to {report['last_game']}",
        "MAE per stat (lower is better). Naive = the player's average over the previous 10 games.",
        "",
    ]
    row_format = "{:<9} {:>10}" + " {:>15}" * len(names)
    lines.append(row_format.format("Stat", "Naive", *names))
    lines.append("-" * (20 + 16 * len(names)))
    for target in TARGET_COLUMNS:
        naive_mae = results[names[0]]["stats"][target]["naive_mae"]
        lines.append(row_format.format(
            target, _metric(naive_mae),
            *(_metric(results[name]["stats"][target]["mae"]) for name in names),
        ))
    lines.append("")
    lines.append(row_format.format(
        "RMSE pts", "", *(_metric(results[name]["stats"]["pts"]["rmse"]) for name in names)))
    lines.append(row_format.format(
        "MAE ratio", "1.0000", *(_metric(results[name]["headline_ratio"], 4) for name in names)))
    lines.append(row_format.format(
        "Seconds", "", *(str(results[name]["seconds"]) for name in names)))
    lines.append("")
    lines.append("MAE ratio = mean over stats of (model MAE / naive MAE); below 1 beats naive.")
    if report["best_architecture"]:
        lines.append(f"Best architecture: {report['best_architecture']}")
    return "\n".join(lines)


def _positive_int(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return number


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Compare per-game stat model architectures.")
    parser.add_argument("--arch", action="append", choices=game_architectures.available(),
                        help="architecture to evaluate; repeat for several (default: all)")
    parser.add_argument("--folds", type=_positive_int, default=DEFAULT_FOLDS,
                        help="number of consecutive test blocks")
    parser.add_argument("--output", type=Path, default=REPORT_PATH, help="JSON report path")
    return parser.parse_args(argv)


def main(argv=None, frame=None):
    args = parse_args(argv)
    if frame is None:
        frame = load_training_frame()
    results = compare(frame, args.arch or game_architectures.available(), args.folds)
    report = build_report(results, frame)
    print(format_table(report))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, allow_nan=False)
        handle.write("\n")
    print(f"\nWrote JSON report to {args.output}")
    return report


if __name__ == "__main__":
    main()
