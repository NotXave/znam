# znam OCR companion server — the 'server' tier of manga/manhwa reading.
#
# Why: whole-page Tesseract is nearly useless on comic pages (busy art,
# stylized lettering), and even Tesseract-on-detected-bubbles reads comic
# fonts poorly. This server does both stages properly:
#   detection:   comic-text-detector (via mokuro) — finds speech bubbles
#   recognition: manga-ocr (Japanese) / EasyOCR (latin scripts, Korean)
#
# Install (once):   pip install mokuro easyocr
# Run:              python ocr_server.py [port]      # default 8787
#
# First run downloads models (~450MB mokuro + ~100MB per EasyOCR language),
# cached under %USERPROFILE%\.cache. znam's default manga server URL is
# http://127.0.0.1:8787 — matching this default port.
#
# Protocol (see utils/ocr/server-client.ts):
#   GET  /health -> 200 {"ok": true}
#   POST /ocr    body: {"image": base64, "lang": "en", "detect_only": false}
#                -> 200 {"regions": [{id, bbox, text, words, lines, vertical, source}]}

import base64
import json
import os
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787

_mpocr = None
_detector = None
_readers = {}

# znam lang codes → EasyOCR codes (only languages EasyOCR supports).
EASYOCR_LANGS = {
    "en": "en", "pl": "pl", "de": "de", "fr": "fr", "es": "es", "it": "it",
    "pt": "pt", "nl": "nl", "cs": "cs", "sk": "sk", "ru": "ru", "uk": "uk",
    "ko": "ko",
}


def get_mpocr():
    """Full Japanese pipeline: detection + manga-ocr recognition."""
    global _mpocr
    if _mpocr is None:
        print("loading mokuro MangaPageOcr (first run downloads ~450MB)…")
        from mokuro.manga_page_ocr import MangaPageOcr

        _mpocr = MangaPageOcr()
        print("mokuro ready")
    return _mpocr


def get_detector():
    """Detection only — comic-text-detector without recognition."""
    global _detector
    if _detector is None:
        print("loading comic-text-detector…")
        from comic_text_detector.inference import TextDetector
        from mokuro.cache import cache

        _detector = TextDetector(
            model_path=cache.comic_text_detector, input_size=1024,
            device="cpu", act="leaky",
        )
        print("detector ready")
    return _detector


def get_reader(lang):
    """EasyOCR reader for a latin-script (or Korean) language."""
    code = EASYOCR_LANGS[lang]
    if code not in _readers:
        print(f"loading EasyOCR reader for '{code}'…")
        import easyocr

        langs = [code] if code == "en" else [code, "en"]
        _readers[code] = easyocr.Reader(langs, gpu=False, verbose=False)
        print("reader ready")
    return _readers[code]


def detect_blocks(img):
    _, _, blk_list = get_detector()(img, refine_mode=1, keep_undetected_mask=True)
    return blk_list


def region_dict(i, box, text, lines, vertical):
    x1, y1, x2, y2 = [int(v) for v in box]
    return {
        "id": f"r{i}",
        "bbox": {"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1},
        "text": text,
        "words": [],
        "lines": lines,
        "vertical": vertical,
        "source": "server",
    }


def ocr_japanese(path, detect_only):
    """mokuro's own result shape → znam regions (same as before)."""
    if detect_only:
        from mokuro.utils import imread

        img = imread(path)
        regions = []
        for i, blk in enumerate(detect_blocks(img)):
            lines = []
            for coords in blk.lines_array():
                xs = [p[0] for p in coords.tolist()]
                ys = [p[1] for p in coords.tolist()]
                lines.append({"text": "", "bbox": {
                    "x": int(min(xs)), "y": int(min(ys)),
                    "w": int(max(xs) - min(xs)), "h": int(max(ys) - min(ys))}})
            regions.append(region_dict(i, blk.xyxy, "", lines, bool(blk.vertical)))
        return regions

    result = get_mpocr()(path)
    regions = []
    for i, blk in enumerate(result.get("blocks", [])):
        line_texts = blk.get("lines") or []
        text = "".join(line_texts)
        if not text.strip():
            continue
        lines = []
        for idx, coords in enumerate(blk.get("lines_coords") or []):
            line_text = line_texts[idx] if idx < len(line_texts) else ""
            if not line_text:
                continue
            xs = [p[0] for p in coords]
            ys = [p[1] for p in coords]
            lines.append({"text": line_text, "bbox": {
                "x": int(min(xs)), "y": int(min(ys)),
                "w": int(max(xs) - min(xs)), "h": int(max(ys) - min(ys))}})
        regions.append(region_dict(i, blk["box"], text, lines, bool(blk.get("vertical", False))))
    return regions


def ocr_latin(path, lang, detect_only):
    """comic-text-detector finds bubbles, EasyOCR reads each crop."""
    from mokuro.utils import imread

    img = imread(path)
    blocks = detect_blocks(img)
    regions = []
    if detect_only:
        for i, blk in enumerate(blocks):
            regions.append(region_dict(i, blk.xyxy, "", [], False))
        return regions

    reader = get_reader(lang)
    h_img, w_img = img.shape[:2]
    for i, blk in enumerate(blocks):
        x1, y1, x2, y2 = [int(v) for v in blk.xyxy]
        pad = max(4, int(max(x2 - x1, y2 - y1) * 0.06))
        cx1, cy1 = max(0, x1 - pad), max(0, y1 - pad)
        cx2, cy2 = min(w_img, x2 + pad), min(h_img, y2 + pad)
        if cx2 - cx1 < 8 or cy2 - cy1 < 8:
            continue
        crop = img[cy1:cy2, cx1:cx2]
        results = reader.readtext(crop, detail=1, paragraph=False)
        if not results:
            continue
        # Sort detected snippets into reading order (top→bottom, left→right)
        results.sort(key=lambda r: (min(p[1] for p in r[0]), min(p[0] for p in r[0])))
        lines = []
        parts = []
        for bbox_pts, text, conf in results:
            text = text.strip()
            if not text or conf < 0.2:
                continue
            xs = [p[0] for p in bbox_pts]
            ys = [p[1] for p in bbox_pts]
            lines.append({"text": text, "bbox": {
                "x": int(min(xs)) + cx1, "y": int(min(ys)) + cy1,
                "w": int(max(xs) - min(xs)), "h": int(max(ys) - min(ys))}})
            parts.append(text)
        if not parts:
            continue
        regions.append(region_dict(i, blk.xyxy, " ".join(parts), lines, False))
    return regions


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        payload = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):  # noqa: N802
        if self.path == "/health":
            self._send(200, {"ok": True, "langs": ["ja"] + list(EASYOCR_LANGS), "engine": "mokuro+easyocr"})
        else:
            self._send(404, {})

    def do_POST(self):  # noqa: N802
        if self.path != "/ocr":
            return self._send(404, {})
        try:
            length = int(self.headers.get("Content-Length", 0))
            req = json.loads(self.rfile.read(length))
            data = req.get("image", "")
            if data.startswith("data:"):
                data = data.split(",", 1)[1]
            raw = base64.b64decode(data)
            lang = (req.get("lang") or "ja").split("-")[0]
            detect_only = bool(req.get("detect_only"))
        except Exception:
            return self._send(400, {"error": "bad request"})

        fd, path = tempfile.mkstemp(suffix=".png")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(raw)
            if lang == "ja":
                regions = ocr_japanese(path, detect_only)
            elif lang in EASYOCR_LANGS:
                regions = ocr_latin(path, lang, detect_only)
            else:
                return self._send(400, {"error": f"unsupported lang: {lang}"})
            self._send(200, {"regions": regions})
        except Exception as err:  # noqa: BLE001 — report, keep serving
            print("OCR error:", err)
            self._send(500, {"error": str(err)})
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"znam OCR server listening on http://127.0.0.1:{PORT}")
    print("engines load lazily on the first request for each language")
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
