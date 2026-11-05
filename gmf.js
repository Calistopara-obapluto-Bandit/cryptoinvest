/* ============================================================
   Global Mass Funds — shared site behaviour
   Navigation, Services dropdown, mobile menu, FAQ accordion,
   and lightweight form feedback. Vanilla JS, no dependencies.
   ============================================================ */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    /* ---------- 1. Fixed nav scroll state ---------- */
    var nav = document.getElementById('site-nav');
    if (nav) {
      var onScroll = function () {
        nav.classList.toggle('scrolled', window.scrollY > 12);
      };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    /* ---------- 2. Services dropdown ---------- */
    var navItems = Array.prototype.slice.call(document.querySelectorAll('.nav-item'));

    function closeAllDropdowns(except) {
      navItems.forEach(function (item) {
        if (item === except) return;
        item.classList.remove('open');
        var toggle = item.querySelector('.nav-link');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      });
    }

    navItems.forEach(function (item) {
      var toggle = item.querySelector('.nav-link');
      var panel = item.querySelector('.dropdown-panel');
      if (!toggle || !panel) return;

      toggle.addEventListener('click', function (event) {
        event.preventDefault();
        var willOpen = !item.classList.contains('open');
        closeAllDropdowns(item);
        item.classList.toggle('open', willOpen);
        toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      });

      // Desktop pointer users get hover as well as click.
      item.addEventListener('mouseenter', function () {
        if (window.matchMedia('(hover: hover) and (min-width: 769px)').matches) {
          closeAllDropdowns(item);
          item.classList.add('open');
          toggle.setAttribute('aria-expanded', 'true');
        }
      });
      item.addEventListener('mouseleave', function () {
        if (window.matchMedia('(hover: hover) and (min-width: 769px)').matches) {
          item.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
      // Keyboard support: close once focus leaves the panel.
      item.addEventListener('focusout', function (event) {
        if (!item.contains(event.relatedTarget)) {
          item.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    });

    document.addEventListener('click', function (event) {
      if (!event.target.closest || !event.target.closest('.nav-item')) closeAllDropdowns();
    });

    /* ---------- 3. Mobile menu ---------- */
    var burger = document.getElementById('nav-toggle');
    var menu = document.getElementById('mobile-menu');

    function setMenu(open) {
      if (!burger || !menu) return;
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.classList.toggle('open', open);
      document.body.classList.toggle('menu-open', open);
    }

    if (burger && menu) {
      burger.addEventListener('click', function () {
        setMenu(!menu.classList.contains('open'));
      });
      menu.addEventListener('click', function (event) {
        if (event.target.tagName === 'A') setMenu(false);
      });
      var desktop = window.matchMedia('(min-width: 769px)');
      var onBreakpoint = function (event) { if (event.matches) setMenu(false); };
      if (desktop.addEventListener) desktop.addEventListener('change', onBreakpoint);
      else if (desktop.addListener) desktop.addListener(onBreakpoint);
    }

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      closeAllDropdowns();
      setMenu(false);
    });

    /* ---------- 4. FAQ / contact accordion ---------- */
    var questions = Array.prototype.slice.call(document.querySelectorAll('.faq-question'));
    questions.forEach(function (question) {
      var item = question.closest('.faq-item');
      if (!item) return;

      var toggle = function () {
        var isOpen = item.classList.contains('open');
        var siblings = item.parentElement ? item.parentElement.querySelectorAll('.faq-item') : [];
        Array.prototype.forEach.call(siblings, function (sibling) {
          sibling.classList.remove('open');
          var q = sibling.querySelector('.faq-question');
          if (q) q.setAttribute('aria-expanded', 'false');
        });
        item.classList.toggle('open', !isOpen);
        question.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      };

      question.addEventListener('click', toggle);
      question.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      });
    });

    /* ---------- 5. Forms: inline confirmation instead of a dead submit ---------- */
    Array.prototype.forEach.call(document.querySelectorAll('form[data-gmf-form]'), function (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var field = form.querySelector('input[type="email"], input[type="text"]');
        var status = form.querySelector('[data-form-status]');
        if (field && !field.checkValidity()) {
          if (status) status.textContent = 'Enter a valid email address to continue.';
          field.focus();
          return;
        }
        if (status) {
          status.textContent = 'Thanks — your request is queued for a GMF rep.';
          status.classList.add('is-ok');
        }
        form.reset();
      });
    });

    /* ---------- 6. In-page links close the menu before jumping ---------- */
    Array.prototype.forEach.call(document.querySelectorAll('a[href^="#"]'), function (link) {
      link.addEventListener('click', function () {
        if (document.body.classList.contains('menu-open')) setMenu(false);
      });
    });
  });
})();
