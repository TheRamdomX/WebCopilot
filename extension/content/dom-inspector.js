/**
 * DOM Inspector v2.1.1 - Escaneo robusto con Shadow DOM
 * Fix: WeakMap no iterable, closest en nodos no-elemento
 */
const DOMInspector = (function() {
  'use strict';

  const ElementType = {
    NAVIGATION: 'navigation',
    ACTION: 'action',
    INPUT: 'input',
    SELECT: 'select',
    INTERACTIVE: 'interactive'
  };

  let idCounter = 0;
  let elementMap = new WeakMap();      // DOM Element -> info
  let reverseMap = new Map();          // id -> { domElement, info }
  let highlightOverlay = null;
  let lastScanStats = { total: 0, byType: {}, byTag: {} };

  // ============ VISIBILIDAD EFECTIVA ============

  function isEffectivelyVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    
    if (el.offsetParent === null) {
      const style = getComputedStyle(el);
      if (style.position !== 'fixed' && style.position !== 'sticky') {
        return false;
      }
    }
    
    if (el.getClientRects().length === 0) return false;
    
    const style = getComputedStyle(el);
    if (style.pointerEvents === 'none') return false;
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) === 0) return false;
    
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
    if (rect.right < 0 || rect.left > window.innerWidth) return false;
    
    return true;
  }

  // ============ INTERACTIVIDAD ============

  function isInteractive(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    
    if (tag === 'a' && el.hasAttribute('href')) return true;
    if (tag === 'button') return true;
    if (tag === 'input' && el.type !== 'hidden') return true;
    if (tag === 'select') return true;
    if (tag === 'textarea') return true;
    if (el.tabIndex >= 0) return true;
    
    const role = el.getAttribute('role');
    if (role && ['button', 'link', 'checkbox', 'radio', 'textbox', 'combobox', 'listbox', 'menuitem', 'tab', 'switch', 'option'].includes(role)) {
      return true;
    }
    
    if (el.isContentEditable) return true;
    return false;
  }

  // ============ CLASIFICACIÓN ============

  function getSemanticType(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    
    if (tag === 'a' && el.hasAttribute('href')) return ElementType.NAVIGATION;
    if (role === 'link') return ElementType.NAVIGATION;
    
    if (tag === 'input' || tag === 'textarea') return ElementType.INPUT;
    if (role === 'textbox' || role === 'searchbox') return ElementType.INPUT;
    if (el.isContentEditable) return ElementType.INPUT;
    
    if (tag === 'select') return ElementType.SELECT;
    if (role === 'combobox' || role === 'listbox') return ElementType.SELECT;
    
    if (tag === 'button') return ElementType.ACTION;
    if (role && ['button', 'checkbox', 'radio', 'switch', 'tab', 'menuitem'].includes(role)) {
      return ElementType.ACTION;
    }
    
    return ElementType.INTERACTIVE;
  }

  // ============ TEXTO ACCESIBLE ============

  function getAccessibleText(el) {
    const innerText = el.innerText?.trim();
    if (innerText && innerText.length > 0 && innerText.length <= 200) {
      return innerText.length > 100 ? innerText.slice(0, 100) + '…' : innerText;
    }
    
    const ariaLabel = el.getAttribute('aria-label')?.trim();
    if (ariaLabel) return ariaLabel;
    
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl?.textContent?.trim()) return labelEl.textContent.trim();
    }
    
    const title = el.getAttribute('title')?.trim();
    if (title) return title;
    
    const img = el.querySelector('img[alt], svg[aria-label]');
    if (img) {
      const alt = img.getAttribute('alt') || img.getAttribute('aria-label');
      if (alt?.trim()) return alt.trim();
    }
    
    const placeholder = el.getAttribute('placeholder')?.trim();
    if (placeholder) return `[${placeholder}]`;
    
    if (el.value?.trim()) {
      const v = el.value.trim();
      return v.length > 50 ? v.slice(0, 50) + '…' : v;
    }
    
    if (el.querySelector('svg') || el.querySelector('i[class*="icon"]')) {
      return '[icon]';
    }
    
    return '';
  }

  // ============ TRAVERSAL SHADOW DOM ============

  function* walkDOM(root) {
    if (!root) return;
    
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
    let node = walker.currentNode;
    
    while (node) {
      yield node;
      if (node.shadowRoot) {
        yield* walkDOM(node.shadowRoot);
      }
      node = walker.nextNode();
    }
  }

  function collectInteractiveElements() {
    const elements = [];
    
    for (const el of walkDOM(document.body)) {
      // Verificar que sea elemento y tenga closest
      if (!el || typeof el.closest !== 'function') continue;
      if (el.closest('#webcopilot-widget-container')) continue;
      if (el.closest('#wc-highlight-overlay')) continue;
      
      if (isInteractive(el) && isEffectivelyVisible(el)) {
        elements.push(el);
      }
    }
    
    return elements;
  }

  // ============ INSPECCIÓN ============

  function getPosition(el) {
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const h = cx < vw/3 ? 'left' : cx > vw*2/3 ? 'right' : 'center';
    const v = cy < vh/3 ? 'top' : cy > vh*2/3 ? 'bottom' : 'middle';
    
    return {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      zone: `${v}-${h}`
    };
  }

  function getElementInfo(el) {
    const tag = el.tagName.toLowerCase();
    const info = {
      isDisabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
      isFocusable: el.tabIndex >= 0
    };
    
    if (tag === 'a') {
      const href = el.getAttribute('href') || '';
      info.href = href.length > 80 ? href.slice(0, 80) + '…' : href;
      info.isExternal = href.startsWith('http') && !href.includes(location.hostname);
    }
    
    if (tag === 'input') {
      info.inputType = el.type || 'text';
      info.isRequired = el.required;
      info.hasValue = !!el.value;
    }
    
    if (tag === 'select') {
      info.optionCount = el.options?.length || 0;
      info.selectedIndex = el.selectedIndex;
    }
    
    return info;
  }

  function inspect(el) {
    const type = getSemanticType(el);
    const text = getAccessibleText(el);
    const position = getPosition(el);
    const tag = el.tagName.toLowerCase();
    
    const info = {
      id: `wc-el-${++idCounter}`,
      type,
      text,
      position,
      tag,
      ...getElementInfo(el)
    };
    
    registerElement(el, info);
    return info;
  }

  // ============ SCAN ============

  function scan() {
    idCounter = 0;
    elementMap = new WeakMap();
    reverseMap.clear();
    
    const domElements = collectInteractiveElements();
    const elements = [];
    const stats = { total: 0, byType: {}, byTag: {} };
    
    for (const el of domElements) {
      const info = inspect(el);
      elements.push(info);
      stats.total++;
      stats.byType[info.type] = (stats.byType[info.type] || 0) + 1;
      stats.byTag[info.tag] = (stats.byTag[info.tag] || 0) + 1;
    }
    
    elements.sort((a, b) => {
      const dy = Math.abs(a.position.top - b.position.top);
      return dy > 30 ? a.position.top - b.position.top : a.position.left - b.position.left;
    });
    
    lastScanStats = stats;
    return elements;
  }

  function generateSummary(elements) {
    return {
      totalElements: elements.length,
      byType: { ...lastScanStats.byType },
      byTag: { ...lastScanStats.byTag },
      byZone: elements.reduce((acc, el) => {
        acc[el.position.zone] = (acc[el.position.zone] || 0) + 1;
        return acc;
      }, {}),
      timestamp: new Date().toISOString(),
      pageUrl: location.href,
      pageTitle: document.title
    };
  }

  // ============ REFERENCIAS ============

  function generateStableReference(info, domElement) {
    const parts = [info.type];
    
    const id = domElement.id;
    if (id && !id.startsWith('wc-') && id.length < 50) {
      parts.push(`id:${id}`);
    }
    
    const name = domElement.getAttribute('name');
    if (name) parts.push(`name:${name}`);
    
    const ariaLabel = domElement.getAttribute('aria-label');
    if (ariaLabel) parts.push(`aria:${ariaLabel.slice(0, 30)}`);
    
    if (info.text && info.text.length <= 40 && info.text !== '[icon]') {
      parts.push(`text:${info.text}`);
    }
    
    const placeholder = domElement.getAttribute('placeholder');
    if (placeholder) parts.push(`ph:${placeholder.slice(0, 20)}`);
    
    const parent = domElement.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === domElement.tagName);
      if (siblings.length > 1) {
        parts.push(`nth:${siblings.indexOf(domElement)}`);
      }
    }
    
    return 'ref-' + parts.join('|').replace(/[^a-zA-Z0-9|:\-_]/g, '_').slice(0, 120);
  }

  // ============ REGISTRO ============

  function registerElement(domElement, info) {
    const reference = generateStableReference(info, domElement);
    const data = { ...info, reference };
    elementMap.set(domElement, data);
    reverseMap.set(info.id, { domElement, info: data });
    return reference;
  }

  // ============ BÚSQUEDA ============

  function getDOMElementById(elementId) {
    const data = reverseMap.get(elementId);
    return data?.domElement || null;
  }

  function getInfoByDOMElement(domElement) {
    return elementMap.get(domElement) || null;
  }

  function getElementByReference(ref) {
    for (const [, data] of reverseMap) {
      if (data.info.reference === ref) return data;
    }
    return null;
  }

  function isElementValid(elementId) {
    const data = reverseMap.get(elementId);
    if (!data || !data.domElement) return false;
    return document.body.contains(data.domElement) && isEffectivelyVisible(data.domElement);
  }

  // ============ HIGHLIGHT ============

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
      transition: all 0.1s ease-out;
      display: none;
    `;
    document.body.appendChild(highlightOverlay);
    return highlightOverlay;
  }

  function highlightElement(domElement) {
    const overlay = createHighlightOverlay();
    if (!domElement) {
      overlay.style.display = 'none';
      return;
    }
    const rect = domElement.getBoundingClientRect();
    Object.assign(overlay.style, {
      display: 'block',
      top: `${rect.top - 2}px`,
      left: `${rect.left - 2}px`,
      width: `${rect.width + 4}px`,
      height: `${rect.height + 4}px`,
      borderColor: '#cba6f7',
      background: 'rgba(203, 166, 247, 0.15)'
    });
  }

  function highlightSelected(domElement) {
    const overlay = createHighlightOverlay();
    if (!domElement) {
      overlay.style.display = 'none';
      return;
    }
    const rect = domElement.getBoundingClientRect();
    Object.assign(overlay.style, {
      display: 'block',
      top: `${rect.top - 2}px`,
      left: `${rect.left - 2}px`,
      width: `${rect.width + 4}px`,
      height: `${rect.height + 4}px`,
      borderColor: '#a6e3a1',
      background: 'rgba(166, 227, 161, 0.2)'
    });
  }

  function clearHighlight() {
    if (highlightOverlay) highlightOverlay.style.display = 'none';
  }

  // ============ DEBUG ============

  function getStats() {
    return { ...lastScanStats };
  }

  function logStats() {
    console.group('🔍 WebCopilot Scan Stats');
    console.log(`Total: ${lastScanStats.total} elementos`);
    console.log('Por tipo:', lastScanStats.byType);
    console.log('Por tag:', lastScanStats.byTag);
    console.groupEnd();
  }

  // ============ API ============

  return {
    scan,
    generateSummary,
    highlightElement,
    highlightSelected,
    clearHighlight,
    getDOMElementById,
    getInfoByDOMElement,
    getElementByReference,
    isElementValid,
    registerElement,
    generateStableReference,
    getElementMap: () => elementMap,
    getReverseMap: () => reverseMap,
    getStats,
    logStats,
    ElementType
  };
})();

window.DOMInspector = DOMInspector;
