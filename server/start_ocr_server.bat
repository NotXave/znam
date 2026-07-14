@echo off
rem znam OCR companion server — double-click to start.
rem First request per language downloads models (~450MB Japanese, ~100MB per EasyOCR language).
cd /d "%~dp0"
python ocr_server.py
pause
