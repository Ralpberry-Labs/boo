"""Starts Boo inside the macOS app: the bundled Ollama (Gemma 4) and the speech server, on free local ports.

Prints "BOO_READY <port>" once every model is warmed up, so the window knows when to load the page.
"""
import os
import pathlib
import signal
import site
import socket
import subprocess
import sys
import threading
import time
import urllib.request

RES = pathlib.Path(os.environ["BOO_RESOURCES"])
PARENT = int(os.environ.get("BOO_PARENT_PID", "0"))

os.setpgrp()  # lead a process group so the app can stop us and Ollama together
site.addsitedir(str(RES / "site-packages"))


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def stop(*_):
    try:
        ollama.terminate()
    finally:
        os._exit(0)


# espeak (used by the Kokoro voice) can't take its data from a path with spaces, like "Boo.app"
espeak = pathlib.Path.home() / ".cache/boo-app/espeak-ng-data"
espeak.parent.mkdir(parents=True, exist_ok=True)
if espeak.is_symlink() or espeak.exists():
    espeak.unlink()
espeak.symlink_to(RES / "site-packages/espeakng_loader/espeak-ng-data")

ollama_port, app_port = free_port(), free_port()
ollama = subprocess.Popen(
    [str(RES / "ollama/ollama"), "serve"],
    env=dict(os.environ, OLLAMA_HOST=f"127.0.0.1:{ollama_port}", OLLAMA_MODELS=str(RES / "ollama-models"),
             OLLAMA_NOPRUNE="1", OLLAMA_KEEP_ALIVE="30m"),
    stdout=sys.stderr, stderr=sys.stderr,
)
signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)

for _ in range(120):
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{ollama_port}/api/version", timeout=1)
        break
    except OSError:
        time.sleep(0.5)

os.environ.update(
    OLLAMA_URL=f"http://127.0.0.1:{ollama_port}", PORT=str(app_port), ESPEAK_DATA_PATH=str(espeak),
    HF_HOME=str(RES / "hf"), HF_HUB_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1", PYTHONDONTWRITEBYTECODE="1",
)
sys.dont_write_bytecode = True


def watch():
    """Tell the window when the server answers; shut down if the app disappears."""
    announced = False
    while True:
        if not announced:
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{app_port}/", timeout=1)
                print(f"BOO_READY {app_port}", flush=True)
                announced = True
            except OSError:
                pass
        if PARENT and os.getppid() != PARENT:
            stop()
        time.sleep(0.5)


threading.Thread(target=watch, daemon=True).start()

try:
    import uvicorn  # noqa: E402

    import server  # noqa: E402
except BaseException:
    ollama.terminate()
    raise

try:
    uvicorn.run(server.app, host="127.0.0.1", port=app_port, log_level="warning")
finally:
    stop()
