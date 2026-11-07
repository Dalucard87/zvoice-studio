#!/usr/bin/env bash
# ZVoice Studio — запуск локального сервера и открытие в браузере
cd "$(dirname "$0")"
PORT="${1:-8765}"

if ss -tln 2>/dev/null | grep -q ":$PORT "; then
  echo "Порт $PORT занят — студия уже запущена?"
  xdg-open "http://localhost:$PORT" 2>/dev/null &
  exit 0
fi

echo "ZVoice Studio → http://localhost:$PORT"
python3 server.py "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!
sleep 0.6
xdg-open "http://localhost:$PORT" 2>/dev/null &
echo "Сервер: PID $SERVER_PID. Остановить: kill $SERVER_PID"
wait $SERVER_PID
