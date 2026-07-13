from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main():
    root = Path(__file__).resolve().parent.parent
    handler = lambda *args, **kwargs: SimpleHTTPRequestHandler(*args, directory=str(root), **kwargs)
    server = ThreadingHTTPServer(("127.0.0.1", 8000), handler)
    print("Serving dashboard at http://127.0.0.1:8000/dashboard/")
    server.serve_forever()


if __name__ == "__main__":
    main()
