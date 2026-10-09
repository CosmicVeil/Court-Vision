import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # make the `app` package importable

from app import config
from app.ml.nba_ai_system import NBAAISystem


def main(argv=None):
    parser = argparse.ArgumentParser(description="Train the NBA AI model from cached data.")
    parser.add_argument(
        "--data",
        default=str(config.data_path(config.MULTI_SEASON_DATA_FILE)),
        help="cached multi-season dataset path",
    )
    parser.add_argument(
        "--output",
        default=str(config.data_path(config.MODEL_FILE)),
        help="destination model path",
    )
    args = parser.parse_args(argv)

    output = Path(args.output).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    system = NBAAISystem()
    if not system.train_from_cache(data_file=args.data, model_file=str(output)):
        raise SystemExit("Model retraining failed")

    print(f"Trained in {time.perf_counter() - started:.1f}s")
    print(f"Saved model to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
