#!/bin/zsh
# Start God Terminal, then open http://localhost:8765
cd "${0:A:h}"
mkdir -p ~/.cache/god-terminal
ln -sfn "$PWD/.venv/lib/python3.12/site-packages/espeakng_loader/espeak-ng-data" ~/.cache/god-terminal/espeak-ng-data
pgrep -x ollama >/dev/null || (ollama serve >/dev/null 2>&1 &)
exec .venv/bin/python server.py
