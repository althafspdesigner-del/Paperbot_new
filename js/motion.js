/* PAPERBOT — sticker & origami motion (no dependencies, loaded with defer).

   [data-sticker]   die-cut stickers: slap onto the page when scrolled into view;
                    on desktop they can be picked up and moved with the mouse.
   [data-origami]   origami illustrations: their facets unfold into place.
   [data-fold]      paper cards / rows: unfold from a top crease as they enter.
   [data-strip]     accordion paper strips: open sideways as they enter.
   [data-parallax]  drift with scroll at the given rate (and rotate by data-spin).
   [data-pin]       pinned notes: drop onto the board, then the pin presses in;
                    dashed links between the notes draw in as you scroll.

   Everything is visible without JavaScript and static under reduced motion. */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---------- Stagger [data-fold] siblings ---------- */
  var counts = new Map();
  document.querySelectorAll("[data-fold]").forEach(function (el) {
    var parent = el.parentElement;
    var n = counts.get(parent) || 0;
    el.style.setProperty("--fold-i", String(n));
    counts.set(parent, n + 1);
  });

  /* ---------- Entrances ---------- */
  function show(el) {
    el.classList.add("is-in");
    if (el.hasAttribute("data-fold")) {
      el.classList.add("is-visible"); // the card art (bars) keys off this
      var settle = function (ev) {
        if (ev && ev.target !== el) return;
        el.removeEventListener("transitionend", settle);
        // Drop the fold transition so the card's own hover transitions apply immediately.
        el.removeAttribute("data-fold");
      };
      el.addEventListener("transitionend", settle);
      setTimeout(settle, 2200);
    }
  }

  var targets = document.querySelectorAll("[data-sticker], [data-origami], [data-fold], [data-strip], [data-pin]");
  if (reduce || !("IntersectionObserver" in window)) {
    targets.forEach(show);
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          show(entry.target);
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    targets.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Scroll parallax ---------- */
  var items = Array.prototype.map.call(document.querySelectorAll("[data-parallax]"), function (el) {
    return {
      el: el,
      k: parseFloat(el.getAttribute("data-parallax")) || 0,
      spin: parseFloat(el.getAttribute("data-spin")) || 0,
      host: el.offsetParent || el.parentElement,
    };
  });

  if (!reduce && items.length) {
    var queued = false;
    var update = function () {
      queued = false;
      var vh = window.innerHeight;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        // Measure the (untransformed) host so the element's own transform never feeds back.
        var r = it.host.getBoundingClientRect();
        if (r.bottom < -300 || r.top > vh + 300) continue;
        var d = r.top + r.height / 2 - vh / 2;
        // Cap the drift so tall sections can't carry a sticker onto nearby content.
        var py = Math.max(-70, Math.min(70, d * it.k));
        it.el.style.setProperty("--py", py.toFixed(1) + "px");
        if (it.spin) it.el.style.setProperty("--pr", (d * it.spin * 0.02).toFixed(2) + "deg");
      }
    };
    var queue = function () {
      if (!queued) {
        queued = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    update();
  }

  /* ---------- Dashed links between pinned notes ---------- */
  var NS = "http://www.w3.org/2000/svg";
  document.querySelectorAll(".notes-board").forEach(function (board, b) {
    var svg = board.querySelector(".notes__links");
    var notes = board.querySelectorAll(".note");
    if (!svg || notes.length < 2) return;
    var links = [];

    var build = function () {
      svg.textContent = "";
      links = [];
      var br = board.getBoundingClientRect();
      var defs = document.createElementNS(NS, "defs");
      svg.appendChild(defs);
      for (var i = 0; i < notes.length - 1; i++) {
        var a = notes[i].getBoundingClientRect();
        var c = notes[i + 1].getBoundingClientRect();
        var pin = notes[i + 1].querySelector(".pin").getBoundingClientRect();
        var ex = pin.left + pin.width / 2 - br.left, ey = pin.top + pin.height / 2 - br.top;
        var d, sy;
        var right = c.left + c.width / 2 > a.left + a.width / 2; // next note sits to the right
        var gy = (a.bottom + c.top) / 2 - br.top; // middle of the gap between the notes
        var free = right ? br.right - a.right : a.left - br.left;
        if (free > 60) {
          // Leave from the free side of this note, loop out, then run along the gap into the next pin.
          var dir = right ? 1 : -1, k = Math.min(80, free - 16) * dir;
          var sx = (right ? a.right : a.left) - br.left;
          sy = a.bottom - br.top - 70;
          d = "M" + sx + " " + sy + "C" + (sx + k) + " " + sy + " " + (sx + k) + " " + gy + " " + sx + " " + gy +
            "C" + (sx - 40 * dir) + " " + gy + " " + ex + " " + gy + " " + ex + " " + ey;
        } else {
          sy = a.bottom - br.top - 2;
          d = "M" + (ex - 30) + " " + sy + "C" + (ex - 30) + " " + gy + " " + ex + " " + gy + " " + ex + " " + ey;
        }
        var id = "nl-" + b + "-" + i;
        var mask = document.createElementNS(NS, "mask");
        mask.setAttribute("id", id);
        mask.setAttribute("maskUnits", "userSpaceOnUse");
        var mp = document.createElementNS(NS, "path");
        mp.setAttribute("class", "link-mask");
        mp.setAttribute("d", d);
        mp.setAttribute("pathLength", "1");
        mp.setAttribute("stroke-dasharray", "1 1");
        mask.appendChild(mp);
        defs.appendChild(mask);
        var path = document.createElementNS(NS, "path");
        path.setAttribute("class", "link");
        path.setAttribute("d", d);
        path.setAttribute("mask", "url(#" + id + ")");
        svg.appendChild(path);
        links.push({ mask: mp, y0: sy, y1: ey });
      }
      draw();
    };

    var draw = function () {
      var top = board.getBoundingClientRect().top;
      var line = window.innerHeight * 0.72; // the link is drawn up to this point of the viewport
      for (var i = 0; i < links.length; i++) {
        var l = links[i];
        var t = reduce ? 1 : (line - (top + l.y0)) / Math.max(1, l.y1 - l.y0);
        t = Math.max(0, Math.min(1, t));
        l.mask.setAttribute("stroke-dashoffset", String(1 - t));
      }
    };

    var queued = false;
    window.addEventListener("scroll", function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; draw(); });
    }, { passive: true });
    if ("ResizeObserver" in window) new ResizeObserver(build).observe(board);
    else window.addEventListener("resize", build);
    build();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
  });

  /* ---------- Pick up and move stickers (mouse / pen only) ---------- */
  if (fine) {
    document.querySelectorAll("[data-sticker]").forEach(function (el) {
      var startX = 0, startY = 0, x = 0, y = 0, pid = null;
      el.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        pid = e.pointerId;
        el.setPointerCapture(pid);
        startX = e.clientX - x;
        startY = e.clientY - y;
        el.classList.add("is-dragging");
        e.preventDefault();
      });
      el.addEventListener("pointermove", function (e) {
        if (e.pointerId !== pid) return;
        x = e.clientX - startX;
        y = e.clientY - startY;
        el.style.setProperty("--dx", x + "px");
        el.style.setProperty("--dy", y + "px");
      });
      var end = function (e) {
        if (e.pointerId !== pid) return;
        pid = null;
        el.classList.remove("is-dragging");
      };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    });
  }
})();
