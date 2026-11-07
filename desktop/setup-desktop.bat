@echo off
rem ZVoice Studio - one-time Electron download for the desktop version (Windows)
setlocal
set VER=37.2.0
set DIR=%~dp0
if exist "%DIR%electron\electron.exe" (
  echo Electron is already installed: %DIR%electron
  exit /b
)
echo Downloading Electron v%VER% (win32-x64)...
curl -L -o "%DIR%electron.zip" "https://github.com/electron/electron/releases/download/v%VER%/electron-v%VER%-win32-x64.zip"
if errorlevel 1 (
  echo Download failed. Check your connection or download manually:
  echo %URL%
  pause
  exit /b 1
)
echo Extracting...
powershell -NoProfile -Command "Expand-Archive -Force '%DIR%electron.zip' '%DIR%electron'"
del "%DIR%electron.zip"
echo Done: %DIR%electron\electron.exe
