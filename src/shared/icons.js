// Small line icons (24px grid, stroke = currentColor) for extension pages.
// Static HTML: <button data-icon="crosshair">Pick</button> gets the icon prepended on load.
(function () {
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {});

  const PATHS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    sort: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    move: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10.5l3 3-3 3M8.5 13.5H15"/>',
    crosshair: '<circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    upload: '<path d="M12 15V4M7 9l5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
    tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    lines: '<path d="M4 6h16M4 12h10M4 18h13"/>',
    compact: '<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/>',
    list: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6M15 15l2 2 2-2"/>',
    eraser: '<path d="M7 21h10M5.5 13.5 13 6l5 5-7.5 7.5H8z"/>',
    keycap: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M8 13h8M10 10l-2 3 2 3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    textfield: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 10v4"/>',
    dropdown: '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="m14 11 2 2 2-2M6 12h5"/>',
    paragraph: '<path d="M4 6h16M4 10h16M4 14h16M4 18h10"/>',
    idcard: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 16c.8-1.5 1.8-2 3-2s2.2.5 3 2M14 10h5M14 14h3"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h.01M15 15h.01M15 9h.01M9 15h.01M12 12h.01"/>',
    fileplus: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
    variable: '<path d="M8 4c-2 2.5-2 13.5 0 16M16 4c2 2.5 2 13.5 0 16M10 9l4 6M14 9l-4 6"/>',
    sigma: '<path d="M18 6V4H6l6 8-6 8h12v-2"/>',
    cursor: '<path d="M9 4h6M9 20h6M12 4v16"/>',
  };

  function iconSvg(name) {
    const p = PATHS[name];
    if (!p) return '';
    return `<svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  }

  /** Icon as an element (empty span if unknown). */
  function icon(name) {
    const span = document.createElement('span');
    span.className = 'icon-wrap';
    span.innerHTML = iconSvg(name);
    return span;
  }

  function decorate(root) {
    (root || document).querySelectorAll('[data-icon]').forEach((el) => {
      if (el.querySelector(':scope > .icon-wrap')) return;
      el.prepend(icon(el.dataset.icon));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => decorate());
  else decorate();

  FB.icon = icon;
  FB.decorateIcons = decorate;
})();
