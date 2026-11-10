"""Internal report: how the logged predictions compare with the games played so far.

  python scripts/accuracy_report.py                      # current season, newest predictions
  python scripts/accuracy_report.py --as-of 2026-11-01   # only games through that date
  python scripts/accuracy_report.py --min-games 10 --top 10
  python scripts/accuracy_report.py --stat rpg           # rank the best/worst lists by another stat
  python scripts/accuracy_report.py --version 3f2a9c0d1b7e

Reads prediction_log and the game archive from DATABASE_URL (the API fills prediction_log the
first time it starts with a set of predictions). Nothing here is exposed on the website.
"""
import argparse
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # make the `app` package importable

from app import db
from app.api.helpers import SO_FAR_FIELDS
from app.services import game_archive, prediction_accuracy


def format_metrics(metrics: list) -> str:
    lines = [f"{'stat':<5}{'players':>8}{'MAE':>8}{'baseline':>10}{'vs base':>9}{'bias':>8}{'median':>8}{'beat base':>11}"]
    for m in metrics:
        improvement = (1 - m['mae'] / m['baseline_mae']) * 100 if m['baseline_mae'] else 0.0
        lines.append(f"{m['stat'].upper():<5}{m['players']:>8}{m['mae']:>8.2f}{m['baseline_mae']:>10.2f}"
                     f"{improvement:>+8.1f}%{m['bias']:>+8.2f}{m['median_abs_error']:>8.2f}"
                     f"{m['beat_baseline_pct']:>10.0f}%")
    return '\n'.join(lines)


def format_players(title: str, rows: list) -> str:
    lines = [title, f"  {'player':<26}{'GP':>4}{'predicted':>11}{'actual':>8}{'last szn':>10}{'error':>8}"]
    for r in rows:
        lines.append(f"  {r['player_name'][:25]:<26}{r['games']:>4}{r['predicted']:>11.1f}{r['actual']:>8.1f}"
                     f"{r['last_season']:>10.1f}{r['predicted'] - r['actual']:>+8.1f}")
    return '\n'.join(lines)


def build_report(errors: list, stat: str, top: int) -> str:
    """The report body for score()/player_errors() rows. Pure, so it is testable offline."""
    if not errors:
        return "No players to score yet."
    ranked = sorted((r for r in errors if r['stat'] == stat),
                    key=lambda r: (abs(r['predicted'] - r['actual']), r['player_name']))
    return '\n\n'.join([
        format_metrics(prediction_accuracy.metrics(errors)),
        "bias: mean of predicted - actual (+ = model too high) · beat base: share of players the\n"
        "model was closer on than assuming they repeat last season",
        format_players(f"Closest {stat.upper()} predictions", ranked[:top]),
        format_players(f"Biggest {stat.upper()} misses", ranked[::-1][:top]),
    ])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--season", type=int, help="ESPN season year, e.g. 2027 for 2026-27 (default: current)")
    parser.add_argument("--version", help="model_version to report on (default: the newest logged)")
    parser.add_argument("--as-of", type=lambda v: datetime.strptime(v, "%Y-%m-%d").date(),
                        help="only count games through this date (YYYY-MM-DD)")
    parser.add_argument("--min-games", type=int, default=prediction_accuracy.MIN_GAMES)
    parser.add_argument("--stat", default=prediction_accuracy.HEADLINE_STAT,
                        choices=[key for key, _ in SO_FAR_FIELDS], help="stat for the best/worst lists")
    parser.add_argument("--top", type=int, default=5, help="players in each best/worst list")
    args = parser.parse_args()

    season = args.season or game_archive.current_season_year()
    conn = db.get_db()
    try:
        versions = prediction_accuracy.logged_versions(conn, season)
        if not versions:
            sys.exit(f"No predictions logged for {game_archive.season_label(season)} yet. "
                     "Start the API once (python main.py) to log the current predictions.")
        version = args.version or versions[0]['model_version']
        print(f"Season {game_archive.season_label(season)} · predictions {version} · "
              f"min {args.min_games} games" + (f" · through {args.as_of}" if args.as_of else ""))
        if len(versions) > 1:
            print("Logged versions: " + ", ".join(
                f"{v['model_version']} ({v['logged_at']:%Y-%m-%d}, {v['players']} players)" for v in versions))
        errors = prediction_accuracy.player_errors(conn, season, version, args.as_of, args.min_games)
        print()
        print(build_report(errors, args.stat, args.top))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
