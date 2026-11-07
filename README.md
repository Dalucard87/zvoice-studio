# ZVoice Studio

Free multitrack voice recorder with **real-time FX chains** — a lightweight DAW for
voice work with a Reaper-style workflow and FabFilter-style plugin panels.
Runs fully offline. No accounts, no cloud, no telemetry.

![ZVoice Studio](docs/screenshot.png)

## Features

- **Multitrack timeline with items** (Reaper-style): every recording or import is a
  separate clip — drag it, move it between tracks, split it at the cursor, glue everything back
- **Punch-in recording**: select a region → ⏺ → re-record just that piece; older takes are trimmed, not deleted
- **11 real-time plugins** with live displays (spectrum, waveform, LED meters):
  De-Noiser · Gate · De-Esser · EQ (6 bands + response curve) · Compressor · Limiter ·
  Saturation · Chorus · Delay · Reverb · Gain — a separate FX chain for every track
- **Waveform editor**: selection, cut/copy/paste, silence, fades, normalize, undo/redo
- **Export**: mix of all tracks or a solo track as WAV 16/24-bit, plus a dry mix without processing
- **Projects**: save/load `.zvproj` — a plain ZIP with a WAV per item plus all chain settings
- **Customization**: interface language (English/Русский), themes, accent color, UI scale,
  track height, output device, output volume, fully remappable hotkeys

## Built with

| Layer | Technology |
|---|---|
| Application logic | **Vanilla JavaScript** (ES modules) — no frameworks, no build step |
| Real-time DSP | **Web Audio API + AudioWorklet** (gate, de-esser and de-noiser are custom worklets with own FFT) |
| Visualization | **Canvas 2D** — waveform timeline, plugin displays, LED meters, spectrum |
| UI | **HTML/CSS** — dark DAW theme, custom rotary knobs |
| Web version server | **Python 3** standard library only (static no-cache server) |
| Desktop shell | **Electron** — own window, microphone access without permission dialogs |
| Project files | **ZIP written from scratch** (STORE method) + 24-bit **WAV** encoder — `project.json` + one WAV per item |
| Persistence | **IndexedDB + File System Access API** — remembers your project folder |

## Download

Ready-to-run bundles are published on the
[**Releases page**](https://github.com/Dalucard87/zvoice-studio/releases/latest) —
Electron runtime and the app are already packed inside, just unpack and launch:

| File | OS | Run |
|---|---|---|
| `ZVoice-Studio-<version>-linux-x64.zip` | Linux 64-bit | `chmod +x launch.sh && ./launch.sh` |
| `ZVoice-Studio-<version>-win64.zip` | Windows 64-bit | double-click `launch.bat` |

No installation required. macOS: grab the source (or clone the repo) and use
the one-time setup below — `setup-desktop.sh` supports Apple Silicon and Intel.

## Quick start

### Web version — all platforms (Python 3 + any Chromium-based browser)

| OS | Command |
|---|---|
| Linux / macOS | `./run.sh` |
| Windows | double-click `run.bat` |

Then open <http://localhost:8765>. Grant microphone access when asked.

### Desktop version — own application window (Electron)

| OS | One-time setup | Run |
|---|---|---|
| Linux / macOS | `./desktop/setup-desktop.sh` | `./desktop/launch.sh` |
| Windows | `desktop\setup-desktop.bat` | `desktop\launch.bat` |

The setup script downloads Electron (~120 MB) once. Desktop shell adds:
a proper app window, microphone without permission dialogs, `.desktop` menu entry (Linux, see below).

### Linux — add to the applications menu

```bash
./install-desktop-entry.sh
```

Installs a `ZVoice Studio` launcher (works on GNOME, KDE, XFCE and any XDG-compliant desktop).

## Default hotkeys

| Action | Key |
|---|---|
| Play / Stop | `Space` |
| Record (into selected track) | `R` |
| Loop selection | `L` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Cut / Copy / Paste | `Ctrl+X` / `C` / `V` |
| Select all / Clear selection | `Ctrl+A` / `Esc` |
| Delete selection | `Del` |
| Cursor to start | `Home` |

Every hotkey can be remapped or disabled in ⚙ → Hotkeys.

## Recording workflow (Reaper-style)

1. `＋ Track` → press `R` → the take lands on the track as an **item** at the cursor
2. Record again → the next item is placed right after, nothing is overwritten
3. Messed up a word? Select it → `R` → punch-in replaces just that region
4. Grab an item by its name bar to move it (even to another track)
5. `Split` cuts an item at the cursor; `Glue` mixes all tracks into one
6. Apply FX per track in the FX window; export the mix as WAV

## Project format

`.zvproj` is a standard ZIP you can open with any archiver:

```
project.json      — track list: names, volume, pan, mute/solo, full FX chains, item positions
track-01-*.wav    — raw 24-bit PCM per item — pull any sound out with any tool
```

Audio lives in memory while the app runs — save the project or export WAV before closing.

## Architecture

```
index.html            — markup
server.py / run.*     — optional no-cache static server for the web version
js/main.js            — app: tracks, items, recording, projects, hotkeys, settings
js/engine/            — mixer (FX chain per track), clip ops + undo, recorder,
                        WAV codec, ZIP container, offline render
js/plugins/           — 11 plugins (FabFilter-style panels) + displays (spectrum/waveform/history)
js/ui/                — item timeline, FX window, knobs, meters, settings dialog
worklets/             — AudioWorklet DSP: gate, de-esser, de-noiser, capture
desktop/              — Electron shell (window + permission-free microphone)
```

## License

[GNU GPL v3](LICENSE). All application code is written from scratch.
Electron is distributed under its own MIT license.
