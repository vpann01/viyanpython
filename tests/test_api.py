"""PyQuest API tests — run with: pytest -q"""
import os
import tempfile

os.environ.setdefault("PYQUEST_DB", os.path.join(tempfile.gettempdir(), "pyquest_test.db"))

from fastapi.testclient import TestClient  # noqa: E402
from backend.main import app  # noqa: E402

client = TestClient(app)


def _login(u, p):
    r = client.post("/api/auth/login", json={"username": u, "password": p})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert r.json()["worlds"] >= 6


def test_curriculum_has_worlds_and_lessons():
    c = client.get("/api/curriculum").json()
    assert len(c["worlds"]) >= 6
    w1 = c["worlds"][0]
    assert w1["lessons"] and "playground" in w1["lessons"][0]


def test_demo_accounts_login():
    for u, p, role in [
        ("admin@pythonquest.ai", "Admin123!", "admin"),
        ("parent@pythonquest.ai", "Parent123!", "parent"),
        ("kid@pythonquest.ai", "Kid123!", "student"),
    ]:
        r = client.post("/api/auth/login", json={"username": u, "password": p})
        assert r.status_code == 200, r.text
        assert r.json()["role"] == role


def test_bad_password_rejected():
    r = client.post("/api/auth/login", json={"username": "kid@pythonquest.ai", "password": "nope"})
    assert r.status_code == 401


def test_complete_lesson_awards_xp_and_badge():
    tok = _login("kid@pythonquest.ai", "Kid123!")
    before = client.get("/api/me", headers=_auth(tok)).json()["progress"]["total_xp"]
    r = client.post("/api/progress/complete", json={"lesson_id": "w1l1", "stars": 3, "seconds": 42},
                    headers=_auth(tok))
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["total_xp"] >= before + 50
    assert "w1l1" in s["completed_lessons"]
    assert any(b["badge"] == "Chest Keeper" for b in s["badges"])


def test_tutor_hint_always_responds():
    tok = _login("kid@pythonquest.ai", "Kid123!")
    r = client.post("/api/tutor/hint",
                    json={"lesson_id": "w1l1", "code": "scor = 7", "error": "NameError: name 'score' is not defined", "attempts": 1},
                    headers=_auth(tok))
    assert r.status_code == 200
    assert len(r.json()["text"]) > 0


def test_parent_dashboard_access():
    tok = _login("parent@pythonquest.ai", "Parent123!")
    r = client.get("/api/parent/kid@pythonquest.ai", headers=_auth(tok))
    assert r.status_code == 200
    assert "skill_map" in r.json()


def test_auth_required():
    assert client.get("/api/me").status_code == 401
