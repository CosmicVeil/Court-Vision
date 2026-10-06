from flask import Blueprint, jsonify, request

from app.auth import create_token, invalidate_token, require_auth
from app.db import authenticate_user_from_json, create_user_from_json, get_user_by_id

bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@bp.route('/signup', methods=['POST'])
def signup():
    try:
        success, user, message = create_user_from_json()
        if success:
            token = create_token(user['id'])
            return jsonify({'success': True, 'user': user, 'token': token, 'message': message}), 201
        return jsonify({'success': False, 'message': message}), 400
    except Exception as e:
        print(f"Signup error: {e}")
        return jsonify({'success': False, 'message': 'Error creating account'}), 500


@bp.route('/login', methods=['POST'])
def login():
    try:
        success, user, message = authenticate_user_from_json()
        if success:
            token = create_token(user['id'])
            return jsonify({'success': True, 'user': user, 'token': token, 'message': message}), 200
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
        return jsonify({'authenticated': True, 'user': user}), 200
    return jsonify({'authenticated': False, 'message': 'User not found'}), 401
