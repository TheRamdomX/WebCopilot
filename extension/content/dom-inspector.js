/**
 * DOM Inspector - Inspecciona el DOM y extrae elementos interactivos visibles
 */
const DOMInspector = (function() {
  'use strict';

  const SELECTORS = [
    'button', 'a[href]', 'input', 'select', 'textarea',
    '[role="button"]', '[role="link"]', '[role="checkbox"]',
    '[role="radio"]', '[role="textbox"]', '[role="combobox"]',
    '[role="listbox"]', '[role="menuitem"]', '[role="tab"]',
    '[onclick]', '[tabindex]:not([tabindex="-1"])'
  ];

  let idCounter = 0;

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0' &&
           (rect.width > 0 || rect.height > 0) &&
           rect.bottom > 0 && rect.top < window.innerHeight &&
           rect.right > 0 && rect.left < window.innerWidth;
  }

  function getText(el) {
    const aria = el.getAttribute('aria-label');
    if (aria?.trim()) return aria.trim();

    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const label = document.getElementById(labelledBy);
      if (label?.textContent) return label.textContent.trim();
    }

    if (el.innerText?.trim()) {
      const t = el.innerText.trim();
      return t.length > 100 ? t.slice(0, 100) + '...' : t;
    }

    const ph = el.getAttribute('placeholder');
    if (ph?.trim()) return ph.trim();

    const title = el.getAttribute('title');
    if (title?.trim()) return title.trim();

    if (el.value?.trim()) {
      const v = el.value.trim();
      return v.length > 50 ? v.slice(0, 50) + '...' : v;
    }

    const img = el.querySelector('img[alt]');
    const alt = img?.getAttribute('alt');
    return alt?.trim() || '';
  }

  function getType(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    if (role) return role;
    const map = { button: 'button', a: 'link', input: el.type || 'text-input', select: 'dropdown', textarea: 'text-area' };
    return map[tag] || (el.hasAttribute('onclick') ? 'clickable' : el.hasAttribute('tabindex') ? 'interactive' : tag);
  }

  function getZone(rect) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const h = cx < vw/3 ? 'left' : cx > vw*2/3 ? 'right' : 'center';
    const v = cy < vh/3 ? 'top' : cy > vh*2/3 ? 'bottom' : 'middle';
    return v + '-' + h;
  }

  function getPosition(el) {
    const rect = el.getBoundingClientRect();
    return { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height), zone: getZone(rect) };
  }

  function getInfo(el) {
    const tag = el.tagName.toLowerCase();
    const info = { isDisabled: el.disabled || el.getAttribute('aria-disabled') === 'true', isFocusable: el.tabIndex >= 0 };
    if (tag === 'a') {
      const href = el.getAttribute('href');
      info.href = href?.length > 50 ? href.slice(0, 50) + '...' : href;
      info.isExternal = href?.startsWith('http') && !href.includes(location.hostname);
    }
    if (tag === 'input') { info.inputType = el.type || 'text'; info.isRequired = el.required; info.hasValue = !!el.value; }
    if (tag === 'select') { info.optionCount = el.options?.length || 0; info.selectedIndex = el.selectedIndex; }
    return info;
  }

  function inspect(el) {
    if (!isVisible(el)) return null;
    return { id: 'wc-el-' + (++idCounter), type: getType(el), text: getText(el), position: getPosition(el), tag: el.tagName.toLowerCase(), ...getInfo(el) };
  }

  function scan() {
    idCounter = 0;
    const elements = [];
    document.querySelectorAll(SELECTORS.join(', ')).forEach(el => {
      if (el.closest('#webcopilot-widget-container')) return;
      const info = inspect(el);
      if (info) elements.push(info);
    });
    return elements.sort((a, b) => a.position.top !== b.position.top ? a.position.top - b.position.top : a.position.left - b.position.left);
  }

  function generateSummary(elements) {
    const summary = { totalElements: elements.length, byType: {}, byZone: {}, timestamp: new Date().toISOString(), pageUrl: location.href, pageTitle: document.title };
    elements.forEach(el => { summary.byType[el.type] = (summary.byType[el.type] || 0) + 1; summary.byZone[el.position.zone] = (summary.byZone[el.position.zone] || 0) + 1; });
    return summary;
  }

  return { scan, generateSummary };
})();

window.DOMInspector = DOMInspector;
