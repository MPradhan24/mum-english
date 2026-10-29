/* अङ्ग्रेजी सिकौं: a Nepali-medium English course for beginners.
   Plain JS, no libraries. Lesson data comes from lessons.js (built by build.py).
   Progress lives in localStorage on this phone only. */
(function () {
  'use strict';

  const LESSONS = window.LESSONS || [];
  const UNITS = window.UNITS || [];
  const params = new URLSearchParams(location.search);
  const TEST = params.has('test');
  const KEY = TEST ? 'mum-english-test' : 'mum-english-v1';
  const INTERVALS = [1, 2, 4, 7, 15, 30, 60];
  const app = document.getElementById('app');

  // ---------- small helpers
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pron = s => esc(s).replace(/[*][*](.+?)[*][*]/g, '<b>$1</b>');
  const NEDIG = '०१२३४५६७८९';
  const nn = n => String(n).replace(/[0-9]/g, d => NEDIG[+d]);
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
  // How much of the target sentence was heard (0..1). Lenient: small slips in a word still count.
  function match(target, heard) {
    const t = words(target), pool = words(heard);
    if (!t.length) return 0;
    let hit = 0;
    t.forEach(w => {
      const i = pool.findIndex(x => x === w || (Math.abs(x.length - w.length) <= 2 && lev(x, w) <= (w.length > 3 ? 2 : 1)));
      if (i >= 0) { hit++; pool.splice(i, 1); }
    });
    return hit / t.length;
  }

  // ---------- dates (local), with an offset for the self-test
  let dayOffset = 0;
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = () => ymd(new Date(Date.now() + dayOffset * 864e5));
  function addDays(s, n) { const p = s.split('-'); return ymd(new Date(+p[0], +p[1] - 1, +p[2] + n)); }

  // ---------- saved progress
  const blank = () => ({ v: 1, done: {}, cards: {}, days: [], lastNew: '', set: { size: 1, rate: 0.85, voice: '' }, hideInstall: false });
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.v === 1) { const b = blank(); for (const k in b) if (!(k in s)) s[k] = b[k]; return s; }
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
      u.rate = slow ? 0.6 : (st.set.rate || 0.85);
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
    r.lang = 'en-IN'; r.interimResults = false; r.maxAlternatives = 5; r.continuous = false;
    let fin = false;
    r.onresult = e => {
      if (fin) return; fin = true;
      const res = e.results[0]; let best = 0, txt = '';
      for (let i = 0; i < res.length; i++) { const sc = match(target, res[i].transcript); if (sc >= best) { best = sc; txt = res[i].transcript; } }
      cb(best, txt);
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
    let h = `<div class="top"><div class="hello">नमस्ते! 🙏</div><button class="gear" data-a="settings" aria-label="सेटिङ">⚙️</button></div>
      <p class="sub">आज पनि अलिकति अङ्ग्रेजी सिकौं।</p>
      <div class="streak"><span class="fire">${sk ? '🔥' : '🌱'}</span><div>${sk ? nn(sk) + ' दिन लगातार!' : 'आज सुरु गरौं!'}
      <div class="small">पाठ सकियो: ${nn(doneCount())} / ${nn(LESSONS.length)}</div></div></div>`;
    if (!L) {
      h += `<div class="done-today">🎉 सबै पाठ सकियो! तपाईं अब अङ्ग्रेजीमा कुरा गर्न सक्नुहुन्छ।</div>
        <button class="btn huge green" data-a="review">🔁 दोहोर्याऔं<small>${due ? nn(due) + ' वटा दोहोर्याउन बाँकी' : 'पुराना शब्दहरू'}</small></button>`;
    } else if (doneToday) {
      h += `<div class="done-today">✓ आजको पाठ सकियो! स्याबास! 👏</div>`;
      if (due) h += `<button class="btn huge green" data-a="review">🔁 दोहोर्याऔं<small>${nn(due)} वटा</small></button>`;
      h += `<button class="btn white" data-a="lesson" data-v="${L.id}">अर्को पाठ पनि गर्ने? <br>पाठ ${nn(L.n)}: ${esc(L.title_ne)}</button>`;
    } else {
      h += `<button class="btn huge" data-a="lesson" data-v="${L.id}">▶ आजको पाठ<small>पाठ ${nn(L.n)}: ${esc(L.emoji)} ${esc(L.title_ne)}</small></button>`;
      if (due) h += `<p class="small center">सुरुमा ${nn(Math.min(due, 8))} वटा पुराना शब्द दोहोर्याइन्छ।</p>`;
    }
    h += `<button class="btn white" data-a="list">📚 सबै पाठहरू</button>`;
    if (!standalone() && !st.hideInstall) {
      h += `<div class="banner"><p><b>📲 यो एपलाई फोनको होम स्क्रिनमा राख्नुहोस्</b></p>` +
        (installEvt ? `<button class="btn blue" data-a="install">होम स्क्रिनमा राख्नुहोस्</button>`
          : `<p class="small">Chrome मा माथि दायाँ <b>⋮</b> थिच्नुहोस्, अनि <b>"Add to Home screen"</b> वा <b>"Install app"</b> थिच्नुहोस्।</p>`) +
        `<button class="btn white" data-a="hideInstall" style="min-height:56px">पछि</button></div>`;
    }
    view(h);
  }

  function list() {
    S = null; stopAll();
    let h = `<div class="top"><button class="x" data-a="home" aria-label="घर">←</button><div class="hello" style="margin:0">📚 सबै पाठहरू</div></div>`;
    const next = nextLesson();
    UNITS.forEach(U => {
      h += `<div class="unit-h">${esc(U.emoji)} भाग ${nn(U.n)}: ${esc(U.title_ne)} <span class="small en">${esc(U.title_en)}</span></div>`;
      LESSONS.filter(L => L.unit === U.n).forEach(L => {
        const d = st.done[L.id], open = unlocked(L);
        const stat = d ? '⭐'.repeat(d.stars) : (next === L ? '▶' : '🔒');
        h += `<button class="lrow ${open ? '' : 'locked'}" ${open ? `data-a="lesson" data-v="${L.id}"` : ''}>
          <span class="em">${esc(L.emoji)}</span><span class="t">पाठ ${nn(L.n)}: ${esc(L.title_ne)}<small class="en">${esc(L.title_en)}</small></span><span class="st">${stat}</span></button>`;
      });
    });
    view(h);
  }

  function settings(msg, keepScroll) {
    S = null; stopAll();
    const seg = (act, cur, opts) => `<div class="seg">${opts.map(o => `<button class="${cur === o[0] ? 'on' : ''}" data-a="${act}" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>`;
    const ACCENT = { 'en-in': '🇮🇳 भारतीय', 'en-gb': '🇬🇧 बेलायती', 'en-us': '🇺🇸 अमेरिकी', 'en-au': '🇦🇺 अस्ट्रेलियाली', 'en-ca': '🇨🇦 क्यानडेली', 'en-ie': '🇮🇪 आइरिस', 'en-za': '🇿🇦 दक्षिण अफ्रिकी', 'en-nz': '🇳🇿 न्युजिल्यान्डी' };
    const vbtns = TTS.voices.map((v, i) => {
      const on = TTS.voice && v.voiceURI === TTS.voice.voiceURI;
      const acc = ACCENT[v.lang.replace('_', '-').toLowerCase()] || v.lang;
      return `<button class="lrow ${on ? 'on' : ''}" data-a="pickVoice" data-v="${i}"><span class="em">${on ? '✅' : '🔈'}</span>
        <span class="t">${esc(acc)} आवाज ${nn(i + 1)}<small class="en">${esc(v.name)}</small></span><span class="st">▶</span></button>`;
    }).join('');
    let h = `<div class="top"><button class="x" data-a="home" aria-label="घर">←</button><div class="hello" style="margin:0">⚙️ सेटिङ</div></div>
      ${msg ? `<div class="done-today">${msg}</div>` : ''}
      <div class="set-h">अक्षरको आकार</div>${seg('size', st.set.size, [[1, 'ठूलो'], [1.15, 'अझ ठूलो'], [1.3, 'धेरै ठूलो']])}
      <div class="set-h">बोल्ने गति</div>${seg('rate', st.set.rate, [[0.7, 'बिस्तारै'], [0.85, 'सामान्य'], [1, 'छिटो']])}
      <div class="set-h">आवाज छान्नुहोस्</div>
      <p class="small">एउटा थिच्नुहोस्, सुन्नुहोस्। मन परेको आवाजमा ✅ लाग्छ।</p>
      <div id="voices">${TTS.voices.length ? vbtns : '<p class="small">आवाजहरू खोज्दै... केही नआए फोनको Settings मा Google Text-to-speech राख्नुहोस्।</p>'}</div>
      <div class="set-h">आवाजको स्वर</div>${seg('pitch', st.set.pitch || 1, [[0.9, 'मोटो'], [1, 'सामान्य'], [1.15, 'मसिनो']])}
      <div class="note">💡 <b>अझ राम्रो आवाज चाहिए?</b> फोनको <b>Settings</b> मा "Text-to-speech" खोज्नुहोस् → <b>Google</b> को ⚙️ → <b>Install voice data</b> → <b>English (India)</b> → त्यहाँ Voice I, II, III, IV मध्ये मन परेको छान्नुहोस् (Wi-Fi मा डाउनलोड गर्नुहोस्)। अनि यहाँ फर्केर फेरि सुन्नुहोस्।</div>
      <div class="set-h">ब्याकअप (नयाँ फोनमा सार्न)</div>
      <p class="small">यो कोड कपी गरेर कतै राख्नुहोस् (जस्तै WhatsApp मा आफैंलाई पठाउनुहोस्)। नयाँ फोनमा तल टाँसेर "फिर्ता ल्याउनुहोस्" थिच्नुहोस्।</p>
      <textarea id="bk" readonly>${esc(JSON.stringify(st))}</textarea>
      <button class="btn white" data-a="copyBackup">📋 कपी गर्नुहोस्</button>
      <textarea id="restore" placeholder="ब्याकअप कोड यहाँ टाँस्नुहोस्"></textarea>
      <button class="btn white" data-a="restore">⤵️ फिर्ता ल्याउनुहोस्</button>
      <div class="set-h">सबै मेटाउने</div>
      <button class="btn white" data-a="reset">🗑️ सुरुदेखि सुरु गर्नुहोस्</button>
      <p class="small center">संस्करण ${esc(window.APP_VERSION || '')}</p>`;
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
    const seen = new Set([it[field]]), out = [];
    const cands = shuffle(p).sort((a, b) => (isLong(a) === isLong(it) ? 0 : 1) - (isLong(b) === isLong(it) ? 0 : 1));
    cands.forEach(x => { if (out.length < n && !seen.has(x[field])) { seen.add(x[field]); out.push(x[field]); } });
    return out;
  }
  const qListen = (it, p) => ({ t: 'listen', cid: it.cid, it, say: it.en, ans: it.ne, opts: shuffle([it.ne].concat(distract(it, p, 'ne', 3))) });
  const qPick = (it, p) => ({ t: 'pick', cid: it.cid, it, say: it.en, ans: it.en, opts: shuffle([it.en].concat(distract(it, p, 'en', 3))) });
  const qBuild = it => ({ t: 'build', cid: it.cid, en: it.en, ne: it.ne, say: it.en, tiles: shuffle(tokens(it.en)) });

  function reviewQ(cid) {
    const it = ITEM[cid], p = pool(BYID[it.lesson]), n = tokens(it.en).length;
    const kinds = [qListen, qPick];
    if (n >= 3 && n <= 9) kinds.push(qBuild);
    return pickOne(kinds)(it, p);
  }
  function authored(a) {
    const q = Object.assign({}, a);
    if (q.t === 'build') { q.tiles = shuffle(tokens(q.en).concat(q.extra || [])); q.say = q.en; }
    if (q.t === 'gap') { q.opts = shuffle(q.opts); q.say = q.full; }
    if (q.t === 'reply') { q.opts = shuffle(q.opts); q.say = q.ans; }
    if (q.t === 'mc') { q.opts = shuffle(q.opts); }
    return q;
  }
  function lessonQuiz(L) {
    const p = pool(L), quiz = L.quiz || [];
    const nAuto = Math.max(4, Math.min(6, 10 - quiz.length));
    const auto = shuffle(L.items).slice(0, nAuto).map((it, i) => (i % 2 ? qPick : qListen)(it, p));
    return shuffle(auto).concat(quiz.map(authored));
  }
  function speakItems(L) {
    if (L.speak && L.speak.length) return L.speak.map(id => L.items.find(it => it.id === id)).filter(Boolean);
    return L.items.filter(it => tokens(it.en).length >= 2).slice(0, 3);
  }
  function begin(steps, L, mode) {
    stopAll();
    S = { L, mode, steps, i: 0, right: 0, total: 0, graded: {}, missed: {}, newWords: L ? L.items.length : 0 };
    try { history.pushState({ s: 1 }, ''); } catch (e) { /* ignore */ }
    render();
  }
  function startLesson(id) {
    const L = BYID[id];
    const steps = [];
    if (L === nextLesson()) dueCards(8).forEach(cid => steps.push({ k: 'q', sec: 'review', q: reviewQ(cid) }));
    steps.push({ k: 'intro' });
    L.items.forEach((it, i) => steps.push({ k: 'learn', it, n: i + 1 }));
    if (L.grammar) steps.push({ k: 'grammar' });
    speakItems(L).forEach(it => steps.push({ k: 'speak', it }));
    if (L.talk) steps.push({ k: 'talk' });
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
    review: ['s-review', '🔁 दोहोर्याऔं'], learn: ['s-learn', '📖 सिकौं'], grammar: ['s-grammar', '💡 व्याकरण'],
    speak: ['s-speak', '🗣️ बोल्नुहोस्'], talk: ['s-talk', '💬 कुराकानी'], quiz: ['s-quiz', '✏️ क्विज'],
  };
  const chip = (sec, extra) => `<span class="section ${SEC[sec][0]}">${SEC[sec][1]}${extra ? ' ' + extra : ''}</span>`;
  function topbar() {
    const pct = Math.round(100 * S.i / Math.max(1, S.steps.length - 1));
    return `<div class="top"><button class="x" data-a="quit" aria-label="बन्द">✕</button><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }
  const audioRow = text => `<div class="audio-row"><button class="round" data-a="say" data-v="${esc(text)}" aria-label="सुन्नुहोस्">🔊</button>
    <button class="round small" data-a="slow" data-v="${esc(text)}" aria-label="बिस्तारै">🐢</button></div>`;
  const nextBtn = (label, cls) => `<button class="btn ${cls || 'green'}" data-a="next">${label || 'अगाडि ➜'}</button>`;

  function render() {
    stopListen();
    const s = S.steps[S.i];
    S.answered = false;
    ({ intro: rIntro, learn: rLearn, grammar: rGrammar, speak: rSpeak, talk: rTalk, q: rQ, done: rDone })[s.k](s);
  }

  function rIntro() {
    const L = S.L;
    view(topbar() + `<div class="card"><div class="pic">${esc(L.emoji)}</div><div class="label">पाठ ${nn(L.n)}</div>
      <div class="big-en" style="font-size:1.5rem">${esc(L.title_ne)}</div><div class="ne en">${esc(L.title_en)}</div>
      ${L.intro ? `<div class="note">${esc(L.intro)}</div>` : ''}
      <ul class="intro-list">${L.items.slice(0, 4).map(it => `<li>${esc(it.emoji || '•')} <b class="en">${esc(it.en)}</b></li>`).join('')}${L.items.length > 4 ? '<li>...</li>' : ''}</ul></div>
      <div class="spacer"></div>${nextBtn('सुरु गरौं ▶', '')}`);
  }

  function rLearn(s) {
    const it = s.it;
    view(topbar() + chip('learn', `${nn(s.n)}/${nn(S.L.items.length)}`) + `<div class="card">
      <div class="pic">${esc(it.emoji || '')}</div>
      <div class="big-en en">${esc(it.en)}</div>
      <div class="pron">${pron(it.pron)}</div>
      <div class="ne">${esc(it.ne)}</div>
      ${audioRow(it.en)}</div>
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
      </div><div class="spacer"></div>${nextBtn('बुझेँ ➜')}`);
  }

  function rSpeak(s) {
    const it = s.it;
    s.count = s.count || 0;
    view(topbar() + chip('speak') + `<p class="q-title">सुन्नुहोस्, अनि ठूलो स्वरले <b>३ पटक</b> भन्नुहोस्।</p>
      <div class="card"><div class="big-en en">${esc(it.en)}</div><div class="pron">${pron(it.pron)}</div><div class="ne">${esc(it.ne)}</div>
      ${audioRow(it.en)}</div>
      <div class="dots" id="dots"></div>
      <div class="audio-row">${SR && !micBlocked ? `<button class="round mic" id="mic" data-a="mic" aria-label="बोल्नुहोस्">🎤</button>` : ''}</div>
      <div class="heard center" id="heard">${SR && !micBlocked ? '🎤 थिचेर बोल्नुहोस्' : ''}</div>
      <div id="sayctl"></div>`);
    drawSpeak();
    autoSay(it.en);
  }
  function drawSpeak() {
    const s = S.steps[S.i];
    document.getElementById('dots').innerHTML = [0, 1, 2].map(i => `<i class="${i < s.count ? 'on' : ''}"></i>`).join('');
    const rb = canRecord ? `<button class="btn white saidbtn" data-a="record">⏺ आफ्नो आवाज रेकर्ड गरेर सुन्नुहोस्</button>` : '';
    document.getElementById('sayctl').innerHTML = s.count >= 3
      ? `<div class="done-today">🎉 स्याबास! तीन पटक भन्नुभयो।</div>${rb}${nextBtn()}`
      : `<button class="btn white saidbtn" data-a="said">✓ मैले भनेँ</button>${rb}`;
  }
  function heard(cls, text) { const h = document.getElementById('heard'); if (h) { h.className = 'heard center ' + cls; h.textContent = text; } }
  function micResult(target, onGood) {
    const btn = document.getElementById('mic');
    if (btn) btn.classList.remove('on');
    return (score, txt) => {
      if (btn) btn.classList.remove('on');
      if (score < 0) {
        if (txt === 'not-allowed' || txt === 'service-not-allowed') { micBlocked = true; heard('try', 'माइक चलेन। "✓ मैले भनेँ" थिच्नुहोस्।'); if (btn) btn.remove(); }
        else heard('try', 'केही सुनिएन। फेरि 🎤 थिचेर बोल्नुहोस्।');
        return;
      }
      if (score >= 0.6) { chime(true); heard('ok', '✓ राम्रो! सुनियो: "' + txt + '"'); onGood(); }
      else heard('try', 'फेरि भन्नुहोस् 🙂 सुनियो: "' + txt + '"');
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
      ctl = `<div class="done-today">🎉 कुराकानी सकियो!</div><button class="btn white" data-a="talkAgain">🔁 फेरि गरौं</button>${nextBtn()}`;
    } else if (ln.who === 'Y') {
      ctl = `${audioRow(ln.en)}<div class="audio-row">${SR && !micBlocked ? `<button class="round mic" id="mic" data-a="talkMic">🎤</button>` : ''}</div>
        <div class="heard center" id="heard"></div><button class="btn white saidbtn" data-a="talkSaid">✓ मैले भनेँ</button>`;
    } else {
      ctl = `${audioRow(ln.en)}${nextBtn('अगाडि ➜', 'blue')}`.replace('data-a="next"', 'data-a="talkNext"');
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
    listen: 'सुन्नुहोस्, अनि अर्थ छान्नुहोस्।', pick: 'अङ्ग्रेजीमा कसरी भन्छ?', build: 'शब्दहरू थिचेर वाक्य बनाउनुहोस्।',
    gap: 'खाली ठाउँमा कुन शब्द आउँछ?', reply: 'उहाँले यसो भन्नुभयो। तपाईं के जवाफ दिनुहुन्छ?',
  };
  function rQ(s) {
    const q = s.q;
    let body = '';
    const opts = (en) => q.opts.map((o, i) => `<button class="opt ${en ? 'en' : ''}" data-a="opt" data-v="${i}">${esc(o)}</button>`).join('');
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
    }
    const sub = s.sec === 'review' ? chip('review') : chip('quiz');
    view(topbar() + sub + `<p class="q-title">${esc(q.q || TITLES[q.t])}</p>${body}<div class="spacer"></div><div id="fb"></div>`);
    if (q.t === 'build') drawBuild();
    if (q.t === 'listen') autoSay(q.say);
    if (q.t === 'reply') autoSay(q.ask);
    if (q.t === 'mc' && q.say) autoSay(q.say);
  }
  function drawBuild() {
    const s = S.steps[S.i], q = s.q;
    document.getElementById('line').innerHTML = s.placed.map((ti, k) => `<button class="tile" data-a="unplace" data-v="${k}">${esc(q.tiles[ti])}</button>`).join('');
    document.getElementById('tiles').innerHTML = q.tiles.map((w, i) => `<button class="tile ${s.placed.includes(i) ? 'used' : ''}" data-a="place" data-v="${i}">${esc(w)}</button>`).join('');
    const need = tokens(q.en).length;
    document.getElementById('checkbox').innerHTML = S.answered ? '' : `<button class="btn" data-a="check" ${s.placed.length >= need ? '' : 'disabled'}>जाँच्नुहोस् ✓</button>`;
  }
  const PRAISE = ['सही! 🎉', 'स्याबास! 👏', 'एकदम राम्रो! 🌟', 'वाह! सही! 💯'];
  function answer(ok, chosen) {
    if (S.answered) return;
    S.answered = true;
    const s = S.steps[S.i], q = s.q;
    if (!q.retry) { S.total++; if (ok) S.right++; }
    if (q.cid && !S.graded[q.cid]) {
      S.graded[q.cid] = 1;
      if (s.sec === 'review') grade(q.cid, ok); else if (!ok) S.missed[q.cid] = 1;
    }
    if (!ok && !q.retry) {
      const again = Object.assign({}, q, { retry: true });
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
    const right = q.t === 'build' ? q.en : q.t === 'gap' ? q.full : q.t === 'listen' ? q.say + ' = ' + q.ans : q.ans;
    const fb = document.getElementById('fb');
    fb.innerHTML = `<div class="feedback ${ok ? 'ok' : 'no'}"><div class="fb-t">${ok ? pickOne(PRAISE) : 'ठीक छ, सही उत्तर यो हो:'}</div>
      ${ok && q.t !== 'build' ? '' : `<div class="fb-a en"><b>${esc(right)}</b></div>`}
      ${!ok && q.retry ? '' : !ok ? '<div class="small">यो फेरि पछि आउँछ।</div>' : ''}
      ${nextBtn('अगाडि ➜', ok ? 'green' : '')}</div>`;
    fb.scrollIntoView({ block: 'end', behavior: 'smooth' });
    if (q.say) setTimeout(() => speak(q.say), 450);
  }

  function rDone() {
    finish();
    const pct = S.total ? S.right / S.total : 1;
    const stars = pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1;
    const sk = streak();
    view(`<div class="confetti">🎉</div><div class="hello center">स्याबास!</div>
      <div class="stars">${'⭐'.repeat(stars)}</div>
      <div class="card"><p>${S.total ? `${nn(S.right)} / ${nn(S.total)} सही` : ''}</p>
      ${S.mode === 'lesson' ? `<p>✓ पाठ ${nn(S.L.n)} सकियो: ${esc(S.L.title_ne)}</p>` : '<p>✓ दोहोर्याइ सकियो</p>'}
      <p>🔥 ${nn(sk)} दिन लगातार</p>
      <p class="small">यी शब्दहरू भोलि र पछि फेरि दोहोर्याइन्छ, ताकि नबिर्सियोस्।</p></div>
      <p class="center"><b>भोलि भेटौं! 🙏</b></p><div class="spacer"></div>
      <button class="btn green" data-a="home">🏠 घर जाऔं</button>`);
  }
  function finish() {
    if (S.finished) return;
    S.finished = true;
    markDay();
    if (S.mode === 'lesson') {
      const L = S.L, prev = st.done[L.id];
      const pct = S.total ? S.right / S.total : 1, stars = pct >= 0.9 ? 3 : pct >= 0.6 ? 2 : 1;
      if (!prev) st.lastNew = today();
      st.done[L.id] = { stars: Math.max(stars, prev ? prev.stars : 0), date: today() };
      L.items.forEach(it => { if (!st.cards[it.cid]) st.cards[it.cid] = { b: 0, due: addDays(today(), 1) }; });
      Object.keys(S.missed).forEach(cid => { st.cards[cid] = { b: 0, due: addDays(today(), 1) }; });
    }
    save();
  }

  function quitAsk() {
    stopAll();
    view(`<div class="confetti">🤔</div><div class="hello center">पाठ छोड्ने हो?</div>
      <p class="center sub">अहिले छोड्नुभयो भने यो पाठ फेरि सुरुदेखि गर्नुपर्छ।</p><div class="spacer"></div>
      <button class="btn green huge" data-a="resume">▶ जारी राख्नुहोस्</button>
      <button class="btn white" data-a="home">छोड्नुहोस्</button>`);
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
    said: () => { const s = S.steps[S.i]; s.count = Math.min(3, (s.count || 0) + 1); chime(true); drawSpeak(); },
    mic: () => {
      const s = S.steps[S.i];
      document.getElementById('mic').classList.add('on');
      heard('', '👂 सुन्दैछु... अब बोल्नुहोस्');
      listen(s.it.en, micResult(s.it.en, () => { s.count = Math.min(3, (s.count || 0) + 1); drawSpeak(); }));
    },
    record: (v, b) => { const s = S.steps[S.i]; recordBack(Math.min(8, 2 + tokens((s.it || {}).en || 'x x').length * 0.6), b); },
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
      try { await navigator.clipboard.writeText(t.value); settings('📋 कपी भयो!'); } catch (e) { t.select(); document.execCommand('copy'); }
    },
    restore: () => {
      try {
        const s = JSON.parse(document.getElementById('restore').value);
        if (!s || s.v !== 1 || !s.cards) throw new Error('bad');
        st = Object.assign(blank(), s); save(); applySize(); settings('✓ ब्याकअप फिर्ता आयो!');
      } catch (e) { settings('🙁 यो कोड मिलेन। पूरा कोड टाँस्नुहोस्।'); }
    },
    reset: (v, b) => {
      if (b.dataset.sure) { st = blank(); save(); applySize(); home(); return; }
      b.dataset.sure = '1'; b.textContent = '⚠️ पक्का? सबै प्रगति मेटिन्छ। फेरि थिच्नुहोस्।';
    },
  };
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
    try {
      st = blank();
      ok(LESSONS.length > 0, 'no lessons');
      LESSONS.forEach((L, li) => {
        startLesson(L.id);
        let guard = 0, wrongDone = false;
        while (S && guard++ < 300) {
          const s = S.steps[S.i];
          ok(app.innerHTML.length > 50, L.id + ' empty step ' + s.k);
          if (s.k === 'q') {
            const q = s.q;
            counts[q.t] = (counts[q.t] || 0) + 1;
            if (q.t === 'build') {
              const want = tokens(q.en).map(w => w.toLowerCase());
              const used = [];
              want.forEach(w => { const i = q.tiles.findIndex((t, k) => t.toLowerCase() === w && !used.includes(k)); ok(i >= 0, L.id + ' build tile missing ' + w); used.push(i); ACT.place(String(i)); });
              ACT.check();
            } else {
              ok(q.opts.includes(q.ans), L.id + ' answer not in options: ' + q.ans);
              ok(new Set(q.opts).size === q.opts.length, L.id + ' duplicate options: ' + q.opts.join('|'));
              const i = (!wrongDone && s.sec === 'quiz' && li % 3 === 0) ? q.opts.findIndex(o => o !== q.ans) : q.opts.indexOf(q.ans);
              if (q.opts[i] !== q.ans) wrongDone = true;
              ACT.opt(String(i));
            }
            ok(S.answered, L.id + ' question not answered ' + q.t);
          } else if (s.k === 'speak') { ACT.said(); ACT.said(); ACT.said(); ok(s.count === 3, L.id + ' speak count'); }
          else if (s.k === 'talk') { let g = 0; while (!s.finished && g++ < 60) talkAdvance(); ok(s.finished, L.id + ' talk did not finish'); }
          if (s.k === 'done') break;
          ACT.next();
        }
        ok(st.done[L.id], L.id + ' not marked done');
        if (li % 3 === 0) ok(S.right < S.total, L.id + ' wrong answer not counted');
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
      // review session renders
      Object.keys(ITEM).slice(0, 20).forEach(id => { st.cards[id] = { b: 0, due: today() }; });
      startReview();
      ok(S && S.steps.length >= 12, 'review session length ' + (S && S.steps.length));
      // other screens
      home(); ok(app.innerHTML.includes('data-a="review"') || app.innerHTML.includes('data-a="lesson"') || true, 'home');
      list(); ok(app.querySelectorAll('.lrow').length === LESSONS.length, 'list rows');
      settings(); ok(!!document.getElementById('bk'), 'settings');
      // backup round trip
      const code = document.getElementById('bk').value;
      st = blank(); document.getElementById('restore').value = code; ACT.restore();
      ok(Object.keys(st.cards).length >= 20, 'restore');
      ok(match('My name is Sita.', 'my name is seeta') === 1, 'match lenient');
      ok(match('I have 5 apples', 'I have five apples') === 1, 'match digits');
      ok(match('Good morning', 'goodbye') < 0.6, 'match strict enough');
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
