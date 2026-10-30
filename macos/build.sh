#!/bin/bash
# Builds dist/Boo.app with Python, every model and the Ollama runtime inside, so it runs with no setup.
# Models and packages are copied as APFS clones, so on the build Mac the bundle takes almost no extra disk.
# Needs: the project .venv (see README), Ollama.app with `ollama pull gemma4`, and Xcode command line tools.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/dist/Boo.app"
R="$APP/Contents/Resources"
PY_HOME="$(cd "$(sed -n 's/^home = //p' "$ROOT/.venv/pyvenv.cfg")/.." && pwd -P)"
SITE="$ROOT/.venv/lib/python3.12/site-packages"
HF="${HF_HOME:-$HOME/.cache/huggingface}/hub"
OLLAMA_RES="/Applications/Ollama.app/Contents/Resources"
OLLAMA_MODELS="${OLLAMA_MODELS:-$HOME/.ollama/models}"
LLM="${LLM:-gemma4}"
LLM_TAG="${LLM_TAG:-latest}"

step() { printf '\n==> %s\n' "$1"; }

step "Fresh bundle"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$R/app"

step "Native window"
swiftc -O -o "$APP/Contents/MacOS/Boo" "$ROOT/macos/Boo.swift" -framework Cocoa -framework WebKit
cp "$ROOT/macos/Info.plist" "$APP/Contents/Info.plist"
cp "$ROOT/macos/AppIcon.icns" "$R/AppIcon.icns"

step "App code"
cp "$ROOT"/{server.py,pictures.py,index.html,emoji-keywords.json} "$ROOT/macos/boot.py" "$R/app/"
cp -R "$ROOT/static" "$R/app/static"

step "Python $(basename "$PY_HOME") and packages"
cp -cR "$PY_HOME" "$R/python"
cp -cR "$SITE" "$R/site-packages"

step "Speech models (Whisper large-v3-turbo, Kokoro-82M)"
mkdir -p "$R/hf/hub"
for m in whisper-large-v3-turbo Kokoro-82M-bf16; do
  cp -cRL "$HF/models--mlx-community--$m" "$R/hf/hub/"  # -L: model files link into a shared blob store
done

step "Ollama runtime and $LLM:$LLM_TAG"
cp -cR "$OLLAMA_RES" "$R/ollama"
find "$R/ollama" \( -name '*.svg' -o -name '*.png' -o -name '*.icns' \) -delete
manifest="manifests/registry.ollama.ai/library/$LLM/$LLM_TAG"
mkdir -p "$R/ollama-models/blobs" "$(dirname "$R/ollama-models/$manifest")"
cp "$OLLAMA_MODELS/$manifest" "$R/ollama-models/$manifest"
for digest in $(grep -oE 'sha256:[0-9a-f]{64}' "$OLLAMA_MODELS/$manifest" | sort -u); do
  cp -c "$OLLAMA_MODELS/blobs/${digest/:/-}" "$R/ollama-models/blobs/"
done

step "Precompile Python, then sign"
"$R/python/bin/python3" -m compileall -q -j 0 "$R/app" "$R/site-packages" >/dev/null 2>&1 || true
codesign --force --deep --sign - "$APP"

step "Done"
du -sh "$APP"
echo "$APP"
