/* Header navigation — shared by every page.

   The menu is a hamburger at every width: the links stay collapsed behind the
   button on desktop as on a phone, so nothing here needs to know about width.
   State lives in one place: aria-expanded on the button. The .is-open class on
   the nav is derived from it, never set independently, and the CSS shows or
   hides the nav from that class alone. */
(function () {
  'use strict';

  var toggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('site-nav');

  if (!toggle || !nav) return;

  function setOpen(open) {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    nav.classList.toggle('is-open', open);
  }

  function isOpen() {
    return toggle.getAttribute('aria-expanded') === 'true';
  }

  toggle.addEventListener('click', function () {
    setOpen(!isOpen());
  });

  /* Following a link closes the menu. On a same-page anchor no navigation
     happens, so without this the panel would stay open over the target. */
  nav.addEventListener('click', function (e) {
    var el = e.target;
    if (el && el.closest && el.closest('a')) setOpen(false);
  });

  /* Escape closes and hands focus back to the button, so a keyboard user is
     not left with focus inside a panel that is no longer rendered. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !isOpen()) return;
    setOpen(false);
    toggle.focus();
  });

  /* A tap outside the header dismisses it, matching what the overlay looks
     like it should do. */
  document.addEventListener('click', function (e) {
    if (!isOpen()) return;
    if (toggle.contains(e.target) || nav.contains(e.target)) return;
    setOpen(false);
  });

  setOpen(false);
})();
