/*
  Premium static animation — scroll reveal + stagger + count-up.
  Dependency-free. Load with `defer`. Self-initializes on DOMContentLoaded.

  Usage:
    <div data-reveal>fades/slides in once, when scrolled into view</div>
    <div data-reveal data-reveal-delay="2">staggered relative to siblings</div>
    <span data-counter="1234">0</span>  animates 0 -> 1234 once visible
    <span data-counter="1234" data-counter-suffix="+">0</span>
*/

(function () {
  "use strict";

  function initReveal() {
    var els = document.querySelectorAll("[data-reveal]");
    if (!els.length) return;

    // Assign a stagger index: explicit data-reveal-delay wins, otherwise
    // fall back to DOM order among siblings sharing a parent.
    var parentCounts = new Map();
    els.forEach(function (el) {
      var explicit = el.getAttribute("data-reveal-delay");
      if (explicit !== null) {
        el.style.setProperty("--reveal-index", explicit);
        return;
      }
      var parent = el.parentElement;
      var count = parentCounts.get(parent) || 0;
      el.style.setProperty("--reveal-index", String(count));
      parentCounts.set(parent, count + 1);
    });

    if (!("IntersectionObserver" in window)) {
      // No IO support: just show everything, no animation.
      els.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var el = entry.target;
            el.classList.add("is-visible");
            observer.unobserve(el); // reveal once, never re-hide
            // After the entrance finishes, drop the reveal transition so the
            // element's own hover/focus transitions apply without delay.
            var settle = function (ev) {
              if (ev && ev.target !== el) return;
              el.removeEventListener("transitionend", settle);
              el.removeAttribute("data-reveal");
            };
            el.addEventListener("transitionend", settle);
            setTimeout(settle, 1600);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );

    els.forEach(function (el) { observer.observe(el); });
  }

  function initCounters() {
    var els = document.querySelectorAll("[data-counter]");
    if (!els.length || !("IntersectionObserver" in window)) return;

    var reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);

          var el = entry.target;
          var target = parseFloat(el.getAttribute("data-counter")) || 0;
          var suffix = el.getAttribute("data-counter-suffix") || "";

          if (reduceMotion) {
            el.textContent = target + suffix;
            return;
          }

          var duration = 1200;
          var start = null;

          function step(ts) {
            if (start === null) start = ts;
            var progress = Math.min((ts - start) / duration, 1);
            var eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
            var value = Math.round(target * eased);
            el.textContent = value + suffix;
            if (progress < 1) requestAnimationFrame(step);
          }

          requestAnimationFrame(step);
        });
      },
      { threshold: 0.5 }
    );

    els.forEach(function (el) { observer.observe(el); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initReveal();
      initCounters();
    });
  } else {
    initReveal();
    initCounters();
  }
})();
