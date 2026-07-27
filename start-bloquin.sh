#!/bin/zsh -il

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

mkdir -p .tmp
WEBKIT_DISABLE_COMPOSITING_MODE=1 npm run tauri dev > "$SCRIPT_DIR/.tmp/bloquin-dev.log" 2>&1
