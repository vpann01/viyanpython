"""
Lightweight auth for PyQuest demo: salted-hash passwords + HMAC bearer tokens.

This is intentionally dependency-free and good enough for a demo/MVP. For real
production, swap to bcrypt/argon2 + proper JWT (python-jose) + OAuth — documented
in README. Three demo accounts are seeded on startup with the exact credentials
requested.
"""
import hashlib
import hmac
import json
import os
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode
from typing import Optional

from . import db

SECRET = os.getenv("PYQUEST_SECRET", "pyquest-dev-secret-change-me").encode()
_SALT = "pyquest-static-salt-v1"

# email -> (password, role, display, parent_of)
DEMO_USERS = {
    "admin@pythonquest.ai":  ("Admin123!",  "admin",   "Admin",     None),
    "parent@pythonquest.ai": ("Parent123!", "parent",  "Parent",    "kid@pythonquest.ai"),
    "kid@pythonquest.ai":    ("Kid123!",    "student", "Py Junior", None),
}

# in-memory password table (username -> hash); seeded + extendable at runtime
_PW: dict = {}


def _hash(password: str) -> str:
    return hashlib.sha256((_SALT + password).encode()).hexdigest()


def seed_demo_users() -> None:
    db.init_db()
    for email, (pw, role, display, parent_of) in DEMO_USERS.items():
        db.upsert_player(email, role=role, display=display, parent_of=parent_of)
        _PW[email] = _hash(pw)


def register(username: str, password: str, role: str = "student",
             display: Optional[str] = None) -> bool:
    if username in _PW:
        return False
    db.upsert_player(username, role=role, display=display or username)
    _PW[username] = _hash(password)
    return True


def verify(username: str, password: str) -> bool:
    h = _PW.get(username)
    return bool(h) and hmac.compare_digest(h, _hash(password))


def make_token(username: str, ttl: int = 7 * 24 * 3600) -> str:
    payload = json.dumps({"u": username, "exp": int(time.time()) + ttl}).encode()
    body = urlsafe_b64encode(payload).decode().rstrip("=")
    sig = hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{body}.{sig}"


def read_token(token: str) -> Optional[str]:
    try:
        body, sig = token.split(".", 1)
        expect = hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()[:32]
        if not hmac.compare_digest(sig, expect):
            return None
        pad = "=" * (-len(body) % 4)
        data = json.loads(urlsafe_b64decode(body + pad))
        if data.get("exp", 0) < time.time():
            return None
        return data.get("u")
    except Exception:
        return None
