"""Store finished NBA games in PostgreSQL (tables: games, team_game_stats, player_game_stats).

  python scripts/archive_games.py                       # yesterday + today (US Eastern)
  python scripts/archive_games.py --date 2026-03-10
  python scripts/archive_games.py --start 2026-03-01 --end 2026-03-31
  python scripts/archive_games.py --season 2025-26      # whole season incl. preseason/playoffs
  python scripts/archive_games.py --season 2025-26 --refresh   # re-fetch already-stored games

Games already stored are skipped unless --refresh is given.
"""
import argparse
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # make the `app` package importable

from app import db
from app.services import game_archive


def _parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def _date_range(args) -> tuple:
    if args.date:
        return args.date, args.date
    if args.season:
        first_year = int(args.season.split("-")[0])
        return date(first_year, 9, 25), date(first_year + 1, 6, 30)
    today = datetime.now(game_archive._ET).date()
    return args.start or today - timedelta(days=1), args.end or today


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--date", type=_parse_date)
    group.add_argument("--season", help="e.g. 2025-26")
    parser.add_argument("--start", type=_parse_date)
    parser.add_argument("--end", type=_parse_date)
    parser.add_argument("--refresh", action="store_true", help="re-fetch games that are already stored")
    args = parser.parse_args()

    start, end = _date_range(args)
    today = datetime.now(game_archive._ET).date()
    end = min(end, today)

    db.init_db()
    conn = db.get_db()
    try:
        counts = game_archive.archive_dates(conn, start, end, refresh=args.refresh)
        linked = game_archive.relink_player_ids(conn)
    finally:
        conn.close()
    print(f"Archived {counts['archived']}, already stored {counts['skipped']}, "
          f"failed/not final {counts['failed']} ({start} to {end})")
    if linked:
        print(f"Linked {linked} previously unmatched players to NBA.com IDs")


if __name__ == "__main__":
    main()
