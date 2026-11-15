"""Train the per-game stat model on every archived game and save it.

Run from backend/:  python scripts/train_game_model.py --arch random_forest
Needs DATABASE_URL (reads the game archive).
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # make the `app` package importable

from app.ml import game_architectures
from app.ml.game_features import load_training_frame
from app.ml.game_model import GameStatModel, model_file


def main(argv=None, frame=None):
    parser = argparse.ArgumentParser(description="Train the per-game stat model.")
    parser.add_argument("--arch", choices=game_architectures.available(),
                        default=game_architectures.default_architecture(),
                        help="model architecture")
    parser.add_argument("--output", help="destination model path (default: one file per architecture in data/)")
    args = parser.parse_args(argv)

    if frame is None:
        frame = load_training_frame()
    started = time.perf_counter()
    model = GameStatModel(args.arch).fit(frame)
    output = model.save(args.output or model_file(args.arch))

    print(f"Trained {args.arch} on {len(frame)} player-games in {time.perf_counter() - started:.1f}s")
    print(f"Saved model to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
