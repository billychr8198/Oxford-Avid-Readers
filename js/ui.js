/* ============================================================
   ui.js — views, rendering and interaction
   ============================================================ */
(function () {
  "use strict";

  var S = function () { return window.OX.state; };
  var ALUMNI = window.ALUMNI, COLLEGES = window.COLLEGES, VIDEOS = window.VIDEOS;

  var byId = {
    alumni: index(ALUMNI), colleges: index(COLLEGES), videos: index(VIDEOS)
  };
  function index(list) {
    var m = {}; list.forEach(function (x) { m[x.id] = x; }); return m;
  }

  var route = "register";
  var mapReady = false;
  var recentColleges = [];
  var ceremonyQueue = [];
  var filters = { alumni: "all", lectures: "all", colleges: "all" };

  /* ---------------------------------------------------------- helpers */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function num(n) { return Number(n || 0).toLocaleString("en-GB"); }

  /* Markdown-lite: the source files use paragraphs, **bold labels** and
     *italic entries*, and nothing else. */
  function md(text) {
    return String(text || "")
      .split(/\n{2,}/)
      .map(function (block) {
        var b = block.trim();
        if (!b || /^-{3,}$/.test(b)) return "";
        b = esc(b)
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
          .replace(/\n/g, "<br>");
        return "<p>" + b + "</p>";
      })
      .join("");
  }

  function initials(name) {
    var parts = String(name).replace(/[^A-Za-z .'-]/g, "").split(/[\s.]+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function hash(s) {
    var h = 2166136261, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* The twenty medieval figures predate portraiture, so they get an
     armorial plate instead of a photograph. */
  function crestPlate(name, big) {
    var h = hash(name);
    var rot = (h % 4) * 45;
    var size = big ? 132 : 92;
    return '<svg viewBox="0 0 120 160" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs><pattern id="hx' + h + '" width="9" height="9" patternTransform="rotate(' + rot + ')" patternUnits="userSpaceOnUse">' +
      '<line x1="0" y1="0" x2="0" y2="9" stroke="var(--accent)" stroke-width="1" opacity=".22"/></pattern></defs>' +
      '<rect width="120" height="160" fill="var(--panel-3)"/>' +
      '<rect width="120" height="160" fill="url(#hx' + h + ')"/>' +
      '<circle cx="60" cy="72" r="34" fill="var(--panel)" stroke="var(--accent)" stroke-width="1.2"/>' +
      '<circle cx="60" cy="72" r="29" fill="none" stroke="var(--accent)" stroke-width=".6" opacity=".6"/>' +
      '<text x="60" y="82" text-anchor="middle" font-family="Cormorant Garamond, Garamond, serif" ' +
      'font-size="26" fill="var(--accent)">' + esc(initials(name)) + '</text>' +
      '<text x="60" y="128" text-anchor="middle" font-family="IBM Plex Mono, monospace" ' +
      'font-size="6.5" letter-spacing="1.6" fill="var(--text-faint)">NO PORTRAIT</text>' +
      '</svg>';
  }

  function portrait(a, big) {
    if (a.image) return '<img src="' + esc(a.image) + '" alt="' + esc(a.name) + '" loading="lazy">';
    return crestPlate(a.name, big);
  }

  function lockIcon() {
    return '<svg class="lockmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">' +
      '<rect x="4" y="10" width="16" height="11" rx="1.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
  }

  function toast(msg) {
    var stack = $("#toasts");
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    stack.appendChild(t);
    setTimeout(function () {
      t.style.transition = "opacity .4s"; t.style.opacity = "0";
      setTimeout(function () { t.remove(); }, 420);
    }, 2300);
  }

  function granted(kind, id) { return S().granted[kind].indexOf(id) > -1; }

  /* ---------------------------------------------------------- routing */
  var VIEWS = {
    register: { label: "Register", count: null },
    reading:  { label: "Reading",  count: function (t) { return t.booksActive; } },
    library:  { label: "Library",  count: function (t) { return t.booksDone; } },
    alumni:   { label: "Alumni",   count: function () { return S().granted.alumni.length + "/" + ALUMNI.length; } },
    colleges: { label: "Colleges", count: function () { return S().granted.colleges.length + "/" + COLLEGES.length; } },
    lectures: { label: "Lectures", count: function () { return S().granted.videos.length + "/" + VIDEOS.length; } },
    settings: { label: "Settings", count: null }
  };

  function go(name) {
    if (!VIEWS[name]) name = "register";
    route = name;
    $$(".nav__item").forEach(function (b) {
      b.setAttribute("aria-current", b.dataset.route === name ? "page" : "false");
    });
    if (location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
    render();
    window.scrollTo({ top: 0, behavior: S().prefs.motion === "calm" ? "auto" : "smooth" });
  }

  function refreshNav() {
    var t = window.OX.totals();
    $$(".nav__item").forEach(function (b) {
      var v = VIEWS[b.dataset.route];
      var slot = $(".nav__count", b);
      if (!slot) return;
      slot.textContent = v.count ? v.count(t) : "";
    });
    var ev = window.OX.evaluate(t.pages, t.chapters, S().rules);
    var s = $("#railStanding");
    if (s) s.innerHTML = "<span>World standing</span><b>" + (ev.composite * 100).toFixed(1) + "%</b>";
    var bar = $("#railBar");
    if (bar) bar.style.width = (ev.composite * 100).toFixed(1) + "%";
  }

  /* ---------------------------------------------------------- render */
  function render() {
    var host = $("#view");
    var t = window.OX.totals();
    var ev = window.OX.evaluate(t.pages, t.chapters, S().rules);
    var html = "";
    if (route === "register") html = viewRegister(t, ev);
    else if (route === "reading") html = viewReading(t);
    else if (route === "library") html = viewLibrary(t);
    else if (route === "alumni") html = viewAlumni();
    else if (route === "colleges") html = viewColleges();
    else if (route === "lectures") html = viewLectures(t);
    else if (route === "settings") html = viewSettings(t, ev);
    host.innerHTML = html;
    refreshNav();

    if (route === "register") animateIndicators();
    if (route === "colleges") mountMap();
    document.title = VIEWS[route].label + " — The Reader's Register";
  }

  /* ============================================================
     REGISTER
     ============================================================ */
  function viewRegister(t, ev) {
    var r = S().rules;
    var won = t.booksDone >= r.booksToWin;
    var name = S().reader ? esc(S().reader) : "";
    var pips = "";
    for (var i = 0; i < r.booksToWin; i++) {
      pips += '<span class="terms__pip" data-on="' + (i < t.booksDone ? 1 : 0) + '"></span>';
    }

    var h = "";

    h += '<div class="masthead">' +
      '<div class="masthead__top"><div>' +
        '<p class="masthead__motto">Dominus Illuminatio Mea</p>' +
        '<h1>' + (name ? name + "&rsquo;s Register" : "The Reader&rsquo;s Register") + '</h1>' +
        '<p class="masthead__sub">Every page you read raises the University. Every chapter admits a name to Convocation. ' +
        'Thirteen books and Oxford stands first in the world.</p>' +
        (name ? "" : '<div class="stack" style="margin-top:16px">' +
          '<input class="input" id="readerName" placeholder="Sign the register with your name" style="max-width:280px" autocomplete="name">' +
          '<button class="btn btn--primary" data-action="sign">Sign in the register</button></div>') +
      '</div>' +
      '<div class="masthead__crest brandplate"><img src="assets/oxford-crest.png" alt="" width="320" height="287"></div></div>' +

      '<div class="tally">' +
        tallyItem(num(t.pages), "Pages read") +
        tallyItem(num(t.chapters), "Chapters") +
        tallyItem(t.booksDone + '<small>/' + r.booksToWin + '</small>', "Books archived") +
        tallyItem(num(S().granted.alumni.length) + '<small>/' + ALUMNI.length + '</small>', "Alumni") +
        tallyItem(num(S().granted.colleges.length) + '<small>/' + COLLEGES.length + '</small>', "Colleges") +
        tallyItem(num(S().granted.videos.length) + '<small>/' + VIDEOS.length + '</small>', "Lectures") +
      '</div>' +
      '<div class="terms">' + pips + '</div>' +
    '</div>';

    if (won) h += victoryPanel(t, ev);

    // what the next chapter buys you
    h += '<div class="grid grid--2 section">' + nextUpPanel(t, ev) + quickLogPanel(t) + '</div>';

    // indicators
    h += '<div class="section"><div class="section-title"><h2>The seven indicators</h2>' +
      '<small>' + (S().rules.pageBoost) + '% per page' +
      (ev.bonus.pct > 0 ? ' &middot; +' + ev.bonus.pct + '% bonus' : '') + '</small></div>' +
      '<p class="page-lede" style="margin-bottom:16px">Each page closes ' + r.pageBoost +
      '% of the gap between a struggling institution and a world-leading one, so the early climb is quick and the last stretch is brutal. ' +
      'The indicators move at different speeds because money, reputation and retrofitted stone move at different speeds.</p>' +
      '<div class="panel">' + ev.rows.map(indicatorRow).join("") + '</div></div>';

    h += feedPanel();
    return h;
  }

  function tallyItem(n, k) {
    return '<div class="tally__item"><div class="tally__n">' + n + '</div><div class="tally__k">' + k + '</div></div>';
  }

  function indicatorRow(row) {
    return '<div class="ind">' +
      '<div class="ind__head"><span class="ind__name">' + esc(row.label) + '</span>' +
      '<span class="ind__val">' + row.display + '</span></div>' +
      '<div class="ind__track"><div class="ind__fill' + (row.over ? " ind__fill--over" : "") +
      '" data-fill="' + (row.fill * 100).toFixed(2) + '"></div></div>' +
      '<div class="ind__foot"><span class="ind__note">' + esc(row.note) + '</span>' +
      '<span>' + esc(row.sub) + (row.over ? ' <span class="ind__bonus">&#9650; bonus</span>' : '') + '</span></div>' +
      '</div>';
  }

  function animateIndicators() {
    requestAnimationFrame(function () {
      $$(".ind__fill").forEach(function (f, i) {
        var delay = S().prefs.motion === "calm" ? 0 : i * 70;
        setTimeout(function () { f.style.width = f.dataset.fill + "%"; }, delay);
      });
    });
  }

  function nextUpPanel(t, ev) {
    var r = S().rules, body;
    var capAlumni = Math.min(r.alumniCap, ALUMNI.length);
    if (t.chapters < capAlumni) {
      var left = capAlumni - t.chapters;
      body = '<p>Your next finished chapter admits <strong>alumnus no.' + (t.chapters + 1) +
        ' of ' + capAlumni + '</strong> to Convocation — drawn at random from the ones you have not met.</p>' +
        '<p class="ind__note">' + num(left) + ' chapters until the roll is complete. After that, chapters start opening lectures instead.</p>';
    } else if (t.chapters < ev.bonus.ceiling) {
      var into = t.chapters - capAlumni;
      var need = r.chaptersPerVideo - (into % r.chaptersPerVideo);
      body = '<p>Convocation is full. Chapters now open the Union&rsquo;s lecture reel: one for every ' +
        r.chaptersPerVideo + '.</p><p><strong>' + need + ' more chapter' + (need === 1 ? "" : "s") +
        '</strong> opens lecture ' + (S().granted.videos.length + 1) + ' of ' + VIDEOS.length + '.</p>' +
        '<p class="ind__note">All ' + VIDEOS.length + ' are open at ' + num(ev.bonus.ceiling) + ' chapters.</p>';
    } else {
      body = '<p>Past ' + num(ev.bonus.ceiling) + ' chapters there is nothing left to unlock, so every further chapter is paid ' +
        'straight into the University: <strong>+' + r.bonusPerChapter + '% to all seven indicators</strong>.</p>' +
        '<p class="mono" style="color:var(--good)">' + num(ev.bonus.extra) + ' bonus chapters &middot; +' + ev.bonus.pct + '% applied</p>';
    }
    var pagesFull = window.OX.pagesForFullStanding(S().rules);
    return '<div class="panel"><div class="section-title"><h2>What the next chapter buys</h2></div><hr class="rule">' +
      body +
      '<hr class="rule"><div class="ind__foot"><span class="ind__note">World standing</span>' +
      '<span class="mono">' + (ev.composite * 100).toFixed(1) + '% &middot; ' + num(t.pages) + '/' + num(pagesFull) + ' pages</span></div></div>';
  }

  function quickLogPanel(t) {
    var open = S().books.filter(function (b) { return !b.archived; });
    if (!open.length) {
      return '<div class="panel"><div class="section-title"><h2>Nothing on the desk</h2></div><hr class="rule">' +
        '<p>The register is open and empty. Add the book you are reading now and log the first chapter.</p>' +
        '<button class="btn btn--primary" data-action="goto" data-to="reading">Add a book</button></div>';
    }
    var b = open[0];
    var doneCh = b.chapters.filter(Boolean).length;
    return '<div class="panel"><div class="section-title"><h2>On the desk</h2><small>' +
      (open.length > 1 ? open.length + " books open" : "1 book open") + '</small></div><hr class="rule">' +
      '<h3 style="font-size:24px">' + esc(b.title) + '</h3>' +
      (b.author ? '<p class="book__author">' + esc(b.author) + '</p>' : '') +
      '<div class="pagebar" style="margin-top:14px"><div class="pagebar__track">' +
      '<div class="pagebar__fill" style="width:' + Math.min(100, (b.pagesRead / b.totalPages) * 100).toFixed(1) + '%"></div>' +
      '<div class="pagebar__label">' + num(b.pagesRead) + ' / ' + num(b.totalPages) + ' pages &middot; ' +
      doneCh + '/' + b.totalChapters + ' chapters</div></div></div>' +
      '<div class="stack">' +
      '<button class="btn" data-action="pages" data-id="' + b.id + '" data-delta="10">+10 pages</button>' +
      '<button class="btn" data-action="pages" data-id="' + b.id + '" data-delta="25">+25 pages</button>' +
      '<button class="btn btn--primary" data-action="nextchapter" data-id="' + b.id + '">Finish next chapter</button>' +
      '<button class="btn btn--ghost" data-action="goto" data-to="reading">Open</button>' +
      '</div></div>';
  }

  function feedPanel() {
    var log = S().log.slice(-12).reverse();
    if (!log.length) return "";
    var rows = log.map(function (e) {
      var label, kind;
      if (e.kind === "alumni") { label = byId.alumni[e.ref].name; kind = "Convocation"; }
      else if (e.kind === "videos") { label = byId.videos[e.ref].title; kind = "Union lecture"; }
      else { label = byId.colleges[e.ref].name; kind = "College"; }
      return '<div class="feed__row"><span class="feed__seq">' + e.seq + '</span>' +
        '<span class="feed__what"><b>' + esc(label) + '</b>' +
        (e.book ? ' <span class="ind__note">&mdash; ' + esc(e.book) + '</span>' : '') + '</span>' +
        '<span class="feed__kind">' + kind + '</span></div>';
    }).join("");
    return '<div class="section"><div class="section-title"><h2>Lately unlocked</h2>' +
      '<small>Most recent first</small></div><div class="panel">' + rows + '</div></div>';
  }

  function victoryPanel(t, ev) {
    return '<div class="panel section" style="border-color:var(--accent)">' +
      '<div class="laurels" style="padding:32px 16px">' +
      '<img src="assets/oxford-crest.png" alt="" width="150" height="134">' +
      '<p class="eyebrow">Congregation has risen</p>' +
      '<h2>Oxford is the best university in the world.</h2>' +
      '<div class="rank">#1</div>' +
      '<p style="max-width:52ch;margin:0 auto;color:var(--text-dim)">Thirteen books, ' + num(t.pages) +
      ' pages and ' + num(t.chapters) + ' chapters. All ' + COLLEGES.length + ' colleges are open, ' +
      'Convocation is full, and the endowment stands at ' + ev.rows[0].display + '.</p>' +
      '<div class="stack" style="justify-content:center;margin-top:24px">' +
      '<button class="btn" data-action="goto" data-to="library">Read the shelf back</button>' +
      '<button class="btn btn--ghost" data-action="goto" data-to="settings">Start a new register</button>' +
      '</div></div></div>';
  }

  /* ============================================================
     READING
     ============================================================ */
  function viewReading(t) {
    var open = S().books.filter(function (b) { return !b.archived; });
    var h = '<p class="eyebrow">Books in progress</p><h1 class="page-title">Reading</h1>' +
      '<p class="page-lede">Log pages as you go and tick a chapter the moment you finish it. ' +
      'Chapters are what admit alumni; pages are what fund the place.</p>';

    h += '<div class="panel section"><div class="section-title"><h2>Add a book</h2></div><hr class="rule">' +
      '<div class="row">' +
      field("Title", '<input class="input" id="nbTitle" placeholder="The Name of the Rose" autocomplete="off">') +
      field("Author", '<input class="input" id="nbAuthor" placeholder="Umberto Eco" autocomplete="off">') +
      '</div><div class="row" style="margin-top:12px">' +
      field("Pages", '<input class="input input--num" id="nbPages" type="number" min="1" max="20000" value="320" inputmode="numeric">') +
      field("Chapters", '<input class="input input--num" id="nbChapters" type="number" min="1" max="500" value="24" inputmode="numeric">') +
      '<button class="btn btn--primary" data-action="addbook">Add to the desk</button>' +
      '</div><p class="field__hint">Chapter count decides how many alumni this book can admit. Both numbers can be changed later.</p></div>';

    if (!open.length) {
      h += '<div class="empty"><h3>No books on the desk</h3>' +
        '<p>Add the one you are reading now. Even a book you are halfway through counts — set the pages you have already read.</p></div>';
    } else {
      h += open.map(bookCard).join("");
    }
    return h;
  }

  function field(label, control) {
    return '<div class="field"><label class="field__label">' + label + '</label>' + control + '</div>';
  }

  function bookCard(b) {
    var done = b.chapters.filter(Boolean).length;
    var pagePct = Math.min(100, (b.pagesRead / b.totalPages) * 100);
    var complete = done === b.totalChapters && b.pagesRead >= b.totalPages;

    var chips = "";
    for (var i = 0; i < b.totalChapters; i++) {
      chips += '<button class="chip" role="switch" aria-pressed="' + (b.chapters[i] ? "true" : "false") +
        '" data-action="chapter" data-id="' + b.id + '" data-i="' + i + '" aria-label="Chapter ' + (i + 1) + '">' + (i + 1) + '</button>';
    }

    return '<article class="book" data-book="' + b.id + '">' +
      '<div class="book__head"><span class="book__spine"></span><div>' +
      '<h3 class="book__title">' + esc(b.title) + '</h3>' +
      (b.author ? '<p class="book__author">' + esc(b.author) + '</p>' : '') +
      '</div><div class="book__meta">' + done + '/' + b.totalChapters + ' chapters<br>' +
      num(b.pagesRead) + '/' + num(b.totalPages) + ' pages</div></div>' +

      '<div class="book__body">' +
      '<div class="pagebar"><label class="field__label">Pages read</label>' +
      '<div class="pagebar__track"><div class="pagebar__fill" style="width:' + pagePct.toFixed(1) + '%"></div>' +
      '<div class="pagebar__label">' + pagePct.toFixed(0) + '%</div></div>' +
      '<div class="stack" style="margin-top:10px">' +
      '<input class="input input--num" type="number" min="0" max="' + b.totalPages + '" value="' + b.pagesRead +
      '" data-action="setpages" data-id="' + b.id + '" style="max-width:110px" inputmode="numeric" aria-label="Pages read">' +
      '<button class="btn btn--sm" data-action="pages" data-id="' + b.id + '" data-delta="1">+1</button>' +
      '<button class="btn btn--sm" data-action="pages" data-id="' + b.id + '" data-delta="10">+10</button>' +
      '<button class="btn btn--sm" data-action="pages" data-id="' + b.id + '" data-delta="25">+25</button>' +
      '<button class="btn btn--sm" data-action="pages" data-id="' + b.id + '" data-delta="-10">&minus;10</button>' +
      '<button class="btn btn--sm" data-action="allpages" data-id="' + b.id + '">All ' + num(b.totalPages) + '</button>' +
      '</div></div>' +

      '<label class="field__label">Chapters finished</label>' +
      '<div class="stack" style="margin-bottom:10px">' +
      '<button class="btn btn--sm btn--primary" data-action="nextchapter" data-id="' + b.id + '">Finish next chapter</button>' +
      '<button class="btn btn--sm" data-action="allchapters" data-id="' + b.id + '">Tick all</button>' +
      '<button class="btn btn--sm btn--ghost" data-action="noneChapters" data-id="' + b.id + '">Clear</button>' +
      '</div>' +
      '<div class="chapters">' + chips + '</div>' +

      '<hr class="rule">' +
      '<label class="field__label">Review</label>' +
      '<textarea class="textarea" data-action="review" data-id="' + b.id +
      '" placeholder="What did it do to you? Written here, kept in the Library.">' + esc(b.review) + '</textarea>' +
      '<div class="stack" style="margin-top:12px;align-items:center">' +
      '<span class="field__label" style="margin:0">Rating</span>' + starPicker(b) +
      '</div>' +

      '<hr class="rule">' +
      '<details style="margin-bottom:14px"><summary class="field__label" style="cursor:pointer">Edit book details</summary>' +
      '<div class="row" style="margin-top:12px">' +
      field("Title", '<input class="input" value="' + esc(b.title) + '" data-action="edit" data-id="' + b.id + '" data-f="title">') +
      field("Author", '<input class="input" value="' + esc(b.author) + '" data-action="edit" data-id="' + b.id + '" data-f="author">') +
      '</div><div class="row" style="margin-top:10px">' +
      field("Pages", '<input class="input input--num" type="number" min="1" value="' + b.totalPages + '" data-action="edit" data-id="' + b.id + '" data-f="totalPages">') +
      field("Chapters", '<input class="input input--num" type="number" min="1" max="500" value="' + b.totalChapters + '" data-action="edit" data-id="' + b.id + '" data-f="totalChapters">') +
      '</div><p class="field__hint">Reducing the chapter count releases the alumni those chapters admitted.</p></details>' +

      '<div class="stack">' +
      '<button class="btn ' + (complete ? "btn--primary" : "") + '" data-action="archive" data-id="' + b.id + '">' +
      (complete ? "Archive &amp; open 3 colleges" : "Archive as finished") + '</button>' +
      '<button class="btn btn--danger btn--sm" data-action="delbook" data-id="' + b.id + '">Remove</button>' +
      '</div>' +
      (complete ? '<p class="field__hint" style="color:var(--good)">Every page and chapter is logged. Archive it to open three more colleges.</p>' : '') +
      '</div></article>';
  }

  function starPicker(b) {
    var out = '<span class="stars" data-stars="' + b.id + '">';
    for (var i = 1; i <= 5; i++) {
      out += '<button class="btn btn--ghost btn--sm" style="border:0;padding:1px 3px;font-size:17px;color:inherit" ' +
        'data-action="rate" data-id="' + b.id + '" data-v="' + i + '" aria-label="' + i + ' out of 5">' +
        (i <= b.rating ? "&#9733;" : '<i>&#9733;</i>') + '</button>';
    }
    return out + '</span>';
  }

  /* ============================================================
     LIBRARY
     ============================================================ */
  function viewLibrary(t) {
    var shelf = S().books.filter(function (b) { return b.archived; });
    var h = '<p class="eyebrow">' + t.booksDone + ' of ' + S().rules.booksToWin + ' archived</p>' +
      '<h1 class="page-title">Library</h1>' +
      '<p class="page-lede">Everything you have finished, with the review you wrote and what it opened.</p>';

    if (!shelf.length) {
      return h + '<div class="empty"><h3>The shelf is bare</h3>' +
        '<p>Books arrive here when you archive them from Reading. Archiving is also what opens the next three colleges.</p>' +
        '<button class="btn btn--primary" data-action="goto" data-to="reading">Go to Reading</button></div>';
    }

    var totalPages = 0, totalCh = 0;
    shelf.forEach(function (b) { totalPages += b.pagesRead; totalCh += b.chapters.filter(Boolean).length; });

    h += '<div class="panel section"><div class="tally" style="margin:0">' +
      tallyItem(shelf.length, "Volumes") +
      tallyItem(num(totalPages), "Pages") +
      tallyItem(num(totalCh), "Chapters") +
      tallyItem((shelf.reduce(function (s, b) { return s + b.rating; }, 0) / shelf.length).toFixed(1),
                "Mean rating") +
      '</div></div>';

    h += shelf.map(function (b) {
      var ch = b.chapters.filter(Boolean).length;
      var stars = "";
      for (var i = 1; i <= 5; i++) stars += i <= b.rating ? "&#9733;" : "<i>&#9733;</i>";
      var when = b.finished ? new Date(b.finished).toLocaleDateString("en-GB",
        { day: "numeric", month: "long", year: "numeric" }) : "";
      return '<article class="tome">' +
        '<div class="tome__spine"><span>' + esc(b.title) + '</span></div>' +
        '<div><div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">' +
        '<div style="flex:1;min-width:200px"><h3 style="font-size:26px">' + esc(b.title) + '</h3>' +
        (b.author ? '<p class="book__author">' + esc(b.author) + '</p>' : '') + '</div>' +
        '<div class="stars">' + stars + '</div></div>' +
        '<div class="tags" style="margin-top:10px">' +
        '<span class="tag">' + num(b.pagesRead) + ' pages</span>' +
        '<span class="tag">' + ch + ' chapters</span>' +
        '<span class="tag tag--gilt">' + ch + ' unlocks</span>' +
        (when ? '<span class="tag">' + when + '</span>' : '') + '</div>' +
        (b.review ? '<div class="review">' + esc(b.review) + '</div>'
                  : '<p class="field__hint" style="margin-top:12px">No review written.</p>') +
        '<div class="stack" style="margin-top:12px">' +
        '<button class="btn btn--sm" data-action="unarchive" data-id="' + b.id + '">Return to the desk</button>' +
        '<button class="btn btn--sm btn--danger" data-action="delbook" data-id="' + b.id + '">Remove</button>' +
        '</div></div></article>';
    }).join("");
    return h;
  }

  /* ============================================================
     ALUMNI
     ============================================================ */
  function viewAlumni() {
    var parts = ["all"];
    ALUMNI.forEach(function (a) { if (parts.indexOf(a.part) < 0) parts.push(a.part); });
    var openCount = S().granted.alumni.length;

    var h = '<p class="eyebrow">' + openCount + ' of ' + ALUMNI.length + ' admitted</p>' +
      '<h1 class="page-title">Convocation</h1>' +
      '<p class="page-lede">One name for every chapter you finish, drawn at random from those you have not yet met. ' +
      'No name repeats — not within a book, not across the whole shelf.</p>';

    h += '<div class="stack section" style="align-items:center">' +
      '<div class="seg">' + parts.map(function (p) {
        return '<button data-action="filter" data-k="alumni" data-v="' + esc(p) + '" aria-pressed="' +
          (filters.alumni === p ? "true" : "false") + '">' + (p === "all" ? "All" : esc(p.split(",")[0])) + '</button>';
      }).join("") + '</div>' +
      '<span class="ind__note">' + (S().prefs.revealLocked
        ? "Names of locked entries are showing (Settings)."
        : "Locked entries stay anonymous until admitted.") + '</span></div>';

    var list = ALUMNI.filter(function (a) { return filters.alumni === "all" || a.part === filters.alumni; });
    h += '<div class="cards">' + list.map(function (a) {
      var open = granted("alumni", a.id);
      if (!open) {
        return '<div class="card card--locked"><div class="card__img">' +
          '<span class="card__no">' + a.id + '</span>' + lockIcon() + '</div>' +
          '<div class="card__cap"><div class="card__name">' +
          (S().prefs.revealLocked ? esc(a.name) : "Not yet admitted") + '</div>' +
          '<div class="card__sub">Locked</div></div></div>';
      }
      return '<button class="card" data-action="alumnus" data-id="' + a.id + '">' +
        '<div class="card__img"><span class="card__no">' + a.id + '</span>' + portrait(a) + '</div>' +
        '<div class="card__cap"><div class="card__name">' + esc(a.name) + '</div>' +
        '<div class="card__sub">' + esc(a.part.split(",")[0]) + '</div></div></button>';
    }).join("") + '</div>';
    return h;
  }

  function openAlumnus(id) {
    var a = byId.alumni[id];
    if (!a || !granted("alumni", id)) return;
    var entry = null;
    S().log.forEach(function (e) { if (e.kind === "alumni" && e.ref === id) entry = e; });
    showModal(
      '<div class="modal__body">' +
      '<div class="plate"><div class="plate__pic">' + portrait(a, true) + '</div>' +
      '<div><p class="eyebrow">No. ' + a.id + ' &middot; ' + esc(a.part) + '</p>' +
      '<h2>' + esc(a.name) + '</h2>' +
      (a.format ? '<p class="book__author">' + esc(a.format) + '</p>' : '') +
      (entry && entry.book ? '<div class="tags" style="margin-top:12px"><span class="tag tag--gilt">Admitted while reading ' +
        esc(entry.book) + '</span></div>' : '') +
      '</div></div>' +
      '<hr class="rule rule--double">' +
      '<div class="prose">' + md(a.body) + '</div>' +
      '</div>', true);
  }

  /* ============================================================
     COLLEGES + MAP
     ============================================================ */
  function viewColleges() {
    var open = S().granted.colleges.length;
    var r = S().rules;
    var booksLeft = Math.ceil((COLLEGES.length - open) / r.collegesPerBook);

    var h = '<p class="eyebrow">' + open + ' of ' + COLLEGES.length + ' open</p>' +
      '<h1 class="page-title">The colleges</h1>' +
      '<p class="page-lede">Archive a book and three more colleges open, chosen at random. ' +
      'Each sits at its real coordinates; drag to pan, scroll or pinch to zoom.' +
      (booksLeft > 0 ? ' <strong>' + booksLeft + ' more book' + (booksLeft === 1 ? "" : "s") +
        '</strong> opens the rest.' : ' All thirty-nine are open.') + '</p>';

    h += '<div class="mapwrap">' +
      '<div class="mapstage"><div class="maptools">' +
      '<button class="btn" data-action="mapzoom" data-f="1.4" aria-label="Zoom in">+</button>' +
      '<button class="btn" data-action="mapzoom" data-f="0.714" aria-label="Zoom out">&minus;</button>' +
      '<button class="btn" data-action="mapreset" aria-label="Reset view">&#8634;</button>' +
      '<button class="btn" data-action="mapnames" aria-label="Show or hide college names" ' +
      'aria-pressed="true">Aa</button>' +
      '</div><div id="mapmount"></div></div>' +
      '<div><div class="panel panel--quiet" style="margin-bottom:14px">' +
      '<div class="seg" style="width:100%">' +
      ['all', 'open', 'locked'].map(function (k) {
        return '<button style="flex:1" data-action="filter" data-k="colleges" data-v="' + k + '" aria-pressed="' +
          (filters.colleges === k ? "true" : "false") + '">' +
          (k === "all" ? "All 39" : k === "open" ? "Open " + open : "Locked " + (COLLEGES.length - open)) + '</button>';
      }).join("") + '</div></div>' +
      '<div class="maplist">' + COLLEGES.map(function (c) {
        var isOpen = granted("colleges", c.id);
        if (filters.colleges === "open" && !isOpen) return "";
        if (filters.colleges === "locked" && isOpen) return "";
        return '<button class="maplist__item" data-locked="' + (isOpen ? 0 : 1) + '"' +
          (isOpen ? ' data-action="college" data-id="' + c.id + '"' : ' disabled') + '>' +
          '<span class="maplist__no">' + c.id + '</span>' +
          '<span class="maplist__nm">' + (isOpen ? esc(c.name) : "Locked") +
          (isOpen ? '<br><span class="ind__note" style="font-size:12.5px">' + esc(c.hook) + '</span>' : '') + '</span>' +
          '<span class="maplist__yr">' + (isOpen ? c.founded : "&mdash;") + '</span></button>';
      }).join("") + '</div>' +
      '<p class="field__hint" style="margin-top:14px">Names thin out when they would collide &mdash; zoom in and they come back. ' +
      'Base plan &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors. ' +
      'The University&rsquo;s own searchable map is at <a href="https://maps.ox.ac.uk/" target="_blank" rel="noopener noreferrer">maps.ox.ac.uk</a>.</p>' +
      '</div></div>';
    return h;
  }

  function mountMap() {
    var mount = $("#mapmount");
    if (!mount) return;
    window.OXMAP.build(mount, COLLEGES, function (id) { return granted("colleges", id); }, openCollege);
    window.OXMAP.refresh(function (id) { return granted("colleges", id); }, recentColleges);
    mapReady = true;
  }

  function openCollege(id) {
    var c = byId.colleges[id];
    if (!c || !granted("colleges", id)) {
      toast("Archive a book to open more colleges");
      return;
    }
    window.OXMAP.setSelected(id, function (x) { return granted("colleges", x); });
    showModal(
      '<div class="modal__hero">' + (c.image
        ? '<img src="' + esc(c.image) + '" alt="' + esc(c.name) + '">'
        : crestPlate(c.name, true)) + '</div>' +
      '<div class="modal__body">' +
      '<p class="eyebrow">College no. ' + c.id + ' &middot; founded ' + c.founded + '</p>' +
      '<h2>' + esc(c.name) + '</h2>' +
      '<p class="book__author">' + esc(c.hook) + '</p>' +
      '<div class="tags" style="margin:14px 0">' +
      '<span class="tag mono">' + c.lat.toFixed(4) + '&deg; N, ' + Math.abs(c.lng).toFixed(4) + '&deg; W</span>' +
      '<a class="tag tag--gilt" href="https://maps.ox.ac.uk/" target="_blank" rel="noopener noreferrer">Official map</a>' +
      '</div>' +
      '<hr class="rule rule--double">' +
      '<div class="prose">' + md(c.body) + '</div>' +
      '<div class="stack"><button class="btn btn--sm" data-action="mapfocus" data-id="' + c.id + '">Centre the plan here</button></div>' +
      '</div>', true);
  }

  /* ============================================================
     LECTURES
     ============================================================ */
  function viewLectures(t) {
    var r = S().rules;
    var open = S().granted.videos.length;
    var cats = ["all"];
    VIDEOS.forEach(function (v) { if (cats.indexOf(v.cat) < 0) cats.push(v.cat); });

    var gate;
    if (t.chapters < r.alumniCap) {
      gate = 'The reel opens once Convocation is full. <strong>' + num(r.alumniCap - t.chapters) +
        ' more chapters</strong> to go.';
    } else if (open < VIDEOS.length) {
      var into = t.chapters - r.alumniCap;
      var need = r.chaptersPerVideo - (into % r.chaptersPerVideo);
      gate = 'One lecture for every ' + r.chaptersPerVideo + ' chapters past ' + num(r.alumniCap) +
        '. <strong>' + need + ' more chapter' + (need === 1 ? "" : "s") + '</strong> opens the next.';
    } else {
      gate = 'All ' + VIDEOS.length + ' lectures are open. Further chapters now pay into the indicators instead.';
    }

    var h = '<p class="eyebrow">' + open + ' of ' + VIDEOS.length + ' open</p>' +
      '<h1 class="page-title">The Union reel</h1>' +
      '<p class="page-lede">' + gate + ' Everything plays through youtube-nocookie, so nothing is tracked back to you.</p>';

    h += '<div class="stack section"><div class="seg">' + cats.map(function (c) {
      return '<button data-action="filter" data-k="lectures" data-v="' + esc(c) + '" aria-pressed="' +
        (filters.lectures === c ? "true" : "false") + '">' + (c === "all" ? "All" : esc(c)) + '</button>';
    }).join("") + '</div></div>';

    var list = VIDEOS.filter(function (v) { return filters.lectures === "all" || v.cat === filters.lectures; });
    h += '<div class="grid grid--3">' + list.map(function (v) {
      if (!granted("videos", v.id)) {
        return '<div class="lecture lecture--locked"><div class="lecture__frame">' + lockIcon() + '</div>' +
          '<div class="lecture__cap"><div class="lecture__t">Not yet open</div>' +
          '<div class="lecture__m"><span>Lecture ' + v.id + '</span></div></div></div>';
      }
      return '<div class="lecture" data-v="' + v.id + '"><div class="lecture__frame">' +
        '<button class="lecture__poster" data-action="play" data-id="' + v.id + '" ' +
        'style="background-image:url(https://i.ytimg.com/vi/' + v.yt + '/hqdefault.jpg)" ' +
        'aria-label="Play ' + esc(v.title) + '"></button>' +
        '<span class="lecture__play">&#9654;</span></div>' +
        '<div class="lecture__cap"><div class="lecture__t">' + esc(v.title) + '</div>' +
        '<div class="lecture__m"><span>' + esc(v.cat) + '</span><span>Oxford Union</span></div></div></div>';
    }).join("") + '</div>';
    return h;
  }

  function play(id) {
    var v = byId.videos[id];
    var card = $('.lecture[data-v="' + id + '"] .lecture__frame');
    if (!card || !v) return;
    card.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + v.yt +
      '?rel=0&autoplay=1" title="' + esc(v.title) +
      '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" ' +
      'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe>';
  }

  /* ============================================================
     SETTINGS
     ============================================================ */
  function viewSettings(t, ev) {
    var r = S().rules, p = S().prefs;
    var pagesFull = window.OX.pagesForFullStanding(r);
    var ceiling = r.alumniCap + r.chaptersPerVideo * VIDEOS.length;

    var h = '<p class="eyebrow">Everything here is live</p><h1 class="page-title">Settings</h1>' +
      '<p class="page-lede">The rules below are the ones from the brief. Change any of them and the register recalculates ' +
      'immediately — unlocks are recomputed from your totals, so nothing is lost or double-counted.</p>';

    /* --- reader --- */
    h += '<div class="panel section"><div class="section-title"><h2>Reader</h2></div><hr class="rule">' +
      field("Name on the register", '<input class="input" id="setName" value="' + esc(S().reader) +
        '" placeholder="Your name" style="max-width:340px">') +
      '<button class="btn btn--sm" data-action="savename">Save name</button></div>';

    /* --- appearance --- */
    h += '<div class="panel section"><div class="section-title"><h2>Appearance</h2></div><hr class="rule">' +
      '<div class="row" style="align-items:flex-start">' +
      '<div class="field"><label class="field__label">Theme</label><div class="seg">' +
      '<button data-action="pref" data-k="theme" data-v="night" aria-pressed="' + (p.theme === "night") + '">Night</button>' +
      '<button data-action="pref" data-k="theme" data-v="day" aria-pressed="' + (p.theme === "day") + '">Day</button>' +
      '</div><p class="field__hint">Night binds the register in Oxford blue. Day prints it on vellum.</p></div>' +
      '<div class="field"><label class="field__label">Motion</label><div class="seg">' +
      '<button data-action="pref" data-k="motion" data-v="full" aria-pressed="' + (p.motion === "full") + '">Full</button>' +
      '<button data-action="pref" data-k="motion" data-v="calm" aria-pressed="' + (p.motion === "calm") + '">Calm</button>' +
      '</div><p class="field__hint">Calm removes the unlock ceremony animation and bar transitions.</p></div>' +
      '</div><hr class="rule">' +
      toggleRow("revealLocked", p.revealLocked, "Show names of locked alumni",
        "Off by default so the draw stays a surprise.") +
      toggleRow("confirmDelete", p.confirmDelete, "Ask before removing a book",
        "Removing a book also releases whatever its chapters unlocked.") +
      '</div>';

    /* --- rules --- */
    h += '<div class="panel section"><div class="section-title"><h2>Rules of the register</h2>' +
      '<small>Live</small></div><hr class="rule">' +
      '<div class="grid grid--2">' +
      ruleField("pageBoost", "Advance per page", r.pageBoost, 0.01, 5, 0.01,
        "Share of the remaining gap that one page closes. At " + r.pageBoost + "%, full standing takes " +
        num(pagesFull) + " pages.") +
      ruleField("bonusPerChapter", "Bonus per surplus chapter", r.bonusPerChapter, 0, 25, 0.5,
        "Added to every indicator for each chapter past " + num(ceiling) + ".") +
      ruleField("alumniCap", "Alumni to admit", r.alumniCap, 1, ALUMNI.length, 1,
        "One per chapter. The corpus holds " + ALUMNI.length + " names.") +
      ruleField("chaptersPerVideo", "Chapters per lecture", r.chaptersPerVideo, 1, 20, 1,
        "Applies only after Convocation is full. " + VIDEOS.length + " lectures available.") +
      ruleField("collegesPerBook", "Colleges per archived book", r.collegesPerBook, 1, 10, 1,
        COLLEGES.length + " colleges over " + r.booksToWin + " books needs " +
        (COLLEGES.length / r.booksToWin).toFixed(2) + " per book.") +
      ruleField("booksToWin", "Books to finish the game", r.booksToWin, 1, 100, 1,
        "Archive this many and Oxford is declared first in the world.") +
      '</div><hr class="rule">' +
      '<div class="ind__foot" style="margin-bottom:14px"><span class="ind__note">Chapter ceiling</span>' +
      '<span class="mono">' + num(r.alumniCap) + ' alumni + ' + num(r.chaptersPerVideo * VIDEOS.length) +
      ' lecture chapters = ' + num(ceiling) + '</span></div>' +
      '<button class="btn btn--sm" data-action="defaults">Restore the brief&rsquo;s defaults</button></div>';

    /* --- data --- */
    h += '<div class="panel section"><div class="section-title"><h2>Your data</h2></div><hr class="rule">' +
      '<p>' + (window.OX.store.persists
        ? "Saved in this browser only. Nothing leaves your device — there is no account and no server."
        : "<strong>This browser is blocking local storage</strong>, so the register will only last as long as the tab. Export before you close it.") +
      '</p>' +
      '<div class="stack" style="margin-top:14px">' +
      '<button class="btn" data-action="export">Export register (.json)</button>' +
      '<label class="btn" style="cursor:pointer">Import register' +
      '<input type="file" accept="application/json,.json" id="importFile" style="display:none"></label>' +
      '<button class="btn btn--danger" data-action="reset">Erase and start again</button>' +
      '</div>' +
      '<hr class="rule">' +
      '<div class="ind__foot"><span class="ind__note">Matriculated</span><span class="mono">' +
      new Date(S().matriculated).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) +
      '</span></div>' +
      '<div class="ind__foot"><span class="ind__note">Draw seed</span><span class="mono">' +
      S().seed.toString(16).toUpperCase() + '</span></div>' +
      '<div class="ind__foot"><span class="ind__note">Logged</span><span class="mono">' +
      num(t.pages) + ' pages &middot; ' + num(t.chapters) + ' chapters &middot; ' + t.booksDone + ' archived</span></div>' +
      '</div>';

    /* --- about --- */
    h += '<div class="panel section"><div class="section-title"><h2>Where the writing comes from</h2></div><hr class="rule">' +
      '<p>The 150 alumni entries and the 39 college write-ups are read straight out of the supplied markdown; ' +
      'portraits and college photographs come from the same archive. Two entries have no picture &mdash; ' +
      'Thomas Bradwardine and Green Templeton College &mdash; and are issued an armorial plate instead.</p>' +
      '<hr class="rule">' +
      '<div class="ind__foot"><span class="ind__note">Crest and wordmark</span>' +
      '<span class="mono">Fan made by Billy Christopher</span></div>' +
      '<div class="ind__foot"><span class="ind__note">Base plan</span>' +
      '<span class="mono">&copy; OpenStreetMap contributors</span></div>' +
      '<hr class="rule">' +
      '<p class="field__hint">Lectures are embedded from the Oxford Union\u2019s YouTube channel through youtube-nocookie.com, ' +
      'and only load once you press play. The plan of Oxford is OpenStreetMap data; each college is placed at its ' +
      'true latitude and longitude. The University\u2019s own map is at maps.ox.ac.uk.</p></div>';

    return h;
  }

  function toggleRow(key, on, label, hint) {
    return '<label class="toggle" style="margin:12px 0">' +
      '<input type="checkbox" data-action="pref" data-k="' + key + '"' + (on ? " checked" : "") + '>' +
      '<span class="toggle__track"></span>' +
      '<span class="toggle__text">' + label + '<small>' + hint + '</small></span></label>';
  }

  function ruleField(key, label, value, min, max, step, hint) {
    return '<div class="field"><label class="field__label">' + label + '</label>' +
      '<input class="input input--num" type="number" min="' + min + '" max="' + max + '" step="' + step +
      '" value="' + value + '" data-action="rule" data-k="' + key + '" inputmode="decimal">' +
      '<p class="field__hint">' + hint + '</p></div>';
  }

  /* ============================================================
     MODAL + CEREMONY
     ============================================================ */
  function showModal(inner, wide) {
    var scrim = $("#scrim");
    scrim.innerHTML = '<div class="modal' + (wide ? " modal--wide" : "") + '" role="dialog" aria-modal="true">' +
      '<button class="modal__close" data-action="closemodal" aria-label="Close">&times;</button>' + inner + '</div>';
    scrim.hidden = false;
    document.body.style.overflow = "hidden";
    var btn = $(".modal__close", scrim);
    if (btn) btn.focus();
  }

  function closeModal() {
    $("#scrim").hidden = true;
    $("#scrim").innerHTML = "";
    document.body.style.overflow = "";
  }

  function queueCeremony(entries) {
    entries.forEach(function (e) { if (e.kind !== "colleges") ceremonyQueue.push(e); });
    var colleges = entries.filter(function (e) { return e.kind === "colleges"; });
    if (colleges.length) {
      recentColleges = colleges.map(function (e) { return e.ref; });
      ceremonyQueue.push({ kind: "collegeBatch", refs: recentColleges });
    }
    if (ceremonyQueue.length) nextCeremony();
  }

  function nextCeremony() {
    var cer = $("#ceremony");
    if (!ceremonyQueue.length) {
      cer.hidden = true; cer.innerHTML = "";
      document.body.style.overflow = "";
      return;
    }
    var e = ceremonyQueue.shift();
    var more = ceremonyQueue.length;
    var inner;

    if (e.kind === "alumni") {
      var a = byId.alumni[e.ref];
      inner = '<div class="seal"><div class="wax">&#10022;</div>' +
        '<p class="seal__kicker">Admitted to Convocation</p>' +
        '<div class="seal__pic">' + portrait(a, true) + '</div>' +
        '<h3>' + esc(a.name) + '</h3>' +
        '<p class="seal__role">No. ' + a.id + ' &middot; ' + esc(a.part) + '</p>' +
        '<div class="stack" style="justify-content:center">' +
        '<button class="btn btn--primary" data-action="cernext">' + (more ? "Next" : "Back to the register") + '</button>' +
        '<button class="btn btn--ghost" data-action="cerread" data-id="' + a.id + '">Read the entry</button></div>' +
        (more ? '<p class="seal__queue">' + more + ' more waiting</p>' : "") + '</div>';

    } else if (e.kind === "videos") {
      var v = byId.videos[e.ref];
      inner = '<div class="seal"><div class="wax">&#9654;</div>' +
        '<p class="seal__kicker">Lecture released</p>' +
        '<div class="seal__pic" style="width:100%;height:auto;aspect-ratio:16/9">' +
        '<img src="https://i.ytimg.com/vi/' + v.yt + '/hqdefault.jpg" alt=""></div>' +
        '<h3 style="font-size:23px">' + esc(v.title) + '</h3>' +
        '<p class="seal__role">' + esc(v.cat) + ' &middot; Oxford Union</p>' +
        '<div class="stack" style="justify-content:center">' +
        '<button class="btn btn--primary" data-action="cernext">' + (more ? "Next" : "Close") + '</button>' +
        '<button class="btn btn--ghost" data-action="cergo" data-to="lectures">Watch now</button></div>' +
        (more ? '<p class="seal__queue">' + more + ' more waiting</p>' : "") + '</div>';

    } else {
      var names = e.refs.map(function (id) { return byId.colleges[id].name; });
      inner = '<div class="seal"><div class="wax">&#9873;</div>' +
        '<p class="seal__kicker">Book archived</p>' +
        '<h3 style="margin-bottom:16px">' + e.refs.length + ' colleges open</h3>' +
        '<div style="text-align:left;margin-bottom:20px">' + e.refs.map(function (id) {
          var c = byId.colleges[id];
          return '<div class="feed__row"><span class="feed__seq">' + c.id + '</span>' +
            '<span class="feed__what"><b>' + esc(c.name) + '</b><br>' +
            '<span class="ind__note">' + esc(c.hook) + '</span></span></div>';
        }).join("") + '</div>' +
        '<div class="stack" style="justify-content:center">' +
        '<button class="btn btn--primary" data-action="cernext">' + (more ? "Next" : "Close") + '</button>' +
        '<button class="btn btn--ghost" data-action="cergo" data-to="colleges">Open the plan</button></div></div>';
    }

    cer.innerHTML = inner;
    cer.hidden = false;
    document.body.style.overflow = "hidden";
    var f = $(".btn--primary", cer);
    if (f) f.focus();
  }

  function checkVictory() {
    var t = window.OX.totals();
    if (t.booksDone >= S().rules.booksToWin && !S().seenVictory) {
      S().seenVictory = true;
      window.OX.save();
      setTimeout(function () {
        var cer = $("#ceremony");
        cer.innerHTML = '<div class="seal" style="max-width:520px;width:min(520px,92vw)">' +
          '<div class="wax">&#9819;</div>' +
          '<img src="assets/oxford-crest.png" alt="" width="104" style="margin:0 auto 16px;display:block">' +
          '<p class="seal__kicker">Congregation has risen</p>' +
          '<h3 style="font-size:34px;line-height:1.1">Oxford is the best university in the world.</h3>' +
          '<div class="rank" style="font-size:64px;font-family:var(--f-display);color:var(--accent);margin:10px 0">#1</div>' +
          '<p style="color:var(--text-dim);font-size:15px">' + S().rules.booksToWin + ' books. ' +
          num(t.pages) + ' pages. ' + num(t.chapters) + ' chapters. Thank you for reading.</p>' +
          '<div class="stack" style="justify-content:center;margin-top:20px">' +
          '<button class="btn btn--primary" data-action="cernext">Take it in</button></div></div>';
        cer.hidden = false;
        document.body.style.overflow = "hidden";
      }, 700);
      return true;
    }
    return false;
  }

  /* ============================================================
     MUTATIONS
     ============================================================ */
  function afterChange(context) {
    var fresh = window.OX.sync(context);
    window.OX.save();
    render();
    if (fresh.length) queueCeremony(fresh);
    return fresh;
  }

  function setPages(book, v) {
    book.pagesRead = Math.max(0, Math.min(book.totalPages, Math.round(v)));
    window.OX.save();
    render();
  }

  function toggleChapter(book, i) {
    book.chapters[i] = !book.chapters[i];
    afterChange({ bookTitle: book.title });
  }

  function nextChapter(book) {
    var i = book.chapters.indexOf(false);
    if (i < 0) { toast("Every chapter is ticked"); return; }
    book.chapters[i] = true;
    // reading a chapter implies reading its pages, if the reader is behind
    var impliedPage = Math.round(((i + 1) / book.totalChapters) * book.totalPages);
    if (impliedPage > book.pagesRead) book.pagesRead = Math.min(book.totalPages, impliedPage);
    afterChange({ bookTitle: book.title });
  }

  function archive(book) {
    book.archived = true;
    book.finished = new Date().toISOString();
    afterChange({ bookTitle: book.title });
    if (!checkVictory()) toast("Archived to the Library");
  }

  /* ============================================================
     EVENTS
     ============================================================ */
  function onClick(e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var act = el.dataset.action;
    var id = +el.dataset.id;
    var book = id ? window.OX.getBook(id) : null;

    switch (act) {
      case "goto": go(el.dataset.to); break;
      case "closemodal": closeModal(); break;

      case "sign": {
        var v = ($("#readerName") || {}).value || "";
        S().reader = v.trim().slice(0, 60);
        window.OX.save(); render();
        if (S().reader) toast("Welcome, " + S().reader);
        break;
      }
      case "savename": {
        S().reader = (($("#setName") || {}).value || "").trim().slice(0, 60);
        window.OX.save(); render(); toast("Name saved");
        break;
      }

      case "addbook": {
        var title = (($("#nbTitle") || {}).value || "").trim();
        if (!title) { toast("A book needs a title"); $("#nbTitle").focus(); break; }
        var pages = parseInt(($("#nbPages") || {}).value, 10) || 300;
        var chs = parseInt(($("#nbChapters") || {}).value, 10) || 20;
        window.OX.addBook({
          title: title.slice(0, 140),
          author: (($("#nbAuthor") || {}).value || "").trim().slice(0, 100),
          totalPages: Math.min(20000, Math.max(1, pages)),
          totalChapters: Math.min(500, Math.max(1, chs))
        });
        render();
        toast("Added to the desk");
        break;
      }

      case "pages": if (book) setPages(book, book.pagesRead + (+el.dataset.delta)); break;
      case "allpages": if (book) setPages(book, book.totalPages); break;
      case "chapter": if (book) toggleChapter(book, +el.dataset.i); break;
      case "nextchapter": if (book) nextChapter(book); break;

      case "allchapters":
        if (book) {
          for (var i = 0; i < book.chapters.length; i++) book.chapters[i] = true;
          if (book.pagesRead < book.totalPages) book.pagesRead = book.totalPages;
          afterChange({ bookTitle: book.title });
        }
        break;
      case "noneChapters":
        if (book) {
          for (var j = 0; j < book.chapters.length; j++) book.chapters[j] = false;
          afterChange({ bookTitle: book.title });
        }
        break;

      case "rate":
        if (book) { book.rating = (book.rating === +el.dataset.v) ? 0 : +el.dataset.v; window.OX.save(); render(); }
        break;

      case "archive": if (book) archive(book); break;
      case "unarchive":
        if (book) { book.archived = false; book.finished = null; afterChange(); toast("Back on the desk"); }
        break;

      case "delbook":
        if (book) {
          if (S().prefs.confirmDelete &&
              !window.confirm('Remove "' + book.title + '"? Whatever its chapters unlocked is released.')) break;
          window.OX.removeBook(id);
          render();
          toast("Removed");
        }
        break;

      case "alumnus": openAlumnus(id); break;
      case "college": openCollege(id); break;
      case "play": play(id); break;

      case "filter":
        filters[el.dataset.k] = el.dataset.v;
        render();
        break;

      case "mapzoom": window.OXMAP.zoomBy(+el.dataset.f); break;
      case "mapreset": window.OXMAP.reset(); break;
      case "mapnames":
        window.OXMAP.setShowNames(!window.OXMAP.showNames, function (x) { return granted("colleges", x); });
        el.setAttribute("aria-pressed", window.OXMAP.showNames);
        break;
      case "mapfocus": {
        var c = byId.colleges[id];
        closeModal();
        if (route !== "colleges") { go("colleges"); setTimeout(function () { window.OXMAP.focusOn(c.lat, c.lng, 4); }, 90); }
        else window.OXMAP.focusOn(c.lat, c.lng, 4);
        break;
      }

      case "pref":
        if (el.dataset.v) { S().prefs[el.dataset.k] = el.dataset.v; applyPrefs(); window.OX.save(); render(); }
        break;

      case "defaults":
        S().rules = Object.assign({}, window.OX.DEFAULT_RULES);
        afterChange();
        toast("Defaults restored");
        break;

      case "export": exportData(); break;
      case "reset":
        if (window.confirm("Erase this register completely and start again? This cannot be undone.")) {
          window.OX.store.clear();
          window.OX.state = window.OX.freshState();
          window.OX.save();
          applyPrefs();
          go("register");
          toast("A fresh register");
        }
        break;

      case "cernext": nextCeremony(); break;
      case "cergo": {
        var to = el.dataset.to;
        ceremonyQueue.length = 0;
        nextCeremony();
        go(to);
        break;
      }
      case "cerread": {
        ceremonyQueue.length = 0;
        nextCeremony();
        go("alumni");
        setTimeout(function () { openAlumnus(id); }, 120);
        break;
      }
    }
  }

  function onChange(e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var act = el.dataset.action;
    var book = el.dataset.id ? window.OX.getBook(+el.dataset.id) : null;

    if (act === "setpages" && book) { setPages(book, parseInt(el.value, 10) || 0); return; }

    if (act === "review" && book) { book.review = el.value.slice(0, 4000); window.OX.save(); return; }

    if (act === "edit" && book) {
      var f = el.dataset.f;
      if (f === "title") book.title = el.value.trim().slice(0, 140) || book.title;
      else if (f === "author") book.author = el.value.trim().slice(0, 100);
      else if (f === "totalPages") {
        book.totalPages = Math.max(1, Math.min(20000, parseInt(el.value, 10) || 1));
        book.pagesRead = Math.min(book.pagesRead, book.totalPages);
      } else if (f === "totalChapters") {
        window.OX.resizeChapters(book, Math.min(500, parseInt(el.value, 10) || 1));
      }
      afterChange({ bookTitle: book.title });
      return;
    }

    if (act === "rule") {
      var k = el.dataset.k;
      var v = parseFloat(el.value);
      if (isNaN(v)) return;
      var lim = {
        pageBoost: [0.01, 5], bonusPerChapter: [0, 25], alumniCap: [1, ALUMNI.length],
        chaptersPerVideo: [1, 20], collegesPerBook: [1, 10], booksToWin: [1, 100]
      }[k];
      v = Math.min(lim[1], Math.max(lim[0], v));
      if (k !== "pageBoost" && k !== "bonusPerChapter") v = Math.round(v);
      S().rules[k] = v;
      afterChange();
      return;
    }

    if (act === "pref" && el.type === "checkbox") {
      S().prefs[el.dataset.k] = el.checked;
      window.OX.save();
      render();
      return;
    }
  }

  function onInput(e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    if (el.dataset.action === "review") {
      var book = window.OX.getBook(+el.dataset.id);
      if (book) { book.review = el.value.slice(0, 4000); window.OX.save(); }
    }
  }

  /* ---------------------------------------------------------- data io */
  function exportData() {
    var blob = new Blob([JSON.stringify(S(), null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "oxford-register-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast("Register exported");
  }

  function importData(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var incoming = JSON.parse(fr.result);
        if (!incoming || !Array.isArray(incoming.books)) throw new Error("shape");
        incoming.rules = Object.assign({}, window.OX.DEFAULT_RULES, incoming.rules || {});
        incoming.prefs = Object.assign({}, window.OX.DEFAULT_PREFS, incoming.prefs || {});
        incoming.granted = Object.assign({ alumni: [], videos: [], colleges: [] }, incoming.granted || {});
        if (!incoming.queues) incoming.queues = window.OX.buildQueues(incoming.seed || 1);
        window.OX.state = incoming;
        window.OX.sync();
        window.OX.save();
        applyPrefs();
        go("register");
        toast("Register imported");
      } catch (err) {
        toast("That file is not a register");
      }
    };
    fr.readAsText(file);
  }

  /* ---------------------------------------------------------- prefs */
  function applyPrefs() {
    var p = S().prefs;
    document.documentElement.setAttribute("data-theme", p.theme);
    document.documentElement.setAttribute("data-motion", p.motion);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", p.theme === "night" ? "#00101F" : "#EDE6D5");
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    window.OX.load();
    window.OX.sync();
    applyPrefs();

    var nav = $("#nav");
    nav.innerHTML = Object.keys(VIEWS).map(function (k) {
      return '<button class="nav__item" data-route="' + k + '" aria-current="false">' +
        '<span class="nav__glyph">' + GLYPH[k] + '</span>' +
        '<span class="nav__label">' + VIEWS[k].label + '</span>' +
        '<span class="nav__count"></span></button>';
    }).join("");

    nav.addEventListener("click", function (e) {
      var b = e.target.closest(".nav__item");
      if (b) go(b.dataset.route);
    });

    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("input", onInput);

    document.addEventListener("change", function (e) {
      if (e.target.id === "importFile" && e.target.files && e.target.files[0]) importData(e.target.files[0]);
    });

    $("#scrim").addEventListener("click", function (e) { if (e.target.id === "scrim") closeModal(); });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!$("#ceremony").hidden) nextCeremony();
      else if (!$("#scrim").hidden) closeModal();
    });

    window.addEventListener("hashchange", function () { go(location.hash.slice(1) || "register"); });

    go(location.hash.slice(1) || "register");
  }

  var GLYPH = {
    register: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h9a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H4z"/><path d="M20 4h-4v13.5H18a2 2 0 0 1 2 2z"/></svg>',
    reading:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 6.5S9.5 4 5 4v14c4.5 0 7 2.5 7 2.5s2.5-2.5 7-2.5V4c-4.5 0-7 2.5-7 2.5z"/><path d="M12 6.5v14"/></svg>',
    library:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="4" height="16" rx="1"/><rect x="9" y="4" width="4" height="16" rx="1"/><path d="M16.5 5.2l3.3 14.2"/></svg>',
    alumni:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8.5 12 4l10 4.5-10 4.5z"/><path d="M6 10.8V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.2"/></svg>',
    colleges: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8.5 9.5 5v14L3 22z"/><path d="M9.5 5 15 8v14l-5.5-3z"/><path d="M15 8l6-3v14l-6 3z"/></svg>',
    lectures: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M10.5 9.3l4.6 2.7-4.6 2.7z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3"/></svg>'
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
