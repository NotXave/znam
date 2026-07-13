# znam ASR companion server — the 'server' tier of Netflix transcription.
#
# Why: browser-wasm Whisper (the 'local' tier) is single-threaded and slow —
# tens of seconds per 8s window for anything above tiny. faster-whisper on
# the CPU (int8) transcribes the same audio orders of magnitude faster, and
# 'small' becomes comfortably real-time.
#
# Install (once):   pip install faster-whisper
# Run:              python asr_server.py [model] [port]
#                   python asr_server.py small        # default port 8788
#
# Models: tiny / base / small / medium / large-v3 (downloaded on first use,
# cached in %USERPROFILE%\.cache\huggingface). znam's default server URL is
# http://127.0.0.1:8788 — matching this default port.
#
# Protocol (see utils/asr/whisper-server-client.ts):
#   GET  /health            -> 200 {"ok": true}
#   POST /transcribe        body: 16kHz mono WAV, header X-Lang: pl
#                           -> 200 {"segments": [{"start", "end", "text"}]}

import io
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

from faster_whisper import WhisperModel

MODEL_NAME = sys.argv[1] if len(sys.argv) > 1 else "small"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8788

print(f"loading faster-whisper model '{MODEL_NAME}' …")


def _load() -> WhisperModel:
    # device="auto" happily picks CUDA even when the CUDA runtime is broken
    # (e.g. "Library cublas64_12.dll is not found") — and that only surfaces
    # on the first transcribe call. Warm up once; fall back to CPU int8.
    try:
        m = WhisperModel(MODEL_NAME, device="auto", compute_type="auto")
        import numpy as np

        # transcribe() is lazy — returns a generator; inference (and any GPU
        # failure) only happens on iteration, so force it.
        segments, _ = m.transcribe(np.zeros(16000, dtype=np.float32), language="pl")
        list(segments)
        return m
    except Exception as err:  # noqa: BLE001
        print(f"GPU path unusable ({err}); falling back to CPU int8")
        return WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")


model = _load()
print("model ready")


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes) -> None:
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802
        if self.path == "/health":
            self._send(200, b'{"ok":true}')
        else:
            self._send(404, b"{}")

    def do_POST(self):  # noqa: N802
        if self.path != "/transcribe":
            return self._send(404, b"{}")
        length = int(self.headers.get("Content-Length", 0))
        wav = self.rfile.read(length)
        lang = (self.headers.get("X-Lang") or "").split("-")[0] or None
        try:
            segments, _info = model.transcribe(
                io.BytesIO(wav),
                language=lang,
                vad_filter=True,
                beam_size=1,  # greedy — fastest, fine for subtitles
            )
            out = [
                {"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()}
                for s in segments
                if s.text.strip()
            ]
            self._send(200, json.dumps({"segments": out}).encode())
        except Exception as err:  # noqa: BLE001 — report, keep serving
            self._send(500, json.dumps({"error": str(err)}).encode())

    def log_message(self, *args):  # silence per-request noise
        pass


if __name__ == "__main__":
    print(f"znam ASR server listening on http://127.0.0.1:{PORT} (model={MODEL_NAME})")
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
