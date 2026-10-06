"""In-memory bearer tokens and the @require_auth route decorator."""
import secrets
from datetime import datetime, timedelta
from functools import wraps
from typing import Optional

from flask import jsonify, request

from app.config import TOKEN_EXPIRY_HOURS

active_tokens = {}


def create_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expiry = datetime.now() + timedelta(hours=TOKEN_EXPIRY_HOURS)
    active_tokens[token] = {
        'user_id': user_id,
        'expiry': expiry
    }
    return token


def validate_token(token: str) -> Optional[int]:
    if token not in active_tokens:
        return None

    token_data = active_tokens[token]
    if datetime.now() > token_data['expiry']:
        del active_tokens[token]
        return None

    return token_data['user_id']


def invalidate_token(token: str):
    if token in active_tokens:
        del active_tokens[token]


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
