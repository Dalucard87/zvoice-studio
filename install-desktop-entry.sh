#!/usr/bin/env bash
# Linux: adds ZVoice Studio to the applications menu (XDG — works on GNOME, KDE, XFCE…)
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -x "$DIR/electron/electron" ]; then
  echo "Electron is not installed. Run first: $DIR/setup-desktop.sh"
  exit 1
fi

APPS="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons/hicolor/512x512/apps"
mkdir -p "$APPS" "$ICONS"

cp "$DIR/app/icon.png" "$ICONS/zvoice-studio.png"

cat > "$APPS/zvoice-studio.desktop" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=ZVoice Studio
GenericName=Voice recorder & FX
Comment=Multitrack voice recording with real-time FX chains
Exec="${DIR}/launch.sh"
Icon=${ICONS}/zvoice-studio.png
Terminal=false
Categories=AudioVideo;Audio;Recorder;
StartupWMClass=zvoice-studio
EOF

command -v update-desktop-database >/dev/null && update-desktop-database "$APPS" || true
echo "Installed: ZVoice Studio (applications menu)"
