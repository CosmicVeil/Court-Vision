import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # make the `app` package importable

from app import config
from app.ml.nba_ai_system import NBAAISystem, SEASONS_TO_SCRAPE


def main(argv=None):
    parser = argparse.ArgumentParser(description="Scrape and cache NBA model training data.")
    parser.add_argument(
        "--output",
        default=str(config.data_path(config.MULTI_SEASON_DATA_FILE)),
        help="cached dataset destination",
    )
    parser.add_argument(
        "--seasons",
        nargs="+",
        type=int,
        default=SEASONS_TO_SCRAPE,
        help="season end years to scrape",
    )
    args = parser.parse_args(argv)

    output = Path(args.output).expanduser().resolve()
    system = NBAAISystem()
    if not system.acquire_training_data(seasons=args.seasons, data_file=str(output)):
        raise SystemExit("Training data scrape failed")

    print(f"Cached training data at {output}")
    print("Next, run scripts/retrain_nba_ai.py to train a model.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
