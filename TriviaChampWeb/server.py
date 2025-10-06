from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import os
from urllib.parse import urlparse, parse_qs

STORE_FILE = os.path.join(os.path.dirname(__file__), 'leaderboard.json')

class Handler(SimpleHTTPRequestHandler):
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
            data = {}
            if os.path.exists(STORE_FILE):
                try:
                    with open(STORE_FILE, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                except Exception:
                    data = {}
            self._set_headers(200)
            self.wfile.write(json.dumps(data).encode('utf-8'))
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
            except Exception:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid JSON"}).encode('utf-8'))
                return
            # Load current
            data = {}
            if os.path.exists(STORE_FILE):
                try:
                    with open(STORE_FILE, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                except Exception:
                    data = {}
            # Update cumulative
            if name:
                data[name] = int(data.get(name, 0)) + score
            # Save
            try:
                with open(STORE_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f)
            except Exception:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": "Failed to persist"}).encode('utf-8'))
                return
            self._set_headers(200)
            self.wfile.write(json.dumps({"ok": True, "leaderboard": data}).encode('utf-8'))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode('utf-8'))

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/leaderboard':
            # Clear the leaderboard store
            try:
                with open(STORE_FILE, 'w', encoding='utf-8') as f:
                    json.dump({}, f)
            except Exception:
                # If file cannot be written, still respond with empty board
                pass
            self._set_headers(200)
            self.wfile.write(json.dumps({"ok": True, "leaderboard": {}}).encode('utf-8'))
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
