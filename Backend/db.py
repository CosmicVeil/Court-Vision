import sqlite3
import os
from werkzeug.security import generate_password_hash, check_password_hash
from flask import request
import json
from typing import Dict, Optional, Tuple

DB_PATH = os.path.join(os.path.dirname(__file__), 'sports.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(app=None):
    """Create tables if they don't exist"""
    conn = get_db()
    cur = conn.cursor()
    cur.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS saved_players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            player_name TEXT NOT NULL,
            team TEXT,
            position TEXT,
            saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, player_id)
        );
    ''')
    conn.commit()
    conn.close()
    print("SQLite database initialized")

# ── User helpers ────────────────────────────────────────────────────────────

def get_user_by_email(email: str) -> Optional[Dict]:
    try:
        conn = get_db()
        user = conn.execute('SELECT * FROM users WHERE email = ?', (email.strip(),)).fetchone()
        conn.close()
        return dict(user) if user else None
    except Exception as e:
        print(f"Error in get_user_by_email: {e}")
        return None

def get_user_by_id(user_id: int) -> Optional[Dict]:
    try:
        conn = get_db()
        user = conn.execute(
            'SELECT id, first_name, last_name, email FROM users WHERE id = ?', (user_id,)
        ).fetchone()
        conn.close()
        return dict(user) if user else None
    except Exception as e:
        print(f"Error in get_user_by_id: {e}")
        return None

def create_user(first_name: str, last_name: str, email: str, password: str) -> Tuple[bool, str]:
    try:
        if get_user_by_email(email):
            return False, "Email already in use. Please choose another one."
        hashed = generate_password_hash(password, method='pbkdf2:sha256')
        conn = get_db()
        conn.execute(
            'INSERT INTO users (first_name, last_name, email, password) VALUES (?, ?, ?, ?)',
            (first_name.strip(), last_name.strip(), email.strip(), hashed)
        )
        conn.commit()
        conn.close()
        return True, "User created successfully"
    except Exception as e:
        print(f"Error in create_user: {e}")
        return False, "An error occurred while creating your account"

def authenticate_user(email: str, password: str) -> Tuple[bool, Optional[Dict], str]:
    user = get_user_by_email(email)
    if not user:
        return False, None, "No account found with this email address"
    if not check_password_hash(user['password'], password):
        return False, None, "Incorrect password"
    user_safe = {k: v for k, v in user.items() if k != 'password'}
    return True, user_safe, "Login successful"

# ── JSON parsers (reused by app.py routes) ──────────────────────────────────

def parse_signup_json() -> Tuple[bool, Optional[Dict], str]:
    try:
        if not request.is_json:
            return False, None, "Request must be JSON"
        data = request.get_json(force=True, silent=False)
        if not data or not isinstance(data, dict):
            return False, None, "Invalid JSON"

        first_name = (data.get('first_name') or '').strip()
        last_name  = (data.get('last_name')  or '').strip()
        email      = (data.get('email')      or '').strip()
        password   = (data.get('password')   or '').strip()

        if not first_name: return False, None, "First name is required"
        if not last_name:  return False, None, "Last name is required"
        if not email or '@' not in email: return False, None, "Valid email is required"
        if not password or len(password) < 6: return False, None, "Password must be at least 6 characters"

        return True, {'first_name': first_name, 'last_name': last_name,
                      'email': email, 'password': password}, "OK"
    except Exception as e:
        return False, None, f"Error parsing request: {e}"

def parse_login_json() -> Tuple[bool, Optional[Dict], str]:
    try:
        if not request.is_json:
            return False, None, "Request must be JSON"
        data = request.get_json(force=True, silent=False)
        if not data or not isinstance(data, dict):
            return False, None, "Invalid JSON"

        email    = (data.get('email')    or '').strip()
        password = (data.get('password') or '').strip()

        if not email or '@' not in email: return False, None, "Valid email is required"
        if not password: return False, None, "Password is required"

        return True, {'email': email, 'password': password}, "OK"
    except Exception as e:
        return False, None, f"Error parsing request: {e}"

def create_user_from_json() -> Tuple[bool, Optional[Dict], str]:
    ok, data, msg = parse_signup_json()
    if not ok:
        return False, None, msg
    success, message = create_user(data['first_name'], data['last_name'], data['email'], data['password'])
    if success:
        user = get_user_by_email(data['email'])
        user_safe = {k: v for k, v in user.items() if k != 'password'} if user else None
        return True, user_safe, message
    return False, None, message

def authenticate_user_from_json() -> Tuple[bool, Optional[Dict], str]:
    ok, data, msg = parse_login_json()
    if not ok:
        return False, None, msg
    return authenticate_user(data['email'], data['password'])

# ── Saved players ────────────────────────────────────────────────────────────

def get_saved_players(user_id: int) -> list:
    try:
        conn = get_db()
        rows = conn.execute(
            'SELECT * FROM saved_players WHERE user_id = ? ORDER BY saved_at DESC', (user_id,)
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        print(f"Error in get_saved_players: {e}")
        return []

def save_player(user_id: int, player_id: int, player_name: str, team: str, position: str) -> Tuple[bool, str]:
    try:
        conn = get_db()
        conn.execute(
            '''INSERT OR IGNORE INTO saved_players (user_id, player_id, player_name, team, position)
               VALUES (?, ?, ?, ?, ?)''',
            (user_id, player_id, player_name, team, position)
        )
        conn.commit()
        conn.close()
        return True, "Player saved"
    except Exception as e:
        print(f"Error in save_player: {e}")
        return False, "Error saving player"

def remove_saved_player(user_id: int, player_id: int) -> Tuple[bool, str]:
    try:
        conn = get_db()
        conn.execute(
            'DELETE FROM saved_players WHERE user_id = ? AND player_id = ?', (user_id, player_id)
        )
        conn.commit()
        conn.close()
        return True, "Player removed"
    except Exception as e:
        print(f"Error in remove_saved_player: {e}")
        return False, "Error removing player"