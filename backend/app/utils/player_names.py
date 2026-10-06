"""Small, dependency-free helpers for repairing and comparing player names."""

import re
import unicodedata


NAME_SUFFIXES = {'jr', 'sr', 'ii', 'iii', 'iv', 'v'}


def fix_mojibake(name):
    """Undo UTF-8 text decoded as Latin-1, without altering valid names."""
    if not isinstance(name, str) or not name:
        return name
    repaired = name
    for _ in range(3):
        try:
            candidate = repaired.encode('latin-1').decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            break
        if candidate == repaired:
            break
        repaired = candidate
    return repaired


def normalize_player_name(name) -> str:
    """Return a canonical key for matching names across NBA data sources."""
    if not name:
        return ''
    name = fix_mojibake(str(name))
    ascii_name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    ascii_name = re.sub(r"[.'`*]", '', ascii_name.lower())
    ascii_name = ascii_name.replace('-', ' ')
    parts = [part for part in ascii_name.split() if part not in NAME_SUFFIXES]
    return ' '.join(parts)
