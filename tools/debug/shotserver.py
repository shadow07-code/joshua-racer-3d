# Local-only frame receiver for the debug build: the page POSTs a JPEG data URL to
# http://127.0.0.1:8098/?name=x and it is written to tools/debug/shots/x.jpg (git-ignored).
import base64, os, re
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
os.makedirs(OUT, exist_ok=True)


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        q = parse_qs(urlparse(self.path).query)
        name = re.sub(r"[^A-Za-z0-9_.-]", "_", q.get("name", ["shot"])[0])[:60]
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("ascii")
        with open(os.path.join(OUT, name + ".jpg"), "wb") as f:
            f.write(base64.b64decode(body.split(",", 1)[1]))
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "http://localhost:8099")
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *a):
        pass


HTTPServer(("127.0.0.1", 8098), H).serve_forever()
