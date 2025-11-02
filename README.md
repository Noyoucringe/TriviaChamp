# TriviaChamp Web

A fast, zero-dependency web trivia app with offline and online modes, per-subject leaderboards, presence, and a lightweight Python server.

Features
- Subjects: Math (19), CS (18), Science (17), History (23)
- Modes: Offline (unlimited, local banks) and Online (timed; Open Trivia DB)
- Difficulty timers: easy 15s, medium 10s, hard 5s
- Leaderboards: per-subject, cumulative; stored server-side with local fallback
- Presence: online player count with heartbeats
- Practice dashboard: daily goals, per-subject accuracy
- Extras: typewriter subtitle, subject themes, achievements, recent activity

## Run locally

Option A: Open `index.html` directly (offline mode works; no shared leaderboard)

Option B: Start the bundled Python server (serves static + APIs)

```powershell
cd "c:\JAVA\TriviaChampWeb"
# optional: set a port (defaults to 8000)
$env:PORT = '8000'
python server.py
# open http://localhost:8000/
```

APIs
- GET/POST/DELETE `/api/leaderboard?category=19|18|17|23` (per-subject)
- GET/POST `/api/presence` (online users)

Notes
- The server binds to `0.0.0.0:$PORT` and stores data in `leaderboard.json`.
- Legacy global boards are auto-migrated to the new schema on first run.
- `index.html` is served with `no-store` to prevent stale UI after deploys.

## Deploy to Render

This repo includes `render.yaml` with a Python Web Service definition.

1) Create a new Render Web Service
	- Connect your GitHub repo
	- Render will detect `render.yaml`
2) Review settings (from render.yaml)
	- Environment: Python
	- Build Command: `pip install -r requirements.txt`
	- Start Command: `python server.py`
3) Deploy
	- Render injects `PORT`; no config needed
	- Auto-Deploy: On (recommended)

After deploy, open the service URL and you’re good to go.

## Folder structure

- `index.html` – UI markup (served no-cache)
- `style.css` – Styles
- `app.js` – Game logic (UI, fetch, timers, leaderboard, presence)
- `server.py` – Static file + JSON API server
- `leaderboard.json` – Server-side data store (auto-created)
- `data/` – Optional offline banks per subject
- `assets/` – Icons and images
- `render.yaml` – Render deployment config
- `requirements.txt` – Empty but present for Python service detection

## Tips & shortcuts

- Press `E` during a quiz to end the session
- “Repair Leaderboards” clears all server/local scores (useful after schema changes)
- Subject tiles: keys 1–4 to select
