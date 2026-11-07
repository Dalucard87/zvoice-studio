#!/usr/bin/env bash
# One-time Electron download for the desktop version (Linux + macOS)
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VER="${ELECTRON_VERSION:-37.2.0}"

OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS" in
  Linux)  EOS="linux" ;;
  Darwin) EOS="darwin" ;;
  *) echo "Unsupported OS: $OS (use setup-desktop.bat on Windows)"; exit 1 ;;
esac
case "$ARCH" in
  x86_64)         EARCH="x64" ;;
  aarch64|arm64)  EARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

if [ "$EOS" = "darwin" ] && [ -x "$DIR/electron/Electron.app/Contents/MacOS/Electron" ]; then
  echo "Electron is already installed: $DIR/electron"
  exit 0
fi
if [ "$EOS" = "linux" ] && [ -x "$DIR/electron/electron" ]; then
  echo "Electron is already installed: $DIR/electron"
  exit 0
fi

URL="https://github.com/electron/electron/releases/download/v$VER/electron-v$VER-$EOS-$EARCH.zip"
MIRROR="https://npmmirror.com/mirrors/electron/v$VER/electron-v$VER-$EOS-$EARCH.zip"
ZIP="$DIR/electron-v$VER-$EOS-$EARCH.zip"

echo "Downloading Electron v$VER ($EOS-$EARCH)..."
if ! curl -L --max-time 540 -o "$ZIP" "$URL"; then
  echo "GitHub did not respond, trying the mirror..."
  curl -L --max-time 540 -o "$ZIP" "$MIRROR"
fi

echo "Extracting..."
unzip -q -o "$ZIP" -d "$DIR/electron"
rm -f "$ZIP"
[ -f "$DIR/electron/electron" ] && chmod +x "$DIR/electron/electron"
echo "Done: $DIR/electron"
