/* Paperbot — page behaviour (no dependencies). Loaded with `defer`. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---------- Nav: scrolled state, mobile menu, active link ---------- */
  var nav = document.querySelector(".nav");
  var toggle = document.getElementById("nav-toggle");
  var links = document.getElementById("nav-links");

  function onScroll() {
    nav.classList.toggle("is-scrolled", window.scrollY > 12);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (toggle && links) {
    var setMenu = function (open) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      links.classList.toggle("is-open", open);
    };
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") !== "true";
      setMenu(open);
      if (open) {
        var first = links.querySelector("a");
        if (first) first.focus();
      }
    });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { setMenu(false); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && links.classList.contains("is-open")) {
        setMenu(false);
        toggle.focus();
      }
    });
  }

  // Highlight the nav link for the section currently in view.
  var sectionLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__links a[href^="#"]:not(.btn)'));
  var sections = sectionLinks
    .map(function (a) { return document.querySelector(a.getAttribute("href")); })
    .filter(Boolean);
  if ("IntersectionObserver" in window && sections.length) {
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var href = "#" + entry.target.id;
          if (!entry.isIntersecting) {
            // Section left the band: clear its link so nothing stays stale.
            sectionLinks.forEach(function (a) {
              if (a.getAttribute("href") === href) a.classList.remove("is-active");
            });
            return;
          }
          sectionLinks.forEach(function (a) {
            a.classList.toggle("is-active", a.getAttribute("href") === href);
          });
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ---------- FAQ: only one open at a time ---------- */
  var faqs = document.querySelectorAll(".faq__item");
  faqs.forEach(function (d) {
    d.addEventListener("toggle", function () {
      if (!d.open) return;
      faqs.forEach(function (o) { if (o !== d && o.open) o.open = false; });
    });
  });

  /* ---------- Pointer tilt on paper cards ---------- */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll(".tilt").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty("--ry", (px * 6).toFixed(2) + "deg");
        card.style.setProperty("--rx", (-py * 6).toFixed(2) + "deg");
        card.classList.add("is-tilting");
      });
      card.addEventListener("pointerleave", function () {
        card.classList.remove("is-tilting");
        card.style.removeProperty("--rx");
        card.style.removeProperty("--ry");
      });
    });
  }

  /* ---------- Demo form ----------
     Front-end only. To wire it up, set `data-endpoint` on the <form> to a
     POST endpoint (e.g. a Formspree / Basin URL or your own API); the JSON
     body is { name, email, company, interest, message }. Without an
     endpoint the form runs in preview mode and says plainly that nothing
     was sent, so it can never tell a real visitor their request arrived. */
  var form = document.getElementById("demo-form");
  if (form) {
    var btn = form.querySelector(".form__submit");
    var btnHTML = btn.innerHTML;
    var alertEl = form.querySelector(".form__alert");
    var sending = false;

    var showFieldState = function (f) {
      var valid = f.checkValidity();
      f.setAttribute("aria-invalid", valid ? "false" : "true");
      var err = document.getElementById(f.getAttribute("aria-describedby"));
      if (err) err.textContent = valid ? "" : f.validationMessage;
      return valid;
    };
    form.querySelectorAll("[required]").forEach(function (f) {
      f.addEventListener("input", function () {
        if (f.getAttribute("aria-invalid") === "true") showFieldState(f);
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (sending) return;
      var firstInvalid = null;
      form.querySelectorAll("[required]").forEach(function (f) {
        if (!showFieldState(f) && !firstInvalid) firstInvalid = f;
      });
      if (firstInvalid) { firstInvalid.focus(); return; }

      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      sending = true;
      btn.disabled = true;
      btn.textContent = "Sending…";
      alertEl.textContent = "";

      function done(previewOnly) {
        var success = form.querySelector(".form__success");
        if (previewOnly) {
          success.querySelector("h3").textContent = "Preview mode";
          success.querySelector(".form__success-msg").textContent =
            "This form isn't connected yet, so nothing was sent. Please contact Paperbot directly to book your demo.";
        }
        form.classList.add("is-sent");
        success.hidden = false;
        success.querySelector("h3").focus();
      }
      function fail() {
        sending = false;
        btn.disabled = false;
        btn.innerHTML = btnHTML;
        alertEl.textContent = "Sorry, your request couldn't be sent. Please try again.";
      }

      var endpoint = form.getAttribute("data-endpoint");
      if (endpoint && window.fetch) {
        fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(data) })
          .then(function (res) {
            if (!res.ok) throw new Error(String(res.status));
            done(false);
          })
          .catch(fail);
      } else {
        if (window.console) console.warn("Paperbot demo form: no data-endpoint set, running in preview mode.");
        setTimeout(function () { done(true); }, 400);
      }
    });
  }

  /* ---------- Footer year ---------- */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
