@echo off
cd /d "%~dp0"
echo Starting Dancing Clock server...
start "Dancing Clock Server" cmd /k python -m http.server 8000 --bind 127.0.0.1
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:8000
echo Browser opened. Close the "Dancing Clock Server" window to stop the server.
