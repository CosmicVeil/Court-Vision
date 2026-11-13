"""Offline tests for the ESPN injury report (app/services/injuries.py) and where it is served."""
import unittest
from unittest.mock import MagicMock, patch

from app import create_app, state
from app.services import injuries

IDS = {"mouhamed gueye": 1631243, "trae young": 1629027, "jalen johnson": 1630552}


def row(name, status="Out", date="2026-11-13T00:06Z", espn_id=4712863, team="ATL", **details):
    return {
        "status": status, "date": date, "shortComment": f"{name} note",
        "athlete": {
            "displayName": name,
            "links": [{"href": f"https://www.espn.com/nba/player/_/id/{espn_id}/x"}],
            "team": {"abbreviation": team}, "position": {"abbreviation": "F"},
        },
        "details": details,
    }


def payload(*rows):
    return {"injuries": [{"displayName": "Atlanta Hawks", "injuries": list(rows)}]}


def resolve(name):
    return IDS.get(name.lower())


@patch.object(injuries, "nba_player_id", side_effect=resolve)
class ParseInjuriesTests(unittest.TestCase):
    def test_golden_path_entry(self, _):
        report = injuries.parse_injuries(payload(row(
            "Mouhamed Gueye", type="Foot", detail="Fracture", side="Left", returnDate="2026-12-12")))
        self.assertEqual(report, {1631243: {
            "status": "Out", "status_abbr": "OUT", "injury": "Foot", "detail": "Fracture",
            "side": "Left", "return_date": "2026-12-12", "note": "Mouhamed Gueye note",
            "updated": "2026-11-13T00:06Z", "espnId": 4712863,
            "name": "Mouhamed Gueye", "team": "ATL", "position": "F",
        }})

    def test_espn_team_abbreviations_become_our_tricodes(self, _):
        for espn, ours in (("GS", "GSW"), ("UTAH", "UTA"), ("WSH", "WAS"), ("NO", "NOP"), ("ATL", "ATL")):
            with self.subTest(espn=espn):
                self.assertEqual(injuries.parse_injuries(payload(row("Trae Young", team=espn)))[1629027]["team"], ours)

    def test_missing_team_and_position_are_blank(self, _):
        entry = injuries.parse_injuries(payload({"status": "Out", "athlete": {"displayName": "Trae Young"}}))[1629027]
        self.assertEqual((entry["name"], entry["team"], entry["position"]), ("Trae Young", "", ""))

    def test_status_abbreviations(self, _):
        for status, abbr in (("Out", "OUT"), ("Day-To-Day", "DTD"), ("Suspension", "SUSP"),
                             ("Questionable", "Q"), ("Inactive", "INAC")):
            with self.subTest(status=status):
                report = injuries.parse_injuries(payload(row("Trae Young", status=status)))
                self.assertEqual(report[1629027]["status_abbr"], abbr)

    def test_missing_details_default_to_empty(self, _):
        entry = injuries.parse_injuries(payload(row("Trae Young")))[1629027]
        self.assertEqual((entry["injury"], entry["detail"], entry["side"], entry["return_date"]),
                         ("", "", "", None))

    def test_unresolved_names_and_blank_status_are_skipped(self, _):
        report = injuries.parse_injuries(payload(row("Nobody Known"), row("Trae Young", status="  ")))
        self.assertEqual(report, {})

    def test_malformed_payloads_and_rows_are_skipped(self, _):
        for bad in (None, {}, {"injuries": None}, {"injuries": [{"injuries": None}]}):
            with self.subTest(payload=bad):
                self.assertEqual(injuries.parse_injuries(bad), {})
        report = injuries.parse_injuries(payload({"athlete": None, "status": "Out"},
                                                 {"athlete": "oops", "status": "Out"},
                                                 row("Trae Young")))
        self.assertEqual(list(report), [1629027])

    def test_duplicate_listing_keeps_newest(self, _):
        report = injuries.parse_injuries(payload(
            row("Trae Young", status="Day-To-Day", date="2026-11-12T10:00Z"),
            row("Trae Young", status="Out", date="2026-11-11T10:00Z")))
        self.assertEqual(report[1629027]["status"], "Day-To-Day")

    def test_espn_id_from_headshot_or_absent(self, _):
        athlete = {"displayName": "Trae Young",
                   "headshot": {"href": "https://a.espncdn.com/i/headshots/nba/players/full/4277905.png"}}
        report = injuries.parse_injuries(payload({"status": "Out", "athlete": athlete},
                                                 {"status": "Out", "athlete": {"displayName": "Jalen Johnson"}}))
        self.assertEqual(report[1629027]["espnId"], 4277905)
        self.assertIsNone(report[1630552]["espnId"])


class InjuryCacheTests(unittest.TestCase):
    def setUp(self):
        self.addCleanup(setattr, injuries, "_cache", None)
        injuries._cache = None
        self.clock = self.enterContext(patch.object(injuries.time, "time", return_value=1000.0))

    def test_fetches_once_within_ttl_then_refreshes(self):
        with patch.object(injuries, "_fetch", side_effect=[{1: {"status": "Out"}}, {2: {"status": "Out"}}]) as fetch:
            self.assertEqual(injuries.get_injuries(), {1: {"status": "Out"}})
            self.clock.return_value = 1000.0 + injuries.CACHE_TTL - 1
            self.assertEqual(injuries.injury_for(1), {"status": "Out"})
            self.assertEqual(fetch.call_count, 1)
            self.clock.return_value = 1000.0 + injuries.CACHE_TTL
            self.assertEqual(injuries.get_injuries(), {2: {"status": "Out"}})
            self.assertIsNone(injuries.injury_for(1))
            self.assertEqual(fetch.call_count, 2)

    def test_failed_refresh_serves_stale_and_waits_a_ttl_before_retrying(self):
        with patch.object(injuries, "_fetch", side_effect=[{1: {"status": "Out"}}, RuntimeError("down")]) as fetch:
            injuries.get_injuries()
            self.clock.return_value += injuries.CACHE_TTL
            self.assertEqual(injuries.get_injuries(), {1: {"status": "Out"}})
            self.clock.return_value += 1
            injuries.get_injuries()
            self.assertEqual(fetch.call_count, 2)

    def test_first_failure_returns_empty_without_raising(self):
        with patch.object(injuries, "_fetch", side_effect=RuntimeError("down")) as fetch:
            self.assertEqual(injuries.get_injuries(), {})
            self.assertIsNone(injuries.injury_for(1))
            self.assertEqual(fetch.call_count, 1)

    def test_force_refresh_bypasses_cache(self):
        with patch.object(injuries, "_fetch", return_value={}) as fetch:
            injuries.get_injuries()
            injuries.get_injuries(force_refresh=True)
            self.assertEqual(fetch.call_count, 2)

    @patch.object(injuries, "nba_player_id", side_effect=resolve)
    def test_fetch_parses_espn_response_and_raises_on_http_error(self, _):
        ok = MagicMock()
        ok.json.return_value = payload(row("Trae Young"))
        with patch.object(injuries.requests, "get", return_value=ok) as get:
            self.assertEqual(list(injuries._fetch()), [1629027])
            get.assert_called_once_with(injuries._ESPN_INJURIES, timeout=10)
        bad = MagicMock()
        bad.raise_for_status.side_effect = RuntimeError("503")
        with patch.object(injuries.requests, "get", return_value=bad), self.assertRaises(RuntimeError):
            injuries._fetch()


def player(player_id, name, team="ATL"):
    return {"PLAYER_ID": player_id, "PLAYER_NAME": name, "TEAM": team, "POSITION": "G", "AGE": 27.0,
            "GAMES_PLAYED_LAST": 10, "PPG_LAST": 25.0}


class InjuryRoutesTests(unittest.TestCase):
    """The player popup and the team roster carry each player's entry, or None when healthy."""

    def setUp(self):
        hurt, healthy = player(1629027, "Trae Young"), player(1630552, "Jalen Johnson")
        for name, value in (
            ("nba_data", [hurt, healthy]),
            ("nba_name_index", {"trae young": hurt, "jalen johnson": healthy}),
            ("multi_season_data", {}), ("multi_season_name_indexes", {}),
            ("current_season_data", []), ("current_season_year", 2027), ("ai_available", False),
        ):
            self.enterContext(patch.object(state, name, value))
        self.enterContext(patch.object(state, "current_player_teams", return_value={}))
        self.entry = {"status": "Day-To-Day", "status_abbr": "DTD", "injury": "Ankle"}
        self.enterContext(patch.object(injuries, "get_injuries", return_value={1629027: self.entry}))
        self.enterContext(patch("app.api.routes.teams._standings_row", return_value=None))
        self.enterContext(patch("app.db.get_db", side_effect=RuntimeError("no database")))
        self.client = create_app(load_data=False).test_client()

    def test_player_popup(self):
        self.assertEqual(self.client.get("/api/players/1629027").get_json()["injury"], self.entry)
        self.assertIsNone(self.client.get("/api/players/1630552").get_json()["injury"])

    def test_team_roster(self):
        roster = {p["name"]: p["injury"] for p in self.client.get("/api/teams/ATL").get_json()["roster"]}
        self.assertEqual(roster, {"Trae Young": self.entry, "Jalen Johnson": None})


class InjuredRosterMembershipTests(unittest.TestCase):
    """A player on the injury report joins his team's roster even before any box score names him."""

    def setUp(self):
        played = player(1630552, "Jalen Johnson")
        self.baseline_hurt = player(1631243, "Mouhamed Gueye", team="ATL")
        for name, value in (
            ("nba_data", [played, self.baseline_hurt]), ("current_season_data", [played]),
            ("current_season_year", 2027),
        ):
            self.enterContext(patch.object(state, name, value))
        self.current_teams = self.enterContext(patch.object(state, "current_player_teams", return_value={}))
        self.report = {
            1631243: {"status": "Out", "status_abbr": "OUT", "name": "Mouhamed Gueye", "team": "ATL", "position": "F"},
            1643563: {"status": "Out", "status_abbr": "OUT", "name": "Richie Saunders", "team": "ATL", "position": "G"},
            1629027: {"status": "Out", "status_abbr": "OUT", "name": "Elsewhere Player", "team": "BOS", "position": "G"},
            1630552: {"status": "Day-To-Day", "status_abbr": "DTD", "name": "Jalen Johnson", "team": "ATL", "position": "F"},
        }
        self.enterContext(patch.object(injuries, "get_injuries", return_value=self.report))
        self.enterContext(patch("app.api.routes.teams._standings_row", return_value=None))
        self.enterContext(patch("app.db.get_db", side_effect=RuntimeError("no database")))
        self.client = create_app(load_data=False).test_client()

    def roster(self):
        return {p["id"]: p for p in self.client.get("/api/teams/ATL").get_json()["roster"]}

    def test_injured_players_join_with_no_stats_and_sort_last(self):
        roster = self.roster()
        self.assertEqual(list(roster), [1630552, 1631243, 1643563])  # played first, then by name
        gueye, saunders = roster[1631243], roster[1643563]
        # Known player: bio from the baseline (age a season on), never last season's stats.
        self.assertEqual((gueye["name"], gueye["position"], gueye["age"], gueye["games_played"], gueye["ppg"]),
                         ("Mouhamed Gueye", "G", 28, 0, None))
        self.assertEqual(gueye["injury"], self.report[1631243])
        # Unknown to our data: ESPN's name and position.
        self.assertEqual((saunders["name"], saunders["position"], saunders["age"]), ("Richie Saunders", "G", None))

    def test_player_who_has_played_is_not_duplicated(self):
        roster = self.roster()
        self.assertEqual(roster[1630552]["ppg"], 25.0)
        self.assertEqual(roster[1630552]["injury"]["status_abbr"], "DTD")

    def test_newer_team_observation_outranks_the_injury_report(self):
        self.current_teams.return_value = {1631243: "BOS"}
        self.assertNotIn(1631243, self.roster())


if __name__ == "__main__":
    unittest.main()
