@echo off
rem znam ASR companion server — double-click to start.
rem First run downloads the model (~460MB for small); afterwards it starts in seconds.
cd /d "%~dp0"
python asr_server.py small
pause
