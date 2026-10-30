#!/bin/zsh
# Start Boo, then open http://localhost:8765
cd "${0:A:h}"
mkdir -p ~/.cache/boo
ln -sfn "$PWD/.venv/lib/python3.12/site-packages/espeakng_loader/espeak-ng-data" ~/.cache/boo/espeak-ng-data
pgrep -x ollama >/dev/null || (ollama serve >/dev/null 2>&1 &)
exec .venv/bin/python server.py
