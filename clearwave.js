/* ============================================================
   Clearwave Crypto — shared site behaviour
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
    var closeTimer = null;

    function closeItem(item) {
      item.classList.remove('open');
      var toggle = item.querySelector('.nav-link');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }

    function closeAllDropdowns(except) {
      navItems.forEach(function (item) {
        if (item !== except) closeItem(item);
      });
    }

    navItems.forEach(function (item) {
      var toggle = item.querySelector('.nav-link');
      var panel = item.querySelector('.dropdown-panel');
      if (!toggle || !panel) return;

      var hoverQuery = window.matchMedia('(hover: hover) and (min-width: 769px)');
      // Set when the open menu is dismissed by a click, so the pointer resting
      // on the trigger does not immediately reopen what was just closed.
      var hoverBlocked = false;

      function openItem() {
        clearTimeout(closeTimer);
        closeAllDropdowns(item);
        item.classList.add('open');
        toggle.setAttribute('aria-expanded', 'true');
      }

      function scheduleClose() {
        clearTimeout(closeTimer);
        closeTimer = setTimeout(function () { closeItem(item); }, 220);
      }

      toggle.addEventListener('click', function (event) {
        event.preventDefault();
        if (item.classList.contains('open')) {
          closeItem(item);
          hoverBlocked = true;
        } else {
          hoverBlocked = false;
          openItem();
        }
      });

      // Desktop pointer users get hover as well as click. The close is delayed
      // and the panel bridges the gap to the trigger, so travelling from the
      // button to a link never dismisses the menu.
      item.addEventListener('mouseenter', function () {
        if (!hoverQuery.matches || hoverBlocked) return;
        openItem();
      });
      item.addEventListener('mouseleave', function () {
        if (!hoverQuery.matches) return;
        hoverBlocked = false;
        scheduleClose();
      });
      // Keyboard support: close once focus leaves the panel.
      item.addEventListener('focusout', function (event) {
        if (!item.contains(event.relatedTarget)) {
          hoverBlocked = false;
          closeItem(item);
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
    Array.prototype.forEach.call(document.querySelectorAll('form[data-cw-form]'), function (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var status = form.querySelector('[data-form-status]');
        // Let the browser enforce every required field, not just the first one.
        if (!form.checkValidity()) {
          if (status) status.textContent = '';
          form.reportValidity();
          return;
        }
        var email = form.querySelector('input[type="email"]');
        if (status) {
          status.textContent = form.classList.contains('newsletter-form')
            ? 'Thanks — you are subscribed. Watch your inbox for Clearwave updates.'
            : (email && email.value
              ? 'Thanks — we will be in touch at ' + email.value + '.'
              : 'Thanks — your message is on its way to a Clearwave rep.');
          status.classList.add('is-ok');
        }
        form.reset();
      });
    });

    /* ---------- 5b. Profit calculator ---------- */
    Array.prototype.forEach.call(document.querySelectorAll('form[data-cw-calc]'), function (form) {
      var plan = form.querySelector('select[name="plan"]');
      var deposit = form.querySelector('input[name="deposit"]');
      var profitOut = form.querySelector('[data-calc-profit]');
      var totalOut = form.querySelector('[data-calc-total]');
      if (!plan || !deposit) return;

      var money = function (value) {
        return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      var update = function () {
        var rate = parseFloat(plan.value) || 0;
        var amount = parseFloat(deposit.value) || 0;
        if (amount < 0) amount = 0;
        var profit = amount * (rate / 100) * 30;
        if (profitOut) profitOut.textContent = money(profit);
        if (totalOut) totalOut.textContent = money(amount + profit);
      };

      plan.addEventListener('change', update);
      deposit.addEventListener('input', update);
      update();
    });

    /* ---------- 6. In-page links close the menu before jumping ---------- */
    Array.prototype.forEach.call(document.querySelectorAll('a[href^="#"]'), function (link) {
      link.addEventListener('click', function () {
        if (document.body.classList.contains('menu-open')) setMenu(false);
      });
    });

    /* ---------- 7. Light / dark theme ---------- */
    // The inline script in the head sets the saved theme before paint; from
    // here we keep the buttons' state in sync and persist each change.
    var themeButtons = Array.prototype.slice.call(document.querySelectorAll('[data-theme-toggle]'));

    function activeTheme() {
      return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function applyTheme(theme) {
      var isDark = theme === 'dark';
      var label = isDark ? 'Switch to light theme' : 'Switch to dark theme';
      document.documentElement.setAttribute('data-theme', theme);
      themeButtons.forEach(function (button) {
        button.setAttribute('aria-pressed', isDark ? 'true' : 'false');
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
      });
      try {
        localStorage.setItem('cw-theme', theme);
      } catch (error) {
        // Storage blocked — the theme still applies for this page view.
      }
    }

    themeButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        applyTheme(activeTheme() === 'dark' ? 'light' : 'dark');
      });
    });

    applyTheme(activeTheme());
  });
})();

/* ============================================================
   Member app — copy the referral link, highlight the chosen package
   ============================================================ */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    /* Copy referral link. Falls back to selecting the text when the
       clipboard API is unavailable (non-HTTPS previews, older browsers). */
    document.addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('[data-copy]') : null;
      if (!button) return;

      var value = button.getAttribute('data-copy') || '';
      var original = button.textContent;
      var done = function () {
        button.textContent = 'Copied';
        window.setTimeout(function () { button.textContent = original; }, 1600);
      };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(value).then(done, function () {
          button.textContent = 'Copy failed';
        });
        return;
      }

      var field = button.parentElement ? button.parentElement.querySelector('input') : null;
      if (field) {
        field.select();
        try { document.execCommand('copy'); done(); } catch (error) { /* selection stays */ }
      }
    });

    /* Keep the selected package card outlined. */
    var choices = document.querySelectorAll('.pkg-choice');
    Array.prototype.forEach.call(choices, function (choice) {
      var input = choice.querySelector('input[type="radio"]');
      if (!input) return;
      input.addEventListener('change', function () {
        Array.prototype.forEach.call(choices, function (other) {
          var own = other.querySelector('input[type="radio"]');
          other.classList.toggle('is-selected', Boolean(own && own.checked));
        });
      });
    });
  });
})();
