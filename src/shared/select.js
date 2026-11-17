// Custom dropdown that wraps a native <select>.
// The <select> stays the source of truth (value + change/input events), so callers
// keep using it normally; only the UI is replaced with a styled button + menu.
(function () {
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {});
  let openState = null; // { sel, menu, btn, index, close }

  function el(tag, props, children) {
    const n = document.createElement(tag);
    Object.assign(n, props || {});
    for (const c of children || []) n.append(c);
    return n;
  }

  const icon = (name) => (FB.icon ? FB.icon(name) : el('span'));

  function enhanceSelect(sel) {
    if (sel.fbSelect) return sel.fbSelect;
    const label = el('span', { className: 'fb-select-label' });
    const btn = el('button', { type: 'button', className: 'fb-select' }, [label, icon('chevron')]);
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    sel.classList.add('fb-select-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    sel.after(btn);

    function sync() {
      const opt = sel.options[sel.selectedIndex];
      label.textContent = opt ? opt.textContent : '';
      btn.disabled = sel.disabled || !sel.options.length;
      if (sel.id) btn.dataset.for = sel.id;
    }

    function choose(i) {
      const opt = sel.options[i];
      if (!opt || opt.disabled) return;
      const changed = sel.selectedIndex !== i;
      sel.selectedIndex = i;
      sync();
      close();
      btn.focus();
      if (changed) {
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    function render(menu, index) {
      menu.replaceChildren(...[...sel.options].map((o, i) => {
        const item = el('div', {
          className: `fb-select-opt${i === sel.selectedIndex ? ' selected' : ''}${i === index ? ' active' : ''}${o.disabled ? ' disabled' : ''}`,
          role: 'option',
        }, [el('span', { className: 'fb-select-check' }, i === sel.selectedIndex ? [icon('check')] : []), el('span', { textContent: o.textContent })]);
        item.setAttribute('aria-selected', String(i === sel.selectedIndex));
        item.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus on the button
        item.addEventListener('click', () => choose(i));
        item.addEventListener('mousemove', () => {
          if (openState && openState.index !== i) { openState.index = i; render(menu, i); }
        });
        return item;
      }));
      const active = menu.children[index];
      if (active) active.scrollIntoView({ block: 'nearest' });
    }

    function position(menu) {
      const r = btn.getBoundingClientRect();
      menu.style.minWidth = `${r.width}px`;
      menu.style.left = `${r.left}px`;
      const h = Math.min(menu.scrollHeight, 280);
      const below = innerHeight - r.bottom - 8;
      if (below < h && r.top > below) menu.style.top = `${Math.max(8, r.top - h - 4)}px`;
      else menu.style.top = `${r.bottom + 4}px`;
    }

    function open() {
      if (btn.disabled) return;
      if (openState) openState.close();
      const menu = el('div', { className: 'fb-select-menu', role: 'listbox' });
      // Inside a modal <dialog> the menu must live in the dialog (top layer).
      (btn.closest('dialog') || document.body).append(menu);
      openState = { sel, menu, btn, index: Math.max(0, sel.selectedIndex), close };
      render(menu, openState.index);
      position(menu);
      btn.setAttribute('aria-expanded', 'true');
      btn.classList.add('open');
    }

    function close() {
      if (!openState || openState.sel !== sel) return;
      openState.menu.remove();
      openState = null;
      btn.setAttribute('aria-expanded', 'false');
      btn.classList.remove('open');
    }

    function move(delta) {
      const n = sel.options.length;
      let i = openState.index;
      for (let k = 0; k < n; k++) {
        i = (i + delta + n) % n;
        if (!sel.options[i].disabled) break;
      }
      openState.index = i;
      render(openState.menu, i);
    }

    btn.addEventListener('click', () => (openState && openState.sel === sel ? close() : open()));
    btn.addEventListener('keydown', (e) => {
      const isOpen = openState && openState.sel === sel;
      if (!isOpen) {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Home') { e.preventDefault(); openState.index = 0; render(openState.menu, 0); }
      else if (e.key === 'End') { e.preventDefault(); openState.index = sel.options.length - 1; render(openState.menu, openState.index); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(openState.index); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Tab') close();
      else if (e.key.length === 1) {
        // type-ahead: jump to the next option starting with this character
        const ch = e.key.toLowerCase();
        const n = sel.options.length;
        for (let k = 1; k <= n; k++) {
          const i = (openState.index + k) % n;
          if (sel.options[i].textContent.trim().toLowerCase().startsWith(ch)) {
            openState.index = i;
            render(openState.menu, i);
            break;
          }
        }
      }
    });
    btn.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== btn) close(); }, 120));
    sel.addEventListener('change', sync);

    sync();
    sel.fbSelect = { sync, open, close, button: btn };
    return sel.fbSelect;
  }

  // Close on outside click / scroll / resize; Esc must not also close a surrounding dialog.
  document.addEventListener('mousedown', (e) => {
    if (openState && !openState.menu.contains(e.target) && !openState.btn.contains(e.target)) openState.close();
  }, true);
  window.addEventListener('resize', () => openState && openState.close());
  document.addEventListener('scroll', (e) => {
    if (openState && !openState.menu.contains(e.target)) openState.close();
  }, true);
  document.addEventListener('cancel', (e) => {
    if (openState) { e.preventDefault(); openState.close(); }
  }, true);

  FB.enhanceSelect = enhanceSelect;
})();
