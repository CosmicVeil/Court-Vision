"""In-memory sliding-window rate limiting for sensitive routes (login, signup).

State lives in this process, which is enough for the single gunicorn worker on Render.
It resets on restart, and with several workers each one would keep its own counts.
"""
import math
import threading
import time
from collections import deque
from functools import wraps

from flask import jsonify, request


class RateLimiter:
    """Allow at most `max_requests` per key within any `window_seconds` span."""

    def __init__(self, max_requests: int, window_seconds: float, clock=time.monotonic):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._clock = clock
        self._hits = {}
        self._lock = threading.Lock()

    def hit(self, key: str):
        """Record a request for `key`. Returns (allowed, retry_after_seconds)."""
        now = self._clock()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= now - self.window_seconds:
                hits.popleft()
            if len(hits) >= self.max_requests:
                return False, max(1, math.ceil(hits[0] + self.window_seconds - now))
            hits.append(now)
            if len(self._hits) > 10_000:
                self._prune(now)
            return True, 0

    def _prune(self, now: float):
        """Drop keys with no hits inside the window so memory stays bounded."""
        cutoff = now - self.window_seconds
        for key in [k for k, hits in self._hits.items() if not hits or hits[-1] <= cutoff]:
            del self._hits[key]

    def reset(self):
        with self._lock:
            self._hits.clear()


def rate_limit(limiter: RateLimiter):
    """Route decorator: 429 with Retry-After once the client IP exceeds `limiter`."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            allowed, retry_after = limiter.hit(request.remote_addr or 'unknown')
            if not allowed:
                response = jsonify({
                    'success': False,
                    'message': 'Too many attempts. Please wait a few minutes and try again.',
                })
                response.status_code = 429
                response.headers['Retry-After'] = str(retry_after)
                return response
            return f(*args, **kwargs)
        return decorated_function
    return decorator
