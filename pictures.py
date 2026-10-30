"""Pick 2-3 picturable words per sentence from Dot's reply and match each to an emoji, locally.

Uses spaCy to find meaningful words and the emojilib keyword list (emoji-keywords.json) to find a picture.
"""
import json
import pathlib
from collections import Counter

import spacy

HERE = pathlib.Path(__file__).parent

# Words that come up a lot in heartfelt conversation, where emojilib's own pick is weak or missing.
EXTRA = {
    "stress": "😣", "stressed": "😣", "pressure": "🗜️", "anxious": "😰", "anxiety": "😰", "worry": "😟",
    "worried": "😟", "calm": "😌", "peace": "🕊️", "peaceful": "🕊️", "lonely": "🥀", "loneliness": "🥀",
    "alone": "🧍", "sad": "😢", "sadness": "😢", "tired": "😴", "exhausted": "😩", "rest": "🛌",
    "sleep": "😴", "breathe": "🌬️", "breath": "🌬️", "heavy": "🏋️", "weight": "🏋️", "burden": "🎒",
    "carry": "🎒", "light": "💡", "hope": "🌈", "feel": "💗", "feeling": "💗", "heart": "❤️", "love": "💞",
    "mind": "🧠", "think": "💭", "thought": "💭", "talk": "💬", "listen": "👂", "time": "⏳", "work": "💼",
    "job": "💼", "boss": "👔", "task": "📋", "friend": "🫂", "family": "👨‍👩‍👧", "home": "🏡", "city": "🏙️",
    "grow": "🌱", "growth": "🌱", "step": "👣", "path": "🛤️", "journey": "🧭", "change": "🔄", "pause": "⏸️",
    "break": "☕", "storm": "⛈️", "fog": "🌫️", "river": "🏞️", "ocean": "🌊", "wave": "🌊", "stone": "🪨",
    "knot": "🪢", "anger": "😠", "angry": "😠", "fear": "😨", "scared": "😨", "happy": "😊", "joy": "😄",
    "proud": "🥹", "safe": "🛡️", "strength": "💪", "strong": "💪", "energy": "⚡", "space": "🌌",
    "direction": "🧭", "question": "❓", "answer": "💡", "moment": "⏱️", "day": "☀️", "night": "🌙",
    "week": "📅", "chest": "🫁", "tear": "💧", "cry": "😢", "smile": "😊", "goal": "🎯", "dream": "🌠",
    "ball": "⚽", "pocket": "👖", "eye": "👀", "tea": "🍵", "coffee": "☕", "cup": "☕", "sun": "☀️",
    "rain": "🌧️", "tree": "🌳", "flower": "🌸", "seed": "🌱", "mountain": "⛰️", "beach": "🏖️", "boat": "⛵",
    "body": "🧍", "attention": "👀", "exhausting": "😩", "draining": "🪫", "drained": "🪫", "commitment": "📅",
    "wind": "🌬️", "quiet": "🤫", "silence": "🤫", "earth": "🌍", "lamp": "🪔", "backpack": "🎒", "fire": "🔥",
    "garden": "🌻", "bridge": "🌉", "door": "🚪", "window": "🪟", "road": "🛣️", "ground": "🌍", "nature": "🌿",
    "settle": "🍂", "lift": "🎈", "pile": "📚", "hold": "🤲", "hand": "🤲", "shoulder": "💆", "music": "🎵",
}
SKIP = {"thing", "way", "lot", "part", "kind", "sort", "bit", "something", "anything", "everything",
        "sound", "seem", "make", "get", "go", "say", "know", "want", "need", "let", "take", "come", "like",
        "be", "have", "do", "right", "good", "little", "much", "many", "more", "most", "one", "point", "wear", "new", "person", "show", "small", "big", "different", "catch", "find", "look", "tend", "try", "keep", "describe", "feel", "blow", "source", "recently", "lately"}
WEIGHT = {"NOUN": 3, "PROPN": 2, "ADJ": 2, "VERB": 1}

nlp = spacy.load("en_core_web_sm", disable=["ner"])


def _build_index() -> dict[str, str]:
    data = json.loads((HERE / "emoji-keywords.json").read_text())
    counts = Counter(k for kws in data.values() for k in kws)
    index: dict[str, str] = {}
    for tier in range(3):
        for emoji, kws in data.items():
            name = kws[0].split("_")
            for word in ([kws[0]] if len(name) == 1 else []) if tier == 0 else \
                        [name[-1]] if tier == 1 else [k for k in kws[1:] if counts[k] <= 6]:
                if "_" not in word and word.isalpha():
                    index.setdefault(word.lower(), emoji)
    index.update(EXTRA)
    return index


INDEX = _build_index()


def lookup(token) -> str | None:
    for w in (token.lemma_.lower(), token.text.lower()):
        if w in SKIP or len(w) < 3:
            return None
        if w in INDEX:
            return INDEX[w]
    return None


def pick(reply: str, per_sentence: int = 3) -> list[dict]:
    """[{word, emoji}] in spoken order, at most `per_sentence` per sentence, best words first."""
    out, last, used = [], None, set()
    for sent in nlp(reply).sents:
        cands = []
        for tok in sent:
            if tok.pos_ in WEIGHT and not tok.is_stop and (emoji := lookup(tok)):
                score = WEIGHT[tok.pos_] + (1 if tok.lemma_.lower() in EXTRA else 0)
                cands.append((score, tok.i, tok.text, emoji))
        best, seen = [], set()
        for c in sorted(cands, key=lambda c: (c[3] in used, -c[0], c[1])):
            if c[3] not in seen and len(best) < per_sentence:
                best.append(c); seen.add(c[3])
        for _, _, word, emoji in sorted(best, key=lambda c: c[1]):
            if emoji != last:
                out.append({"word": word, "emoji": emoji}); last = emoji; used.add(emoji)
    return out


if __name__ == "__main__":
    for t in ["It sounds like the weight of things at work feels heavy right now. Like carrying a collection of stones in your pockets. What has been feeling the most burdensome for you lately?",
              "It must feel like the river of tasks never slows down for you. Being constantly pulled in different directions can wear a person out. Where in your day does that feeling of needing a pause show up the most?",
              "It sounds like your heart feels a little adrift, like a boat on a wide, unfamiliar river. What is one small thing in this new city that has caught your eye recently?",
              "Cats love napping in a sunny window with a ball of yarn."]:
        print([(p["word"], p["emoji"]) for p in pick(t)])
