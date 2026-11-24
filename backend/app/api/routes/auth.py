from flask import Blueprint, jsonify, request

from app.auth import create_token, invalidate_token, require_auth
from app.config import LOGIN_RATE_LIMIT, SIGNUP_RATE_LIMIT
from app.db import (
    authenticate_user_from_json, check_password_for_user, create_user_from_json, delete_user, get_user_by_id,
    parse_signup_json,
)
from app.utils.fantasy import describe_setting
from app.utils.rate_limit import RateLimiter, rate_limit

bp = Blueprint('auth', __name__, url_prefix='/api/auth')

# Per-IP limits that slow password guessing and mass account creation. Login counts only failed
# attempts; signup counts every attempt that reaches the database (new accounts and taken emails,
# which would otherwise let anyone probe which emails are registered), but not invalid input.
login_limiter = RateLimiter(*LOGIN_RATE_LIMIT)
signup_limiter = RateLimiter(*SIGNUP_RATE_LIMIT)
# Account deletion re-checks the password, so wrong guesses there are limited like failed logins.
delete_limiter = RateLimiter(*LOGIN_RATE_LIMIT)


def _public_user(user):
    """The user as sent to the browser, with their fantasy scoring spelled out (label + weights)."""
    return {**user, 'fantasy_scoring': describe_setting(user.get('fantasy_scoring'))}


@bp.route('/signup', methods=['POST'])
@rate_limit(signup_limiter, counts=lambda status: status != 422)
def signup():
    try:
        valid, _, message = parse_signup_json()
        if not valid:
            return jsonify({'success': False, 'message': message}), 422
        success, user, message = create_user_from_json()
        if success:
            token = create_token(user['id'])
            return jsonify({'success': True, 'user': _public_user(user), 'token': token, 'message': message}), 201
        return jsonify({'success': False, 'message': message}), 400
    except Exception as e:
        print(f"Signup error: {e}")
        return jsonify({'success': False, 'message': 'Error creating account'}), 500


@bp.route('/login', methods=['POST'])
@rate_limit(login_limiter, counts=lambda status: status != 200)
def login():
    try:
        success, user, message = authenticate_user_from_json()
        if success:
            token = create_token(user['id'])
            return jsonify({'success': True, 'user': _public_user(user), 'token': token, 'message': message}), 200
        return jsonify({'success': False, 'message': message}), 401
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({'success': False, 'message': 'Error logging in'}), 500


@bp.route('/logout', methods=['POST'])
@require_auth
def logout():
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        invalidate_token(token)
    return jsonify({'success': True, 'message': 'Logged out successfully'}), 200


@bp.route('/verify', methods=['GET'])
@require_auth
def verify():
    user = get_user_by_id(request.user_id)
    if user:
        return jsonify({'authenticated': True, 'user': _public_user(user)}), 200
    return jsonify({'authenticated': False, 'message': 'User not found'}), 401


@bp.route('/account', methods=['DELETE'])
@require_auth
@rate_limit(delete_limiter, counts=lambda status: status == 403)
def delete_account():
    """Permanently delete the signed-in user's account and everything stored with it.

    The token proves who is asking; the password re-confirms it's really them, so a leaked or
    stolen token (it lives in localStorage) can't erase an account on its own.
    """
    password = (request.get_json(silent=True) or {}).get('password')
    if not isinstance(password, str) or not password:
        return jsonify({'success': False, 'message': 'Enter your password to delete your account'}), 400
    if not check_password_for_user(request.user_id, password):
        return jsonify({'success': False, 'message': 'Incorrect password'}), 403
    if not delete_user(request.user_id):
        return jsonify({'success': False, 'message': 'Could not delete your account'}), 500
    return jsonify({'success': True, 'message': 'Your account has been deleted'}), 200
