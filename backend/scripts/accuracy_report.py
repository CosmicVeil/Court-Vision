"""Internal report: how the logged predictions compare with the games played so far.

  python scripts/accuracy_report.py                      # current season, newest predictions
  python scripts/accuracy_report.py --as-of 2026-11-01   # only games through that date
  python scripts/accuracy_report.py --min-games 10 --top 10
  python scripts/accuracy_report.py --stat rpg           # rank the best/worst lists by another stat
  python scripts/accuracy_report.py --version 3f2a9c0d1b7e
  python scripts/accuracy_report.py --all                # every player, closest overall first
  python scripts/accuracy_report.py --all --stat ppg     # every player, closest on points first
  python scripts/accuracy_report.py --all --csv accuracy.csv   # same table as a spreadsheet file

Reads prediction_log and the game archive from DATABASE_URL (the API fills prediction_log the
first time it starts with a set of predictions). Nothing here is exposed on the website.
"""
import argparse
import csv
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


def player_table(errors: list, stat: str = 'overall') -> list:
    """One row per player with every stat, closest prediction first.

    `stat` ranks by that stat's absolute error. 'overall' ranks by `score`: each stat's miss
    divided by the typical (mean) miss for that stat, averaged over the stats, so points don't
    drown out steals. A score of 1.0 is an average miss; lower is closer.
    """
    typical = {m['stat']: m['mae'] for m in prediction_accuracy.metrics(errors)}
    players = {}
    for row in errors:
        player = players.setdefault(row['player_id'], {
            'player_name': row['player_name'], 'team': row.get('team'), 'games': row['games'], 'stats': {}})
        player['stats'][row['stat']] = {'predicted': row['predicted'], 'actual': row['actual'],
                                        'error': row['predicted'] - row['actual']}
    table = []
    for player in players.values():
        scaled = [abs(s['error']) / typical[key] for key, s in player['stats'].items() if typical.get(key)]
        player['score'] = sum(scaled) / len(scaled) if scaled else 0.0
        if stat == 'overall' or stat in player['stats']:
            table.append(player)
    rank = (lambda p: p['score']) if stat == 'overall' else (lambda p: abs(p['stats'][stat]['error']))
    return sorted(table, key=lambda p: (rank(p), p['player_name']))


def format_table(table: list) -> str:
    keys = [key for key, _ in SO_FAR_FIELDS]
    lines = [f"{'#':>4}  {'player':<24}{'team':<5}{'GP':>3}{'score':>7}" + ''.join(f"{key.upper():>12}" for key in keys),
             f"{'':>4}  {'':<24}{'':<5}{'':>3}{'':>7}" + f"{'pred/actual':>12}" * len(keys)]
    for index, player in enumerate(table, 1):
        cells = ''.join(
            f"{'{:.1f}/{:.1f}'.format(player['stats'][key]['predicted'], player['stats'][key]['actual']):>12}"
            if key in player['stats'] else f"{'-':>12}" for key in keys)
        lines.append(f"{index:>4}  {player['player_name'][:23]:<24}{player['team'] or '':<5}{player['games']:>3}"
                     f"{player['score']:>7.2f}{cells}")
    return '\n'.join(lines)


def write_csv(table: list, path: str) -> None:
    keys = [key for key, _ in SO_FAR_FIELDS]
    with open(path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['rank', 'player', 'team', 'games', 'score']
                        + [f'{key}_{column}' for key in keys for column in ('predicted', 'actual', 'error')])
        for index, player in enumerate(table, 1):
            row = [index, player['player_name'], player['team'] or '', player['games'], round(player['score'], 3)]
            for key in keys:
                stat = player['stats'].get(key)
                row += [round(stat[c], 2) for c in ('predicted', 'actual', 'error')] if stat else ['', '', '']
            writer.writerow(row)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--season", type=int, help="ESPN season year, e.g. 2027 for 2026-27 (default: current)")
    parser.add_argument("--version", help="model_version to report on (default: the newest logged)")
    parser.add_argument("--as-of", type=lambda v: datetime.strptime(v, "%Y-%m-%d").date(),
                        help="only count games through this date (YYYY-MM-DD)")
    parser.add_argument("--min-games", type=int, default=prediction_accuracy.MIN_GAMES)
    parser.add_argument("--stat", choices=[key for key, _ in SO_FAR_FIELDS] + ['overall'],
                        help="stat to rank players by (default: ppg; with --all: overall, every stat combined)")
    parser.add_argument("--top", type=int, default=5, help="players in each best/worst list")
    parser.add_argument("--all", action="store_true", help="list every player with every stat, closest first")
    parser.add_argument("--csv", metavar="FILE", help="with --all: also write the table to a CSV file")
    args = parser.parse_args()
    if args.csv and not args.all:
        parser.error("--csv needs --all")
    if args.stat == 'overall' and not args.all:
        parser.error("--stat overall needs --all")

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
        if args.all:
            table = player_table(errors, args.stat or 'overall')
            print(format_table(table))
            print("\nscore: average miss across the stats, each divided by that stat's typical miss "
                  "(1.00 = average, lower = closer)")
            if args.csv:
                write_csv(table, args.csv)
                print(f"Wrote {len(table)} players to {args.csv}")
        else:
            print(build_report(errors, args.stat or prediction_accuracy.HEADLINE_STAT, args.top))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
