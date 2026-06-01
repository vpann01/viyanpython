#!/bin/bash
# Local dev runner for PyQuest
cd "$(dirname "$0")" || exit 1
PORT="${1:-8100}"
echo "🐍 PyQuest starting on http://localhost:$PORT"
exec python3 -m uvicorn backend.main:app --host 0.0.0.0 --port "$PORT" --reload
