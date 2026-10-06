"""CourtVision API: Flask app factory."""
import os
import secrets

from flask import Flask
from flask_cors import CORS


def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response


def create_app(load_data: bool = True) -> Flask:
    """Build the Flask app. load_data=False skips loading data, the model and the DB (for tests)."""
    from app import state
    from app.api import register_routes

    app = Flask(__name__)
    CORS(app, resources={
        r"/api/*": {
            "origins": "*",
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": False
        }
    })
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', secrets.token_hex(32))
    app.after_request(add_security_headers)
    register_routes(app)

    if load_data:
        state.initialize()
    return app
