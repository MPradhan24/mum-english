/* अङ्ग्रेजी सिकौं: a Nepali-medium English course for beginners.
   Plain JS, no libraries. Lesson data comes from lessons.js (built by build.py).
   Progress lives in localStorage on this phone only. */
(function () {
  'use strict';

  const LESSONS = window.LESSONS || [];
  const UNITS = window.UNITS || [];
  const params = new URLSearchParams(location.search);
  const TEST = params.has('test');
  const KEY = TEST ? 'mum-english-test' : 'mum-english-v2';
  const OLD_KEY = 'mum-english-v1';
  const PASS = 0.8; // share of quiz questions right on the first try needed to pass a lesson
  const INTERVALS = [1, 2, 4, 7, 15, 30, 60];
  const app = document.getElementById('app');

  // ---------- small helpers
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pron = s => esc(s).replace(/[*][*](.+?)[*][*]/g, '<b>$1</b>');
  const nn = n => String(n); // plain digits: she reads these on her phone every day
  const pickOne = a => a[Math.floor(Math.random() * a.length)];
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const tokens = s => String(s).split(' ').filter(Boolean).map(w => w.replace(/[.,!?]+$/, ''));
  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
    'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function numWords(n) {
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
    if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numWords(n % 100) : '');
    if (n < 100000) return numWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + numWords(n % 1000) : '');
    return String(n);
  }
  function words(s) {
    return String(s).toLowerCase().replace(/[0-9]+/g, m => ' ' + numWords(+m) + ' ').replace(/[^a-z' ]+/g, ' ')
      .split(' ').filter(Boolean).map(w => w.replace(/'/g, ''));
  }
  function lev(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  // ---------- comparing English sentences
  const CONTR = {
    "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not', "don't": 'do not', "doesn't": 'does not',
    "didn't": 'did not', "can't": 'cannot', "won't": 'will not', "haven't": 'have not', "hasn't": 'has not', "couldn't": 'could not',
    "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are', "he's": 'he is', "she's": 'she is', "it's": 'it is',
    "that's": 'that is', "what's": 'what is', "where's": 'where is', "there's": 'there is', "who's": 'who is', "here's": 'here is',
    "i'll": 'i will', "you'll": 'you will', "we'll": 'we will', "they'll": 'they will', "he'll": 'he will', "she'll": 'she will',
    "i've": 'i have', "we've": 'we have', "let's": 'let us', "i'd": 'i would',
  };
  // Grammar words must be exactly right; a typo is forgiven only in longer content words.
  const FUNC = new Set(('i you he she it we they me him us them my your his her its our their a an the is am are was were be ' +
    'do does did not no in on at to for of from with by this that these those and but or so if can will would could have has had ' +
    'what where who when why how there here some any').split(' '));
  // a sentence as a list of lower-case words: contractions expanded, digits as words, punctuation dropped
  function norm(s) {
    const w = String(s).toLowerCase().replace(/[’‘`]/g, "'").replace(/[0-9]+/g, m => ' ' + numWords(+m) + ' ')
      .replace(/[^a-z' ]+/g, ' ').split(' ').filter(Boolean)
      .flatMap(x => (CONTR[x] || x).split(' ')).map(x => x.replace(/'/g, ''));
    const out = [];
    w.forEach(x => { if (x === 'not' && out[out.length - 1] === 'can') out[out.length - 1] = 'cannot'; else out.push(x); });
    return out;
  }
  function words(s) { return norm(s); }
  function close(want, got) {
    if (want === got) return true;
    if (FUNC.has(want) || want.length < 5) return false;
    // endings carry grammar (-s, -ed): they must match
    if (want.endsWith('s') !== got.endsWith('s') || want.endsWith('ed') !== got.endsWith('ed')) return false;
    return lev(want, got) <= 1;
  }
  // word-by-word alignment of what she wrote against one right answer
  function align(want, got) {
    const n = want.length, m = got.length, d = [];
    for (let i = 0; i <= n; i++) { d[i] = []; for (let j = 0; j <= m; j++) d[i][j] = i === 0 ? j : j === 0 ? i : 0; }
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (close(want[i - 1], got[j - 1]) ? 0 : 1));
    const ops = [];
    let i = n, j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (close(want[i - 1], got[j - 1]) ? 0 : 1)) {
        ops.unshift(close(want[i - 1], got[j - 1]) ? { k: 'ok', w: got[j - 1] } : { k: 'bad', w: got[j - 1], want: want[i - 1] }); i--; j--;
      } else if (j > 0 && d[i][j] === d[i][j - 1] + 1) { ops.unshift({ k: 'extra', w: got[j - 1] }); j--; }
      else { ops.unshift({ k: 'miss', want: want[i - 1] }); i--; }
    }
    return { cost: d[n][m], ops };
  }
  // check a typed sentence against the accepted answers
  function checkWrite(input, answers) {
    const got = norm(input);
    let best = null;
    answers.forEach(a => { const r = align(norm(a), got); if (!best || r.cost < best.cost) best = Object.assign(r, { answer: a }); });
    return { ok: !!got.length && best.cost === 0, ops: best.ops, answer: best.answer };
  }
  // How much of the target was heard (0..1), in order. Grammar words must be exact.
  function match(target, heard) {
    const t = norm(target), h = norm(heard);
    if (!t.length) return 0;
    const near = (a, b) => a === b || (!FUNC.has(a) && a.length > 3 && Math.abs(a.length - b.length) <= 2 && lev(a, b) <= 2);
    const d = [];
    for (let i = 0; i <= t.length; i++) { d[i] = []; for (let j = 0; j <= h.length; j++) d[i][j] = 0; }
    for (let i = 1; i <= t.length; i++) for (let j = 1; j <= h.length; j++)
      d[i][j] = near(t[i - 1], h[j - 1]) ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]);
    return d[t.length][h.length] / t.length;
  }

  // ---------- wrong options that differ from the right sentence by one grammar point
  const BE = { am: ['is', 'are'], is: ['am', 'are'], are: ['is', 'am'], was: ['were'], were: ['was'] };
  const SUBJ = ['I', 'you', 'he', 'she', 'it', 'we', 'they'];
  const POSS = ['my', 'your', 'his', 'her', 'our', 'their'];
  const PAST = { go: 'went', eat: 'ate', see: 'saw', come: 'came', buy: 'bought', have: 'had', sleep: 'slept', make: 'made', take: 'took',
    get: 'got', drink: 'drank', write: 'wrote', sit: 'sat', speak: 'spoke', give: 'gave', know: 'knew', think: 'thought', meet: 'met',
    feel: 'felt', tell: 'told', say: 'said', grow: 'grew', wake: 'woke', leave: 'left', find: 'found', bring: 'brought', teach: 'taught' };
  // short forms swapped for a wrong short form or a broken long form
  const CSWAP = { "isn't": ["aren't", "don't"], "aren't": ["isn't", "doesn't"], "don't": ["doesn't", "isn't"], "doesn't": ["don't", "isn't"],
    "didn't": ["don't", "doesn't"], "wasn't": ["weren't", "isn't"], "weren't": ["wasn't", "aren't"], "can't": ['can'], "won't": ['will'],
    "i'm": ['I is', 'I are'], "you're": ['you is', 'you am'], "it's": ['it are', 'it am'], "that's": ['that are'], "they're": ['they is', 'they am'],
    "we're": ['we is', 'we am'], "he's": ['he are'], "she's": ['she are'], "what's": ['what are'], "i'll": ['I am'] };
  const PAST_BACK = Object.fromEntries(Object.entries(PAST).map(([a, b]) => [b, a]));
  const VERBS = new Set(('cook go drink watch wake like love live work eat want read walk pray come see sleep play speak make call clean ' +
    'wash visit buy need know think help take get open wait sit write teach learn sing dance enjoy wear use hear understand say tell ' +
    'give bring stay look feel miss worry meet start finish put keep send pay sign fill turn stop practise grow leave find close ' +
    'carry pray study talk listen rain cry laugh').split(' ').concat(Object.keys(PAST)));
  const third = v => v === 'have' ? 'has' : v === 'go' ? 'goes' : v === 'do' ? 'does' : /(s|sh|ch|x)$/.test(v) ? v + 'es' : /[^aeiou]y$/.test(v) ? v.slice(0, -1) + 'ies' : v + 's';
  const base3 = w => w === 'has' ? 'have' : w === 'goes' ? 'go' : w === 'does' ? 'do' : /ies$/.test(w) ? w.slice(0, -3) + 'y' : /(s|sh|ch|x)es$/.test(w) ? w.slice(0, -2) : w.slice(0, -1);
  function variants(en, accepted) {
    const toks = String(en).split(' ').filter(Boolean);
    const endP = (toks[toks.length - 1].match(/[.,!?]+$/) || [''])[0];
    const bare = toks.map(w => w.replace(/[.,!?]+$/, ''));
    const punct = toks.map((w, i) => (i === toks.length - 1 ? '' : (w.match(/[.,!?]+$/) || [''])[0]));
    const keepCase = (i, w) => (/^I( |$)/.test(w) ? w : i === 0 || /[.!?]$/.test(punct[i - 1] || '') ? w[0].toUpperCase() + w.slice(1) : w.toLowerCase());
    const make = (arr, pu) => arr.map((w, i) => w + (i === arr.length - 1 ? '' : (pu || punct)[i] || '')).join(' ').replace(/^./, c => c.toUpperCase()) + endP;
    const out = [];
    const add = (kind, arr, pu) => out.push({ kind, s: make(arr, pu) });
    const drop = (kind, i) => { const a = bare.slice(), pu = punct.slice(); a.splice(i, 1); pu.splice(i, 1); add(kind, a, pu); };
    const lower = bare.map(w => w.toLowerCase());
    lower.forEach((w, i) => {
      const swap = list => list.forEach(r => { const a = bare.slice(); a[i] = keepCase(i, r); add(i + w, a); });
      if (BE[w]) swap(BE[w]);
      if (SUBJ.map(x => x.toLowerCase()).includes(w) && (i === 0 || BE[lower[i - 1]] || ['do', 'does', 'did', 'can', 'will'].includes(lower[i - 1]) || /^(what|where|who|when|why|how)$/.test(lower[i - 2] || ''))) {
        swap(SUBJ.filter(x => x.toLowerCase() !== w).sort(() => Math.random() - 0.5).slice(0, 3));
      }
      if (POSS.includes(w)) swap(POSS.filter(x => x !== w).sort(() => Math.random() - 0.5).slice(0, 2));
      if (w === 'a') swap(['an', 'the']);
      if (w === 'an') swap(['a', 'the']);
      if (w === 'the') swap(['a']);
      if (['a', 'an', 'the'].includes(w)) drop('drop' + i, i);
      if (CSWAP[w]) swap(CSWAP[w]);
      if (w === 'do') swap(['does']);
      if (w === 'does') swap(['do']);
      if (w === 'did') swap(['do', 'does']);
      if (w === 'this') swap(['these']);
      if (w === 'these') swap(['this']);
      if (w === 'that') swap(['those']);
      if (w === 'those') swap(['that']);
      if (w === 'in') swap(['on', 'at']);
      if (w === 'on') swap(['in', 'at']);
      if (w === 'at') swap(['in', 'on']);
      if (w === 'not') drop('not' + i, i);
      if (PAST[w]) swap([w + 'ed']);
      if (PAST_BACK[w]) swap([PAST_BACK[w], PAST_BACK[w] + 'ed']);
      if (VERBS.has(w) && i > 0) swap([third(w)]);
      if (i > 0 && /s$/.test(w) && VERBS.has(base3(w))) swap([base3(w)]);
      if (/ed$/.test(w) && VERBS.has(w.slice(0, -2))) swap([w.slice(0, -2)]);
      if (/ed$/.test(w) && VERBS.has(w.slice(0, -1))) swap([w.slice(0, -1)]);
      if (i > 0 && /^(two|three|four|five|six|seven|eight|nine|ten|many)$/.test(lower[i - 1]) && /s$/.test(w)) swap([w.slice(0, -1)]);
      if (w === 'children') swap(['childs', 'child']);
    });
    // question word order: "Is this tea?" -> "This is tea?"
    if (endP.includes('?') && (BE[lower[0]] || ['do', 'does', 'can'].includes(lower[0])) && bare.length > 2) {
      const a = bare.slice(); [a[0], a[1]] = [keepCase(0, a[1]), lower[0] === 'i' ? 'I' : lower[0]]; add('order', a);
    }
    const ok = new Set((accepted || [en]).map(x => norm(x).join(' ')));
    const seen = new Set(), res = [];
    shuffle(out).forEach(v => { const k = norm(v.s).join(' '); if (!ok.has(k) && !seen.has(k)) { seen.add(k); res.push(v); } });
    // prefer three different grammar points
    const pick = [], kinds = new Set();
    res.forEach(v => { if (pick.length < 3 && !kinds.has(v.kind)) { kinds.add(v.kind); pick.push(v.s); } });
    res.forEach(v => { if (pick.length < 3 && !pick.includes(v.s)) pick.push(v.s); });
    return pick;
  }

  // ---------- dates (local), with an offset for the self-test
  let dayOffset = 0;
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = () => ymd(new Date(Date.now() + dayOffset * 864e5));
  function addDays(s, n) { const p = s.split('-'); return ymd(new Date(+p[0], +p[1] - 1, +p[2] + n)); }

  // ---------- saved progress
  const blank = () => ({ v: 2, done: {}, tries: {}, cards: {}, days: [], lastNew: '', set: { size: 1, rate: 0.85, voice: '', pitch: 1 }, hideInstall: false, fresh: false });
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.v === 2) { const b = blank(); for (const k in b) if (!(k in s)) s[k] = b[k]; return s; }
      // first open after the course was rebuilt: start the new lessons, keep the voice and text settings
      const old = !TEST && JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
      if (old && old.set) {
        const b = blank();
        b.set = Object.assign(b.set, old.set); b.hideInstall = !!old.hideInstall; b.fresh = true; b.days = old.days || [];
        return b;
      }
    } catch (e) { /* fall through */ }
    return blank();
  }
  let st = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage full or blocked */ } }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
  function applySize() { document.documentElement.style.setProperty('--scale', st.set.size || 1); }
  applySize();

  // ---------- lesson index
  const BYID = {}, ITEM = {};
  LESSONS.forEach((L, i) => {
    L.n = i + 1;
    BYID[L.id] = L;
    L.items.forEach(it => { it.cid = L.id + ':' + it.id; it.lesson = L.id; ITEM[it.cid] = it; });
  });
  const nextLesson = () => LESSONS.find(L => !st.done[L.id]) || null;
  const unlocked = L => L.n === 1 || !!st.done[L.id] || !!st.done[LESSONS[L.n - 2].id];
  const doneCount = () => LESSONS.filter(L => st.done[L.id]).length;

  function markDay() {
    const t = today();
    if (!st.days.includes(t)) st.days.push(t);
    if (st.days.length > 500) st.days = st.days.slice(-500);
  }
  function streak() {
    const set = new Set(st.days);
    let d = today();
    if (!set.has(d)) d = addDays(d, -1);
    let n = 0;
    while (set.has(d)) { n++; d = addDays(d, -1); }
    return n;
  }

  // ---------- spaced repetition (Leitner boxes, graded automatically by answers)
  function dueCards(limit) {
    const t = today();
    return Object.keys(st.cards)
      .filter(id => ITEM[id] && st.cards[id].due <= t)
      .sort((a, b) => (st.cards[a].due < st.cards[b].due ? -1 : st.cards[a].due > st.cards[b].due ? 1 : st.cards[a].b - st.cards[b].b))
      .slice(0, limit);
  }
  function grade(cid, ok) {
    const c = st.cards[cid] || (st.cards[cid] = { b: 0, due: today() });
    if (ok) { c.b = Math.min(c.b + 1, INTERVALS.length - 1); c.due = addDays(today(), INTERVALS[c.b]); }
    else { c.b = 0; c.due = addDays(today(), 1); }
  }

  // ---------- voice (text to speech)
  const TTS = { voices: [], voice: null, ok: 'speechSynthesis' in window };
  const FEM = /female|woman|heera|neerja|kalpana|veena|priya|swara|ananya|aditi|raveena|zira|hazel|susan|sonia|libby|maisie|samantha|karen|moira|tessa|x-ahp|x-cxx|x-ena|x-enc/i;
  const MALE = /male|prabhat|ravi|hemant|madhur|kunal|george|ryan|thomas|daniel|david|mark|guy|rishi|x-end|x-ene/i;
  function scoreVoice(v) {
    const lang = v.lang.replace('_', '-').toLowerCase();
    const name = v.name + ' ' + v.voiceURI;
    let s = 0;
    if (lang === 'en-in') s += 20; else if (lang === 'en-gb') s += 10; else if (lang === 'en-us') s += 5;
    if (FEM.test(name)) s += 8;
    if (MALE.test(name.replace(/female/ig, ''))) s -= 8;
    if (/natural|google/i.test(name)) s += 2;
    if (v.localService) s += 1;
    return s;
  }
  function loadVoices() {
    if (!TTS.ok) return;
    const before = TTS.voices.length;
    TTS.voices = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)).sort((a, b) => scoreVoice(b) - scoreVoice(a));
    let v = st.set.voice && TTS.voices.find(x => x.voiceURI === st.set.voice);
    if (!v) v = TTS.voices[0];
    TTS.voice = v || null;
    // Android often lists its voices a moment after the page opens: refresh the settings screen if it is showing
    if (TTS.voices.length !== before && document.getElementById('voices')) settings('', true);
  }
  if (TTS.ok) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  function speak(text, slow, onend) {
    if (!TTS.ok || TEST) { if (onend) onend(); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (TTS.voice) { u.voice = TTS.voice; u.lang = TTS.voice.lang; } else u.lang = 'en-IN';
      u.rate = typeof slow === 'number' ? slow : slow ? 0.6 : (st.set.rate || 0.85);
      u.pitch = st.set.pitch || 1;
      if (onend) { u.onend = onend; u.onerror = onend; }
      speechSynthesis.speak(u);
    } catch (e) { if (onend) onend(); }
  }
  let autoTimer = 0;
  function autoSay(text, delay) { clearTimeout(autoTimer); autoTimer = setTimeout(() => speak(text), delay || 350); }

  // ---------- listening (speech recognition) and recording
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, micBlocked = false;
  function listen(target, cb) {
    stopListen();
    const r = new SR();
    // recognise in the accent she is copying: stricter than en-IN, so fewer mumbled words slip through
    r.lang = (TTS.voice && TTS.voice.lang.replace('_', '-')) || 'en-GB';
    r.interimResults = false; r.maxAlternatives = 5; r.continuous = false;
    let fin = false, t0 = 0, t1 = 0;
    r.onspeechstart = () => { t0 = Date.now(); };
    r.onspeechend = () => { t1 = Date.now(); };
    r.onresult = e => {
      if (fin) return; fin = true;
      const res = e.results[0]; let best = 0, txt = '';
      for (let i = 0; i < res.length; i++) { const sc = match(target, res[i].transcript); if (sc >= best) { best = sc; txt = res[i].transcript; } }
      cb(best, txt, t0 && t1 > t0 ? (t1 - t0) / 1000 : 0);
    };
    r.onerror = e => { if (!fin) { fin = true; cb(-1, e.error || 'error'); } };
    r.onend = () => { if (!fin) { fin = true; cb(-1, 'no-speech'); } rec = null; };
    try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    try { r.start(); rec = r; } catch (e) { fin = true; cb(-1, 'start'); }
  }
  function stopListen() { if (rec) { try { rec.abort(); } catch (e) { /* ignore */ } rec = null; } }
  const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  let recording = false;
  async function recordBack(seconds, btn) {
    if (recording) return;
    recording = true;
    const label = btn.innerHTML;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(s), chunks = [];
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = () => {
        s.getTracks().forEach(t => t.stop());
        btn.innerHTML = '🔈 तपाईंको आवाज...';
        const a = new Audio(URL.createObjectURL(new Blob(chunks, { type: mr.mimeType })));
        a.onended = () => { btn.innerHTML = label; recording = false; };
        a.onerror = a.onended;
        a.play().catch(a.onended);
      };
      btn.innerHTML = '🔴 बोल्नुहोस्...';
      mr.start();
      setTimeout(() => { try { mr.stop(); } catch (e) { /* ignore */ } }, seconds * 1000);
    } catch (e) {
      btn.innerHTML = 'माइक चलेन 🙁'; recording = false;
      setTimeout(() => { btn.innerHTML = label; }, 2500);
    }
  }

  // ---------- happy and sad sounds
  let AC = null;
  function chime(ok) {
    if (TEST) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = AC.currentTime;
      (ok ? [660, 990] : [330, 247]).forEach((f, i) => {
        const o = AC.createOscillator(), g = AC.createGain(), t = t0 + i * 0.13;
        o.type = ok ? 'sine' : 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + 0.3);
      });
    } catch (e) { /* no audio */ }
    try { if (navigator.vibrate) navigator.vibrate(ok ? 40 : [70, 60, 70]); } catch (e) { /* ignore */ }
  }

  // ---------- screens
  let S = null; // the running session
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (!S) home(); });
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  function view(html, keepScroll) {
    clearTimeout(autoTimer);
    app.innerHTML = html;
    if (!keepScroll) window.scrollTo(0, 0);
  }
  function stopAll() { stopListen(); try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }

  function home() {
    S = null; stopAll();
    const L = nextLesson(), t = today(), due = dueCards(99).length, sk = streak();
    const doneToday = st.lastNew === t;
    let h = `<div class="top"><div class="hello">नमस्ते! 🙏</div><button class="gear" data-a="settings" aria-label="Settings">⚙️</button></div>
      <p class="sub">आज पनि अलिकति अङ्ग्रेजी सिकौं।</p>
      ${st.fresh ? `<div class="banner"><p><b>✨ New lessons!</b></p><p class="small">पाठहरू नयाँ र अझ राम्रा बनाइएका छन्: वाक्य बनाउने, लेख्ने र बोल्ने अभ्यास बढी। त्यसैले Lesson 1 बाट फेरि सुरु गरौं।</p>
        <button class="btn white" data-a="okFresh" style="min-height:56px">OK 👍</button></div>` : ''}
      <div class="streak"><span class="fire">${sk ? '🔥' : '🌱'}</span><div>${sk ? sk + '-day streak!' : 'Start today!'}
      <div class="small">Lessons done: ${nn(doneCount())} / ${nn(LESSONS.length)}</div></div></div>`;
    if (!L) {
      h += `<div class="done-today">🎉 All lessons done! तपाईं अब अङ्ग्रेजीमा कुरा गर्न सक्नुहुन्छ।</div>
        <button class="btn huge green" data-a="review">🔁 Review<small>${due ? due + ' words' : 'Old words'}</small></button>`;
    } else if (doneToday) {
      h += `<div class="done-today">✓ Today's lesson done! स्याबास! 👏</div>`;
      if (due) h += `<button class="btn huge green" data-a="review">🔁 Review<small>${due} words</small></button>`;
      h += `<button class="btn white" data-a="lesson" data-v="${L.id}">Next Lesson ▶<br>Lesson ${L.n}: ${esc(L.title_en)}</button>`;
    } else {
      h += `<button class="btn huge" data-a="lesson" data-v="${L.id}">▶ Today's Lesson<small>Lesson ${L.n}: ${esc(L.emoji)} ${esc(L.title_en)}</small></button>`;
      if (due) h += `<p class="small center">पहिले ${Math.min(due, 8)} वटा पुराना शब्दको Review हुन्छ।</p>`;
    }
    h += `<button class="btn white" data-a="list">📚 All Lessons</button>`;
    if (!standalone() && !st.hideInstall) {
      h += `<div class="banner"><p><b>📲 Install this app</b></p>` +
        (installEvt ? `<button class="btn blue" data-a="install">📲 Install App</button>`
          : `<p class="small">Chrome मा माथि दायाँ <b>⋮</b> थिच्नुहोस्, अनि <b>"Add to Home screen"</b> वा <b>"Install app"</b> थिच्नुहोस्।</p>`) +
        `<button class="btn white" data-a="hideInstall" style="min-height:56px">Later</button></div>`;
    }
    view(h);
  }

  function list() {
    S = null; stopAll();
    let h = `<div class="top"><button class="x" data-a="home" aria-label="Home">←</button><div class="hello" style="margin:0">📚 All Lessons</div></div>`;
    const next = nextLesson();
    UNITS.forEach(U => {
      h += `<div class="unit-h">${esc(U.emoji)} Unit ${U.n}: ${esc(U.title_en)} <span class="small">${esc(U.title_ne)}</span></div>`;
      LESSONS.filter(L => L.unit === U.n).forEach(L => {
        const d = st.done[L.id], open = unlocked(L);
        const stat = d ? '⭐'.repeat(d.stars) : (next === L ? '▶' : '🔒');
        h += `<button class="lrow ${open ? '' : 'locked'}" ${open ? `data-a="lesson" data-v="${L.id}"` : ''}>
          <span class="em">${esc(L.emoji)}</span><span class="t"><span class="en">${esc(L.title_en)}</span><small>Lesson ${L.n} · ${esc(L.title_ne)}</small></span><span class="st">${stat}</span></button>`;
      });
    });
    view(h);
  }

  function settings(msg, keepScroll) {
    S = null; stopAll();
    const seg = (act, cur, opts) => `<div class="seg">${opts.map(o => `<button class="${cur === o[0] ? 'on' : ''}" data-a="${act}" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>`;
    const ACCENT = { 'en-in': '🇮🇳 Indian English', 'en-gb': '🇬🇧 UK English', 'en-us': '🇺🇸 American English', 'en-au': '🇦🇺 Australian English', 'en-ca': '🇨🇦 Canadian English', 'en-ie': '🇮🇪 Irish English', 'en-za': '🇿🇦 South African English', 'en-nz': '🇳🇿 New Zealand English' };
    const vbtns = TTS.voices.map((v, i) => {
      const on = TTS.voice && v.voiceURI === TTS.voice.voiceURI;
      const acc = ACCENT[v.lang.replace('_', '-').toLowerCase()] || v.lang;
      return `<button class="lrow ${on ? 'on' : ''}" data-a="pickVoice" data-v="${i}"><span class="em">${on ? '✅' : '🔈'}</span>
        <span class="t">${esc(acc)} · Voice ${i + 1}<small class="en">${esc(v.name)}</small></span><span class="st">▶</span></button>`;
    }).join('');
    let h = `<div class="top"><button class="x" data-a="home" aria-label="Home">←</button><div class="hello" style="margin:0">⚙️ Settings</div></div>
      ${msg ? `<div class="done-today">${msg}</div>` : ''}
      <div class="set-h">Font Size</div>${seg('size', st.set.size, [[1, 'Big'], [1.15, 'Bigger'], [1.3, 'Biggest']])}
      <div class="set-h">Speech Rate</div>${seg('rate', st.set.rate, [[0.7, 'Slow'], [0.85, 'Normal'], [1, 'Fast']])}
      <div class="set-h">Voice</div>
      <p class="small">एउटा थिच्नुहोस्, सुन्नुहोस्। मन परेको आवाजमा ✅ लाग्छ।</p>
      <div id="voices">${TTS.voices.length ? vbtns : '<p class="small">आवाजहरू खोज्दै... केही नआए फोनको Settings मा Google Text-to-speech राख्नुहोस्।</p>'}</div>
      <div class="set-h">Voice Pitch</div>${seg('pitch', st.set.pitch || 1, [[0.9, 'Low'], [1, 'Normal'], [1.15, 'High']])}
      <div class="note">💡 <b>अझ राम्रो आवाज चाहिए?</b> फोनको <b>Settings</b> मा "Text-to-speech" खोज्नुहोस् → <b>Google</b> को ⚙️ → <b>Install voice data</b> → <b>English (India)</b> → त्यहाँ Voice I, II, III, IV मध्ये मन परेको छान्नुहोस् (Wi-Fi मा डाउनलोड गर्नुहोस्)। अनि यहाँ फर्केर फेरि सुन्नुहोस्।</div>
      <div class="set-h">Backup <span class="small">(नयाँ फोनमा सार्न)</span></div>
      <p class="small">यो code Copy गरेर राख्नुहोस् (जस्तै WhatsApp मा)। नयाँ फोनमा तल Paste गरेर Restore थिच्नुहोस्।</p>
      <textarea id="bk" readonly>${esc(JSON.stringify(st))}</textarea>
      <button class="btn white" data-a="copyBackup">📋 Copy</button>
      <textarea id="restore" placeholder="Paste backup code here"></textarea>
      <button class="btn white" data-a="restore">⤵️ Restore</button>
      <div class="set-h">Reset</div>
      <button class="btn white" data-a="reset">🗑️ Delete all progress</button>
      <p class="small center">Version ${esc(window.APP_VERSION || '')}</p>`;
    view(h, keepScroll);
  }

  // ---------- building a session
  function pool(L) {
    let p = L.items.slice();
    for (let k = L.n - 2; k >= 0 && p.length < 14; k--) p = p.concat(LESSONS[k].items);
    if (p.length < 6) LESSONS.forEach(x => { if (x !== L && p.length < 14) p = p.concat(x.items); });
    return p;
  }
  function distract(it, p, field, n) {
    // prefer options of the same shape (a word among words, a sentence among sentences)
    const isLong = x => tokens(x.en).length >= 3;
    const key = x => (field === 'en' ? norm(x.en).join(' ') : x[field]); // "don't" and "do not" count as the same
    const seen = new Set([key(it)]), out = [];
    const cands = shuffle(p).sort((a, b) => (isLong(a) === isLong(it) ? 0 : 1) - (isLong(b) === isLong(it) ? 0 : 1));
    cands.forEach(x => { if (out.length < n && !seen.has(key(x))) { seen.add(key(x)); out.push(x[field]); } });
    return out;
  }
  const isSentence = it => tokens(it.en).length >= 2;
  const accepted = it => [it.en].concat(it.alt || []);
  // wrong options: sentences differ from the answer by one grammar point; single words come from the same topic
  function optsFor(it, p) {
    let wrong = isSentence(it) ? variants(it.en, accepted(it)) : [];
    if (wrong.length < 3) {
      const taken = new Set(accepted(it).concat(wrong).map(x => norm(x).join(' ')));
      const more = distract(it, p.filter(x => !taken.has(norm(x.en).join(' '))), 'en', 3 - wrong.length);
      wrong = wrong.concat(more);
    }
    return shuffle([it.en].concat(wrong.slice(0, 3)));
  }
  // listening: which sentence did you hear?
  const qListen = (it, p) => ({ t: 'listen', cid: it.cid, it, say: it.en, ans: it.en, opts: optsFor(it, p) });
  // Nepali -> which English sentence?
  const qPick = (it, p) => ({ t: 'pick', cid: it.cid, it, say: it.en, ans: it.en, opts: optsFor(it, p) });
  const qBuild = it => ({ t: 'build', cid: it.cid, en: it.en, ne: it.ne, say: it.en, tiles: shuffle(tokens(it.en)) });
  // type the English for the Nepali, or type what you hear
  const qWrite = it => ({ t: 'write', cid: it.cid, ne: it.ne, emoji: it.emoji, en: it.en, answers: accepted(it), say: it.en });
  const qDict = it => ({ t: 'dict', cid: it.cid, ne: it.ne, en: it.en, answers: accepted(it), say: it.en });
  const writable = it => isSentence(it) && it.w !== false && tokens(it.en).length <= 10;

  function reviewQ(cid) {
    const it = ITEM[cid], p = pool(BYID[it.lesson]);
    if (!isSentence(it)) return pickOne([qListen, qPick])(it, p);
    const kinds = [qListen, qPick, qPick];
    if (writable(it)) kinds.push(qWrite, qWrite, qDict);
    else if (tokens(it.en).length <= 10) kinds.push(qBuild);
    return pickOne(kinds)(it, p);
  }
  function authored(a) {
    const q = Object.assign({}, a);
    if (q.t === 'build') { q.tiles = shuffle(tokens(q.en).concat(q.extra || [])); q.say = q.en; }
    if (q.t === 'gap') { q.opts = shuffle(q.opts); q.say = q.full; }
    if (q.t === 'reply') { q.opts = shuffle(q.opts); q.say = q.ans; }
    if (q.t === 'mc') { q.opts = shuffle(q.opts); }
    if (q.t === 'write' || q.t === 'dict') { q.answers = [q.en].concat(q.alt || []); q.say = q.en; }
    return q;
  }
  // about 12-15 questions: recognition first (listen, choose, gaps), then production (build, dictation, writing)
  function lessonQuiz(L) {
    const p = pool(L), quiz = (L.quiz || []).map(authored);
    const sent = shuffle(L.items.filter(isSentence)), words = L.items.filter(it => !isSentence(it));
    const recog = [], prod = [];
    quiz.forEach(q => ((q.t === 'build' || q.t === 'write' || q.t === 'dict') ? prod : recog).push(q));
    const nWrite = quiz.filter(q => q.t === 'write').length, nDict = quiz.filter(q => q.t === 'dict').length;
    const wr = sent.filter(writable);
    wr.slice(0, Math.max(0, 4 - nWrite)).forEach(it => prod.push(qWrite(it)));
    if (!nDict && wr.length) prod.push(qDict(wr[wr.length - 1]));
    if (!quiz.some(q => q.t === 'build') && sent.length) prod.push(qBuild(sent[0]));
    const want = Math.max(4, 14 - recog.length - prod.length);
    const auto = shuffle(sent.concat(sent).concat(words)).slice(0, want).map((it, i) => (i % 2 ? qPick : qListen)(it, p));
    return shuffle(recog.concat(auto)).concat(shuffle(prod));
  }
  function speakItems(L) {
    if (L.speak && L.speak.length) return L.speak.map(id => L.items.find(it => it.id === id)).filter(Boolean);
    return L.items.filter(it => tokens(it.en).length >= 2).slice(0, 3);
  }
  function begin(steps, L, mode) {
    stopAll();
    S = { L, mode, steps, i: 0, right: 0, total: 0, qRight: 0, qTotal: 0, graded: {}, missed: {}, wrongQs: [] };
    try { history.pushState({ s: 1 }, ''); } catch (e) { /* ignore */ }
    render();
  }
  // practice: after a lesson that was not passed, go over the missed sentences again, then a fresh quiz
  function startLesson(id, practice) {
    const L = BYID[id];
    const steps = [];
    if (!practice && L === nextLesson()) dueCards(8).forEach(cid => steps.push({ k: 'q', sec: 'review', q: reviewQ(cid) }));
    if (practice) {
      const again = L.items.filter(it => practice.includes(it.cid));
      (again.length ? again : L.items).forEach((it, i, a) => steps.push({ k: 'learn', it, n: i + 1, of: a.length }));
      if (L.grammar) steps.push({ k: 'grammar' });
    } else {
      steps.push({ k: 'intro' });
      L.items.forEach((it, i) => steps.push({ k: 'learn', it, n: i + 1, of: L.items.length }));
      if (L.grammar) steps.push({ k: 'grammar' });
      speakItems(L).forEach(it => steps.push({ k: 'speak', it }));
      if (L.talk) steps.push({ k: 'talk' });
    }
    lessonQuiz(L).forEach(q => steps.push({ k: 'q', sec: 'quiz', q }));
    steps.push({ k: 'done' });
    begin(steps, L, 'lesson');
  }
  function startReview() {
    let ids = dueCards(12);
    if (!ids.length) ids = shuffle(Object.keys(st.cards).filter(id => ITEM[id])).slice(0, 10);
    if (!ids.length) { home(); return; }
    begin(ids.map(cid => ({ k: 'q', sec: 'review', q: reviewQ(cid) })).concat([{ k: 'done' }]), null, 'review');
  }

  // ---------- session screens
  const SEC = {
    review: ['s-review', '🔁 Review'], learn: ['s-learn', '📖 Learn'], grammar: ['s-grammar', '💡 Grammar'],
    speak: ['s-speak', '🗣️ Speak'], talk: ['s-talk', '💬 Conversation'], quiz: ['s-quiz', '✏️ Quiz'],
  };
  const chip = (sec, extra) => `<span class="section ${SEC[sec][0]}">${SEC[sec][1]}${extra ? ' ' + extra : ''}</span>`;
  function topbar() {
    const pct = Math.round(100 * S.i / Math.max(1, S.steps.length - 1));
    return `<div class="top"><button class="x" data-a="quit" aria-label="Close">✕</button><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }
  const audioRow = (text, verySlow) => `<div class="audio-row"><button class="round" data-a="say" data-v="${esc(text)}" aria-label="Listen">🔊</button>
    <button class="round small" data-a="slow" data-v="${esc(text)}" aria-label="Slow">🐢</button>
    ${verySlow ? `<button class="round small" data-a="verySlow" data-v="${esc(text)}" aria-label="Very slow">🐌</button>` : ''}</div>`;
  // syllables of a tricky word, e.g. "**ऍ**·पल", plus a mouth tip
  const sylHtml = it => (it.syl ? `<div class="syl">${it.syl.split('·').map(x => `<span>${pron(x)}</span>`).join('<i>·</i>')}</div>` : '') +
    (it.tip ? `<div class="tip">👄 ${pron(it.tip)}</div>` : '');
  const nextBtn = (label, cls) => `<button class="btn ${cls || 'green'}" data-a="next">${label || 'Next ➜'}</button>`;

  function render() {
    stopListen();
    const s = S.steps[S.i];
    S.answered = false;
    ({ intro: rIntro, learn: rLearn, grammar: rGrammar, speak: rSpeak, talk: rTalk, q: rQ, done: rDone })[s.k](s);
  }

  function rIntro() {
    const L = S.L;
    view(topbar() + `<div class="card"><div class="pic">${esc(L.emoji)}</div><div class="label">Lesson ${L.n}</div>
      <div class="big-en en" style="font-size:1.5rem">${esc(L.title_en)}</div><div class="ne">${esc(L.title_ne)}</div>
      ${L.intro ? `<div class="note">${esc(L.intro)}</div>` : ''}
      <ul class="intro-list">${L.items.slice(0, 4).map(it => `<li>${esc(it.emoji || '•')} <b class="en">${esc(it.en)}</b></li>`).join('')}${L.items.length > 4 ? '<li>...</li>' : ''}</ul></div>
      <div class="spacer"></div>${nextBtn('Start ▶', '')}`);
  }

  function rLearn(s) {
    const it = s.it;
    view(topbar() + chip('learn', `${nn(s.n)}/${nn(s.of || S.L.items.length)}`) + `<div class="card">
      <div class="pic">${esc(it.emoji || '')}</div>
      <div class="big-en en">${esc(it.en)}</div>
      <div class="pron">${pron(it.pron)}</div>
      ${sylHtml(it)}
      <div class="ne">${esc(it.ne)}</div>
      ${audioRow(it.en, !!it.syl)}</div>
      ${it.note ? `<div class="note">💡 ${esc(it.note)}</div>` : ''}
      <div class="spacer"></div>${nextBtn()}`);
    autoSay(it.en);
  }

  function rGrammar() {
    const g = S.L.grammar;
    view(topbar() + chip('grammar') + `<div class="card" style="text-align:left">
      <div class="big-en" style="font-size:1.35rem">${esc(g.title)}</div>
      ${(g.lines || []).map(l => `<p class="gr-line">${pron(l)}</p>`).join('')}
      ${g.table ? `<table class="gtable">${g.table.map(r => `<tr><td class="en">${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>` : ''}
      ${(g.ex || []).map(e => `<div class="gex"><div class="t"><div class="en">${esc(e[0])}</div><div>${esc(e[1])}</div></div>
        <button class="round small" data-a="say" data-v="${esc(e[0])}">🔊</button></div>`).join('')}
      </div><div class="spacer"></div>${nextBtn('OK ➜')}`);
  }

  // Back-chaining: build the sentence up from its end ("happy" -> "are happy" -> "We are happy"),
  // which keeps the natural tune, then say the whole sentence twice in one breath.
  function speakStages(it) {
    const tk = tokens(it.en), n = tk.length;
    if (n < 3) return [{ len: n, text: it.en }, { len: n, text: it.en }, { len: n, text: it.en }];
    const k = Math.max(1, Math.round(n / 3)), lens = [...new Set([k, 2 * k])].filter(l => l < n);
    return lens.map(l => ({ len: l, text: tk.slice(n - l).join(' ') })).concat([{ len: n, text: it.en, full: 1 }, { len: n, text: it.en, full: 1 }]);
  }
  function rSpeak(s) {
    const it = s.it;
    s.stages = s.stages || speakStages(it);
    s.count = s.count || 0;
    const done = s.count >= s.stages.length, stg = s.stages[Math.min(s.count, s.stages.length - 1)];
    const tk = tokens(it.en), from = tk.length - stg.len;
    const shown = String(it.en).split(' ').map((w, i) => `<span class="${i < from && !done ? 'dim' : ''}">${esc(w)}</span>`).join(' ');
    const what = done ? '' : stg.full ? '🌊 अब पूरा वाक्य, <b>एकै सासमा</b>, शब्दहरू जोडेर:' : '🧩 पहिले यति मात्र (पछाडिबाट):';
    view(topbar() + chip('speak') + `<p class="q-title">सुन्नुहोस्, अनि ठूलो स्वरले दोहोर्याउनुहोस्।</p>
      <div class="card"><div class="big-en en chunked">${shown}</div><div class="pron">${pron(it.pron)}</div>${sylHtml(it)}<div class="ne">${esc(it.ne)}</div></div>
      <div class="dots" id="dots">${s.stages.map((x, i) => `<i class="${i < s.count ? 'on' : ''}"></i>`).join('')}</div>
      ${done ? '' : `<p class="center">${what}<br><b class="en say-now">${esc(stg.text)}</b></p>${audioRow(stg.text, !!it.syl)}`}
      <div class="audio-row">${SR && !micBlocked && !done ? `<button class="round mic" id="mic" data-a="mic" aria-label="Speak">🎤</button>` : ''}</div>
      <div class="heard center" id="heard">${SR && !micBlocked && !done ? '🎤 थिचेर बोल्नुहोस्' : ''}</div>
      <div id="sayctl"></div>
      <p class="small center">🎤 ले शब्द मात्र जाँच्छ, उच्चारण होइन। ⏺ Record गरेर आफ्नो आवाज र 🔊 को आवाज तुलना गर्नुहोस्।</p>`, s.count > 0);
    drawSpeak();
    if (!done) autoSay(stg.text);
  }
  function drawSpeak() {
    const s = S.steps[S.i];
    const rb = canRecord ? `<button class="btn white saidbtn" data-a="record">⏺ Record & Listen</button>` : '';
    document.getElementById('sayctl').innerHTML = s.count >= s.stages.length
      ? `<div class="done-today">🎉 स्याबास! राम्रोसँग भन्नुभयो।</div>${rb}${nextBtn()}`
      : `<button class="btn white saidbtn" data-a="said">✓ मैले भनेँ</button>${rb}`;
  }
  function speakAdvance() {
    const s = S.steps[S.i];
    s.count = Math.min(s.stages.length, s.count + 1);
    if (TEST) return;
    setTimeout(() => { if (S && S.steps[S.i] === s) rSpeak(s); }, 700);
  }
  function heard(cls, text) { const h = document.getElementById('heard'); if (h) { h.className = 'heard center ' + cls; h.textContent = text; } }
  function micResult(target, onGood) {
    const btn = document.getElementById('mic');
    if (btn) btn.classList.remove('on');
    return (score, txt, secs) => {
      if (btn) btn.classList.remove('on');
      if (score < 0) {
        if (txt === 'not-allowed' || txt === 'service-not-allowed') { micBlocked = true; heard('try', 'माइक चलेन। "✓ मैले भनेँ" थिच्नुहोस्।'); if (btn) btn.remove(); }
        else heard('try', 'केही सुनिएन। फेरि 🎤 थिचेर बोल्नुहोस्।');
        return;
      }
      const n = norm(target).length, slow = n >= 3 && secs > (n * 0.45 + 0.8) * 2;
      if (score >= 0.9) {
        chime(true);
        heard('ok', '✓ राम्रो! सुनियो: "' + txt + '"' + (slow ? '  👉 अर्को पटक शब्दहरू जोडेर, अलि छिटो भन्नुहोस्।' : ''));
        onGood();
      } else heard('try', 'फेरि भन्नुहोस् 🙂 सुनियो: "' + txt + '"  (सबै शब्द, सही क्रममा भन्नुहोस्)');
    };
  }

  function rTalk() {
    const L = S.L, s = S.steps[S.i];
    s.at = s.at || 0;
    const who = w => (L.people && L.people[w]) || (w === 'Y' ? '🙋‍♀️ तपाईं' : '👤 उहाँ');
    let chat = '';
    L.talk.slice(0, s.at + 1).forEach((ln, i) => {
      const cur = i === s.at && !s.finished, me = ln.who === 'Y';
      chat += `<div class="bubble ${me ? 'me' : 'them'} ${cur && me ? 'wait' : ''}"><div class="who">${me ? '🙋‍♀️ तपाईं' : esc(who(ln.who))}${cur && me ? ' — अब तपाईं भन्नुहोस्:' : ''}</div>
        <div class="e en">${esc(ln.en)}</div>${cur || i === s.at ? `<div class="p">${pron(ln.pron)}</div>` : ''}<div class="n">${esc(ln.ne)}</div></div>`;
    });
    const ln = L.talk[s.at];
    let ctl;
    if (s.finished) {
      ctl = `<div class="done-today">🎉 Conversation done!</div><button class="btn white" data-a="talkAgain">🔁 Again</button>${nextBtn()}`;
    } else if (ln.who === 'Y') {
      ctl = `${audioRow(ln.en)}<div class="audio-row">${SR && !micBlocked ? `<button class="round mic" id="mic" data-a="talkMic">🎤</button>` : ''}</div>
        <div class="heard center" id="heard"></div><button class="btn white saidbtn" data-a="talkSaid">✓ मैले भनेँ</button>`;
    } else {
      ctl = `${audioRow(ln.en)}${nextBtn('Next ➜', 'blue')}`.replace('data-a="next"', 'data-a="talkNext"');
    }
    view(topbar() + chip('talk') + `<p class="q-title">${esc(L.talk_ne || 'यो कुराकानी गरौं। तपाईंको पालो आउँदा बोल्नुहोस्।')}</p>
      <div class="chat">${chat}</div>${ctl}`, s.at > 0);
    if (s.at > 0) { const c = app.querySelector('.chat'); if (c && c.lastElementChild) c.lastElementChild.scrollIntoView({ block: 'center' }); }
    if (!s.finished && ln.who !== 'Y') autoSay(ln.en, 300);
  }
  function talkAdvance() {
    const s = S.steps[S.i];
    if (s.at >= S.L.talk.length - 1) s.finished = true; else s.at++;
    rTalk();
  }

  // ----- questions
  const TITLES = {
    listen: 'सुन्नुहोस्: कुन वाक्य सुन्नुभयो?', pick: 'अङ्ग्रेजीमा कसरी भन्छ?', build: 'शब्दहरू थिचेर वाक्य बनाउनुहोस्।',
    gap: 'खाली ठाउँमा कुन शब्द आउँछ?', reply: 'उहाँले यसो भन्नुभयो। तपाईं के जवाफ दिनुहुन्छ?',
    write: 'यो वाक्य अङ्ग्रेजीमा लेख्नुहोस्।', dict: 'सुन्नुहोस्, अनि जे सुन्नुभयो त्यही लेख्नुहोस्।',
  };
  function rQ(s) {
    const q = s.q;
    let body = '';
    const label = o => (o === '—' ? '— (केही पनि चाहिँदैन)' : o);
    const opts = (en) => q.opts.map((o, i) => `<button class="opt ${en ? 'en' : ''}" data-a="opt" data-v="${i}">${pron(label(o))}</button>`).join('');
    if (q.t === 'listen') {
      body = audioRow(q.say) + opts(false);
    } else if (q.t === 'pick') {
      body = `<div class="card"><div class="pic">${esc(q.it.emoji || '')}</div><div class="big-en" style="font-size:1.4rem">${esc(q.it.ne)}</div></div>` + opts(true);
    } else if (q.t === 'build') {
      s.placed = [];
      body = `<div class="card"><div class="big-en" style="font-size:1.3rem">${esc(q.ne)}</div></div>
        <div class="answer-line en" id="line"></div><div class="tiles en" id="tiles"></div><div id="checkbox"></div>`;
    } else if (q.t === 'gap') {
      body = `<div class="card"><div class="gap-sent en">${esc(q.text).replace('___', '<span class="blank">?</span>')}</div>
        ${q.ne ? `<div class="ne">${esc(q.ne)}</div>` : ''}</div>` + opts(true);
    } else if (q.t === 'reply') {
      body = `<div class="chat"><div class="bubble them"><div class="who">${esc(q.who || '👤 उहाँ')}</div><div class="e en">${esc(q.ask)}</div>
        ${q.ask_ne ? `<div class="n">${esc(q.ask_ne)}</div>` : ''}</div></div>${audioRow(q.ask)}` + opts(true);
    } else if (q.t === 'mc') {
      body = (q.say ? audioRow(q.say) : '') + opts(/^[A-Za-z]/.test(q.ans));
    } else if (q.t === 'write' || q.t === 'dict') {
      q.tries = q.tries || 0;
      body = (q.t === 'write'
        ? `<div class="card"><div class="pic">${esc(q.emoji || '')}</div><div class="big-en" style="font-size:1.35rem">${esc(q.ne)}</div></div>`
        : audioRow(q.say, true)) +
        `<textarea id="wr" class="write en" rows="2" autocapitalize="sentences" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Type in English..."></textarea>
        <div id="wdiff"></div><div id="wbtn"><button class="btn" data-a="checkWrite">Check ✓</button></div>`;
    }
    const sub = s.sec === 'review' ? chip('review') : chip('quiz');
    view(topbar() + sub + `<p class="q-title">${esc(q.q || TITLES[q.t])}</p>${body}<div class="spacer"></div><div id="fb"></div>`);
    if (q.t === 'build') drawBuild();
    if (q.t === 'listen') autoSay(q.say);
    if (q.t === 'reply') autoSay(q.ask);
    if (q.t === 'mc' && q.say) autoSay(q.say);
    if (q.t === 'dict') autoSay(q.say);
  }
  // her sentence word by word: wrong words red, missing words as a gap
  function diffHtml(ops) {
    return `<div class="wdiff en">${ops.map(o => o.k === 'ok' ? `<span class="w-ok">${esc(o.w)}</span>`
      : o.k === 'miss' ? '<span class="w-miss">＿</span>'
      : `<span class="w-bad ${o.k === 'extra' ? 'extra' : ''}">${esc(o.w)}</span>`).join(' ')}</div>`;
  }
  function drawBuild() {
    const s = S.steps[S.i], q = s.q;
    document.getElementById('line').innerHTML = s.placed.map((ti, k) => `<button class="tile" data-a="unplace" data-v="${k}">${esc(q.tiles[ti])}</button>`).join('');
    document.getElementById('tiles').innerHTML = q.tiles.map((w, i) => `<button class="tile ${s.placed.includes(i) ? 'used' : ''}" data-a="place" data-v="${i}">${esc(w)}</button>`).join('');
    const need = tokens(q.en).length;
    document.getElementById('checkbox').innerHTML = S.answered ? '' : `<button class="btn" data-a="check" ${s.placed.length >= need ? '' : 'disabled'}>Check ✓</button>`;
  }
  const PRAISE = ['Correct! 🎉', 'Very good! 👏', 'Excellent! 🌟', 'स्याबास! 💯'];
  function answer(ok, chosen) {
    if (S.answered) return;
    S.answered = true;
    const s = S.steps[S.i], q = s.q;
    // a typed answer that needed a second try or the word tiles counts as wrong
    const good = ok && !q.forceWrong;
    if (!q.retry) {
      S.total++; if (good) S.right++;
      if (s.sec === 'quiz') { S.qTotal++; if (good) S.qRight++; else S.wrongQs.push(q); }
    }
    if (q.cid && !S.graded[q.cid]) {
      S.graded[q.cid] = 1;
      if (s.sec === 'review') grade(q.cid, good); else if (!good) S.missed[q.cid] = 1;
    }
    if (!good && !q.retry) {
      const back = q.orig || q;
      const again = Object.assign({}, back, { retry: true, tries: 0, forceWrong: false });
      if (again.opts) again.opts = shuffle(again.opts);
      if (again.tiles) again.tiles = shuffle(again.tiles);
      S.steps.splice(S.steps.length - 1, 0, { k: 'q', sec: s.sec, q: again });
    }
    save();
    chime(ok);
    // mark the options
    app.querySelectorAll('.opt').forEach(b => {
      b.disabled = true;
      const o = q.opts[+b.dataset.v];
      if (o === q.ans) b.classList.add('right'); else if (+b.dataset.v === chosen) b.classList.add('wrong');
    });
    if (q.t === 'build') drawBuild();
    const right = q.t === 'build' || q.t === 'write' || q.t === 'dict' ? q.en : q.t === 'gap' ? q.full : q.ans;
    const neText = q.ne || (q.it && q.it.ne) || '';
    const showNe = (q.t === 'dict' || q.t === 'listen') && neText;
    const fb = document.getElementById('fb');
    fb.innerHTML = `<div class="feedback ${ok ? 'ok' : 'no'}"><div class="fb-t">${good ? pickOne(PRAISE) : ok ? '✓ अहिले सही!' : 'Correct answer:'}</div>
      ${good && q.t !== 'build' && q.t !== 'listen' ? '' : `<div class="fb-a en"><b>${pron(right)}</b></div>`}
      ${showNe ? `<div class="small">${esc(neText)}</div>` : ''}
      ${!good && !q.retry ? '<div class="small">यो फेरि पछि आउँछ।</div>' : ''}
      ${nextBtn('Next ➜', ok ? 'green' : '')}</div>`;
    fb.scrollIntoView({ block: 'end', behavior: 'smooth' });
    if (q.say) setTimeout(() => speak(q.say), 450);
  }

  const starsFor = pct => (pct >= 1 ? 3 : pct >= 0.9 ? 2 : 1);
  function rDone() {
    finish();
    const sk = streak();
    if (S.mode === 'lesson' && !S.passed) {
      const seen = new Set(), wrong = [];
      S.wrongQs.forEach(q => {
        const en = q.en || q.full || q.ans, ne = q.ne || (q.it && q.it.ne) || q.ask_ne || '';
        if (!seen.has(en)) { seen.add(en); wrong.push([en, ne]); }
      });
      view(`<div class="confetti">💪</div><div class="hello center">अझै अलिकति अभ्यास गरौं</div>
        <div class="card"><p><b>${S.qRight} / ${S.qTotal} correct</b> <span class="small">(Pass: ${Math.ceil(PASS * S.qTotal)})</span></p>
        <p class="small">यो पाठ पास गर्न ${Math.round(PASS * 100)}% सही चाहिन्छ। गलत भएका वाक्य फेरि सिकौं, अनि नयाँ प्रश्न आउँछन्।</p>
        ${wrong.map(w => `<div class="gex"><div class="t"><div class="en">${pron(w[0])}</div><div>${esc(w[1])}</div></div>
          ${/[A-Za-z]/.test(w[0]) ? `<button class="round small" data-a="say" data-v="${esc(w[0])}">🔊</button>` : ''}</div>`).join('')}</div>
        <div class="spacer"></div>
        <button class="btn huge" data-a="practice">🔁 Practice again</button>
        <button class="btn white" data-a="home">🏠 Home</button>`);
      return;
    }
    const stars = starsFor(S.mode === 'lesson' ? S.pct : (S.total ? S.right / S.total : 1));
    view(`<div class="confetti">🎉</div><div class="hello center">स्याबास!</div>
      <div class="stars">${'⭐'.repeat(stars)}</div>
      <div class="card"><p>${S.mode === 'lesson' ? `${S.qRight} / ${S.qTotal} correct` : S.total ? `${S.right} / ${S.total} correct` : ''}</p>
      ${S.mode === 'lesson' ? `<p>✓ Lesson ${S.L.n} passed: ${esc(S.L.title_en)}</p>` : '<p>✓ Review done</p>'}
      <p>🔥 ${sk}-day streak</p>
      <p class="small">यी शब्दहरू भोलि र पछि फेरि दोहोर्याइन्छ, ताकि नबिर्सियोस्।</p></div>
      <p class="center"><b>भोलि भेटौं! 🙏</b></p><div class="spacer"></div>
      <button class="btn green" data-a="home">🏠 Home</button>`);
  }
  function finish() {
    if (S.finished) return;
    S.finished = true;
    markDay();
    if (S.mode === 'lesson') {
      const L = S.L, prev = st.done[L.id];
      S.pct = S.qTotal ? S.qRight / S.qTotal : 1;
      S.passed = S.pct >= PASS;
      st.tries[L.id] = (st.tries[L.id] || 0) + 1;
      if (S.passed) {
        if (!prev) st.lastNew = today();
        st.done[L.id] = { stars: Math.max(starsFor(S.pct), prev ? prev.stars : 0), date: today() };
        L.items.forEach(it => { if (!st.cards[it.cid]) st.cards[it.cid] = { b: 0, due: addDays(today(), 1) }; });
      }
      Object.keys(S.missed).forEach(cid => { st.cards[cid] = { b: 0, due: addDays(today(), 1) }; });
    }
    save();
  }

  function quitAsk() {
    stopAll();
    view(`<div class="confetti">🤔</div><div class="hello center">Exit lesson?</div>
      <p class="center sub">अहिले छोड्नुभयो भने यो पाठ फेरि सुरुदेखि गर्नुपर्छ।</p><div class="spacer"></div>
      <button class="btn green huge" data-a="resume">▶ Continue</button>
      <button class="btn white" data-a="home">Exit</button>`);
  }

  // ---------- actions (every tap goes through here)
  const ACT = {
    home, list, settings,
    lesson: id => startLesson(id),
    review: startReview,
    next: () => { stopAll(); if (S.i < S.steps.length - 1) { S.i++; render(); } else home(); },
    quit: () => { if (S && S.steps[S.i].k === 'done') home(); else quitAsk(); },
    resume: () => render(),
    say: v => speak(v),
    slow: v => speak(v, true),
    opt: v => { const q = S.steps[S.i].q; const o = q.opts[+v]; answer(o === q.ans, +v); },
    place: v => { const s = S.steps[S.i]; if (S.answered || s.placed.includes(+v)) return; s.placed.push(+v); drawBuild(); },
    unplace: v => { const s = S.steps[S.i]; if (S.answered) return; s.placed.splice(+v, 1); drawBuild(); },
    check: () => {
      const s = S.steps[S.i], q = s.q;
      const got = s.placed.map(i => q.tiles[i].toLowerCase()).join(' ');
      answer(got === tokens(q.en).map(w => w.toLowerCase()).join(' '));
    },
    said: () => { chime(true); speakAdvance(); },
    mic: () => {
      const s = S.steps[S.i], target = s.stages[s.count].text;
      document.getElementById('mic').classList.add('on');
      heard('', '👂 सुन्दैछु... अब बोल्नुहोस्');
      listen(target, micResult(target, speakAdvance));
    },
    verySlow: v => speak(v, 0.45),
    record: (v, b) => { const s = S.steps[S.i]; recordBack(Math.min(8, 2 + tokens((s.it || {}).en || 'x x').length * 0.6), b); },
    practice: () => startLesson(S.L.id, Object.keys(S.missed)),
    okFresh: () => { st.fresh = false; save(); home(); },
    checkWrite: () => {
      const s = S.steps[S.i], q = s.q, el = document.getElementById('wr');
      if (!el || S.answered || !el.value.trim()) return;
      const r = checkWrite(el.value, q.answers);
      if (r.ok) { el.disabled = true; document.getElementById('wbtn').innerHTML = ''; answer(true); return; }
      q.tries++; q.forceWrong = true;
      chime(false);
      if (q.tries === 1) {
        document.getElementById('wdiff').innerHTML = diffHtml(r.ops) +
          '<div class="heard try">❌ अलिकति मिलेन। रातो शब्द र ＿ खाली ठाउँ हेरेर फेरि लेख्नुहोस्।</div>';
        return;
      }
      // second miss: help with word tiles (still counts as wrong)
      s.q = Object.assign({}, q, { orig: q, t: 'build', tiles: shuffle(tokens(q.en)), q: '🧩 सहयोग: शब्दहरू थिचेर वाक्य बनाउनुहोस्।' });
      rQ(s);
    },
    talkNext: talkAdvance,
    talkSaid: () => { chime(true); talkAdvance(); },
    talkMic: () => {
      const ln = S.L.talk[S.steps[S.i].at];
      document.getElementById('mic').classList.add('on');
      heard('', '👂 सुन्दैछु... अब बोल्नुहोस्');
      listen(ln.en, micResult(ln.en, () => setTimeout(talkAdvance, 900)));
    },
    talkAgain: () => { const s = S.steps[S.i]; s.at = 0; s.finished = false; rTalk(); },
    install: async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) { /* ignore */ } installEvt = null; home(); },
    hideInstall: () => { st.hideInstall = true; save(); home(); },
    size: v => { st.set.size = +v; save(); applySize(); settings('', true); },
    rate: v => { st.set.rate = +v; save(); settings('', true); speak('Good morning! How are you?'); },
    pitch: v => { st.set.pitch = +v; save(); settings('', true); speak('Good morning! How are you?'); },
    pickVoice: v => { const vo = TTS.voices[+v]; if (!vo) return; st.set.voice = vo.voiceURI; save(); loadVoices(); settings('', true); speak('Hello! My name is Maya. Nice to meet you.'); },
    testVoice: () => speak('Hello! My name is Maya. Nice to meet you.'),
    copyBackup: async () => {
      const t = document.getElementById('bk');
      try { await navigator.clipboard.writeText(t.value); settings('📋 Copied!'); } catch (e) { t.select(); document.execCommand('copy'); }
    },
    restore: () => {
      try {
        const s = JSON.parse(document.getElementById('restore').value);
        if (!s || s.v !== 2 || !s.cards) throw new Error('bad');
        st = Object.assign(blank(), s); save(); applySize(); settings('✓ Backup restored!');
      } catch (e) { settings('🙁 यो कोड मिलेन। पूरा कोड टाँस्नुहोस्।'); }
    },
    reset: (v, b) => {
      if (b.dataset.sure) { st = blank(); save(); applySize(); home(); return; }
      b.dataset.sure = '1'; b.textContent = '⚠️ पक्का? सबै प्रगति मेटिन्छ। फेरि थिच्नुहोस्।';
    },
  };
  // Enter in the typing box = Check
  app.addEventListener('keydown', e => { if (e.target.id === 'wr' && e.key === 'Enter') { e.preventDefault(); ACT.checkWrite(); } });
  app.addEventListener('click', e => {
    const b = e.target.closest('[data-a]');
    if (!b || b.disabled) return;
    const f = ACT[b.dataset.a];
    if (f) f(b.dataset.v, b);
  });
  // Android back button: inside a lesson, ask before leaving
  window.addEventListener('popstate', () => {
    if (S && !S.finished) { try { history.pushState({ s: 1 }, ''); } catch (e) { /* ignore */ } quitAsk(); }
    else if (S || app.querySelector('.top .x')) home();
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is a bonus */ });
  }

  // ---------- self-test (?test=1) and screenshot jumps (?go=...)
  function selftest() {
    const out = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    const counts = {};
    // answer the current question, right or wrong
    function answerQ(right) {
      const s = S.steps[S.i], q = s.q;
      counts[q.t] = (counts[q.t] || 0) + 1;
      if (q.t === 'write' || q.t === 'dict') {
        const el = document.getElementById('wr');
        ok(!!el, 'no typing box for ' + q.t);
        if (right) { el.value = q.en.toLowerCase().replace(/[.!?]$/, ''); ACT.checkWrite(); }
        else {
          el.value = 'xyz'; ACT.checkWrite(); ok(!S.answered && document.getElementById('wdiff').innerHTML.includes('w-'), 'no diff after first wrong try');
          el.value = 'abc'; ACT.checkWrite(); ok(S.steps[S.i].q.t === 'build', 'second wrong try did not turn into tiles');
          answerQ(false);
        }
        return;
      }
      if (q.t === 'build') {
        const want = tokens(q.en).map(w => w.toLowerCase());
        const order = right ? want : want.slice().reverse();
        const used = [];
        order.forEach(w => { const i = q.tiles.findIndex((x, k) => x.toLowerCase() === w && !used.includes(k)); ok(i >= 0, 'build tile missing ' + w); used.push(i); ACT.place(String(i)); });
        if (!right && want.join(' ') === order.join(' ')) { ACT.unplace('0'); ACT.place(String(used[0])); }
        ACT.check();
        return;
      }
      ok(q.opts.includes(q.ans), 'answer not in options: ' + q.ans);
      ok(new Set(q.opts.map(o => norm(o).join(' ') || o)).size === q.opts.length, 'options look the same: ' + q.opts.join(' | '));
      ok(q.opts.length >= 3 || q.t === 'mc' || q.t === 'gap' || q.t === 'reply', 'too few options: ' + q.opts.join(' | '));
      ACT.opt(String(right ? q.opts.indexOf(q.ans) : q.opts.findIndex(o => o !== q.ans)));
    }
    // play a lesson through; wrongEvery = answer every nth quiz question wrong (0 = all right)
    function play(id, wrongEvery, practice) {
      startLesson(id, practice);
      let guard = 0, n = 0;
      while (S && guard++ < 400) {
        const s = S.steps[S.i];
        ok(app.innerHTML.length > 50, id + ' empty step ' + s.k);
        if (s.k === 'q') {
          const wrong = s.sec === 'quiz' && !s.q.retry && wrongEvery && (++n % wrongEvery === 0 || wrongEvery === 1);
          answerQ(!wrong);
          ok(S.answered, id + ' question not answered ' + s.q.t);
        } else if (s.k === 'speak') { let g = 0; while (s.count < s.stages.length && g++ < 10) ACT.said(); ok(s.count === s.stages.length, id + ' speak stages'); }
        else if (s.k === 'talk') { let g = 0; while (!s.finished && g++ < 60) talkAdvance(); ok(s.finished, id + ' talk did not finish'); }
        if (s.k === 'done') break;
        ACT.next();
      }
    }
    try {
      st = blank();
      ok(LESSONS.length > 0, 'no lessons');
      // the typing checker
      const W = (inp, ans) => checkWrite(inp, [].concat(ans)).ok;
      ok(W("We're happy", 'We are happy.'), 'contraction accepted');
      ok(W('we are happy.', 'We are happy.'), 'case and full stop ignored');
      ok(W('We are hapy', 'We are happy.'), 'small typo in a long word accepted');
      ok(!W('We is happy', 'We are happy.'), 'wrong be rejected');
      ok(!W('They are happy', 'We are happy.'), 'wrong subject rejected');
      ok(!W('We happy', 'We are happy.'), 'missing word rejected');
      ok(!W('This is a apple.', 'This is an apple.'), 'wrong article rejected');
      ok(!W('She cook every day.', 'She cooks every day.'), 'missing -s rejected');
      ok(W('I have 2 sons', 'I have two sons.'), 'digits accepted');
      ok(W('No, it is not.', "No, it isn't."), 'full form accepted');
      // the one-grammar-point wrong options
      let vcount = 0, sample = [];
      LESSONS.forEach(L => L.items.filter(isSentence).forEach(it => {
        const v = variants(it.en, accepted(it)), acc = new Set(accepted(it).map(x => norm(x).join(' ')));
        vcount++;
        ok(new Set(v.map(x => norm(x).join(' '))).size === v.length, 'duplicate variants for ' + it.en);
        ok(!v.some(x => acc.has(norm(x).join(' '))), 'a variant is a right answer: ' + it.en);
        if (sample.length < 4 && v.length === 3) sample.push(it.en + ' -> ' + v.join(' / '));
      }));
      out.push('variants checked: ' + vcount + ' e.g. ' + sample.join(' ;; '));
      ok(match('We are happy', 'we are happy') === 1 && match('We are happy', 'happy we are') < 0.9, 'ordered speech match');
      // pass mark: everything wrong -> not passed, next lesson stays locked; practice again; then pass
      const L1 = LESSONS[0].id;
      play(L1, 1);
      ok(!st.done[L1] && !S.passed && nextLesson() === LESSONS[0], 'failed lesson should not pass');
      ok(app.innerHTML.includes('data-a="practice"'), 'no practice-again button');
      const missed = Object.keys(S.missed);
      ok(missed.length > 0, 'missed items not recorded');
      play(L1, 0, missed);
      ok(!!st.done[L1] && S.passed, 'practice run with all right should pass');
      st = blank();
      // every lesson, every third with some wrong answers
      LESSONS.forEach((L, li) => {
        play(L.id, li % 3 === 0 ? 6 : 0);
        ok(S.qTotal >= 10, L.id + ' quiz too short: ' + S.qTotal);
        if (!st.done[L.id]) play(L.id, 0);
        ok(st.done[L.id], L.id + ' not passed');
        dayOffset++;
      });
      out.push('lessons: ' + LESSONS.length + ', items: ' + Object.keys(ITEM).length + ', cards: ' + Object.keys(st.cards).length);
      out.push('question types seen: ' + JSON.stringify(counts));
      // SRS: one card answered right every time it is due climbs the boxes
      const cid = Object.keys(ITEM)[0];
      st.cards = {}; st.cards[cid] = { b: 0, due: addDays(today(), 1) };
      const seen = [];
      for (let d = 0; d < 130; d++) {
        dayOffset++;
        if (dueCards(8).includes(cid)) { seen.push(st.cards[cid].b); grade(cid, true); }
      }
      out.push('srs boxes when due: ' + seen.join(','));
      ok(seen.join(',') === '0,1,2,3,4,5,6', 'srs progression ' + seen.join(','));
      grade(cid, false);
      ok(st.cards[cid].b === 0 && st.cards[cid].due === addDays(today(), 1), 'srs reset on miss');
      // review session renders and can be answered
      Object.keys(ITEM).slice(0, 20).forEach(id => { st.cards[id] = { b: 0, due: today() }; });
      startReview();
      ok(S && S.steps.length >= 12, 'review session length ' + (S && S.steps.length));
      let g = 0;
      while (S && S.steps[S.i].k === 'q' && g++ < 40) { answerQ(true); ACT.next(); }
      // other screens
      home(); list(); ok(app.querySelectorAll('.lrow').length === LESSONS.length, 'list rows');
      settings(); ok(!!document.getElementById('bk'), 'settings');
      const code = document.getElementById('bk').value;
      st = blank(); document.getElementById('restore').value = code; ACT.restore();
      ok(Object.keys(st.cards).length >= 20, 'restore');
    } catch (e) { fails.push('EXCEPTION ' + e.message + ' ' + (e.stack || '').split(String.fromCharCode(10)).slice(0, 3).join(' | ')); }
    localStorage.removeItem(KEY);
    const box = document.getElementById('selftest');
    box.hidden = false;
    box.textContent = (fails.length ? 'FAIL ' + fails.length : 'PASS') + ' || ' + out.concat(fails.slice(0, 40)).join(' || ');
    document.title = fails.length ? 'FAIL' : 'PASS';
  }

  window.APP = { ACT, startLesson, render, get S() { return S; } };
  const go = params.get('go');
  if (TEST) selftest();
  else if (go) {
    const p = go.split(':');
    if (p[0] === 'list') list();
    else if (p[0] === 'settings') settings();
    else if (p[0] === 'lesson' && BYID[p[1]]) {
      startLesson(p[1]);
      const want = p[2] || '';
      const idx = /^[0-9]+$/.test(want) ? +want : S.steps.findIndex(s => s.k === want || (s.q && s.q.t === want));
      if (idx > 0) { S.i = Math.min(idx, S.steps.length - 1); render(); }
      if (p[3] === 'right' || p[3] === 'wrong') {
        const q = S.steps[S.i].q;
        if (q && q.opts) ACT.opt(String(p[3] === 'right' ? q.opts.indexOf(q.ans) : q.opts.findIndex(o => o !== q.ans)));
      }
    } else home();
  } else home();
})();
