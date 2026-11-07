#!/usr/bin/env bash
# ZVoice Studio — запуск десктоп-приложения
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -x "$DIR/electron/electron" ]; then
  echo "Electron не найден. Выполни один раз:"
  echo "  $DIR/setup-desktop.sh"
  exit 1
fi

exec "$DIR/electron/electron" "$DIR/app" "$@"
