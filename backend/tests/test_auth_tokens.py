import hashlib
import os
import unittest
from unittest.mock import MagicMock, call, patch

from flask import request

from app import create_app
from app.auth import create_token, invalidate_token, require_auth, validate_token
from app.config import TOKEN_EXPIRY_HOURS
from app.db import init_db


class TokenDbTests(unittest.TestCase):
    def setUp(self):
        self.conn = MagicMock()
        self.db_patch = patch('app.auth.get_db', return_value=self.conn)
        self.get_db = self.db_patch.start()
        self.addCleanup(self.db_patch.stop)


class CreateTokenTests(TokenDbTests):
    def test_stores_sha256_hash_not_raw_token(self):
        token = create_token(42)

        inserts = [args for args in self.conn.execute.call_args_list
                   if 'INSERT INTO auth_tokens' in args.args[0]]
        self.assertEqual(len(inserts), 1)
        self.assertEqual(inserts[0].args[1][:2],
                         (hashlib.sha256(token.encode()).hexdigest(), 42))
        for args in self.conn.execute.call_args_list:
            self.assertNotIn(token, str(args))

    def test_preserves_token_generation(self):
        with patch('app.auth.secrets.token_urlsafe', return_value='random-token') as generate:
            self.assertEqual(create_token(42), 'random-token')
        generate.assert_called_once_with(32)

    def test_expiry_computed_in_sql(self):
        create_token(42)

        inserts = [args for args in self.conn.execute.call_args_list
                   if 'INSERT INTO auth_tokens' in args.args[0]]
        self.assertEqual(len(inserts), 1)
        self.assertIn('expires_at', inserts[0].args[0])
        self.assertIn('NOW() + make_interval(hours => %s)', inserts[0].args[0])
        self.assertEqual(inserts[0].args[1][2], TOKEN_EXPIRY_HOURS)

    def test_deletes_expired_rows_in_same_transaction(self):
        create_token(42)

        self.conn.execute.assert_any_call('DELETE FROM auth_tokens WHERE expires_at <= NOW()')
        self.assertEqual([entry[0] for entry in self.conn.method_calls],
                         ['execute', 'execute', 'commit', 'close'])

    def test_commits_and_closes(self):
        create_token(42)

        self.conn.commit.assert_called_once_with()
        self.conn.close.assert_called_once_with()

    def test_raises_when_connection_fails(self):
        self.get_db.side_effect = RuntimeError('db down')
        with self.assertRaisesRegex(RuntimeError, 'db down'):
            create_token(42)

    def test_raises_and_closes_on_db_error(self):
        for stage in ('cleanup', 'insert', 'commit'):
            with self.subTest(stage=stage):
                conn = MagicMock()
                self.get_db.return_value = conn
                if stage == 'commit':
                    conn.commit.side_effect = RuntimeError('db down')
                else:
                    conn.execute.side_effect = ([RuntimeError('db down')] if stage == 'cleanup'
                                                else [MagicMock(), RuntimeError('db down')])
                with self.assertRaisesRegex(RuntimeError, 'db down'):
                    create_token(42)
                conn.close.assert_called_once_with()
                if stage != 'commit':
                    conn.commit.assert_not_called()


class ValidateTokenTests(TokenDbTests):
    def test_returns_user_id_for_row(self):
        self.conn.execute.return_value.fetchone.return_value = {'user_id': 7}

        self.assertEqual(validate_token('persisted-token'), 7)
        self.conn.execute.assert_called_once_with(
            'SELECT user_id FROM auth_tokens WHERE token_hash = %s AND expires_at > NOW()',
            (hashlib.sha256(b'persisted-token').hexdigest(),))
        self.conn.close.assert_called_once_with()

    def test_returns_none_when_no_row(self):
        self.conn.execute.return_value.fetchone.return_value = None

        self.assertIsNone(validate_token('unknown-or-expired-token'))
        self.conn.execute.return_value.fetchone.assert_called_once_with()
        self.conn.close.assert_called_once_with()

    def test_returns_none_when_connection_fails(self):
        self.get_db.side_effect = RuntimeError('db down')

        self.assertIsNone(validate_token('token'))
        self.get_db.assert_called_once_with()

    def test_returns_none_and_closes_when_query_fails(self):
        for stage in ('execute', 'fetchone'):
            with self.subTest(stage=stage):
                conn = MagicMock()
                self.get_db.return_value = conn
                target = conn.execute if stage == 'execute' else conn.execute.return_value.fetchone
                target.side_effect = RuntimeError('db down')

                self.assertIsNone(validate_token('token'))
                conn.close.assert_called_once_with()


class InvalidateTokenTests(TokenDbTests):
    def test_deletes_by_hash(self):
        invalidate_token('persisted-token')

        self.assertEqual(self.conn.method_calls, [
            call.execute('DELETE FROM auth_tokens WHERE token_hash = %s',
                         (hashlib.sha256(b'persisted-token').hexdigest(),)),
            call.commit(),
            call.close(),
        ])

    def test_unknown_token_is_successful(self):
        self.conn.execute.return_value.rowcount = 0

        self.assertIsNone(invalidate_token('unknown-token'))
        self.conn.commit.assert_called_once_with()
        self.conn.close.assert_called_once_with()

    def test_does_not_raise_when_connection_fails(self):
        self.get_db.side_effect = RuntimeError('db down')

        self.assertIsNone(invalidate_token('token'))
        self.get_db.assert_called_once_with()

    def test_does_not_raise_and_closes_on_db_error(self):
        for stage in ('execute', 'commit'):
            with self.subTest(stage=stage):
                conn = MagicMock()
                self.get_db.return_value = conn
                getattr(conn, stage).side_effect = RuntimeError('db down')

                self.assertIsNone(invalidate_token('token'))
                conn.close.assert_called_once_with()
                if stage == 'execute':
                    conn.commit.assert_not_called()


class RequireAuthTests(TokenDbTests):
    def setUp(self):
        super().setUp()
        app = create_app(load_data=False)
        app.config['TESTING'] = True

        @app.route('/test-auth')
        @require_auth
        def protected():
            return {'user_id': request.user_id}

        self.client = app.test_client()

    def test_missing_or_non_bearer_header_401(self):
        for headers in ({}, {'Authorization': 'Basic credentials'}):
            with self.subTest(headers=headers):
                response = self.client.get('/test-auth', headers=headers)
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.get_json(),
                                 {'success': False, 'message': 'No token provided'})
        self.get_db.assert_not_called()

    def test_invalid_token_401(self):
        self.conn.execute.return_value.fetchone.return_value = None

        response = self.client.get('/test-auth', headers={'Authorization': 'Bearer invalid'})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json(),
                         {'success': False, 'message': 'Invalid or expired token'})
        self.conn.close.assert_called_once_with()

    def test_valid_token_sets_user_id(self):
        self.conn.execute.return_value.fetchone.return_value = {'user_id': 5}

        response = self.client.get('/test-auth', headers={'Authorization': 'Bearer persisted'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {'user_id': 5})

    def test_db_error_returns_401_not_500(self):
        self.conn.execute.side_effect = RuntimeError('db down')

        response = self.client.get('/test-auth', headers={'Authorization': 'Bearer token'})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json(),
                         {'success': False, 'message': 'Invalid or expired token'})
        self.conn.close.assert_called_once_with()


class InitDbTests(unittest.TestCase):
    def test_creates_auth_tokens_table_after_saved_players(self):
        conn = MagicMock()
        with patch.dict(os.environ, {'DATABASE_URL': 'postgresql://unused/test'}), \
             patch('app.db.get_db', return_value=conn), \
             patch('app.services.game_archive.init_archive_tables') as archive:
            init_db()

        statements = [' '.join(args.args[0].split()) for args in conn.execute.call_args_list]
        self.assertEqual(len(statements), 3)
        self.assertIn('CREATE TABLE IF NOT EXISTS saved_players', statements[1])
        self.assertEqual(statements[2],
                         'CREATE TABLE IF NOT EXISTS auth_tokens ( '
                         'token_hash TEXT PRIMARY KEY, '
                         'user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, '
                         'expires_at TIMESTAMP NOT NULL )')
        archive.assert_called_once_with(conn)
        conn.commit.assert_called_once_with()
        conn.close.assert_called_once_with()


if __name__ == '__main__':
    unittest.main()
