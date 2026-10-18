"""Bearer tokens stored hashed in Postgres and the @require_auth route decorator."""
import hashlib
import secrets
from functools import wraps
from typing import Optional

from flask import jsonify, request

from app.config import TOKEN_EXPIRY_HOURS
from app.db import get_db


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    conn = None
    try:
        conn = get_db()
        conn.execute('DELETE FROM auth_tokens WHERE expires_at <= NOW()')
        conn.execute(
            'INSERT INTO auth_tokens (token_hash, user_id, expires_at) '
            'VALUES (%s, %s, NOW() + make_interval(hours => %s))',
            (_hash_token(token), user_id, TOKEN_EXPIRY_HOURS)
        )
        conn.commit()
        return token
    finally:
        if conn:
            conn.close()


def validate_token(token: str) -> Optional[int]:
    conn = None
    try:
        conn = get_db()
        row = conn.execute(
            'SELECT user_id FROM auth_tokens WHERE token_hash = %s AND expires_at > NOW()',
            (_hash_token(token),)
        ).fetchone()
        return row['user_id'] if row else None
    except Exception as e:
        print(f"Error in validate_token: {e}")
        return None
    finally:
        if conn:
            conn.close()


def invalidate_token(token: str):
    conn = None
    try:
        conn = get_db()
        conn.execute('DELETE FROM auth_tokens WHERE token_hash = %s', (_hash_token(token),))
        conn.commit()
    except Exception as e:
        print(f"Error in invalidate_token: {e}")
    finally:
        if conn:
            conn.close()


def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'success': False, 'message': 'No token provided'}), 401

        token = auth_header.split(' ')[1]
        user_id = validate_token(token)

        if not user_id:
            return jsonify({'success': False, 'message': 'Invalid or expired token'}), 401

        request.user_id = user_id
        return f(*args, **kwargs)

    return decorated_function
