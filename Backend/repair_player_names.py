"""Repair mojibake in PLAYER_NAME fields in CourtVision pickle data files."""

import argparse
from datetime import datetime
import os
import pickle
import shutil
import tempfile

from player_names import fix_mojibake


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PATHS = [
    os.path.join(BASE_DIR, "nba_multi_season_data.pkl"),
    os.path.join(BASE_DIR, "nba_2025_26_data.pkl"),
]


def _records(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        records = []
        for value in data.values():
            if not isinstance(value, list):
                raise TypeError("pickle season values must be lists of player records")
            records.extend(value)
        return records
    raise TypeError("pickle data must be a player list or a season-to-player-list dict")


def repair_records(data):
    """Repair PLAYER_NAME in place and return the changed (old, new) pairs."""
    changes = []
    for record in _records(data):
        if not isinstance(record, dict):
            raise TypeError("player records must be dictionaries")
        old = record.get("PLAYER_NAME")
        new = fix_mojibake(old)
        if new != old:
            record["PLAYER_NAME"] = new
            changes.append((old, new))
    return changes


def _backup_path(path):
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    candidate = f"{path}.{stamp}.bak"
    suffix = 1
    while os.path.exists(candidate):
        candidate = f"{path}.{stamp}.{suffix}.bak"
        suffix += 1
    return candidate


def repair_file(path, dry_run=False):
    path = os.path.abspath(os.fspath(path))
    with open(path, "rb") as handle:
        data = pickle.load(handle)
    records = _records(data)
    changes = repair_records(data)
    result = {
        "path": path,
        "rows": len(records),
        "changed": len(changes),
        "examples": changes[:10],
    }
    if dry_run or not changes:
        return result

    backup = _backup_path(path)
    shutil.copy2(path, backup)
    result["backup"] = backup
    fd, temp_path = tempfile.mkstemp(prefix=os.path.basename(path) + ".", dir=os.path.dirname(path))
    try:
        with os.fdopen(fd, "wb") as handle:
            pickle.dump(data, handle, protocol=pickle.HIGHEST_PROTOCOL)
        os.replace(temp_path, path)
    except Exception:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="report repairs without writing files")
    parser.add_argument("paths", nargs="*", help="pickle files (defaults to CourtVision player data)")
    args = parser.parse_args(argv)
    for path in args.paths or DEFAULT_PATHS:
        result = repair_file(path, dry_run=args.dry_run)
        mode = "would change" if args.dry_run else "changed"
        print(f"{result['path']}: {result['rows']} rows, {mode} {result['changed']} names")
        for old, new in result["examples"]:
            print(f"  {old} -> {new}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
