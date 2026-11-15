"""Swappable model architectures for the per-game stat model.

An architecture is a zero-argument factory returning an unfitted estimator that follows
scikit-learn's contract: fit(X, y) and predict(X), with X of shape (rows, features) that
may contain NaN and y of shape (rows, targets). Each architecture owns whatever
preprocessing it needs (for example imputing NaN), so the rest of the code can treat
them all the same.

To add one, write a factory and decorate it with @register("name"). Nothing else changes:
GameStatModel, the evaluation and both scripts look architectures up by name.
"""
import os
from typing import Callable, Dict, List

from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.multioutput import MultiOutputRegressor
from sklearn.pipeline import make_pipeline
from xgboost import XGBRegressor

from app import config

ARCHITECTURES: Dict[str, Callable] = {}


def register(name: str):
    def decorator(factory: Callable) -> Callable:
        if name in ARCHITECTURES:
            raise ValueError(f"Architecture {name!r} is already registered")
        ARCHITECTURES[name] = factory
        return factory
    return decorator


def available() -> List[str]:
    return sorted(ARCHITECTURES)


def default_architecture() -> str:
    return os.environ.get(config.GAME_MODEL_ARCHITECTURE_ENV) or config.DEFAULT_GAME_MODEL_ARCHITECTURE


def build(name: str):
    """Return a fresh, unfitted estimator for the named architecture."""
    try:
        factory = ARCHITECTURES[name]
    except KeyError:
        raise ValueError(
            f"Unknown architecture {name!r}; available: {', '.join(available())}"
        ) from None
    return factory()


@register("xgboost")
def _xgboost():
    # Gradient boosting: trees are built one after another, each correcting the errors of
    # the ones before. Handles NaN natively. One booster per target stat.
    return MultiOutputRegressor(XGBRegressor(
        n_estimators=300,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        objective='reg:absoluteerror',
        random_state=42,
        n_jobs=1,
    ))


@register("random_forest")
def _random_forest():
    # Bagging: deep trees are grown independently on random samples of rows and features,
    # then averaged. Older scikit-learn forests reject NaN, so missing values (no betting
    # line, short history) are filled with the training median first. One forest per
    # target stat, so points do not dominate the splits for blocks or steals.
    return make_pipeline(
        SimpleImputer(strategy="median", keep_empty_features=True),
        MultiOutputRegressor(RandomForestRegressor(
            n_estimators=200,
            min_samples_leaf=20,
            max_features=0.5,
            max_samples=0.5,
            random_state=42,
            n_jobs=-1,
        )),
    )
