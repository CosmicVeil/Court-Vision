"""Self-ping keepalive for Render's free tier.

Render's free web services sleep after ~15 minutes of inactivity. The primary
fix is an external uptime monitor (UptimeRobot) hitting the ``/healthz``
endpoint every few minutes -- see the Backend README.

This module is a built-in backup: a daemon thread that periodically pings the
service's own public URL so it keeps itself warm even if no external monitor is
configured. It only starts when running on Render (or when explicitly enabled)
and when a target URL is known, so it is a no-op for local development and tests.

Note: a self-ping keeps an *already awake* service from going idle. It cannot
wake a service back up once Render has put it to sleep -- only an external
request can do that, which is why UptimeRobot remains the recommended solution.
"""
import logging
import os
import threading
import time
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

# Default: ping every 10 minutes (under Render's ~15 min idle window).
DEFAULT_INTERVAL_SECONDS = 600
_started = False
_lock = threading.Lock()


def _resolve_base_url() -> str | None:
    """Figure out the public URL to ping.

    Prefers an explicit KEEPALIVE_URL, then Render's own RENDER_EXTERNAL_URL
    which Render injects automatically for every web service.
    """
    url = os.environ.get('KEEPALIVE_URL') or os.environ.get('RENDER_EXTERNAL_URL')
    if not url:
        return None
    return url.rstrip('/')


def _should_run() -> bool:
    if os.environ.get('KEEPALIVE_ENABLED') == 'false':
        return False
    # Allow forcing on, otherwise only run on Render.
    if os.environ.get('KEEPALIVE_ENABLED') == 'true':
        return True
    return os.environ.get('RENDER') in ('true', '1')


def _ping_loop(ping_url: str, interval: int) -> None:
    while True:
        time.sleep(interval)
        try:
            req = Request(ping_url, headers={'User-Agent': 'court-vision-keepalive'})
            with urlopen(req, timeout=15) as resp:
                logger.info('keepalive ping %s -> %s', ping_url, resp.status)
        except Exception as exc:  # pragma: no cover - network best-effort
            logger.warning('keepalive ping failed: %s', exc)


def start_keepalive() -> bool:
    """Start the self-ping thread once. Returns True if it was started."""
    global _started
    if not _should_run():
        return False

    base_url = _resolve_base_url()
    if not base_url:
        logger.info('keepalive: no KEEPALIVE_URL/RENDER_EXTERNAL_URL set, skipping self-ping')
        return False

    with _lock:
        if _started:
            return False
        _started = True

    try:
        interval = int(os.environ.get('KEEPALIVE_INTERVAL_SECONDS', DEFAULT_INTERVAL_SECONDS))
    except ValueError:
        interval = DEFAULT_INTERVAL_SECONDS

    ping_url = f'{base_url}/healthz'
    thread = threading.Thread(
        target=_ping_loop,
        args=(ping_url, interval),
        name='keepalive',
        daemon=True,
    )
    thread.start()
    logger.info('keepalive: self-ping started -> %s every %ss', ping_url, interval)
    return True
