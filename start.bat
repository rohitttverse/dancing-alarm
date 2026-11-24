@echo off
cd /d "%~dp0"
echo Dancing Clock server shuru ho raha hai...
start "Dancing Clock Server" cmd /k python -m http.server 8000 --bind 127.0.0.1
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:8000
echo Browser khul gaya. Server band karne ke liye "Dancing Clock Server" window close karein.
