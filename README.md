# अङ्ग्रेजी सिकौं (Let's learn English)

A small English course for a Nepali-speaking beginner, taught in Nepali (Devanagari). It's a plain HTML/CSS/JS app that installs on an Android phone's home screen and works offline.

- 6 units and 51 lessons, from "Hello!" to a full conversation with a new friend. Each lesson goes: learn cards, a grammar corner, a "say it 3 times" speaking drill, a role-play conversation (in the last lesson of each unit), then a quiz.
- Spaced repetition: every phrase becomes a card (Leitner boxes of 1, 2, 4, 7, 15, 30 and 60 days). Due cards are reviewed at the start of the next lesson and graded automatically from the answers.
- Audio uses the phone's own text-to-speech. It prefers a female Indian English voice, which can be changed under ⚙️. Speaking drills use Android speech recognition when it's available, plus a "✓ मैले भनेँ" (I said it) button and a record-and-play-back button.
- Progress is saved on the phone only (localStorage). ⚙️ → ब्याकअप gives a code to move progress to a new phone.

## Files
- `lessons/uN.json`: lesson content, one file per unit. The format is documented at the top of `build.py`.
- `build.py`: validates the lessons, writes `lessons.js` and bumps the offline-cache version in `sw.js`. Run it after every change: `python build.py`.
- `index.html`, `app.css`, `app.js`: the app.
- `manifest.webmanifest`, `sw.js`, `icons/`: the installable app (PWA) and offline cache.

## Testing
- Self-test: open `index.html?test=1`. It plays through every lesson, checks the SRS schedule and the backup round trip, then writes PASS/FAIL into `#selftest`.
  `msedge --headless=new --virtual-time-budget=8000 --dump-dom "file:///E:/workspace/mum-english/index.html?test=1"`
- Jump to a screen for screenshots: `?go=list`, `?go=settings`, `?go=lesson:u1l2:build`, `?go=lesson:u1l2:reply:wrong`.

## Deploy
The site is static, so any https host works (GitHub Pages: Settings → Pages → deploy from branch `main`, folder `/`). After deploying, open the URL in Chrome on the phone, then tap ⋮ → "Install app" / "Add to Home screen".
