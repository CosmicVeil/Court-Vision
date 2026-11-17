"""In-memory sliding-window rate limiting for sensitive routes (login, signup).

State lives in this process, which is enough for the single gunicorn worker on Render.
It resets on restart, and with several workers each one would keep its own counts.
"""
import math
import threading
import time
from collections import deque
from functools import wraps

from flask import jsonify, make_response, request


class RateLimiter:
    """Allow at most `max_requests` per key within any `window_seconds` span."""

    def __init__(self, max_requests: int, window_seconds: float, clock=time.monotonic):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._clock = clock
        self._hits = {}
        self._lock = threading.Lock()
        self._next_prune = 0.0

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
            # At most once per window: when most keys are still active, pruning frees little.
            if len(self._hits) > 10_000 and now >= self._next_prune:
                self._prune(now)
                self._next_prune = now + self.window_seconds
            return True, 0

    def release(self, key: str):
        """Take back the latest recorded hit for `key` (a request that turned out not to count)."""
        with self._lock:
            hits = self._hits.get(key)
            if hits:
                hits.pop()

    def _prune(self, now: float):
        """Drop keys with no hits inside the window so memory stays bounded."""
        cutoff = now - self.window_seconds
        for key in [k for k, hits in self._hits.items() if not hits or hits[-1] <= cutoff]:
            del self._hits[key]

    def reset(self):
        with self._lock:
            self._hits.clear()


def rate_limit(limiter: RateLimiter, counts=None):
    """Route decorator: 429 with Retry-After once the client IP exceeds `limiter`.

    `counts(status_code)` decides afterwards whether a request uses up the limit; the hit is
    recorded first and released if not, so concurrent requests can't slip past the check.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            key = request.remote_addr or 'unknown'
            allowed, retry_after = limiter.hit(key)
            if not allowed:
                response = jsonify({
                    'success': False,
                    'message': 'Too many attempts. Please wait a few minutes and try again.',
                })
                response.status_code = 429
                response.headers['Retry-After'] = str(retry_after)
                return response
            response = make_response(f(*args, **kwargs))
            if counts and not counts(response.status_code):
                limiter.release(key)
            return response
        return decorated_function
    return decorator
