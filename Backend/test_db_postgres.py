import importlib.util
import os
from pathlib import Path
import shutil
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import yaml


BACKEND_DIR = Path(__file__).resolve().parent
DB_MODULE_PATH = BACKEND_DIR / "db.py"
RENDER_CONFIG_PATH = BACKEND_DIR / "render.yaml"


class RecordingConnection:
    def __init__(self, row=None, rows=None):
        self.row = row
        self.rows = rows or []
        self.statements = []
        self.committed = False
        self.closed = False

    def execute(self, query, params=None):
        self.statements.append((query, params))
        return self

    def fetchone(self):
        return self.row

    def fetchall(self):
        return self.rows

    def commit(self):
        self.committed = True

    def close(self):
        self.closed = True


class FakePsycopg(types.ModuleType):
    def __init__(self):
        super().__init__("psycopg")
        self.connections = []
        self.queued_results = []

    def connect(self, database_url, **kwargs):
        result = self.queued_results.pop(0) if self.queued_results else {}
        connection = RecordingConnection(**result)
        connection.database_url = database_url
        connection.connect_kwargs = kwargs
        self.connections.append(connection)
        return connection


def load_db_module(module_path=DB_MODULE_PATH):
    fake_psycopg = FakePsycopg()
    fake_rows = types.ModuleType("psycopg.rows")
    fake_rows.dict_row = object()

    module_name = "courtvision_db_under_test"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(
        sys.modules,
        {"psycopg": fake_psycopg, "psycopg.rows": fake_rows},
    ):
        spec.loader.exec_module(module)

    return module, fake_psycopg, fake_rows.dict_row


class PostgresDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.db, self.psycopg, self.dict_row = load_db_module()
        self.database_url = "postgresql://courtvision:secret@db.internal/courtvision"

    def test_get_db_connects_to_database_url_with_dictionary_rows(self):
        with patch.dict(os.environ, {"DATABASE_URL": self.database_url}, clear=True):
            connection = self.db.get_db()

        self.assertEqual(connection.database_url, self.database_url)
        self.assertIs(connection.connect_kwargs["row_factory"], self.dict_row)

    def test_get_db_rejects_missing_database_url(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "DATABASE_URL"):
                self.db.get_db()

    def test_backend_dotenv_supplies_database_url_when_process_env_is_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            local_db_path = Path(directory) / "db.py"
            shutil.copyfile(DB_MODULE_PATH, local_db_path)
            (Path(directory) / ".env").write_text(
                f"DATABASE_URL={self.database_url}\n",
                encoding="utf-8",
            )

            with patch.dict(os.environ, {}, clear=True):
                local_db, _, _ = load_db_module(local_db_path)
                connection = local_db.get_db()

        self.assertEqual(connection.database_url, self.database_url)

    def test_process_database_url_takes_precedence_over_backend_dotenv(self):
        local_database_url = "postgresql:///courtvision"
        with tempfile.TemporaryDirectory() as directory:
            local_db_path = Path(directory) / "db.py"
            shutil.copyfile(DB_MODULE_PATH, local_db_path)
            (Path(directory) / ".env").write_text(
                f"DATABASE_URL={local_database_url}\n",
                encoding="utf-8",
            )

            with patch.dict(os.environ, {"DATABASE_URL": self.database_url}, clear=True):
                local_db, _, _ = load_db_module(local_db_path)
                connection = local_db.get_db()

        self.assertEqual(connection.database_url, self.database_url)

    def test_get_user_by_email_uses_postgres_parameters_and_returns_a_dict(self):
        expected_user = {
            "id": 7,
            "first_name": "Ada",
            "last_name": "Lovelace",
            "email": "ada@example.com",
            "password": "hashed",
        }
        self.psycopg.queued_results.append({"row": expected_user})

        with patch.dict(os.environ, {"DATABASE_URL": self.database_url}, clear=True):
            user = self.db.get_user_by_email(" ada@example.com ")

        self.assertEqual(user, expected_user)
        connection = self.psycopg.connections[0]
        self.assertEqual(
            connection.statements,
            [("SELECT * FROM users WHERE email = %s", ("ada@example.com",))],
        )
        self.assertTrue(connection.closed)

    def test_init_db_creates_postgres_schema_and_closes_connection(self):
        with patch.dict(os.environ, {"DATABASE_URL": self.database_url}, clear=True):
            self.db.init_db()

        connection = self.psycopg.connections[0]
        executed_sql = "\n".join(query for query, _ in connection.statements)
        self.assertIn("GENERATED BY DEFAULT AS IDENTITY", executed_sql)
        self.assertIn("CREATE TABLE IF NOT EXISTS users", executed_sql)
        self.assertIn("CREATE TABLE IF NOT EXISTS saved_players", executed_sql)
        self.assertTrue(connection.committed)
        self.assertTrue(connection.closed)

    def test_create_user_inserts_with_postgres_parameters(self):
        self.psycopg.queued_results.extend([{"row": None}, {}])

        with patch.dict(os.environ, {"DATABASE_URL": self.database_url}, clear=True):
            success, message = self.db.create_user(
                " Ada ", " Lovelace ", " ada@example.com ", "password123"
            )

        self.assertTrue(success)
        self.assertEqual(message, "User created successfully")
        insert_connection = self.psycopg.connections[1]
        query, params = insert_connection.statements[0]
        self.assertEqual(
            query,
            "INSERT INTO users (first_name, last_name, email, password) VALUES (%s, %s, %s, %s)",
        )
        self.assertEqual(params[:3], ("Ada", "Lovelace", "ada@example.com"))
        self.assertNotEqual(params[3], "password123")
        self.assertTrue(insert_connection.committed)
        self.assertTrue(insert_connection.closed)

    def test_get_saved_players_returns_dictionary_rows(self):
        expected_players = [
            {
                "id": 3,
                "user_id": 7,
                "player_id": 2544,
                "player_name": "LeBron James",
                "team": "LAL",
                "position": "F",
            }
        ]
        self.psycopg.queued_results.append({"rows": expected_players})

        with patch.dict(os.environ, {"DATABASE_URL": self.database_url}, clear=True):
            players = self.db.get_saved_players(7)

        self.assertEqual(players, expected_players)
        self.assertEqual(
            self.psycopg.connections[0].statements,
            [("SELECT * FROM saved_players WHERE user_id = %s ORDER BY saved_at DESC", (7,))],
        )
        self.assertTrue(self.psycopg.connections[0].closed)

    def test_save_player_ignores_duplicate_user_player_pair(self):
        with patch.dict(os.environ, {"DATABASE_URL": self.database_url}, clear=True):
            success, message = self.db.save_player(7, 2544, "LeBron James", "LAL", "F")

        self.assertTrue(success)
        self.assertEqual(message, "Player saved")
        connection = self.psycopg.connections[0]
        query, params = connection.statements[0]
        self.assertIn("ON CONFLICT (user_id, player_id) DO NOTHING", query)
        self.assertEqual(params, (7, 2544, "LeBron James", "LAL", "F"))
        self.assertTrue(connection.committed)
        self.assertTrue(connection.closed)

    def test_remove_saved_player_uses_postgres_parameters(self):
        with patch.dict(os.environ, {"DATABASE_URL": self.database_url}, clear=True):
            success, message = self.db.remove_saved_player(7, 2544)

        self.assertTrue(success)
        self.assertEqual(message, "Player removed")
        connection = self.psycopg.connections[0]
        self.assertEqual(
            connection.statements,
            [("DELETE FROM saved_players WHERE user_id = %s AND player_id = %s", (7, 2544))],
        )
        self.assertTrue(connection.committed)
        self.assertTrue(connection.closed)

    def test_render_blueprint_wires_internal_postgres_url_to_backend(self):
        config = yaml.safe_load(RENDER_CONFIG_PATH.read_text())
        databases = {database["name"]: database for database in config["databases"]}
        self.assertIn("court-vision-db", databases)

        backend = next(service for service in config["services"] if service["name"] == "court-vision-api")
        environment = {item["key"]: item for item in backend["envVars"]}
        self.assertEqual(
            environment["DATABASE_URL"]["fromDatabase"],
            {"name": "court-vision-db", "property": "connectionString"},
        )


if __name__ == "__main__":
    unittest.main()
