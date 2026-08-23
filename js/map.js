/* ============================================================
   map.js — the plan of Oxford.

   The base is the real street plan supplied with the project,
   georeferenced by fitting two control points (the Banbury /
   Woodstock fork at the head of St Giles', and Carfax) and
   deriving the longitude scale from the latitude scale through
   cos(lat), as Web Mercator requires. Every college then sits at
   its true coordinates rather than by eye.

   Labels are laid out at draw time with a greedy collision test:
   nineteen colleges sit within 400 m of Radcliffe Square, so
   printing every name at once is unreadable. Names that cannot
   fit are dropped until you zoom in and make room.
   ============================================================ */
(function () {
  "use strict";

  /* ---- georeference (in base-image pixels) ---- */
  var IMG_W = 1920, IMG_H = 1974;
  var LAT_MAX = 51.769536;
  var LNG_MIN = -1.278869;
  var PX_LAT = 81429;                                   // pixels per degree of latitude
  var PX_LNG = PX_LAT * Math.cos(51.757 * Math.PI / 180);

  /* ---- padding so pins at the edges are not clipped ---- */
  var PAD_T = 84, PAD_L = 34, PAD_R = 34, PAD_B = 34;
  var W = IMG_W + PAD_L + PAD_R;
  var H = IMG_H + PAD_T + PAD_B;

  function px(lat, lng) {
    return { x: PAD_L + (lng - LNG_MIN) * PX_LNG,
             y: PAD_T + (LAT_MAX - lat) * PX_LAT };
  }

  var SVG_NS = "http://www.w3.org/2000/svg";
  var XLINK = "http://www.w3.org/1999/xlink";

  function el(tag, attrs) {
    var n = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  }

  var api = {
    svg: null, gPins: null, view: null,
    onSelect: null, showNames: true, selected: null,
    hovered: null, recent: [], colleges: [],
    isUnlocked: function () { return false; },
    W: W, H: H, project: px
  };

  /* ------------------------------------------------------------------ */
  api.build = function (mount, colleges, isUnlocked, onSelect) {
    api.onSelect = onSelect;
    api.colleges = colleges;
    api.isUnlocked = isUnlocked;
    api.selected = null;
    api.hovered = null;
    mount.innerHTML = "";

    var svg = el("svg", {
      viewBox: "0 0 " + W + " " + H,
      role: "img",
      "aria-label": "Plan of Oxford showing all thirty-nine colleges"
    });
    api.svg = svg;
    api.view = { x: 0, y: 0, w: W, h: H };

    svg.appendChild(el("rect", { x: 0, y: 0, width: W, height: H, fill: "var(--plan-mat)" }));

    var img = el("image", {
      x: PAD_L, y: PAD_T, width: IMG_W, height: IMG_H,
      preserveAspectRatio: "none", href: "assets/oxford-plan.jpg"
    });
    img.setAttributeNS(XLINK, "xlink:href", "assets/oxford-plan.jpg");
    svg.appendChild(img);

    svg.appendChild(el("rect", {
      x: PAD_L + 1, y: PAD_T + 1, width: IMG_W - 2, height: IMG_H - 2,
      fill: "none", stroke: "var(--plan-edge)", "stroke-width": 3
    }));

    var gPins = el("g", { class: "pins" });
    api.gPins = gPins;

    colleges.forEach(function (c) {
      var p = px(c.lat, c.lng);
      var g = el("g", { class: "pin", "data-id": c.id, tabindex: "0", role: "button" });
      g.appendChild(el("circle", { class: "pin__ring", cx: p.x, cy: p.y, r: 26 }));
      g.appendChild(el("circle", { class: "pin__halo", cx: p.x, cy: p.y, r: 16 }));
      g.appendChild(el("circle", { class: "pin__dot", cx: p.x, cy: p.y, r: 11 }));
      var t = el("text", { class: "pin__name", x: p.x, y: p.y, "text-anchor": "start" });
      t.textContent = c.name;
      g.appendChild(t);
      g.appendChild(el("circle", { class: "pin__hit", cx: p.x, cy: p.y, r: 30 }));

      g.addEventListener("click", function (e) { e.stopPropagation(); api.onSelect(c.id); });
      g.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); api.onSelect(c.id); }
      });
      g.addEventListener("pointerenter", function () { api.hovered = c.id; layoutLabels(); });
      g.addEventListener("pointerleave", function () { api.hovered = null; layoutLabels(); });
      g.addEventListener("focus", function () { api.hovered = c.id; layoutLabels(); });
      g.addEventListener("blur", function () { api.hovered = null; layoutLabels(); });

      g._cx = p.x; g._cy = p.y; g._name = c.name;
      gPins.appendChild(g);
    });

    svg.appendChild(gPins);
    mount.appendChild(svg);

    api.refresh(isUnlocked);
    apply(api.view);
    wirePanZoom(svg);
    return svg;
  };

  /* ------------------------------------------------------------------ */
  api.refresh = function (isUnlocked, recent) {
    if (!api.gPins) return;
    if (isUnlocked) api.isUnlocked = isUnlocked;
    if (recent) api.recent = recent;
    Array.prototype.forEach.call(api.gPins.children, function (g) {
      var id = +g.getAttribute("data-id");
      var open = api.isUnlocked(id);
      g.setAttribute("class", "pin" + (open ? "" : " pin--locked") +
        (api.recent.indexOf(id) > -1 ? " pin--new" : "") +
        (api.selected === id ? " pin--on" : ""));
      g.setAttribute("aria-label", open ? g._name : "Locked college");
      g.setAttribute("tabindex", open ? "0" : "-1");
    });
    layoutLabels();
  };

  api.setShowNames = function (v, isUnlocked) { api.showNames = v; api.refresh(isUnlocked); };
  api.setSelected = function (id, isUnlocked) { api.selected = id; api.refresh(isUnlocked); };

  /* ---- greedy label placement -------------------------------------- */
  function layoutLabels() {
    if (!api.gPins) return;
    var k = api.view.w / W;                 // canvas units per screen unit
    var fs = 30 * k;                        // keeps type a constant size on screen
    var pad = 6 * k, gap = 18 * k;

    var pins = Array.prototype.slice.call(api.gPins.children);
    var placed = [];

    function score(g) {
      var id = +g.getAttribute("data-id");
      if (api.selected === id) return 100;
      if (api.hovered === id) return 90;
      if (api.recent.indexOf(id) > -1) return 80;
      return 0;
    }

    pins.slice()
      .sort(function (a, b) { return score(b) - score(a) || a._cy - b._cy; })
      .forEach(function (g) {
        var id = +g.getAttribute("data-id");
        var t = g.querySelector(".pin__name");
        var open = api.isUnlocked(id);
        var forced = api.selected === id || api.hovered === id;

        if (!open || (!api.showNames && !forced)) { t.style.display = "none"; return; }

        // measure for real where the browser will let us; fall back to an
        // estimate under jsdom and other non-rendering environments
        t.style.display = "";
        t.style.fontSize = fs.toFixed(2) + "px";
        var w = 0;
        try { w = t.getComputedTextLength(); } catch (err) { w = 0; }
        if (!w) w = g._name.length * fs * 0.55;
        w += pad * 2;

        var cands = [
          { x: g._cx + gap, y: g._cy + fs * 0.34, a: "start" },
          { x: g._cx - gap, y: g._cy + fs * 0.34, a: "end" },
          { x: g._cx,       y: g._cy - gap,       a: "middle" },
          { x: g._cx,       y: g._cy + gap + fs * 0.72, a: "middle" }
        ];

        var fallback = null;
        for (var i = 0; i < cands.length; i++) {
          var c = cands[i];
          var left = c.a === "start" ? c.x : c.a === "end" ? c.x - w : c.x - w / 2;
          var box = { l: left, t: c.y - fs * 0.82, r: left + w, b: c.y + fs * 0.32 };
          var inside = box.l >= 2 && box.r <= W - 2 && box.t >= 2 && box.b <= H - 2;
          if (!inside) continue;
          if (!hits(box, placed)) { put(c, box); return; }
          if (!fallback) fallback = { c: c, box: box };
        }
        // a selected or hovered pin always shows its name, overlap or not
        if (forced && fallback) { put(fallback.c, fallback.box); return; }
        t.style.display = "none";

        function put(c, box) {
          t.style.display = "";
          t.setAttribute("x", c.x.toFixed(1));
          t.setAttribute("y", c.y.toFixed(1));
          t.setAttribute("text-anchor", c.a);
          t.style.strokeWidth = (4.6 * k).toFixed(2) + "px";
          placed.push(box);
        }
      });

    function hits(b, list) {
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (b.l < o.r && b.r > o.l && b.t < o.b && b.b > o.t) return true;
      }
      return false;
    }
  }
  api.layoutLabels = layoutLabels;

  /* ------------------------------------------------------------------ */
  api.focusOn = function (lat, lng, zoom) {
    var p = px(lat, lng), z = zoom || 4, w = W / z, h = (w * H) / W;
    apply({ x: p.x - w / 2, y: p.y - h / 2, w: w, h: h });
  };

  api.reset = function () { apply({ x: 0, y: 0, w: W, h: H }); };

  api.zoomBy = function (f) {
    var v = api.view, cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    var w = v.w / f, h = (w * H) / W;
    apply({ x: cx - w / 2, y: cy - h / 2, w: w, h: h });
  };

  function apply(v) {
    v.w = Math.min(W, Math.max(W / 10, v.w));
    v.h = (v.w * H) / W;
    v.x = Math.min(W - v.w, Math.max(0, v.x));
    v.y = Math.min(H - v.h, Math.max(0, v.y));
    api.view = v;
    api.svg.setAttribute("viewBox",
      [v.x, v.y, v.w, v.h].map(function (n) { return n.toFixed(1); }).join(" "));

    var k = v.w / W;
    [[".pin__dot", 11, 3], [".pin__halo", 16, 0], [".pin__ring", 26, 2.2], [".pin__hit", 30, 0]]
      .forEach(function (s) {
        Array.prototype.forEach.call(api.gPins.querySelectorAll(s[0]), function (c) {
          c.setAttribute("r", (s[1] * k).toFixed(2));
          if (s[2]) c.setAttribute("stroke-width", (s[2] * k).toFixed(2));
        });
      });
    layoutLabels();
  }
  api.apply = apply;

  /* ------------------------------------------------------------------ */
  function wirePanZoom(svg) {
    var dragging = false, last = null, pts = {}, startDist = 0, startW = 0;

    function toSvg(evt) {
      var r = svg.getBoundingClientRect(), v = api.view;
      return { x: v.x + ((evt.clientX - r.left) / r.width) * v.w,
               y: v.y + ((evt.clientY - r.top) / r.height) * v.h };
    }

    svg.addEventListener("wheel", function (e) {
      e.preventDefault();
      var pt = toSvg(e);
      var f = e.deltaY < 0 ? 1.25 : 1 / 1.25;
      var v = api.view, w = v.w / f, h = v.h / f;
      apply({ x: pt.x - ((pt.x - v.x) / v.w) * w, y: pt.y - ((pt.y - v.y) / v.h) * h, w: w, h: h });
    }, { passive: false });

    svg.addEventListener("pointerdown", function (e) {
      pts[e.pointerId] = e;
      if (e.target.closest(".pin")) return;
      dragging = true; last = { x: e.clientX, y: e.clientY };
      try { svg.setPointerCapture(e.pointerId); } catch (err) {}
    });

    svg.addEventListener("pointermove", function (e) {
      if (e.pointerId in pts) pts[e.pointerId] = e;
      var ids = Object.keys(pts);

      if (ids.length === 2) {                       // pinch beats pan
        dragging = false;
        var a = pts[ids[0]], b = pts[ids[1]];
        var d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (!startDist) { startDist = d; startW = api.view.w; return; }
        var v2 = api.view, w2 = startW * (startDist / Math.max(1, d)), h2 = (w2 * H) / W;
        apply({ x: v2.x + (v2.w - w2) / 2, y: v2.y + (v2.h - h2) / 2, w: w2, h: h2 });
        return;
      }

      if (!dragging) return;
      var r = svg.getBoundingClientRect(), v = api.view;
      apply({ x: v.x - ((e.clientX - last.x) / r.width) * v.w,
              y: v.y - ((e.clientY - last.y) / r.height) * v.h, w: v.w, h: v.h });
      last = { x: e.clientX, y: e.clientY };
    });

    ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
      svg.addEventListener(ev, function (e) {
        dragging = false;
        delete pts[e.pointerId];
        if (Object.keys(pts).length < 2) startDist = 0;
      });
    });
  }

  window.OXMAP = api;
})();
