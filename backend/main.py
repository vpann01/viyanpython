"""
PyQuest backend — FastAPI.

Serves the JSON API (curriculum, auth, progress, tutor) AND the static frontend,
so the whole platform is a single deployable service. Python execution happens
CLIENT-SIDE via Pyodide (WASM), so there is no server-side code-execution risk.
"""
import json
from pathlib import Path
from typing import Optional

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import auth, db, tutor

HERE = Path(__file__).resolve().parent
FRONTEND = HERE.parent / "frontend"
CURRICULUM = json.loads((HERE / "content" / "curriculum.json").read_text())

# Flatten lessons -> quick lookup for scoring/validation
LESSON_INDEX = {}
for _w in CURRICULUM["worlds"]:
    for _l in _w.get("lessons", []):
        LESSON_INDEX[_l["id"]] = {**_l, "world_id": _w["id"]}

def _bootstrap():
    """Idempotent: create tables + seed demo accounts. Safe to call repeatedly."""
    db.init_db()
    auth.seed_demo_users()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _bootstrap()
    yield


app = FastAPI(title="PyQuest API", version=CURRICULUM["meta"]["version"], lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Also seed at import time so TestClient(app) (which doesn't run lifespan unless
# used as a context manager) and any import-and-call usage have demo users ready.
_bootstrap()


# ── models ────────────────────────────────────────────────────────────────────
class LoginIn(BaseModel):
    username: str
    password: str


class RegisterIn(BaseModel):
    username: str
    password: str
    display: Optional[str] = None


class CompleteIn(BaseModel):
    lesson_id: str
    stars: int = 3
    seconds: int = 0


class TutorIn(BaseModel):
    lesson_id: str
    code: str = ""
    error: Optional[str] = None
    attempts: int = 0


# ── auth helpers ────────────────────────────────────────────────────────────────
def current_user(authorization: Optional[str] = Header(None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "missing token")
    user = auth.read_token(authorization.split(" ", 1)[1])
    if not user:
        raise HTTPException(401, "invalid or expired token")
    return user


# ── routes ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"ok": True, "version": CURRICULUM["meta"]["version"], "worlds": len(CURRICULUM["worlds"])}


@app.get("/api/curriculum")
def curriculum():
    return CURRICULUM


@app.post("/api/auth/login")
def login(body: LoginIn):
    if not auth.verify(body.username, body.password):
        raise HTTPException(401, "wrong username or password")
    p = db.get_player(body.username) or {}
    return {"token": auth.make_token(body.username), "username": body.username,
            "role": p.get("role", "student"), "display": p.get("display", body.username)}


@app.post("/api/auth/register")
def register(body: RegisterIn):
    if not auth.register(body.username, body.password, display=body.display):
        raise HTTPException(409, "username already exists")
    return {"token": auth.make_token(body.username), "username": body.username, "role": "student"}


@app.get("/api/me")
def me(user: str = Depends(current_user)):
    p = db.get_player(user) or {"username": user, "role": "student"}
    return {"player": p, "progress": db.summary(user)}


@app.post("/api/progress/complete")
def complete(body: CompleteIn, user: str = Depends(current_user)):
    lesson = LESSON_INDEX.get(body.lesson_id)
    if not lesson:
        raise HTTPException(404, "unknown lesson")
    reward = lesson.get("reward", {})
    return db.complete_lesson(
        user, body.lesson_id, xp=int(lesson.get("xp", 50)),
        stars=max(0, min(3, body.stars)),
        badge=reward.get("badge"), badge_emoji=reward.get("emoji"),
        seconds=body.seconds,
    )


@app.post("/api/tutor/hint")
def tutor_hint(body: TutorIn, user: str = Depends(current_user)):
    lesson = LESSON_INDEX.get(body.lesson_id, {})
    prompt = (lesson.get("playground", {}) or {}).get("prompt", "")
    return tutor.hint(prompt=prompt, code=body.code, error=body.error,
                      attempts=body.attempts, lesson_title=lesson.get("title", ""))


@app.get("/api/parent/{child}")
def parent_view(child: str, user: str = Depends(current_user)):
    """Parent/teacher analytics for a child (demo: any authenticated adult)."""
    me_p = db.get_player(user) or {}
    if me_p.get("role") not in ("parent", "teacher", "admin") and user != child:
        raise HTTPException(403, "not allowed")
    s = db.summary(child)
    # build a tiny skill heatmap: completed lessons per world
    per_world = {}
    for w in CURRICULUM["worlds"]:
        ids = [l["id"] for l in w.get("lessons", [])]
        done = sum(1 for i in ids if i in s["completed_lessons"])
        per_world[w["id"]] = {"name": w["name"], "done": done, "total": len(ids)}
    return {"child": child, "summary": s, "skill_map": per_world,
            "minutes_spent": round(s["seconds_spent"] / 60, 1)}


# ── static frontend (must be mounted last) ────────────────────────────────────
@app.get("/")
def index():
    return FileResponse(FRONTEND / "index.html")


if FRONTEND.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="static")
