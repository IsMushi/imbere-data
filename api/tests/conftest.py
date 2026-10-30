"""Shared fixtures.

The model is fitted on first access and cached in module state, so the whole suite loads it once.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))


@pytest.fixture(scope="session", autouse=True)
def _warm_datastore() -> None:
    from app import datastore

    datastore.get()
