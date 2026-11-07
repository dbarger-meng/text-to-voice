#!/usr/bin/env python3
"""Serve this folder locally with the headers DECtalk needs (cross-origin isolation).
Usage: python3 serve.py   then open http://localhost:8000"""
import functools, http.server, os

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()

port = int(os.environ.get("PORT", "8000"))
here = os.path.dirname(os.path.abspath(__file__))
print(f"Serving on http://localhost:{port}")
http.server.ThreadingHTTPServer(("", port), functools.partial(Handler, directory=here)).serve_forever()
