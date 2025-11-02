from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import os
from urllib.parse import urlparse, parse_qs
import time

STORE_FILE = os.path.join(os.path.dirname(__file__), 'leaderboard.json')

# Simple in-memory presence store (client id -> last heartbeat time)
PRESENCE = {}
PRESENCE_TTL = 45  # seconds

def prune_presence():
    now = time.time()
    stale = [k for k,v in list(PRESENCE.items()) if now - v > PRESENCE_TTL]
    for k in stale:
        try:
            del PRESENCE[k]
        except Exception:
            pass

class Handler(SimpleHTTPRequestHandler):
    def _load_boards(self):
        boards = {}
        if os.path.exists(STORE_FILE):
            try:
                with open(STORE_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if isinstance(data, dict) and 'boards' in data and isinstance(data['boards'], dict):
                    boards = data['boards']
                elif isinstance(data, dict):
                    # legacy flat map: treat as global board and migrate file on the fly
                    boards = { 'global': data }
                    # Persist migration so future reads use the new schema
                    try:
                        self._save_boards(boards)
                    except Exception:
                        pass
                else:
                    boards = {}
            except Exception:
                boards = {}
        return boards

    def _save_boards(self, boards):
        try:
            with open(STORE_FILE, 'w', encoding='utf-8') as f:
                json.dump({ 'boards': boards }, f)
            return True
        except Exception:
            return False
    def _set_headers(self, code=200, ctype='application/json'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(200)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/leaderboard':
            qs = parse_qs(parsed.query)
            category = (qs.get('category') or [''])[0].strip() or 'global'
            boards = self._load_boards()
            board = boards.get(category, {})
            self._set_headers(200)
            self.wfile.write(json.dumps(board).encode('utf-8'))
        elif parsed.path == '/api/presence':
            # Return number of active clients in the last PRESENCE_TTL seconds
            prune_presence()
            self._set_headers(200)
            self.wfile.write(json.dumps({"online": len(PRESENCE)}).encode('utf-8'))
        elif parsed.path in ('/', '/index.html'):
            # Serve index.html with no-cache headers to avoid stale UI
            index_path = os.path.join(os.path.dirname(__file__), 'index.html')
            if os.path.exists(index_path):
                try:
                    with open(index_path, 'rb') as f:
                        content = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/html; charset=utf-8')
                    self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
                    self.send_header('Pragma', 'no-cache')
                    self.send_header('Expires', '0')
                    # Keep CORS permissive to match API behavior
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(content)
                    return
                except Exception:
                    pass
            # fallback to default handler if any error
            return super().do_GET()
        elif parsed.path == '/favicon.ico':
            # Serve SVG logo as favicon if requested
            logo_path = os.path.join(os.path.dirname(__file__), 'assets', 'logo.svg')
            if os.path.exists(logo_path):
                try:
                    with open(logo_path, 'rb') as f:
                        content = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'image/svg+xml')
                    self.send_header('Cache-Control', 'public, max-age=86400')
                    self.end_headers()
                    self.wfile.write(content)
                    return
                except Exception:
                    pass
            return super().do_GET()
        else:
            return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/leaderboard':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            try:
                payload = json.loads(body)
                # Expect payload like {"name": "...", "score": 3}
                name = str(payload.get('name', '')).strip()
                score = int(payload.get('score', 0))
                category = str(payload.get('category', '')).strip()
            except Exception:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid JSON"}).encode('utf-8'))
                return
            # Allow category via query as well
            if not category:
                try:
                    qs = parse_qs(parsed.query)
                    category = (qs.get('category') or [''])[0].strip()
                except Exception:
                    category = ''
            key = category or 'global'

            # Load, update, save
            boards = self._load_boards()
            board = boards.get(key, {})
            if name:
                board[name] = int(board.get(name, 0)) + score
            boards[key] = board
            if not self._save_boards(boards):
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": "Failed to persist"}).encode('utf-8'))
                return
            self._set_headers(200)
            self.wfile.write(json.dumps({"ok": True, "leaderboard": board}).encode('utf-8'))
        elif parsed.path == '/api/presence':
            # Record a heartbeat for a client id
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8') if length else '{}'
            try:
                payload = json.loads(body or '{}')
            except Exception:
                payload = {}
            cid = str(payload.get('id') or '')
            if not cid:
                # allow passing id via query as well
                try:
                    qs = parse_qs(urlparse(self.path).query)
                    cid = (qs.get('id') or [''])[0]
                except Exception:
                    cid = ''
            if cid:
                PRESENCE[cid] = time.time()
                prune_presence()
                self._set_headers(200)
                self.wfile.write(json.dumps({"ok": True, "online": len(PRESENCE)}).encode('utf-8'))
            else:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "missing id"}).encode('utf-8'))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode('utf-8'))

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/leaderboard':
            qs = parse_qs(parsed.query)
            category = (qs.get('category') or [''])[0].strip()
            boards = self._load_boards()
            if category:
                boards[category] = {}
            else:
                boards = {}
            self._save_boards(boards)
            self._set_headers(200)
            self.wfile.write(json.dumps({"ok": True, "leaderboard": boards.get(category or 'global', {})}).encode('utf-8'))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode('utf-8'))

if __name__ == '__main__':
    # Serve files and API from current directory; bind to all interfaces
    os.chdir(os.path.dirname(__file__))
    port = int(os.environ.get('PORT', '8000'))  # Render sets PORT
    httpd = HTTPServer(('0.0.0.0', port), Handler)
    print(f'Serving at http://0.0.0.0:{port}')
    httpd.serve_forever()
