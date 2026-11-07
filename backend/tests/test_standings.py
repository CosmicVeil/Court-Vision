import unittest
from unittest.mock import patch

from app.services import standings

CONFERENCES = {
    "east": [{"rank": 1, "team": "Boston Celtics"}],
    "west": [{"rank": 1, "team": "Denver Nuggets"}],
}


class BuildSourceOrderTests(unittest.TestCase):
    """ESPN is the primary source; nba_api is only tried when ESPN fails."""

    @patch.object(standings, "_fetch_from_nba_api")
    @patch.object(standings, "_fetch_from_espn", return_value=CONFERENCES)
    def test_espn_success_never_calls_nba_api(self, espn, nba_api):
        data = standings._build(2017)

        espn.assert_called_once_with(2017)
        nba_api.assert_not_called()
        self.assertEqual(data["source"], "espn")
        self.assertEqual(data["season_label"], "2016-17")
        self.assertEqual(data["east"], CONFERENCES["east"])

    @patch.object(standings, "_fetch_from_nba_api", return_value=CONFERENCES)
    @patch.object(standings, "_fetch_from_espn", return_value=None)
    def test_falls_back_to_nba_api_when_espn_fails(self, espn, nba_api):
        data = standings._build(2017)

        nba_api.assert_called_once_with("2016-17")
        self.assertEqual(data["source"], "nba_api")

    @patch.object(standings, "_fetch_from_nba_api", return_value=None)
    @patch.object(standings, "_fetch_from_espn", return_value=None)
    def test_raises_when_both_sources_fail(self, espn, nba_api):
        with self.assertRaises(RuntimeError):
            standings._build(2017)


if __name__ == "__main__":
    unittest.main()
