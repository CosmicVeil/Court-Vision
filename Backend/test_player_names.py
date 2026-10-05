import contextlib
import io
import math
import os
import pickle
import tempfile
import unittest
from unittest.mock import Mock

import requests
from bs4 import BeautifulSoup

from nba_web_scraper import NBAWebScraper, fix_mojibake, normalize_player_name
from repair_player_names import DEFAULT_PATHS, main, repair_file


class PlayerNameTests(unittest.TestCase):
    def test_real_names_and_idempotence(self):
        names = ["Luka Dončić", "Nikola Jokić", "Alperen Şengün", "Kristaps Porziņģis",
                 "Dennis Schröder", "Nenê", "LeBron James"]
        for name in names:
            broken = name.encode("utf-8").decode("latin-1")
            self.assertEqual(fix_mojibake(broken), name)
            self.assertEqual(fix_mojibake(name), name)
            self.assertEqual(fix_mojibake(fix_mojibake(broken)), name)
        self.assertIsNone(fix_mojibake(None))
        self.assertEqual(fix_mojibake(""), "")
        nan = float("nan")
        self.assertTrue(math.isnan(fix_mojibake(nan)))
        self.assertEqual(normalize_player_name("Luka DonÄ\x8diÄ\x87"), "luka doncic")

    def test_requests_page_is_decoded_as_utf8(self):
        response = requests.Response()
        response.status_code = 200
        response.headers["Content-Type"] = "text/html"
        response._content = (("<p>Luka Dončić</p>" + "x" * 10001).encode("utf-8"))
        scraper = NBAWebScraper()
        scraper.session.get = Mock(return_value=response)
        self.assertIn("Luka Dončić", scraper.get_player_stats_page(2026))
        self.assertEqual(response.encoding, "utf-8")

    def test_parser_repairs_misdecoded_fixture(self):
        html = """<table><tr><th>Player</th><th>Team</th><th>Pos</th><th>G</th><th>PTS</th><th>TRB</th><th>AST</th></tr>
        <tr><td>Luka Dončić</td><td>LAL</td><td>G</td><td>10</td><td>20</td><td>8</td><td>7</td></tr></table>"""
        broken = html.encode("utf-8").decode("latin-1")
        rows = NBAWebScraper().parse_html_tables(BeautifulSoup(broken, "html.parser").find_all("table"))
        self.assertEqual(rows[0]["PLAYER_NAME"], "Luka Dončić")

    def test_repair_file_dry_run_write_backup_and_noop(self):
        original_data = {2026: [{"PLAYER_NAME": "Luka DonÄ\x8diÄ\x87", "PTS": 31, "note": float("nan")},
                                {"PLAYER_NAME": "Dennis Schröder", "PTS": 10}]}
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "players.pkl")
            with open(path, "wb") as handle:
                pickle.dump(original_data, handle)
            with open(path, "rb") as handle:
                original_bytes = handle.read()
            dry = repair_file(path, dry_run=True)
            self.assertEqual(dry["changed"], 1)
            with open(path, "rb") as handle:
                self.assertEqual(handle.read(), original_bytes)
            self.assertEqual([p for p in os.listdir(directory) if p.endswith(".bak")], [])

            result = repair_file(path)
            self.assertEqual(result["changed"], 1)
            with open(result["backup"], "rb") as handle:
                self.assertEqual(handle.read(), original_bytes)
            with open(path, "rb") as handle:
                repaired = pickle.load(handle)
            self.assertEqual(repaired[2026][0]["PLAYER_NAME"], "Luka Dončić")
            self.assertEqual(repaired[2026][0]["PTS"], 31)
            self.assertTrue(math.isnan(repaired[2026][0]["note"]))
            self.assertEqual(repaired[2026][1], original_data[2026][1])
            with open(path, "rb") as handle:
                written = handle.read()
            backups = [p for p in os.listdir(directory) if p.endswith(".bak")]
            self.assertEqual(repair_file(path)["changed"], 0)
            with open(path, "rb") as handle:
                self.assertEqual(handle.read(), written)
            self.assertEqual([p for p in os.listdir(directory) if p.endswith(".bak")], backups)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["--dry-run", path]), 0)

    def test_plain_list_and_defaults(self):
        self.assertEqual([os.path.basename(path) for path in DEFAULT_PATHS],
                         ["nba_multi_season_data.pkl", "nba_2025_26_data.pkl"])
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "players.pkl")
            with open(path, "wb") as handle:
                pickle.dump([{"PLAYER_NAME": "Nikola JokiÄ\x87", "TEAM": "DEN"}], handle)
            self.assertEqual(repair_file(path)["changed"], 1)


if __name__ == "__main__":
    unittest.main()
