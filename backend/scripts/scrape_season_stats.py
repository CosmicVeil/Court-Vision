"""Refresh the current-season player stats (used by the daily GitHub Action)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # make the `app` package importable

from app.scraping.nba_web_scraper import test_scraper

if __name__ == "__main__":
    test_scraper()
