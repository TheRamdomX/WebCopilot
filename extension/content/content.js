/**
 * WebCopilot Content Script v2.1
 * Escaneo con estabilidad de DOM y detección de routing SPA
 */
(function() {
  'use strict';

  if (window.WebCopilotInitialized) return;
  window.WebCopilotInitialized = true;

  // ============ ESTADO ============

  let elementRegistry = new Map();
  let orderedElements = [];
  let currentSummary = {};
  let isScanning = false;
  let isInitialized = false;
  
  // Observers
  let stabilityObserver = null;
  let stabilityTimeout = null;
  let routeChangeDebounce = null;
  
  // Config
  const STABILITY_DELAY = 400; // ms sin mutaciones para considerar estable
  const ROUTE_DEBOUNCE = 200;  // ms debounce para cambios de ruta

  // ============ FINGERPRINT ============

  function generateFingerprint(el) {
    return [
      el.tag,
      el.type,
      el.text?.slice(0, 30) || '',
      el.href?.slice(0, 30) || '',
      el.inputType || '',
      Math.round(el.position.top / 50) * 50,
      Math.round(el.position.left / 50) * 50
    ].join('|');
  }

  // ============ REGISTRY ============

  function updateRegistry(newElements) {
    const newFPs = new Set();
    const added = [], updated = [], removed = [];

    newElements.forEach(el => {
      const fp = generateFingerprint(el);
      newFPs.add(fp);

      if (elementRegistry.has(fp)) {
        const existing = elementRegistry.get(fp);
        const upd = { ...el, id: existing.id, _fingerprint: fp, _firstSeen: existing._firstSeen, _lastSeen: Date.now() };
        if (JSON.stringify(existing.position) !== JSON.stringify(el.position) || existing.text !== el.text) {
          updated.push(upd);
        }
        elementRegistry.set(fp, upd);
      } else {
        const newEl = { ...el, _fingerprint: fp, _firstSeen: Date.now(), _lastSeen: Date.now() };
        elementRegistry.set(fp, newEl);
        added.push(newEl);
      }
    });

    for (const [fp, el] of elementRegistry.entries()) {
      if (!newFPs.has(fp)) {
        removed.push(el);
        elementRegistry.delete(fp);
      }
    }

    // Mantener orden estable
    const existingOrder = orderedElements
      .filter(el => elementRegistry.has(el._fingerprint))
      .map(el => elementRegistry.get(el._fingerprint));
    
    orderedElements = [...existingOrder, ...added].sort((a, b) => {
      const dy = Math.abs(a.position.top - b.position.top);
      return dy > 30 ? a.position.top - b.position.top : a.position.left - b.position.left;
    });

    return {
      elements: orderedElements,
      hasChanges: added.length > 0 || removed.length > 0 || updated.length > 0,
      stats: { added: added.length, updated: updated.length, removed: removed.length }
    };
  }

  // ============ SCAN ============

  function scanAndRender(force = false, reason = 'manual') {
    if (isScanning) return;
    isScanning = true;

    const scanned = DOMInspector.scan();
    const result = updateRegistry(scanned);
    currentSummary = DOMInspector.generateSummary(result.elements);

    if (result.hasChanges || force) {
      Widget.render(result.elements, currentSummary);
      
      // Log en desarrollo
      if (result.hasChanges) {
        console.log(`🔄 WebCopilot [${reason}]: +${result.stats.added} -${result.stats.removed} ~${result.stats.updated}`);
      }
    }
    
    isScanning = false;
  }

  // ============ ESTABILIDAD DEL DOM ============

  function waitForDOMStability() {
    return new Promise(resolve => {
      let mutationCount = 0;
      
      const checkStability = () => {
        clearTimeout(stabilityTimeout);
        stabilityTimeout = setTimeout(() => {
          // DOM estable
          if (stabilityObserver) {
            stabilityObserver.disconnect();
            stabilityObserver = null;
          }
          console.log(`✅ DOM estable tras ${mutationCount} mutaciones`);
          resolve();
        }, STABILITY_DELAY);
      };
      
      stabilityObserver = new MutationObserver(mutations => {
        // Ignorar mutaciones del widget
        const relevant = mutations.filter(m => {
          const target = m.target;
          if (!target || typeof target.closest !== 'function') return true;
          if (target.closest('#webcopilot-widget-container')) return false;
          if (target.closest('#wc-highlight-overlay')) return false;
          return true;
        });
        
        if (relevant.length > 0) {
          mutationCount += relevant.length;
          checkStability();
        }
      });
      
      stabilityObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
      });
      
      // Iniciar timer
      checkStability();
    });
  }

  // ============ DETECCIÓN DE ROUTING SPA ============

  function setupRouteChangeDetection() {
    let lastUrl = location.href;
    
    const handleRouteChange = (source) => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      
      clearTimeout(routeChangeDebounce);
      routeChangeDebounce = setTimeout(() => {
        console.log(`🔀 Cambio de ruta [${source}]: ${location.href}`);
        invalidateAndRescan();
      }, ROUTE_DEBOUNCE);
    };
    
    // Interceptar pushState y replaceState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      handleRouteChange('pushState');
    };
    
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      handleRouteChange('replaceState');
    };
    
    // Detectar popstate (back/forward)
    window.addEventListener('popstate', () => handleRouteChange('popstate'));
    
    // Fallback: verificar URL periódicamente (para frameworks raros)
    setInterval(() => {
      if (location.href !== lastUrl) {
        handleRouteChange('interval');
      }
    }, 1000);
  }

  function invalidateAndRescan() {
    // Limpiar cache
    elementRegistry.clear();
    orderedElements = [];
    
    // Esperar estabilidad y re-escanear
    waitForDOMStability().then(() => {
      scanAndRender(true, 'route-change');
    });
  }

  // ============ MUTATION OBSERVER CONTINUO ============

  let continuousObserver = null;
  let mutationDebounce = null;

  function setupContinuousObserver() {
    continuousObserver = new MutationObserver(mutations => {
      const relevant = mutations.filter(m => {
        const target = m.target;
        // Verificar que target sea un elemento con closest
        if (!target || typeof target.closest !== 'function') return true;
        if (target.closest('#webcopilot-widget-container')) return false;
        if (target.closest('#wc-highlight-overlay')) return false;
        return true;
      });
      
      if (relevant.length === 0) return;
      
      clearTimeout(mutationDebounce);
      mutationDebounce = setTimeout(() => {
        checkSelectedElementsValidity();
        if (relevant.length > 5) {
          scanAndRender(false, 'mutation');
        }
      }, 300);
    });
    
    continuousObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'disabled', 'aria-hidden', 'href']
    });
  }

  function checkSelectedElementsValidity() {
    const selected = Widget.getSelectedElements();
    let hasInvalid = false;
    
    selected.forEach(el => {
      if (!DOMInspector.isElementValid(el.id)) {
        hasInvalid = true;
      }
    });
    
    if (hasInvalid) {
      scanAndRender(true, 'validity-check');
    }
  }

  // ============ INICIALIZACIÓN ============

  async function init() {
    if (isInitialized) return;
    isInitialized = true;
    
    console.log('🚀 WebCopilot v2.1 inicializando...');
    
    // 1. Inicializar widget (sin datos aún)
    Widget.init();
    
    // 2. Esperar estabilidad del DOM
    await waitForDOMStability();
    
    // 3. Primer escaneo
    scanAndRender(true, 'init');
    DOMInspector.logStats();
    
    // 4. Configurar detección de routing
    setupRouteChangeDetection();
    
    // 5. Configurar observer continuo
    setupContinuousObserver();
    
    // 6. Auto-refresh si no minimizado
    if (!Widget.isMinimized()) {
      Widget.startAutoRefresh();
    }
    
    // 7. Exponer API
    window.WebCopilot = {
      // Scan
      refresh: (force) => scanAndRender(force, 'api'),
      rescan: invalidateAndRescan,
      
      // Data
      getElements: () => orderedElements,
      getRegistry: () => Object.fromEntries(elementRegistry),
      getSummary: () => currentSummary,
      getStats: DOMInspector.getStats,
      
      // Auto-refresh
      startAutoRefresh: Widget.startAutoRefresh,
      stopAutoRefresh: Widget.stopAutoRefresh,
      
      // Selection (MVP 2)
      toggleSelectionMode: Widget.toggleSelectionMode,
      isSelectionMode: Widget.isSelectionMode,
      getSelectedElements: Widget.getSelectedElements,
      clearSelection: Widget.clearSelection,
      
      // References
      getElementByReference: DOMInspector.getElementByReference,
      isElementValid: DOMInspector.isElementValid,
      getDOMElement: DOMInspector.getDOMElementById,
      
      // Actions
      click: Actions.click,
      type: Actions.type,
      focus: Actions.focus,
      scroll: Actions.scroll,
      hover: Actions.hover,
      select: Actions.select,
      check: Actions.check,
      pressKey: Actions.pressKey,
      sequence: Actions.sequence,
      
      // Debug
      logStats: DOMInspector.logStats,
      
      version: '3.0.0'
    };
    
    console.log('✅ WebCopilot listo');
  }

  // ============ ARRANQUE ============

  // NO usar DOMContentLoaded - esperar a que body exista y luego estabilidad
  function bootstrap() {
    if (document.body) {
      init();
    } else {
      // Body aún no existe, esperar
      const bodyObserver = new MutationObserver(() => {
        if (document.body) {
          bodyObserver.disconnect();
          init();
        }
      });
      bodyObserver.observe(document.documentElement, { childList: true });
    }
  }

  bootstrap();
})();
