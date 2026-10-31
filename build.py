"""Validate the lessons and bundle them into lessons.js.

Usage: python build.py
Input:  lessons/uN.json, one file per unit (lessons in order)
Output: lessons.js (window.UNITS, window.LESSONS, window.APP_VERSION) and a new cache version in sw.js

Unit file: {"unit": 1, "title_ne", "title_en", "emoji", "lessons": [lesson, ...]}
Lesson:
  id, title_ne, title_en, emoji, intro (Nepali sentence)
  items:   [[id, english, devanagari pronunciation, nepali meaning, emoji, note?, {extras}?], ...]
           pronunciation: **x** marks the stressed syllable
           extras: alt [other accepted English answers], syl "**ऍ**·पल" (syllables), tip (mouth tip),
                   w false (do not ask her to type this one, e.g. when the Nepali allows many translations)
  contractions: true on the lesson that teaches isn't, I'm, don't ...; no contraction may appear before it
  grammar: {title, lines[], table?[[english, nepali]], ex?[[english, nepali]]}   (optional)
  speak:   [item ids] for the "repeat 3 times" drill (default: first 3 multi-word items)
  quiz:    authored questions, added after the automatic ones:
           ["build", english sentence, nepali, [extra wrong tiles]?]
           ["gap", "My ___ is Sita.", answer, [wrong options], nepali?]
           ["reply", question asked, right reply, [wrong replies], question in nepali?]
           ["mc", question in nepali, answer, [wrong options], english to play?]
           ["write", nepali, english, [other accepted answers]?]   she types the English
           ["dict", english, nepali?, [other accepted answers]?]   she hears it and types it
  Every lesson needs 3 typing questions in total: authored "write" ones plus items she can type
  (sentences of 2 to 10 words without w:false).
  talk:    [[who, english, pronunciation, nepali], ...]  who "Y" is the learner (optional)
  people:  {who: label} for the talk; talk_ne: instruction line for the talk
"""
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
DEV = re.compile("[" + chr(0x0900) + "-" + chr(0x097F) + "]")


def tokens(s):
    return [re.sub("[.,!?]+$", "", w) for w in s.split() if w]


CONTR = re.compile(r"\b([A-Za-z]+)'(t|m|re|s|ll|ve|d)\b")
CONTR_S = {"it", "that", "what", "where", "there", "he", "she", "who", "let", "here"}


def contractions(text):
    """Contractions in a sentence; a possessive 's (mother's) is not one."""
    return [m.group(0) for m in CONTR.finditer(text) if m.group(2) != "s" or m.group(1).lower() in CONTR_S]


def main():
    errs, units, lessons = [], [], []
    files = sorted((HERE / "lessons").glob("u*.json"), key=lambda p: int(re.sub("[^0-9]", "", p.stem) or 0))
    ids = set()
    taught = False  # has the contractions lesson come yet?
    for f in files:
        try:
            u = json.loads(f.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            sys.exit(f"{f.name}: invalid JSON: {e}")
        units.append({k: u[k] for k in ("title_ne", "title_en", "emoji")} | {"n": u["unit"]})
        for raw in u["lessons"]:
            w = f"{f.name} {raw.get('id')}"
            if raw.get("id") in ids:
                errs.append(f"{w}: duplicate lesson id")
            ids.add(raw.get("id"))
            for k in ("id", "title_ne", "title_en", "emoji", "items"):
                if not raw.get(k):
                    errs.append(f"{w}: missing {k}")
            L = {k: raw[k] for k in ("id", "title_ne", "title_en", "emoji") if k in raw}
            L["unit"] = u["unit"]
            for k in ("intro", "grammar", "speak", "people", "talk_ne"):
                if k in raw:
                    L[k] = raw[k]
            items, iids = [], set()
            for it in raw.get("items", []):
                if len(it) < 5:
                    errs.append(f"{w}: short item {it}")
                    continue
                iid, en, pr, ne, em = it[:5]
                extra = it[-1] if isinstance(it[-1], dict) else {}
                if iid in iids:
                    errs.append(f"{w}: duplicate item id {iid}")
                iids.add(iid)
                if not DEV.search(pr):
                    errs.append(f"{w} {iid}: pronunciation is not Devanagari: {pr}")
                if not DEV.search(ne):
                    errs.append(f"{w} {iid}: meaning is not Nepali: {ne}")
                d = {"id": iid, "en": en, "pron": pr, "ne": ne, "emoji": em}
                if len(it) > 5 and isinstance(it[5], str) and it[5]:
                    d["note"] = it[5]
                for k in ("alt", "syl", "tip", "w"):
                    if k in extra:
                        d[k] = extra[k]
                unknown = set(extra) - {"alt", "syl", "tip", "w"}
                if unknown:
                    errs.append(f"{w} {iid}: unknown extras {unknown}")
                items.append(d)
            L["items"] = items
            if len({i["en"] for i in items}) != len(items):
                errs.append(f"{w}: two items share the same English")
            if len({i["ne"] for i in items}) != len(items):
                errs.append(f"{w}: two items share the same Nepali")
            for sid in raw.get("speak", []):
                if sid not in iids:
                    errs.append(f"{w}: speak id {sid} is not an item")
            g = raw.get("grammar")
            if g and not g.get("title"):
                errs.append(f"{w}: grammar without title")
            quiz = []
            for q in raw.get("quiz", []):
                t = q[0]
                if t == "build":
                    d = {"t": "build", "en": q[1], "ne": q[2]}
                    if len(q) > 3 and q[3]:
                        d["extra"] = q[3]
                    if len(tokens(q[1])) < 2 or len(tokens(q[1])) > 10:
                        errs.append(f"{w}: build sentence length {q[1]}")
                elif t == "gap":
                    if "___" not in q[1]:
                        errs.append(f"{w}: gap without ___: {q[1]}")
                    # "—" = no word needed (no article)
                    full = re.sub(r"\s*___\s*", " ", q[1]).strip() if q[2] == "—" else q[1].replace("___", q[2])
                    full = full[:1].upper() + full[1:]
                    d = {"t": "gap", "text": q[1], "ans": q[2], "opts": [q[2]] + q[3], "full": full}
                    if len(q) > 4 and q[4]:
                        d["ne"] = q[4]
                elif t == "reply":
                    d = {"t": "reply", "ask": q[1], "ans": q[2], "opts": [q[2]] + q[3]}
                    if len(q) > 4 and q[4]:
                        d["ask_ne"] = q[4]
                elif t == "mc":
                    d = {"t": "mc", "q": q[1], "ans": q[2], "opts": [q[2]] + q[3]}
                    if len(q) > 4 and q[4]:
                        d["say"] = q[4]
                elif t == "write":
                    d = {"t": "write", "ne": q[1], "en": q[2], "alt": q[3] if len(q) > 3 else []}
                    if not DEV.search(q[1]):
                        errs.append(f"{w}: write prompt is not Nepali: {q[1]}")
                elif t == "dict":
                    d = {"t": "dict", "en": q[1], "ne": q[2] if len(q) > 2 else "", "alt": q[3] if len(q) > 3 else []}
                else:
                    errs.append(f"{w}: unknown quiz type {t}")
                    continue
                if "opts" in d:
                    if len(set(d["opts"])) != len(d["opts"]):
                        errs.append(f"{w}: duplicate options {d['opts']}")
                    if len(d["opts"]) < 2:
                        errs.append(f"{w}: too few options {d['opts']}")
                quiz.append(d)
            L["quiz"] = quiz
            if raw.get("talk"):
                L["talk"] = [{"who": a, "en": b, "pron": c, "ne": n} for a, b, c, n in raw["talk"]]
                for ln in L["talk"]:
                    if ln["who"] != "Y" and ln["who"] not in raw.get("people", {}):
                        errs.append(f"{w}: talk speaker {ln['who']} not in people")
                    if not DEV.search(ln["pron"]) or not DEV.search(ln["ne"]):
                        errs.append(f"{w}: talk line missing Devanagari: {ln['en']}")
                if not any(ln["who"] == "Y" for ln in L["talk"]):
                    errs.append(f"{w}: talk has no learner lines")
            # no contractions before the lesson that teaches them
            if raw.get("contractions"):
                taught = True
            if not taught:
                texts = [i["en"] for i in items] + [a for i in items for a in i.get("alt", [])]
                texts += [ln["en"] for ln in L.get("talk", [])]
                for q in quiz:
                    texts += [q.get(k, "") for k in ("en", "text", "ask", "ans", "full")] + q.get("opts", []) + q.get("alt", [])
                g = L.get("grammar") or {}
                texts += [r[0] for r in g.get("table", [])] + [e[0] for e in g.get("ex", [])] + g.get("lines", [])
                found = sorted({c for x in texts for c in contractions(x)})
                if found:
                    errs.append(f"{w}: contractions before they are taught: {found}")
            # enough typing practice
            n_write = sum(q["t"] == "write" for q in quiz)
            n_typable = sum(1 for i in items if 2 <= len(tokens(i["en"])) <= 10 and i.get("w") is not False)
            if n_write + n_typable < 3:
                errs.append(f"{w}: needs 3 typing questions (has {n_write} write + {n_typable} typable items)")
            lessons.append(L)
    if errs:
        print("\n".join(errs))
        sys.exit(f"{len(errs)} problem(s)")
    data = json.dumps(lessons, ensure_ascii=False, separators=(",", ":"))
    unit_js = json.dumps(units, ensure_ascii=False, separators=(",", ":"))
    assets = "".join((HERE / n).read_text(encoding="utf-8") for n in ("index.html", "app.css", "app.js")) + data
    ver = hashlib.sha1(assets.encode("utf-8")).hexdigest()[:8]
    (HERE / "lessons.js").write_text(
        f"window.APP_VERSION='{ver}';\nwindow.UNITS={unit_js};\nwindow.LESSONS={data};\n", encoding="utf-8")
    sw = HERE / "sw.js"
    sw.write_text(re.sub("const V = '[^']*';", f"const V = 'me-{ver}';", sw.read_text(encoding="utf-8")), encoding="utf-8")
    n_items = sum(len(L["items"]) for L in lessons)
    n_quiz = sum(len(L["quiz"]) for L in lessons)
    print(f"ok: {len(units)} units, {len(lessons)} lessons, {n_items} items, {n_quiz} authored questions, version {ver}")


if __name__ == "__main__":
    main()
