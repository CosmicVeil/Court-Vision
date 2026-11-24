"""DELETE /api/auth/account: self-serve account deletion, against an in-memory fake database."""
import hashlib
import unittest
from unittest.mock import MagicMock, patch

from werkzeug.security import generate_password_hash

from app import create_app
from app.api.routes import auth as auth_route
from app.db import delete_user


def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


class FakeDb:
    """Just enough of Postgres for the statements account deletion and token checks run.

    Tables are plain lists of dicts. Writes go to a staged copy that commit() keeps and
    rollback() (or closing without commit) throws away, like a real transaction.
    """

    def __init__(self):
        self.committed = {'users': [], 'saved_players': [], 'auth_tokens': []}
        self.fail_on = None  # a SQL prefix that should raise, to test rollback

    def add_user(self, user_id, password, token):
        self.committed['users'].append({
            'id': user_id, 'email': f'user{user_id}@example.com',
            'password': generate_password_hash(password, method='pbkdf2:sha256'),
            'fantasy_scoring': {'preset': 'espn'},
        })
        self.committed['saved_players'].append({'user_id': user_id, 'player_id': 2544})
        self.committed['auth_tokens'].append({'token_hash': _hash(token), 'user_id': user_id})

    def connect(self):
        return FakeConnection(self)


class FakeConnection:
    def __init__(self, db):
        self.db = db
        self.tables = {name: list(rows) for name, rows in db.committed.items()}

    def execute(self, sql, params=()):
        sql = ' '.join(sql.split())
        if self.db.fail_on and sql.startswith(self.db.fail_on):
            raise RuntimeError('db down')
        result = MagicMock()
        if sql.startswith('SELECT user_id FROM auth_tokens WHERE token_hash = %s'):
            rows = [r for r in self.tables['auth_tokens'] if r['token_hash'] == params[0]]
            result.fetchone.return_value = {'user_id': rows[0]['user_id']} if rows else None
        elif sql == 'SELECT password FROM users WHERE id = %s':
            rows = [r for r in self.tables['users'] if r['id'] == params[0]]
            result.fetchone.return_value = {'password': rows[0]['password']} if rows else None
        elif sql.startswith('DELETE FROM '):
            table, column = sql.split()[2], sql.split()[4]
            before = len(self.tables[table])
            self.tables[table] = [r for r in self.tables[table] if r[column] != params[0]]
            result.rowcount = before - len(self.tables[table])
        else:
            raise AssertionError(f'Unexpected SQL: {sql}')
        return result

    def commit(self):
        self.db.committed = {name: list(rows) for name, rows in self.tables.items()}

    def rollback(self):
        self.tables = {name: list(rows) for name, rows in self.db.committed.items()}

    def close(self):
        pass


class DeleteAccountTestCase(unittest.TestCase):
    def setUp(self):
        self.db = FakeDb()
        self.db.add_user(1, 'alice-password', 'alice-token')
        self.db.add_user(2, 'bob-password', 'bob-token')
        for target in ('app.auth.get_db', 'app.db.get_db'):
            self.enterContext(patch(target, side_effect=self.db.connect))
        auth_route.delete_limiter.reset()
        self.addCleanup(auth_route.delete_limiter.reset)
        app = create_app(load_data=False)
        app.config['TESTING'] = True
        self.client = app.test_client()

    def rows(self, table, user_id):
        key = 'id' if table == 'users' else 'user_id'
        return [r for r in self.db.committed[table] if r[key] == user_id]

    def delete(self, token='alice-token', password='alice-password'):
        headers = {'Authorization': f'Bearer {token}'} if token else {}
        body = {'password': password} if password is not None else None
        return self.client.delete('/api/auth/account', headers=headers, json=body)


class DeleteAccountRouteTests(DeleteAccountTestCase):
    def test_deletes_user_saved_players_and_tokens(self):
        response = self.delete()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()['success'])
        for table in ('users', 'saved_players', 'auth_tokens'):
            self.assertEqual(self.rows(table, 1), [], table)

    def test_other_users_data_is_untouched(self):
        self.delete()

        for table in ('users', 'saved_players', 'auth_tokens'):
            self.assertEqual(len(self.rows(table, 2)), 1, table)
        self.assertEqual(self.rows('users', 2)[0]['fantasy_scoring'], {'preset': 'espn'})

    def test_token_stops_working_after_deletion(self):
        self.delete()

        response = self.client.get('/api/auth/verify', headers={'Authorization': 'Bearer alice-token'})
        self.assertEqual(response.status_code, 401)

    def test_unauthenticated_requests_are_rejected(self):
        for token in (None, 'not-a-real-token'):
            with self.subTest(token=token):
                response = self.delete(token=token)
                self.assertEqual(response.status_code, 401)
        self.assertEqual(len(self.rows('users', 1)), 1)

    def test_deletes_the_token_owner_not_the_password_owner(self):
        # Bob's token with Alice's password: the password is checked against Bob's account.
        response = self.delete(token='bob-token', password='alice-password')

        self.assertEqual(response.status_code, 403)
        self.assertEqual(len(self.rows('users', 1)), 1)
        self.assertEqual(len(self.rows('users', 2)), 1)

    def test_wrong_or_missing_password_keeps_the_account(self):
        for password, status in (('wrong', 403), ('', 400), (None, 400)):
            with self.subTest(password=password):
                response = self.delete(password=password)
                self.assertEqual(response.status_code, status)
                self.assertFalse(response.get_json()['success'])
        self.assertEqual(len(self.rows('users', 1)), 1)
        self.assertEqual(len(self.rows('auth_tokens', 1)), 1)

    def test_repeated_wrong_passwords_are_rate_limited(self):
        statuses = [self.delete(password='wrong').status_code for _ in range(11)]

        self.assertEqual(statuses[:10], [403] * 10)
        self.assertEqual(statuses[10], 429)

    def test_database_failure_returns_500_and_keeps_everything(self):
        self.db.fail_on = 'DELETE FROM users'

        response = self.delete()

        self.assertEqual(response.status_code, 500)
        for table in ('users', 'saved_players', 'auth_tokens'):
            self.assertEqual(len(self.rows(table, 1)), 1, table)


class DeleteUserTests(DeleteAccountTestCase):
    def test_missing_user_returns_false_and_rolls_back(self):
        self.assertFalse(delete_user(99))
        self.assertEqual(len(self.db.committed['users']), 2)


if __name__ == '__main__':
    unittest.main()
