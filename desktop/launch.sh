#!/usr/bin/env bash
# ZVoice Studio — desktop launcher (Linux + macOS)
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -x "$DIR/electron/electron" ]; then
  exec "$DIR/electron/electron" "$DIR/app" "$@"
fi
if [ -x "$DIR/electron/Electron.app/Contents/MacOS/Electron" ]; then
  exec "$DIR/electron/Electron.app/Contents/MacOS/Electron" "$DIR/app" "$@"
fi

echo "Electron is not installed. Run once:"
echo "  $DIR/setup-desktop.sh"
exit 1
