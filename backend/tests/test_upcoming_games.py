import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import app.services.live_games as live_games


class FixedDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return cls(2026, 12, 20, 12, tzinfo=timezone(timedelta(hours=-4))).astimezone(tz)


def event(game_id, date, home="LAL", away="DEN"):
    return {
        "id": game_id, "date": date,
        "status": {"type": {"state": "pre", "completed": False}},
        "competitions": [{"competitors": [
            {"homeAway": "home", "score": "0", "team": {"abbreviation": home}},
            {"homeAway": "away", "score": "0", "team": {"abbreviation": away}},
        ]}],
    }


class UpcomingGamesTests(unittest.TestCase):
    def setUp(self):
        live_games._cache.clear()
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.csv_path = os.path.join(tmp.name, "upcoming.csv")
        self.enterContext(patch.object(live_games, "_UPCOMING_CSV", self.csv_path))
        self.enterContext(patch.object(live_games, "datetime", FixedDatetime))

    def fetch_with(self, months):
        requested = []

        def fake_get(url, params=None):
            requested.append(params["dates"])
            return months.get(params["dates"])

        with patch.object(live_games, "_get", side_effect=fake_get):
            games = live_games.get_upcoming_games(days=30)
        return games, requested

    def test_fetches_each_month_across_year_end_and_filters_window(self):
        months = {
            "202612": {"events": [
                event("past", "2026-12-10T00:00Z"),      # Dec 9 ET: before today
                event("today", "2026-12-20T23:00Z"),     # today ET: not upcoming
                event("dec", "2026-12-23T00:30Z"),       # Dec 22 ET
            ]},
            "202701": {"events": [
                event("jan", "2027-01-05T00:00Z"),       # Jan 4 ET
                event("late", "2027-01-25T00:00Z"),      # beyond 30 days, but cached
            ]},
        }
        with patch.object(live_games, "_get", side_effect=lambda url, params=None: months.get(params["dates"], {"events": []})) as get:
            games = live_games.get_upcoming_games(days=30)
            requested = [call.kwargs["params"]["dates"] for call in get.call_args_list]

        self.assertEqual(requested[:2], ["202612", "202701"])
        self.assertEqual(requested[-1], "202712")
        self.assertEqual(len(requested), 13)
        self.assertEqual([g["gameId"] for g in games], ["dec", "jan"])
        self.assertEqual(games[0]["gameDate"], "20261222")

        # The full 365-day window is cached; later reads filter by days.
        with patch.object(live_games, "_get") as get:
            cached = live_games.get_upcoming_games(days=60)
        get.assert_not_called()
        self.assertEqual([g["gameId"] for g in cached], ["dec", "jan", "late"])

    def test_failed_month_returns_empty_and_does_not_write_cache(self):
        games, requested = self.fetch_with({"202612": {"events": [event("dec", "2026-12-23T00:30Z")]}})

        self.assertEqual(games, [])
        self.assertEqual(requested, ["202612", "202701"])
        self.assertFalse(os.path.exists(self.csv_path))

    def test_failure_keeps_previous_cache_file(self):
        with open(self.csv_path, "w") as handle:
            handle.write("old,cache\n")

        self.fetch_with({})

        with open(self.csv_path) as handle:
            self.assertEqual(handle.read(), "old,cache\n")

    def test_header_only_csv_is_a_cache_miss(self):
        live_games._write_upcoming_csv("20261220", [])
        self.assertIsNone(live_games._load_upcoming_csv("20261220"))

        months = {f"2027{m:02d}": {"events": []} for m in range(1, 13)}
        months["202612"] = {"events": [event("dec", "2026-12-23T00:30Z")]}
        games, requested = self.fetch_with(months)

        self.assertEqual([g["gameId"] for g in games], ["dec"])
        self.assertEqual(len(requested), 13)
        self.assertEqual(len(live_games._load_upcoming_csv("20261220")), 1)


if __name__ == "__main__":
    unittest.main()
