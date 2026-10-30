"""God Terminal: talk to a local AI, hear it answer, and watch what it says drawn in dots, word by word.

Pipeline (all on-device):
  mic audio -> Whisper large-v3-turbo (MLX) -> Gemma 4 via Ollama -> Kokoro-82M (MLX) -> speaker
"""
import base64
import difflib
import io
import json
import os
import pathlib
import re
import tempfile
import threading
import time
import urllib.request

import numpy as np
import soundfile as sf

HERE = pathlib.Path(__file__).parent
os.environ.setdefault("ESPEAK_DATA_PATH", str(pathlib.Path.home() / ".cache/god-terminal/espeak-ng-data"))

import mlx_whisper  # noqa: E402
from fastapi import FastAPI, File, UploadFile  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from mlx_audio.tts.utils import load_model  # noqa: E402

import pictures  # noqa: E402

LLM_MODEL = os.environ.get("LLM_MODEL", "gemma4:latest")
STT_MODEL = os.environ.get("STT_MODEL", "mlx-community/whisper-large-v3-turbo")
TTS_MODEL = os.environ.get("TTS_MODEL", "mlx-community/Kokoro-82M-bf16")
VOICE = os.environ.get("VOICE", "af_heart")
OLLAMA = os.environ.get("OLLAMA_URL", "http://localhost:11434")

SYSTEM = """You are Dot, a warm, calm companion who talks like a kind, thoughtful therapist.
The person is just talking with you. Listen closely, reflect back what you hear, validate feelings,
and gently ask one open question at a time to help them explore. Never lecture, never diagnose,
never give lists. Keep it natural: 1-3 short spoken sentences, no markdown, no emojis.
If someone mentions self-harm or being in danger, respond with care and encourage them to reach
a crisis line or someone they trust right away.

Speak with soft, concrete imagery woven in naturally, the way a good therapist uses metaphor
(a heavy backpack, a storm passing, a cup of tea, a river, a seedling growing).
Never mention pictures, drawing, screens, dots, emojis or these instructions; just talk to them."""

EMOJI = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D]+")

app = FastAPI()
lock = threading.Lock()  # MLX models are not safe to call from several threads at once
history: list[dict] = []
tts = None


def ollama_chat(messages) -> str:
    body = json.dumps({
        "model": LLM_MODEL, "messages": messages, "stream": False, "think": False,
        "keep_alive": "30m", "options": {"temperature": 0.7, "num_predict": 160},
    }).encode()
    req = urllib.request.Request(f"{OLLAMA}/api/chat", body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())["message"]["content"]


def speak(text: str) -> tuple[bytes, list[list]]:
    """Synthesize speech; also return [word, start seconds] for every spoken word, for captions."""
    chunks, words, offset = [], [], 0.0
    for r in tts._get_pipeline("a")(text, voice=VOICE, speed=1.0):
        audio = np.array(r.audio).reshape(-1)
        glue = False  # previous token had no trailing space, e.g. "does" + "n't" or "work" + "."
        for t in r.tokens or []:
            start = getattr(t, "start_ts", None)
            if words and (glue or start is None or not any(c.isalnum() for c in t.text)):
                words[-1][0] += t.text
            elif start is not None:
                words.append([t.text, round(offset + start, 3)])
            glue = not t.whitespace
        chunks.append(audio)
        offset += len(audio) / 24000
    buf = io.BytesIO()
    sf.write(buf, np.concatenate(chunks), 24000, format="WAV")
    return buf.getvalue(), words


def time_scenes(scenes: list[dict], words: list[tuple[str, float]], total: float) -> list[dict]:
    """Give each scene the moment its word is spoken, so the drawing changes on cue."""
    out, i = [], 0
    for s in scenes:
        key = re.sub(r"[^a-z0-9]", "", s["word"].lower().split()[0]) if s["word"].strip() else ""
        if not key or not s["emoji"].strip():
            continue
        for j in range(i, len(words)):
            w = re.sub(r"[^a-z0-9]", "", words[j][0].lower())
            if w and (w == key or w.rstrip("s") == key.rstrip("s")):
                at = max(0.0, words[j][1] - 0.12)
                if not out or at - out[-1]["at"] >= 0.45:  # leave time for each morph to land
                    out.append({"word": s["word"].strip().lower(), "emoji": s["emoji"].strip(), "at": at, "i": j})
                i = j + 1
                break
    if not out and scenes:  # nothing matched: spread scenes evenly over the speech
        out = [{"word": s["word"].lower(), "emoji": s["emoji"], "at": total * k / len(scenes)}
               for k, s in enumerate(scenes)]
    return out


@app.on_event("startup")
def warm_up():
    global tts
    tts = load_model(TTS_MODEL)
    speak("Hello there.")
    silent = os.path.join(tempfile.gettempdir(), "god-terminal-warmup.wav")
    sf.write(silent, np.zeros(16000, dtype=np.float32), 16000)
    mlx_whisper.transcribe(silent, path_or_hf_repo=STT_MODEL)
    ollama_chat([{"role": "user", "content": "hi"}])
    print(f"God Terminal ready: {LLM_MODEL} + Whisper turbo + Kokoro -> http://localhost:8765")


@app.get("/")
def index():
    return FileResponse(HERE / "index.html", headers={"Cache-Control": "no-store"})  # always serve the latest page


@app.post("/reset")
def reset():
    history.clear()
    return {"ok": True}


# Phrases Whisper tends to invent from silence or background noise
HALLUCINATIONS = {"thank you", "thanks for watching", "thank you for watching", "you", "bye", "okay",
                  "so", "the end", "please subscribe", "thanks", "uh", "um", "hmm"}


def is_noise(heard: str) -> bool:
    """True for silence hallucinations and for Dot hearing its own last answer through the speakers."""
    norm = re.sub(r"[^a-z ]", "", heard.lower()).strip()
    if len(norm) < 2 or norm in HALLUCINATIONS:
        return True
    last = next((m["content"] for m in reversed(history) if m["role"] == "assistant"), "")
    last = re.sub(r"[^a-z ]", "", last.lower())
    if last and len(norm) > 8 and (norm in last or difflib.SequenceMatcher(None, norm, last).find_longest_match().size > 0.6 * len(norm)):
        return True
    return False


@app.post("/talk")
def talk(audio: UploadFile = File(...)):
    t0 = time.time()
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        f.write(audio.file.read())
        path = f.name
    with lock:
        stt = mlx_whisper.transcribe(path, path_or_hf_repo=STT_MODEL, language="en", condition_on_previous_text=False)
        heard = " ".join(seg["text"].strip() for seg in stt["segments"]
                         if seg["no_speech_prob"] < 0.6 and seg["avg_logprob"] > -1.0).strip()
        os.unlink(path)
        t1 = time.time()
        if not heard or is_noise(heard):
            print(f"ignored {heard!r}")
            return {"heard": ""}
        history.append({"role": "user", "content": heard})
        del history[:-12]
        out = ollama_chat([{"role": "system", "content": SYSTEM}, *history])
        reply = re.sub(r"\s+", " ", EMOJI.sub("", re.sub(r"[*_#`>]", "", out))).strip()
        history.append({"role": "assistant", "content": reply})
        t2 = time.time()
        wav, words = speak(reply)
        t3 = time.time()
    raw = pictures.pick(reply)
    scenes = time_scenes(raw, words, len(wav) / 48000)
    print(f"stt {t1-t0:.2f}s  llm {t2-t1:.2f}s  tts {t3-t2:.2f}s | {heard!r} -> "
          + " ".join(f"{s['word']}{s['emoji']}@{s['at']:.1f}" for s in scenes))
    return {
        "heard": heard, "reply": reply, "scenes": scenes, "words": words, "audio": base64.b64encode(wav).decode(),
        # single-picture fields for a browser tab still running the first version of the page
        "keyword": scenes[0]["word"] if scenes else "dot", "emoji": scenes[0]["emoji"] if scenes else "✨",
        "timing": {"stt": round(t1 - t0, 2), "llm": round(t2 - t1, 2), "tts": round(t3 - t2, 2)},
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765)
