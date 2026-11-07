@echo off
rem ZVoice Studio - web version launcher (Windows)
cd /d "%~dp0"
start "" http://localhost:8765
where python >nul 2>nul
if %errorlevel%==0 (
  python server.py 8765
) else (
  py server.py 8765
)
