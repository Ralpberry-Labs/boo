# Boo 👻

Talk to an AI out loud, entirely on your Mac. Boo listens, answers in a natural voice like a calm,
caring companion, and paints what it says as a living dot grid: the picture morphs 2-3 times per
sentence, exactly as each word is spoken, with word-by-word captions and emojis. While it thinks,
the dots float like a ghost and "brainstorm" through dreamy shapes.

**It works like a voice call.** Boo starts listening as soon as it opens, answers, and listens again, with no
buttons. Talk over her (or tap her) to cut in, just like ChatGPT's voice mode.

**Pick an avatar** under the mic:
- **Her** (default): a drawn character turned into dots and brought to life: she breathes, sways, blinks, lip-syncs
  every word, blushes, nods on the beat, her hair ripples, sound rings pulse while you talk, the brainstorm floats in a
  thought cloud while she thinks, and each picture appears where she is looking.
- **Genie**: a procedurally animated dot genie who gestures, cups an ear while you talk, taps her chin while she
  thinks, conjures pictures from her palm, and fidgets when idle.
- **Classic dots**: just the morphing pictures.

Free, local and open source. No cloud APIs, no account, nothing leaves your Mac.

Real-time diffusion video models are beautiful, but too heavy to run comfortably on a laptop.
Boo goes the other way: instead of generating pixels, it samples emoji into a grid of dots and
morphs between them, so the pictures are instant and the whole thing runs on the Mac you have.

| Step | Model | Runs on |
|---|---|---|
| Hearing | Whisper large-v3-turbo (`mlx-community/whisper-large-v3-turbo`) | MLX |
| Thinking | Gemma 4 8B (`gemma4:latest`) | Ollama |
| Voice | Kokoro-82M (`mlx-community/Kokoro-82M-bf16`), with per-word timestamps | MLX |
| Pictures | spaCy + emojilib keywords, matched to the spoken words | CPU |

A turn takes about 2-4 s on an M5 Pro (hear ~0.5 s, think ~1 s, voice ~1 s).

## Run from source

Needs an Apple Silicon Mac, Python 3.12, [uv](https://docs.astral.sh/uv/) and [Ollama](https://ollama.com).

```bash
uv venv -p 3.12 .venv
uv pip install -p .venv/bin/python -r requirements.txt
ollama pull gemma4
./run.sh
```

Open http://localhost:8765 in Chrome or Safari and allow the microphone. The Whisper and Kokoro
weights download from Hugging Face on first start. Tap the mic (or hold Space) and talk; it stops
when you pause. Tick **Hands-free** for a back-and-forth conversation.

Settings via environment variables: `LLM_MODEL`, `STT_MODEL`, `TTS_MODEL`, `VOICE` (Kokoro voice,
default `af_heart`), `OLLAMA_URL`, `PORT`.

## Build the Mac app

`macos/build.sh` makes `dist/Boo.app`: a native window with Python, every model and the Ollama
runtime bundled inside, so it runs with no setup. It needs the source setup above (run Boo once so
the models are downloaded), Ollama.app with `gemma4` pulled, and the Xcode command line tools.

```bash
macos/build.sh
open dist/Boo.app
```

The bundle is about 15 GB. On the build Mac, models are copied as APFS clones and take almost no
extra disk. Logs go to `~/Library/Logs/Boo.log`.

## Files

- `server.py`: FastAPI server: speech-to-text, chat, text-to-speech with word timings, echo and silence filtering
- `pictures.py`: picks 2-3 picturable words per sentence and matches each to an emoji
- `index.html`: the page: mic capture, particle morphs, thinking animation, captions
- `static/portrait.js`, `static/portrait.png`: the portrait avatar and its drawing (background removed)
- `static/avatar.js`: the dot renderer both avatars share, and the genie: a procedural rig (springs, two-bone arms, blinks, visemes)
- `emoji-keywords.json`: emoji keyword list from [emojilib](https://github.com/muan/emojilib)
- `static/fonts/`: Nunito, bundled so the app works offline
- `macos/`: the native app shell (`Boo.swift`), its launcher (`boot.py`), icon and build script

## License

MIT, see `LICENSE`. Made by Ralpberry Labs. Third-party components and model licenses are listed
in `THIRD_PARTY_NOTICES.md`.
