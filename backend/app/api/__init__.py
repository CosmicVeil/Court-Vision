from app.api.routes import auth, games, health, players, predictions, saved_players, stats


def register_routes(app):
    for module in (health, auth, saved_players, players, games, stats, predictions):
        app.register_blueprint(module.bp)
