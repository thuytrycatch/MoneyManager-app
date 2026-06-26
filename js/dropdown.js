/* =====================================================================
 *  dropdown.js — a small, dependency-free custom <select> replacement.
 *
 *  Why: native <select> renders differently on Chrome/iOS/Android (arrow,
 *  height, the OS-drawn option panel), which made the app look uneven.
 *  This enhances every native <select> in place with a consistent button +
 *  popover (a bottom-sheet on mobile) while KEEPING the native element for
 *  its value and `change` events — so existing app logic is untouched.
 *
 *  Usage: it auto-runs. A MutationObserver re-enhances any <select> added
 *  later (the app re-renders #view and opens modals dynamically). Selects
 *  marked data-cs are skipped, so enhancing is idempotent.
 * ===================================================================== */
(function () {
  'use strict';

  var CHEV = '<svg class="cs-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  var CHECK = '<svg class="cs-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

  var openInstance = null; // only one panel open at a time

  function isMobile() {
    try { return window.matchMedia('(max-width: 768px)').matches; } catch (e) { return false; }
  }

  // Build the trigger button + hide the native select, once per <select>.
  function enhance(sel) {
    if (!sel || sel.dataset.cs || sel.multiple) return;
    sel.dataset.cs = '1';

    var wrap = document.createElement('div');
    wrap.className = 'cs';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add('cs-native');
    sel.setAttribute('tabindex', '-1');
    sel.setAttribute('aria-hidden', 'true');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cs-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="cs-val"></span>' + CHEV;
    wrap.appendChild(btn);

    function syncLabel() {
      var opt = sel.options[sel.selectedIndex];
      btn.querySelector('.cs-val').textContent = opt ? opt.textContent : '';
    }
    syncLabel();

    // Keep the label fresh if app code changes the value programmatically.
    sel.addEventListener('change', syncLabel);

    btn.addEventListener('click', function () {
      if (wrap.classList.contains('open')) close();
      else open(wrap, sel, btn, syncLabel);
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(wrap, sel, btn, syncLabel);
      }
    });
  }

  function open(wrap, sel, btn, syncLabel) {
    close(); // close any other open panel first
    var mobile = isMobile();

    var backdrop = document.createElement('div');
    backdrop.className = 'cs-backdrop';

    var panel = document.createElement('div');
    panel.className = 'cs-panel' + (mobile ? ' cs-sheet' : '');
    panel.setAttribute('role', 'listbox');

    var opts = [];
    for (var i = 0; i < sel.options.length; i++) {
      var o = sel.options[i];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cs-opt';
      b.setAttribute('role', 'option');
      b.setAttribute('tabindex', '-1');
      b.dataset.idx = String(i);
      var selected = i === sel.selectedIndex;
      b.setAttribute('aria-selected', selected ? 'true' : 'false');
      b.innerHTML = '<span class="cs-opt-label"></span>' + CHECK;
      b.querySelector('.cs-opt-label').textContent = o.textContent;
      panel.appendChild(b);
      opts.push(b);
    }

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    wrap.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');

    if (!mobile) position(panel, btn);

    function choose(idx) {
      var changed = sel.selectedIndex !== idx;
      sel.selectedIndex = idx;
      syncLabel();
      // Close first: a change listener may re-render and destroy this element.
      close();
      // Mirror a real user selection so existing listeners run.
      if (changed) sel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    var active = sel.selectedIndex >= 0 ? sel.selectedIndex : 0;
    function setActive(idx) {
      if (idx < 0) idx = 0; if (idx > opts.length - 1) idx = opts.length - 1;
      active = idx;
      opts.forEach(function (b, j) { b.classList.toggle('active', j === idx); });
      if (opts[idx]) opts[idx].focus();
    }

    opts.forEach(function (b) {
      b.addEventListener('click', function () { choose(Number(b.dataset.idx)); });
    });
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
      else if (e.key === 'End') { e.preventDefault(); setActive(opts.length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    backdrop.addEventListener('click', close);

    // Reposition/dismiss popover on layout shifts (desktop fixed positioning).
    var onShift = function () { if (mobile) return; position(panel, btn); };
    window.addEventListener('scroll', onScrollClose, true);
    window.addEventListener('resize', onShift);

    openInstance = {
      wrap: wrap, btn: btn, panel: panel, backdrop: backdrop,
      onShift: onShift,
    };

    // focus the selected/first option for keyboard users
    setActive(active);

    function onScrollClose(e) {
      if (panel.contains(e.target)) return; // scrolling inside the list is fine
      close();
    }
    openInstance.onScrollClose = onScrollClose;
  }

  // Place the popover under (or above) the trigger, clamped to the viewport.
  function position(panel, btn) {
    var r = btn.getBoundingClientRect();
    var margin = 6;
    panel.style.minWidth = r.width + 'px';
    panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - panel.offsetWidth - 8)) + 'px';
    var below = window.innerHeight - r.bottom;
    var ph = panel.offsetHeight;
    if (below < ph + margin && r.top > below) {
      panel.style.top = Math.max(8, r.top - ph - margin) + 'px';
    } else {
      panel.style.top = (r.bottom + margin) + 'px';
    }
  }

  function close() {
    var inst = openInstance;
    if (!inst) return;
    openInstance = null;
    window.removeEventListener('scroll', inst.onScrollClose, true);
    window.removeEventListener('resize', inst.onShift);
    inst.wrap.classList.remove('open');
    inst.btn.setAttribute('aria-expanded', 'false');
    if (inst.panel.parentNode) inst.panel.parentNode.removeChild(inst.panel);
    if (inst.backdrop.parentNode) inst.backdrop.parentNode.removeChild(inst.backdrop);
    try { if (inst.btn.isConnected) inst.btn.focus(); } catch (e) { /* ignore */ }
  }

  function enhanceAll(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var list = scope.querySelectorAll('select:not([data-cs])');
    for (var i = 0; i < list.length; i++) enhance(list[i]);
  }

  // Re-enhance selects added by re-renders / opened modals. Debounced via rAF.
  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    raf(function () { scheduled = false; enhanceAll(); });
  }

  function init() {
    enhanceAll();
    try {
      var mo = new MutationObserver(schedule);
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* MutationObserver unsupported — callers can use enhanceAll() */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.CustomSelect = { enhance: enhance, enhanceAll: enhanceAll, close: close };
})();
