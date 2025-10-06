# TriviaChamp Web

A simple web version of your Java `TRIVIACHAMP` console game. It supports:

- Offline mode (local question bank per subject)
- Online mode (fetches questions from Open Trivia DB, no API key required)
- Categories: Math (19), CS (18), Science (17), History (23)
- Difficulty: easy/medium/hard with timers (15/10/5 seconds)
- Leaderboard stored in browser localStorage (cumulative)
 - Offline extras: Unlimited questions, optional difficulty (toggle), and larger local banks (JSON)

## Run locally

Option 1: Open `index.html` directly in your browser (no build step).

Option 2: Run the bundled server (serves files + shared leaderboard API):

```powershell
# from the project folder
cd "c:\JAVA\TriviaChampWeb"
python server.py
# then open http://<your-computer-ip>:8000 in your browser or phone
```

## Notes

- Online mode calls `https://opentdb.com/api.php` and does not require any API key.
- If the API rate-limits (429), the app retries briefly.
- Offline mode is unlimited; it loads larger local banks from `data/*.json` and keeps generating questions.
- Press `E` during a quiz to quickly end the session.
- Leaderboard sync: with `server.py` running, all devices on the same network share the same scores via `/api/leaderboard`. If you use `http.server`, only your browser's localStorage is used and won't sync across devices.

## Folder structure

- `index.html` – UI markup
- `style.css` – Basic styling
- `app.js` – Game logic (fetching, timer, scoring, leaderboard)
