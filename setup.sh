#!/bin/bash
set -e

echo "=== Installing frontend dependencies ==="
cd "$(dirname "$0")/frontend"
npm install

echo "=== Building frontend ==="
npx next build

echo "=== Starting backend ==="
cd "$(dirname "$0")/backend"
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

echo "=== Starting frontend ==="
cd "$(dirname "$0")/frontend"
npx next dev --turbopack &
FRONTEND_PID=$!

echo "=== Both servers running ==="
echo "Backend:  http://127.0.0.1:8000 (PID: $BACKEND_PID)"
echo "Frontend: http://localhost:3000 (PID: $FRONTEND_PID)"
echo "Press Ctrl+C to stop both"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait