/* ================================================================
   BAKERSS — SHARED JS  (deferred, non-render-blocking)
   ================================================================ */

(function () {
  'use strict';

  /* ── Load Google Fonts asynchronously (performance) ────── */
  function loadFonts() {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap';
    link.onload = function () { document.documentElement.classList.add('fonts-loaded'); };
    document.head.appendChild(link);
  }

  /* ── Mobile Nav ─────────────────────────────────────────── */
  function initNav() {
    var ham = document.querySelector('.ham');
    var mob = document.querySelector('.mob-nav');
    if (!ham || !mob) return;

    ham.addEventListener('click', function () {
      var open = mob.classList.toggle('is-open');
      ham.classList.toggle('is-open', open);
      ham.setAttribute('aria-expanded', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (mob.classList.contains('is-open') && !mob.contains(e.target) && !ham.contains(e.target)) {
        mob.classList.remove('is-open');
        ham.classList.remove('is-open');
        ham.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
    });
  }

  /* ── FAQ Accordion ──────────────────────────────────────── */
  function initFAQ() {
    document.querySelectorAll('.faq-q').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var wasOpen = btn.classList.contains('open');
        // Close all
        document.querySelectorAll('.faq-q').forEach(function (b) {
          b.classList.remove('open');
          b.setAttribute('aria-expanded', 'false');
          var ans = b.nextElementSibling;
          if (ans) ans.classList.remove('open');
        });
        // Toggle clicked
        if (!wasOpen) {
          btn.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
          var ans = btn.nextElementSibling;
          if (ans) ans.classList.add('open');
        }
      });
    });
  }

  /* ── Scroll-reveal (IntersectionObserver) ───────────────── */
  function initReveal() {
    if (!window.IntersectionObserver) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -36px 0px' });

    document.querySelectorAll('[data-reveal]').forEach(function (el, i) {
      el.style.opacity = '0';
      el.style.transform = 'translateY(22px)';
      el.style.transition = 'opacity .5s ease ' + (i % 5 * 0.08) + 's, transform .5s ease ' + (i % 5 * 0.08) + 's';
      obs.observe(el);
    });
  }

  /* ── Active nav link ────────────────────────────────────── */
  function setActiveNav() {
    var path = window.location.pathname;
    var file = path.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link, .mob-link, .dd-link').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (file && href.indexOf(file) !== -1 && file !== '') {
        a.setAttribute('aria-current', 'page');
      }
    });
  }

  /* ── Init ───────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    loadFonts();
    initNav();
    initFAQ();
    initReveal();
    setActiveNav();
  });
})();
