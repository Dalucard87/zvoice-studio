#!/usr/bin/env bash
# Скачивает Electron (рантайм для десктоп-версии) и распаковывает в desktop/electron
# Веб-версии это не нужно — ей хватает python3.
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VER="${ELECTRON_VERSION:-37.2.0}"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) EARCH="x64" ;;
  aarch64|arm64) EARCH="arm64" ;;
  *) echo "Неизвестная архитектура: $ARCH"; exit 1 ;;
esac

if [ -x "$DIR/electron/electron" ]; then
  echo "Electron уже установлен: $DIR/electron"
  exit 0
fi

URL="https://github.com/electron/electron/releases/download/v$VER/electron-v$VER-linux-$EARCH.zip"
MIRROR="https://npmmirror.com/mirrors/electron/v$VER/electron-v$VER-linux-$EARCH.zip"
ZIP="$DIR/electron-v$VER.zip"

echo "Скачиваю Electron v$VER ($EARCH)..."
if ! curl -L --max-time 540 -o "$ZIP" "$URL"; then
  echo "GitHub не ответил, пробую зеркало..."
  curl -L --max-time 540 -o "$ZIP" "$MIRROR"
fi

echo "Распаковываю..."
unzip -q -o "$ZIP" -d "$DIR/electron"
rm -f "$ZIP"
chmod +x "$DIR/electron/electron"
echo "Готово: $DIR/electron/electron"
