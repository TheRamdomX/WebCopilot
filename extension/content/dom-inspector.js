/**
 * DOM Inspector - Inspecciona el DOM y extrae elementos interactivos visibles
 * MVP 2: Incluye selección, resaltado y referencias estables
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
  let elementMap = new WeakMap();
  let referenceMap = new Map();
  let highlightOverlay = null;

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
    const info = { id: 'wc-el-' + (++idCounter), type: getType(el), text: getText(el), position: getPosition(el), tag: el.tagName.toLowerCase(), ...getInfo(el) };
    registerElement(el, info);
    return info;
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

  function generateStableReference(el, domElement) {
    const parts = [el.type];
    
    const ariaLabel = domElement.getAttribute('aria-label');
    if (ariaLabel) parts.push('aria:' + ariaLabel.slice(0, 30));
    
    const name = domElement.getAttribute('name');
    if (name) parts.push('name:' + name);
    
    const id = domElement.id;
    if (id && !id.includes('wc-')) parts.push('id:' + id);
    
    const text = el.text;
    if (text && text.length <= 30) parts.push('text:' + text);
    
    const placeholder = domElement.getAttribute('placeholder');
    if (placeholder) parts.push('ph:' + placeholder.slice(0, 20));
    
    // Posición relativa en hermanos del mismo tipo
    const parent = domElement.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === domElement.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(domElement);
        parts.push('nth:' + index);
      }
    }
    
    return 'ref-' + parts.join('|').replace(/[^a-zA-Z0-9|:\-]/g, '_').slice(0, 100);
  }

  // Crear overlay de resaltado
  function createHighlightOverlay() {
    if (highlightOverlay) return highlightOverlay;
    
    highlightOverlay = document.createElement('div');
    highlightOverlay.id = 'wc-highlight-overlay';
    highlightOverlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      border: 2px solid #cba6f7;
      background: rgba(203, 166, 247, 0.15);
      border-radius: 4px;
      z-index: 2147483646;
      transition: all 0.15s ease;
      display: none;
    `;
    document.body.appendChild(highlightOverlay);
    return highlightOverlay;
  }

  // Resaltar elemento en la página
  function highlightElement(domElement) {
    const overlay = createHighlightOverlay();
    
    if (!domElement) {
      overlay.style.display = 'none';
      return;
    }
    
    const rect = domElement.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.top = rect.top - 2 + 'px';
    overlay.style.left = rect.left - 2 + 'px';
    overlay.style.width = rect.width + 4 + 'px';
    overlay.style.height = rect.height + 4 + 'px';
  }

  // Resaltar con estilo de selección confirmada
  function highlightSelected(domElement) {
    const overlay = createHighlightOverlay();
    
    if (!domElement) {
      overlay.style.display = 'none';
      return;
    }
    
    const rect = domElement.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.top = rect.top - 2 + 'px';
    overlay.style.left = rect.left - 2 + 'px';
    overlay.style.width = rect.width + 4 + 'px';
    overlay.style.height = rect.height + 4 + 'px';
    overlay.style.borderColor = '#a6e3a1';
    overlay.style.background = 'rgba(166, 227, 161, 0.2)';
  }

  // Ocultar resaltado
  function clearHighlight() {
    if (highlightOverlay) {
      highlightOverlay.style.display = 'none';
      highlightOverlay.style.borderColor = '#cba6f7';
      highlightOverlay.style.background = 'rgba(203, 166, 247, 0.15)';
    }
  }

  // Obtener elemento DOM por ID interno
  function getDOMElementById(elementId) {
    for (const [dom, info] of elementMap) {
      if (info.id === elementId) return dom;
    }
    return null;
  }

  // Registrar elemento en mapas
  function registerElement(domElement, info) {
    const reference = generateStableReference(info, domElement);
    elementMap.set(domElement, { ...info, reference });
    referenceMap.set(info.id, { domElement, info: { ...info, reference } });
    return reference;
  }

  // Obtener info de elemento por referencia
  function getElementByReference(ref) {
    for (const [id, data] of referenceMap) {
      if (data.info.reference === ref) return data;
    }
    return null;
  }

  // Verificar si elemento sigue válido
  function isElementValid(elementId) {
    const data = referenceMap.get(elementId);
    if (!data) return false;
    return document.body.contains(data.domElement) && isVisible(data.domElement);
  }

  return { 
    scan, 
    generateSummary, 
    highlightElement, 
    highlightSelected,
    clearHighlight, 
    getDOMElementById, 
    registerElement,
    getElementByReference,
    isElementValid,
    generateStableReference,
    getElementMap: () => elementMap,
    getReferenceMap: () => referenceMap
  };
})();

window.DOMInspector = DOMInspector;
