/* PAPERBOT — sticker & origami motion (no dependencies, loaded with defer).

   [data-sticker]   die-cut stickers: slap onto the page when scrolled into view;
                    on desktop they can be picked up and moved with the mouse.
   [data-origami]   origami illustrations: their facets unfold into place.
   [data-fold]      paper cards / rows: unfold from a top crease as they enter.
   [data-strip]     accordion paper strips: open sideways as they enter.
   [data-parallax]  drift with scroll at the given rate (and rotate by data-spin).

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

  var targets = document.querySelectorAll("[data-sticker], [data-origami], [data-fold], [data-strip]");
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
