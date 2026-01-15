/**
 * WebCopilot - Content Script Principal
 */
(function() {
  'use strict';

  if (window.WebCopilotInitialized) return;
  window.WebCopilotInitialized = true;

  let elementRegistry = new Map();
  let orderedElements = [];
  let currentSummary = {};
  let isScanning = false;

  function generateFingerprint(el) {
    return [el.tag, el.type, el.text || '', el.href || '', el.inputType || '', Math.round(el.position.top / 50) * 50, Math.round(el.position.left / 50) * 50].join('|');
  }

  function updateRegistry(newElements) {
    const newFPs = new Set();
    const added = [], updated = [], removed = [];

    newElements.forEach(function(el) {
      const fp = generateFingerprint(el);
      newFPs.add(fp);

      if (elementRegistry.has(fp)) {
        const existing = elementRegistry.get(fp);
        const upd = { ...el, id: existing.id, _fingerprint: fp, _firstSeen: existing._firstSeen, _lastSeen: Date.now() };
        if (JSON.stringify(existing.position) !== JSON.stringify(el.position) || existing.text !== el.text) updated.push(upd);
        elementRegistry.set(fp, upd);
      } else {
        const newEl = { ...el, _fingerprint: fp, _firstSeen: Date.now(), _lastSeen: Date.now() };
        elementRegistry.set(fp, newEl);
        added.push(newEl);
      }
    });

    for (const [fp, el] of elementRegistry.entries()) {
      if (!newFPs.has(fp)) { removed.push(el); elementRegistry.delete(fp); }
    }

    const existingOrder = orderedElements.filter(function(el) { return elementRegistry.has(el._fingerprint); }).map(function(el) { return elementRegistry.get(el._fingerprint); });
    orderedElements = [...existingOrder, ...added].sort(function(a, b) { return Math.abs(a.position.top - b.position.top) > 30 ? a.position.top - b.position.top : a.position.left - b.position.left; });

    return { elements: orderedElements, hasChanges: added.length > 0 || removed.length > 0 || updated.length > 0 };
  }

  function scanAndRender(force) {
    if (isScanning) return;
    isScanning = true;

    const scanned = DOMInspector.scan();
    const result = updateRegistry(scanned);
    currentSummary = DOMInspector.generateSummary(result.elements);

    if (result.hasChanges || force) Widget.render(result.elements, currentSummary);
    isScanning = false;
  }

  function init() {
    Widget.init();
    scanAndRender(true);
    if (!Widget.isMinimized()) Widget.startAutoRefresh();

    window.WebCopilot = {
      refresh: function(force) { scanAndRender(force); },
      getElements: function() { return orderedElements; },
      getRegistry: function() { return Object.fromEntries(elementRegistry); },
      getSummary: function() { return currentSummary; },
      startAutoRefresh: Widget.startAutoRefresh,
      stopAutoRefresh: Widget.stopAutoRefresh,
      version: '1.0.1'
    };
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : setTimeout(init, 100);
})();
