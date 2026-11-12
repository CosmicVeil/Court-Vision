from app.api.routes import auth, games, health, players, predictions, profile, saved_players, standings, stats


def register_routes(app):
    for module in (health, auth, profile, saved_players, players, games, stats, standings, predictions):
        app.register_blueprint(module.bp)
