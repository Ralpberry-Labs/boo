# God Terminal

Talk to an AI out loud, entirely on your Mac. It listens, answers in a natural voice like a calm,
therapist-style companion, and paints what it says as a living dot-grid: the picture morphs 2-3 times
per sentence, exactly as each word is spoken, with word-by-word captions and emojis.
While it thinks, the dots float like a genie and "brainstorm" through dreamy shapes.

Everything runs locally. No cloud APIs.

| Step | Model | Runs on |
|---|---|---|
| Hearing | Whisper large-v3-turbo (`mlx-community/whisper-large-v3-turbo`) | MLX |
| Thinking | Gemma 4 8B (`gemma4:latest`) | Ollama |
| Voice | Kokoro-82M (`mlx-community/Kokoro-82M-bf16`), with per-word timestamps | MLX |
| Pictures | spaCy + emojilib keywords, matched to the spoken words | CPU |

A turn takes about 3-4 s on an M5 Pro (hear ~0.5 s, think ~1.5-2 s, voice ~1 s).

## Setup

Needs an Apple Silicon Mac, Python 3.12, [uv](https://docs.astral.sh/uv/), ffmpeg and [Ollama](https://ollama.com).

```bash
uv venv -p 3.12 .venv
uv pip install -p .venv/bin/python -r requirements.txt
ollama pull gemma4
```

The Whisper and Kokoro weights download from Hugging Face on first start.

## Run

```bash
./run.sh
```

Then open http://localhost:8765 in Chrome or Safari and allow the microphone.
Tap the mic (or hold Space) and talk; it stops when you pause. Tick **Hands-free** for a back-and-forth conversation.

Settings via environment variables: `LLM_MODEL`, `STT_MODEL`, `TTS_MODEL`, `VOICE` (Kokoro voice, default `af_heart`), `OLLAMA_URL`.

## Files

- `server.py` - FastAPI server: speech-to-text, chat, text-to-speech with word timings, echo and silence filtering
- `pictures.py` - picks 2-3 picturable words per sentence and matches each to an emoji
- `index.html` - the page: mic capture, particle morphs, thinking animation, captions
- `emoji-keywords.json` - emoji keyword list from [emojilib](https://github.com/muan/emojilib) (MIT)

## License

Proprietary. Copyright (c) 2026 Ralpberry Labs. All rights reserved.
Third-party components are listed in `THIRD_PARTY_NOTICES.md`.
