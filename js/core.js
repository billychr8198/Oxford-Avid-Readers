/* ============================================================
   core.js — state, storage, the unlock engine, indicator maths
   No build step, no modules: plain scripts so the page works
   from file:// and from GitHub Pages alike.
   ============================================================ */
(function () {
  "use strict";

  var KEY = "oxford.readers.register.v1";

  /* ---------------------------------------------------------- storage
     localStorage is blocked in some embedded previews, so fall back to
     an in-memory store rather than throwing and losing the session.   */
  var mem = {};
  var canPersist = (function () {
    try {
      var t = "__ox__";
      window.localStorage.setItem(t, "1");
      window.localStorage.removeItem(t);
      return true;
    } catch (e) { return false; }
  })();

  var store = {
    persists: canPersist,
    read: function () {
      try { return canPersist ? window.localStorage.getItem(KEY) : mem[KEY] || null; }
      catch (e) { return mem[KEY] || null; }
    },
    write: function (v) {
      try { if (canPersist) window.localStorage.setItem(KEY, v); else mem[KEY] = v; }
      catch (e) { mem[KEY] = v; }
    },
    clear: function () {
      try { if (canPersist) window.localStorage.removeItem(KEY); } catch (e) {}
      delete mem[KEY];
    }
  };

  /* ---------------------------------------------------------- rng
     mulberry32: small, fast, seeded. The seed lives in saved state so
     every reader gets their own draw order, stable across sessions.  */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, seed) {
    var out = list.slice(), r = rng(seed), i, j, tmp;
    for (i = out.length - 1; i > 0; i--) {
      j = Math.floor(r() * (i + 1));
      tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }

  /* ---------------------------------------------------------- rules
     Every number here is exposed in Settings. Defaults reproduce the
     brief exactly: 150 alumni, then a lecture every 3rd chapter up to
     390, then a 3% bonus per further chapter; 3 colleges per book;
     0.25% advance per page; 13 books to finish.                       */
  var DEFAULT_RULES = {
    pageBoost:       0.25,  // % of the remaining gap closed per page read
    bonusPerChapter: 3,     // % added per chapter beyond the lecture ceiling
    alumniCap:       150,   // one alumnus per chapter, up to this many
    chaptersPerVideo: 3,    // after the cap, one lecture per N chapters
    collegesPerBook: 3,     // colleges opened when a book is archived
    booksToWin:      13     // finish this many and Oxford tops the world
  };

  var DEFAULT_PREFS = {
    theme: "night",
    motion: "full",
    revealLocked: false,   // show names of alumni you haven't unlocked yet
    confirmDelete: true
  };

  /* ---------------------------------------------------------- indicators
     A reader's pages buy "standing". Each page closes 0.25% of the gap
     between a struggling institution and a world-leading one, so growth
     is fast at first and grinds later — which is how endowments,
     rankings and reputations actually behave.

     standing = pages x ln(1 + boost) / MATURITY, clamped to 1.
     At the default 0.25% that is ~5,206 pages, roughly thirteen books.
     Each indicator then bends that standing by its own exponent, so
     money arrives early and sustainability arrives last.               */
  var MATURITY = 13;

  var INDICATORS = [
    { key: "endowment", label: "Endowment", kind: "money",
      start: 45e6, target: 8.4e9, ease: 0.75,
      note: "Benefactions compound before anything else does." },

    { key: "budget", label: "Annual income", kind: "money",
      start: 68e6, target: 3.05e9, ease: 0.85,
      note: "Research grants follow the endowment by about a decade." },

    { key: "acceptance", label: "Acceptance rate", kind: "percent", lowerIsBetter: true,
      start: 92, target: 15.6, ease: 1.35,
      note: "Selectivity is a symptom of reputation, never a cause." },

    { key: "qs", label: "QS world ranking", kind: "rank", lowerIsBetter: true,
      start: 1401, target: 1, ease: 1.8,
      note: "The stubbornest number here. It moves last, and slowly." },

    { key: "employability", label: "Graduate employability", kind: "score",
      start: 18.4, target: 100, ease: 1.05,
      note: "Employers notice a rising place sooner than rankers do." },

    { key: "reputation", label: "Academic reputation", kind: "score",
      start: 12.7, target: 100, ease: 1.15,
      note: "Built by citation, hiring and forty years of patience." },

    { key: "sustainability", label: "Sustainability", kind: "score",
      start: 9.5, target: 100, ease: 2.4,
      note: "Retrofitting medieval stone is the slowest work of all." }
  ];

  function lerp(a, b, t) { return a + (b - a) * t; }
  function logLerp(a, b, t) { return Math.exp(lerp(Math.log(a), Math.log(b), t)); }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function computeStanding(pages, rules) {
    var boost = Math.max(0.0001, rules.pageBoost) / 100;
    var per = Math.log(1 + boost);
    return clamp((pages * per) / MATURITY, 0, 1);
  }

  function pagesForFullStanding(rules) {
    var boost = Math.max(0.0001, rules.pageBoost) / 100;
    return Math.ceil(MATURITY / Math.log(1 + boost));
  }

  /* Chapters past the lecture ceiling pay a flat bonus per the brief. */
  function bonusPercent(chapters, rules) {
    var ceiling = rules.alumniCap + rules.chaptersPerVideo * window.VIDEOS.length;
    var extra = Math.max(0, chapters - ceiling);
    return { extra: extra, pct: extra * rules.bonusPerChapter, ceiling: ceiling };
  }

  function evaluate(pages, chapters, rules) {
    var standing = computeStanding(pages, rules);
    var bonus = bonusPercent(chapters, rules);
    var mult = 1 + bonus.pct / 100;

    var rows = INDICATORS.map(function (ind) {
      var t = Math.pow(standing, ind.ease);
      var raw, display, sub, over = false;

      if (ind.kind === "money") {
        raw = logLerp(ind.start, ind.target, t) * mult;
        over = mult > 1;
        display = fmtMoney(raw);
        sub = fmtMoney(ind.target) + " target";

      } else if (ind.kind === "percent") {
        raw = clamp(lerp(ind.start, ind.target, t) / mult, 1.5, 100);
        over = mult > 1;
        display = raw.toFixed(1) + "%";
        sub = ind.target.toFixed(1) + "% target";

      } else if (ind.kind === "rank") {
        raw = Math.max(1, Math.round(logLerp(ind.start, ind.target, t)));
        over = raw === 1 && mult > 1;
        display = "#" + raw.toLocaleString("en-GB");
        sub = "#1 target";

      } else { // score out of 100
        raw = clamp(lerp(ind.start, ind.target, t), 0, 100);
        over = raw >= 99.95 && mult > 1;
        display = raw.toFixed(1);
        sub = "100.0 target";
      }

      return {
        key: ind.key, label: ind.label, note: ind.note, kind: ind.kind,
        value: raw, display: display, sub: sub, fill: t, over: over,
        lowerIsBetter: !!ind.lowerIsBetter
      };
    });

    var composite = rows.reduce(function (s, r) { return s + r.fill; }, 0) / rows.length;
    return { standing: standing, composite: composite, bonus: bonus, rows: rows };
  }

  function fmtMoney(v) {
    if (v >= 1e9) return "£" + (v / 1e9).toFixed(2) + "bn";
    if (v >= 1e6) return "£" + (v / 1e6).toFixed(1) + "m";
    if (v >= 1e3) return "£" + Math.round(v / 1e3) + "k";
    return "£" + Math.round(v);
  }

  /* ---------------------------------------------------------- state */
  function freshState() {
    var seed = (Math.random() * 4294967296) >>> 0;
    return {
      v: 1,
      seed: seed,
      reader: "",
      matriculated: new Date().toISOString(),
      books: [],
      nextBookId: 1,
      rules: Object.assign({}, DEFAULT_RULES),
      prefs: Object.assign({}, DEFAULT_PREFS),
      queues: buildQueues(seed),
      granted: { alumni: [], videos: [], colleges: [] },
      log: [],
      seenVictory: false
    };
  }

  function buildQueues(seed) {
    return {
      alumni:   shuffle(window.ALUMNI.map(function (a) { return a.id; }), seed ^ 0x9E3779B9),
      videos:   shuffle(window.VIDEOS.map(function (v) { return v.id; }), seed ^ 0x85EBCA6B),
      colleges: shuffle(window.COLLEGES.map(function (c) { return c.id; }), seed ^ 0xC2B2AE35)
    };
  }

  var state = null;

  function load() {
    var raw = store.read();
    if (raw) {
      try {
        var s = JSON.parse(raw);
        s.rules = Object.assign({}, DEFAULT_RULES, s.rules || {});
        s.prefs = Object.assign({}, DEFAULT_PREFS, s.prefs || {});
        s.granted = Object.assign({ alumni: [], videos: [], colleges: [] }, s.granted || {});
        s.log = s.log || [];
        s.books = s.books || [];
        if (!s.queues) s.queues = buildQueues(s.seed || 1);
        state = s;
        return state;
      } catch (e) { /* corrupt save — start clean rather than trap the reader */ }
    }
    state = freshState();
    return state;
  }

  function save() {
    try { store.write(JSON.stringify(state)); } catch (e) {}
  }

  /* ---------------------------------------------------------- totals */
  function totals() {
    var pages = 0, chapters = 0, done = 0, active = 0;
    state.books.forEach(function (b) {
      pages += b.pagesRead || 0;
      chapters += (b.chapters || []).filter(Boolean).length;
      if (b.archived) done++; else active++;
    });
    return { pages: pages, chapters: chapters, booksDone: done, booksActive: active };
  }

  /* ---------------------------------------------------------- unlock engine
     Unlocks are recomputed from totals rather than accumulated, so
     ticking and un-ticking a chapter always lands on the same state.
     Grants are drawn in order from a per-reader shuffled queue: that
     guarantees a random draw with no repeats, ever, across all books. */
  function targetCounts(t, rules) {
    var alumni = Math.min(t.chapters, rules.alumniCap, window.ALUMNI.length);
    var afterCap = Math.max(0, t.chapters - rules.alumniCap);
    var videos = Math.min(Math.floor(afterCap / rules.chaptersPerVideo), window.VIDEOS.length);
    var colleges = Math.min(t.booksDone * rules.collegesPerBook, window.COLLEGES.length);
    return { alumni: alumni, videos: videos, colleges: colleges };
  }

  function sync(context) {
    var t = totals();
    var want = targetCounts(t, state.rules);
    var fresh = [];

    ["alumni", "videos", "colleges"].forEach(function (kind) {
      var have = state.granted[kind];
      while (have.length > want[kind]) {
        var back = have.pop();
        state.queues[kind].unshift(back);
        for (var i = state.log.length - 1; i >= 0; i--) {
          if (state.log[i].kind === kind && state.log[i].ref === back) { state.log.splice(i, 1); break; }
        }
      }
      while (have.length < want[kind] && state.queues[kind].length) {
        var ref = state.queues[kind].shift();
        have.push(ref);
        var entry = {
          kind: kind, ref: ref,
          seq: have.length,
          at: Date.now(),
          book: context && context.bookTitle ? context.bookTitle : null
        };
        state.log.push(entry);
        fresh.push(entry);
      }
    });

    if (state.log.length > 400) state.log = state.log.slice(-400);
    return fresh;
  }

  /* ---------------------------------------------------------- books */
  function addBook(fields) {
    var b = {
      id: state.nextBookId++,
      title: fields.title,
      author: fields.author || "",
      totalPages: Math.max(1, fields.totalPages | 0),
      totalChapters: Math.max(1, fields.totalChapters | 0),
      pagesRead: 0,
      chapters: [],
      review: "",
      rating: 0,
      archived: false,
      started: new Date().toISOString(),
      finished: null
    };
    for (var i = 0; i < b.totalChapters; i++) b.chapters.push(false);
    state.books.unshift(b);
    save();
    return b;
  }

  function getBook(id) {
    for (var i = 0; i < state.books.length; i++) if (state.books[i].id === id) return state.books[i];
    return null;
  }

  function removeBook(id) {
    state.books = state.books.filter(function (b) { return b.id !== id; });
    var fresh = sync();
    save();
    return fresh;
  }

  /* Resizing a book keeps whatever chapter ticks still fit. */
  function resizeChapters(book, n) {
    n = Math.max(1, n | 0);
    var next = [];
    for (var i = 0; i < n; i++) next.push(book.chapters[i] || false);
    book.chapters = next;
    book.totalChapters = n;
  }

  window.OX = {
    store: store,
    rng: rng,
    shuffle: shuffle,
    DEFAULT_RULES: DEFAULT_RULES,
    DEFAULT_PREFS: DEFAULT_PREFS,
    INDICATORS: INDICATORS,
    MATURITY: MATURITY,
    evaluate: evaluate,
    fmtMoney: fmtMoney,
    computeStanding: computeStanding,
    pagesForFullStanding: pagesForFullStanding,
    bonusPercent: bonusPercent,
    buildQueues: buildQueues,
    freshState: freshState,
    load: load,
    save: save,
    totals: totals,
    targetCounts: targetCounts,
    sync: sync,
    addBook: addBook,
    getBook: getBook,
    removeBook: removeBook,
    resizeChapters: resizeChapters,
    get state() { return state; },
    set state(v) { state = v; }
  };
})();
