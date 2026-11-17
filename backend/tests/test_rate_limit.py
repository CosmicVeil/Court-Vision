import os
import unittest
from unittest.mock import patch

from app import create_app
from app.api.routes import auth as auth_routes
from app.config import LOGIN_RATE_LIMIT, SIGNUP_RATE_LIMIT, cors_origins, trusted_proxy_hops
from app.utils.rate_limit import RateLimiter


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


class RateLimiterTests(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.limiter = RateLimiter(3, 60, clock=self.clock)

    def test_allows_up_to_limit_then_blocks(self):
        self.assertEqual([self.limiter.hit('ip')[0] for _ in range(4)], [True, True, True, False])

    def test_retry_after_counts_down_to_oldest_hit_expiry(self):
        for _ in range(3):
            self.limiter.hit('ip')
        self.clock.now += 20
        self.assertEqual(self.limiter.hit('ip'), (False, 40))

    def test_window_slides(self):
        self.limiter.hit('ip')
        self.clock.now += 30
        self.limiter.hit('ip')
        self.limiter.hit('ip')
        self.assertFalse(self.limiter.hit('ip')[0])
        self.clock.now += 30  # first hit is now exactly one window old
        self.assertTrue(self.limiter.hit('ip')[0])
        self.assertFalse(self.limiter.hit('ip')[0])

    def test_blocked_attempts_do_not_extend_lockout(self):
        for _ in range(3):
            self.limiter.hit('ip')
        for _ in range(10):
            self.limiter.hit('ip')
        self.clock.now += 60
        self.assertTrue(self.limiter.hit('ip')[0])

    def test_keys_are_independent(self):
        for _ in range(3):
            self.limiter.hit('a')
        self.assertFalse(self.limiter.hit('a')[0])
        self.assertTrue(self.limiter.hit('b')[0])

    def test_release_takes_back_the_latest_hit(self):
        for _ in range(3):
            self.limiter.hit('ip')
        self.limiter.release('ip')
        self.assertTrue(self.limiter.hit('ip')[0])
        self.assertFalse(self.limiter.hit('ip')[0])
        self.limiter.release('unknown-key')  # no-op, no error

    def test_prune_runs_at_most_once_per_window_when_keys_stay_active(self):
        limiter = RateLimiter(3, 60, clock=self.clock)
        with patch.object(limiter, '_prune', wraps=limiter._prune) as prune:
            for i in range(10_005):
                limiter.hit(f'ip-{i}')
            self.assertEqual(prune.call_count, 1)
            self.clock.now += 60
            limiter.hit('later')
            self.assertEqual(prune.call_count, 2)

    def test_prune_drops_stale_keys(self):
        self.limiter.hit('old')
        self.clock.now += 61
        self.limiter.hit('new')
        self.limiter._prune(self.clock.now)
        self.assertEqual(list(self.limiter._hits), ['new'])


VALID_SIGNUP = {'first_name': 'Ada', 'last_name': 'Lovelace', 'email': 'ada@example.com', 'password': 'secret123'}


class AuthRouteRateLimitTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app(load_data=False).test_client()
        auth_routes.login_limiter.reset()
        auth_routes.signup_limiter.reset()
        self.addCleanup(auth_routes.login_limiter.reset)
        self.addCleanup(auth_routes.signup_limiter.reset)

    def test_login_returns_429_with_retry_after_once_limit_hit(self):
        max_requests = LOGIN_RATE_LIMIT[0]
        with patch.object(auth_routes, 'authenticate_user_from_json',
                          return_value=(False, None, 'Invalid email or password')) as authenticate:
            statuses = [self.client.post('/api/auth/login', json={}).status_code
                        for _ in range(max_requests)]
            blocked = self.client.post('/api/auth/login', json={})

        self.assertEqual(statuses, [401] * max_requests)
        self.assertEqual(blocked.status_code, 429)
        self.assertGreater(int(blocked.headers['Retry-After']), 0)
        self.assertFalse(blocked.get_json()['success'])
        # The blocked request never reached the password check.
        self.assertEqual(authenticate.call_count, max_requests)

    def test_signup_is_limited_separately_from_login(self):
        max_requests = SIGNUP_RATE_LIMIT[0]
        with patch.object(auth_routes, 'create_user_from_json',
                          return_value=(False, None, 'Email already in use')):
            for _ in range(max_requests):
                self.client.post('/api/auth/signup', json=VALID_SIGNUP)
            self.assertEqual(self.client.post('/api/auth/signup', json=VALID_SIGNUP).status_code, 429)
        with patch.object(auth_routes, 'authenticate_user_from_json',
                          return_value=(False, None, 'Invalid email or password')):
            self.assertEqual(self.client.post('/api/auth/login', json={}).status_code, 401)

    def test_successful_logins_do_not_use_up_the_limit(self):
        max_requests = LOGIN_RATE_LIMIT[0]
        user = {'id': 1, 'email': 'ada@example.com'}
        with patch.object(auth_routes, 'authenticate_user_from_json', return_value=(True, user, 'ok')), \
                patch.object(auth_routes, 'create_token', return_value='token'), \
                patch.object(auth_routes, '_public_user', return_value=user):
            statuses = {self.client.post('/api/auth/login', json={}).status_code for _ in range(max_requests + 5)}
        self.assertEqual(statuses, {200})

    def test_invalid_signup_input_is_422_and_does_not_use_up_the_limit(self):
        max_requests = SIGNUP_RATE_LIMIT[0]
        with patch.object(auth_routes, 'create_user_from_json') as create:
            short_password = {**VALID_SIGNUP, 'password': '123'}
            statuses = {self.client.post('/api/auth/signup', json=short_password).status_code
                        for _ in range(max_requests + 3)}
            create.return_value = (False, None, 'Email already in use')
            after = self.client.post('/api/auth/signup', json=VALID_SIGNUP).status_code
        self.assertEqual(statuses, {422})
        self.assertEqual(after, 400)  # the valid attempt still reached the database
        self.assertEqual(create.call_count, 1)

    def test_spoofed_forwarded_for_ignored_without_trusted_proxy(self):
        max_requests = LOGIN_RATE_LIMIT[0]
        with patch.dict(os.environ, {'TRUSTED_PROXY_HOPS': '0'}), \
                patch.object(auth_routes, 'authenticate_user_from_json',
                             return_value=(False, None, 'Invalid email or password')):
            client = create_app(load_data=False).test_client()
            for i in range(max_requests):
                client.post('/api/auth/login', json={}, headers={'X-Forwarded-For': f'10.0.0.{i}'})
            blocked = client.post('/api/auth/login', json={}, headers={'X-Forwarded-For': '10.0.0.99'})
        self.assertEqual(blocked.status_code, 429)

    def test_render_keys_on_the_client_ip_cloudflare_appended(self):
        # On Render: "<client-supplied...>, <client per Cloudflare>, <Cloudflare edge per Render>".
        max_requests = LOGIN_RATE_LIMIT[0]
        with patch.dict(os.environ, {'TRUSTED_PROXY_HOPS': '2'}), \
                patch.object(auth_routes, 'authenticate_user_from_json',
                             return_value=(False, None, 'Invalid email or password')):
            client = create_app(load_data=False).test_client()
            for _ in range(max_requests):
                client.post('/api/auth/login', json={}, headers={'X-Forwarded-For': '203.0.113.1, 104.22.17.40'})
            self.assertEqual(client.post('/api/auth/login', json={},
                                         headers={'X-Forwarded-For': '203.0.113.1, 104.22.17.40'}).status_code, 429)
            # A client prepending a fake IP still gets keyed on what Cloudflare appended.
            self.assertEqual(client.post('/api/auth/login', json={},
                                         headers={'X-Forwarded-For': '1.2.3.4, 203.0.113.1, 104.22.17.40'}).status_code, 429)
            # Another user behind the same Cloudflare edge has their own limit.
            self.assertEqual(client.post('/api/auth/login', json={},
                                         headers={'X-Forwarded-For': '203.0.113.2, 104.22.17.40'}).status_code, 401)


class CorsTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app(load_data=False).test_client()

    def _allowed_origin(self, origin):
        response = self.client.options('/api/auth/login', headers={
            'Origin': origin, 'Access-Control-Request-Method': 'POST'})
        return response.headers.get('Access-Control-Allow-Origin')

    def test_production_site_is_allowed(self):
        self.assertEqual(self._allowed_origin('https://courtvision.works'), 'https://courtvision.works')

    def test_vite_preview_is_allowed(self):
        self.assertEqual(self._allowed_origin('http://localhost:4173'), 'http://localhost:4173')

    def test_other_sites_are_not_allowed(self):
        self.assertIsNone(self._allowed_origin('https://evil.example'))

    def test_cors_origins_env_override(self):
        with patch.dict(os.environ, {'CORS_ORIGINS': 'https://preview.example/, https://b.example'}):
            self.assertEqual(cors_origins(), ['https://preview.example', 'https://b.example'])

    def test_cors_origins_default_when_unset(self):
        with patch.dict(os.environ, {'CORS_ORIGINS': ''}):
            self.assertIn('https://courtvision.works', cors_origins())


class TrustedProxyHopsTests(unittest.TestCase):
    def test_malformed_override_falls_back_to_default(self):
        for raw, expected in [('true', 2), ('', 2), (' 1 ', 1), ('-3', 0)]:
            with patch.dict(os.environ, {'RENDER': 'true', 'TRUSTED_PROXY_HOPS': raw}), \
                    patch('builtins.print'):
                self.assertEqual(trusted_proxy_hops(), expected, raw)

    def test_two_hops_on_render_none_locally(self):
        with patch.dict(os.environ, {'RENDER': 'true'}, clear=False):
            os.environ.pop('TRUSTED_PROXY_HOPS', None)
            self.assertEqual(trusted_proxy_hops(), 2)
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('RENDER', None)
            os.environ.pop('TRUSTED_PROXY_HOPS', None)
            self.assertEqual(trusted_proxy_hops(), 0)


if __name__ == '__main__':
    unittest.main()
