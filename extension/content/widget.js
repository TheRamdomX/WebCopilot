/**
 * Widget - Widget flotante con Shadow DOM
 * MVP 2: Modo selección y referencias de elementos
 */
const Widget = (function() {
  'use strict';

  let container, shadowRoot, isMinimized = false, isDragging = false, dragOffset = { x: 0, y: 0 };
  let autoRefreshInterval = null, currentElementIds = new Set();
  let selectionMode = false, selectedElements = new Map();
  const AUTO_REFRESH_DELAY = 1000;

  const STYLES = `
    :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .wc-widget { position: fixed; top: 20px; right: 20px; width: 380px; max-height: 500px; background: #1e1e2e; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.4); z-index: 2147483647; overflow: hidden; font-size: 14px; color: #cdd6f4; border: 1px solid #313244; transition: all 0.3s ease; }
    .wc-widget.minimized { width: 200px; max-height: 44px; }
    .wc-header { background: #313244; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none; }
    .wc-title { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; color: #cba6f7; }
    .wc-title-icon { width: 18px; height: 18px; background: #cba6f7; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
    .wc-title-icon::before { content: '◉'; font-size: 12px; color: #1e1e2e; }
    .wc-controls { display: flex; gap: 8px; }
    .wc-btn { background: transparent; border: none; color: #6c7086; cursor: pointer; padding: 4px; border-radius: 4px; font-size: 16px; transition: all 0.2s; }
    .wc-btn:hover { background: #45475a; color: #cdd6f4; }
    .wc-content { max-height: 400px; overflow-y: auto; padding: 12px; }
    .wc-widget.minimized .wc-content { display: none; }
    .wc-summary { background: #313244; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
    .wc-summary-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6c7086; margin-bottom: 8px; }
    .wc-summary-stats { display: flex; flex-wrap: wrap; gap: 8px; }
    .wc-stat { background: #45475a; padding: 6px 10px; border-radius: 6px; font-size: 12px; }
    .wc-stat-value { font-weight: 600; color: #89b4fa; }
    .wc-elements-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6c7086; margin-bottom: 8px; padding: 0 4px; }
    .wc-element-list { display: flex; flex-direction: column; gap: 6px; }
    .wc-element { background: #313244; border-radius: 8px; padding: 10px 12px; border-left: 3px solid #89b4fa; transition: all 0.2s; }
    .wc-element:hover { background: #45475a; }
    .wc-element-new { animation: slideIn 0.3s ease; background: #3b4261; }
    .wc-element-removing { animation: slideOut 0.2s ease forwards; }
    .wc-element-updated { animation: pulse 0.5s ease; }
    @keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes slideOut { from { opacity: 1; max-height: 100px; } to { opacity: 0; max-height: 0; padding: 0; margin: 0; } }
    @keyframes pulse { 0%, 100% { background: #313244; } 50% { background: #3b4261; } }
    .wc-element.type-button { border-left-color: #f38ba8; }
    .wc-element.type-link { border-left-color: #89b4fa; }
    .wc-element.type-text-input, .wc-element.type-text-area { border-left-color: #a6e3a1; }
    .wc-element.type-dropdown { border-left-color: #f9e2af; }
    .wc-element.type-checkbox, .wc-element.type-radio { border-left-color: #cba6f7; }
    .wc-element-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .wc-element-type { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6c7086; background: #1e1e2e; padding: 2px 6px; border-radius: 4px; }
    .wc-element-id { font-size: 10px; color: #585b70; font-family: monospace; }
    .wc-element-text { font-size: 13px; color: #cdd6f4; word-break: break-word; }
    .wc-element-text.empty { font-style: italic; color: #585b70; }
    .wc-element-meta { display: flex; gap: 8px; margin-top: 6px; font-size: 10px; color: #6c7086; }
    .wc-element-zone { background: #1e1e2e; padding: 2px 6px; border-radius: 4px; }
    .wc-footer { background: #313244; padding: 8px 16px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #6c7086; }
    .wc-refresh-btn { background: #45475a; border: none; color: #cdd6f4; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 11px; transition: all 0.2s; }
    .wc-refresh-btn:hover { background: #585b70; }
    .wc-empty { text-align: center; padding: 30px; color: #6c7086; }
    .wc-empty-icon { font-size: 32px; margin-bottom: 10px; }
    .wc-content::-webkit-scrollbar { width: 6px; }
    .wc-content::-webkit-scrollbar-track { background: transparent; }
    .wc-content::-webkit-scrollbar-thumb { background: #45475a; border-radius: 3px; }
    
    /* MVP 2: Estilos de selección */
    .wc-selection-btn { background: #45475a; border: none; color: #cdd6f4; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 11px; transition: all 0.2s; margin-right: 8px; }
    .wc-selection-btn:hover { background: #585b70; }
    .wc-selection-btn.active { background: #cba6f7; color: #1e1e2e; }
    .wc-element.selected { border-left-color: #a6e3a1 !important; background: #2d4a3e; }
    .wc-element.selected:hover { background: #3a5c4d; }
    .wc-element-reference { font-size: 9px; color: #89b4fa; font-family: monospace; margin-top: 4px; word-break: break-all; background: #1e1e2e; padding: 4px 6px; border-radius: 4px; }
    .wc-selected-section { background: #2d4a3e; border-radius: 8px; padding: 12px; margin-bottom: 12px; border: 1px solid #a6e3a1; }
    .wc-selected-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #a6e3a1; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
    .wc-selected-count { background: #a6e3a1; color: #1e1e2e; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
    .wc-selected-list { display: flex; flex-direction: column; gap: 6px; }
    .wc-selected-item { background: #313244; border-radius: 6px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; }
    .wc-selected-info { flex: 1; }
    .wc-selected-type { font-size: 10px; text-transform: uppercase; color: #6c7086; }
    .wc-selected-text { font-size: 12px; color: #cdd6f4; margin-top: 2px; }
    .wc-selected-ref { font-size: 9px; color: #89b4fa; font-family: monospace; margin-top: 4px; }
    .wc-selected-status { font-size: 10px; padding: 2px 6px; border-radius: 4px; }
    .wc-selected-status.valid { background: #a6e3a1; color: #1e1e2e; }
    .wc-selected-status.invalid { background: #f38ba8; color: #1e1e2e; }
    .wc-remove-btn { background: #f38ba8; border: none; color: #1e1e2e; width: 20px; height: 20px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 8px; }
    .wc-remove-btn:hover { background: #eba0ac; }
    .wc-clear-btn { background: transparent; border: 1px solid #f38ba8; color: #f38ba8; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; }
    .wc-clear-btn:hover { background: #f38ba8; color: #1e1e2e; }
    .wc-mode-indicator { background: #cba6f7; color: #1e1e2e; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; animation: pulse 1s infinite; }
  `;

  function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

  function renderSummary(s) {
    const stats = Object.entries(s.byType).map(([t, c]) => '<span class="wc-stat"><span class="wc-stat-value">' + c + '</span> ' + t + '</span>').join('');
    return '<div class="wc-summary"><div class="wc-summary-title">Resumen</div><div class="wc-summary-stats"><span class="wc-stat"><span class="wc-stat-value">' + s.totalElements + '</span> elementos</span>' + stats + '</div></div>';
  }

  function renderElement(el) {
    const text = el.text || '(sin texto)';
    const isSelected = selectedElements.has(el.id);
    let meta = '<span class="wc-element-zone">' + el.position.zone + '</span>';
    if (el.href) meta += '<span>→ ' + escapeHtml(el.href) + '</span>';
    if (el.inputType && el.inputType !== 'text') meta += '<span>tipo: ' + el.inputType + '</span>';
    if (el.isDisabled) meta += '<span>deshabilitado</span>';
    const refHtml = el.reference ? '<div class="wc-element-reference">' + escapeHtml(el.reference) + '</div>' : '';
    return '<div class="wc-element type-' + el.type + (isSelected ? ' selected' : '') + '" data-element-id="' + el.id + '"><div class="wc-element-header"><span class="wc-element-type">' + el.type + '</span><span class="wc-element-id">' + el.id + '</span></div><div class="wc-element-text ' + (el.text ? '' : 'empty') + '">' + escapeHtml(text) + '</div><div class="wc-element-meta">' + meta + '</div>' + refHtml + '</div>';
  }

  // Renderizar sección de elementos seleccionados
  function renderSelectedSection() {
    if (selectedElements.size === 0) return '';
    
    let items = '';
    selectedElements.forEach((data, id) => {
      const isValid = DOMInspector.isElementValid(id);
      const statusClass = isValid ? 'valid' : 'invalid';
      const statusText = isValid ? '✓' : '✗';
      items += '<div class="wc-selected-item" data-selected-id="' + id + '">' +
        '<div class="wc-selected-info">' +
        '<div class="wc-selected-type">' + data.type + '</div>' +
        '<div class="wc-selected-text">' + escapeHtml(data.text || '(sin texto)') + '</div>' +
        '<div class="wc-selected-ref">' + escapeHtml(data.reference || '') + '</div>' +
        '</div>' +
        '<span class="wc-selected-status ' + statusClass + '">' + statusText + '</span>' +
        '<button class="wc-remove-btn" data-remove-id="' + id + '">×</button>' +
        '</div>';
    });
    
    return '<div class="wc-selected-section">' +
      '<div class="wc-selected-title">' +
      '<span>Elementos seleccionados</span>' +
      '<span class="wc-selected-count">' + selectedElements.size + '</span>' +
      '</div>' +
      '<div class="wc-selected-list">' + items + '</div>' +
      '</div>';
  }

  function render(elements, summary) {
    shadowRoot.querySelector('.wc-widget') ? renderIncremental(elements, summary) : renderFull(elements, summary);
  }

  function renderFull(elements, summary) {
    const html = elements.length ? elements.map(renderElement).join('') : '<div class="wc-empty"><div class="wc-empty-icon">🔍</div><div>No se encontraron elementos</div></div>';
    const modeIndicator = selectionMode ? '<span class="wc-mode-indicator">SELECCIÓN ACTIVA</span>' : '';
    const selectedSection = renderSelectedSection();
    const widget = '<div class="wc-widget ' + (isMinimized ? 'minimized' : '') + '"><div class="wc-header"><div class="wc-title"><div class="wc-title-icon"></div>WebCopilot</div><div class="wc-controls">' + modeIndicator + '<button class="wc-btn" id="wc-minimize" title="Minimizar">−</button></div></div><div class="wc-content">' + selectedSection + renderSummary(summary) + '<div class="wc-elements-title">Elementos detectados</div><div class="wc-element-list">' + html + '</div></div><div class="wc-footer"><span class="wc-status">' + summary.totalElements + ' elementos • ' + new Date().toLocaleTimeString() + '</span><button class="wc-selection-btn' + (selectionMode ? ' active' : '') + '" id="wc-selection">⎯⊙ Seleccionar</button><button class="wc-refresh-btn" id="wc-refresh">↻ Actualizar</button></div></div>';
    const t = document.createElement('template'); t.innerHTML = widget;
    shadowRoot.appendChild(t.content.cloneNode(true));
    currentElementIds = new Set(elements.map(function(e) { return e.id; }));
    attachEvents();
    attachElementEvents();
  }

  function renderIncremental(elements, summary) {
    const widget = shadowRoot.querySelector('.wc-widget');
    const sumEl = widget.querySelector('.wc-summary');
    const tmp = document.createElement('div'); tmp.innerHTML = renderSummary(summary);
    sumEl.innerHTML = tmp.querySelector('.wc-summary').innerHTML;

    // Actualizar sección de seleccionados
    updateSelectedSection();

    const list = widget.querySelector('.wc-element-list');
    const newIds = new Set(elements.map(function(e) { return e.id; }));

    currentElementIds.forEach(function(id) {
      if (!newIds.has(id)) {
        const el = list.querySelector('[data-element-id="' + id + '"]');
        if (el) {
          el.classList.add('wc-element-removing');
          setTimeout(function() { el.remove(); }, 200);
        }
      }
    });

    elements.forEach(function(el, i) {
      const existing = list.querySelector('[data-element-id="' + el.id + '"]');
      if (existing) {
        const textEl = existing.querySelector('.wc-element-text');
        const newText = el.text || '(sin texto)';
        if (textEl.textContent !== newText) {
          textEl.textContent = newText;
          textEl.classList.toggle('empty', !el.text);
          existing.classList.add('wc-element-updated');
          setTimeout(function() { existing.classList.remove('wc-element-updated'); }, 500);
        }
        // Actualizar estado de selección
        existing.classList.toggle('selected', selectedElements.has(el.id));
      } else {
        const t = document.createElement('template'); t.innerHTML = renderElement(el);
        const newEl = t.content.firstElementChild;
        newEl.classList.add('wc-element-new');
        const next = list.children[i];
        next ? list.insertBefore(newEl, next) : list.appendChild(newEl);
        setTimeout(function() { newEl.classList.remove('wc-element-new'); }, 300);
        attachSingleElementEvents(newEl);
      }
    });

    if (!elements.length && !list.querySelector('.wc-empty')) {
      list.innerHTML = '<div class="wc-empty"><div class="wc-empty-icon">🔍</div><div>No se encontraron elementos</div></div>';
    } else if (elements.length) {
      const empty = list.querySelector('.wc-empty');
      if (empty) empty.remove();
    }

    currentElementIds = newIds;
    widget.querySelector('.wc-status').textContent = summary.totalElements + ' elementos • ' + new Date().toLocaleTimeString();

    // Actualizar indicador de modo
    updateModeIndicator();
  }

  function attachEvents() {
    const widget = shadowRoot.querySelector('.wc-widget');
    const header = shadowRoot.querySelector('.wc-header');
    const minBtn = shadowRoot.querySelector('#wc-minimize');
    const refBtn = shadowRoot.querySelector('#wc-refresh');
    const selBtn = shadowRoot.querySelector('#wc-selection');

    minBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      isMinimized = !isMinimized;
      widget.classList.toggle('minimized', isMinimized);
      minBtn.textContent = isMinimized ? '□' : '−';
      if (isMinimized) {
        stopAutoRefresh();
        if (selectionMode) toggleSelectionMode();
      } else {
        startAutoRefresh();
      }
    });

    // Botón de selección
    selBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleSelectionMode();
      selBtn.classList.toggle('active', selectionMode);
    });

    refBtn.addEventListener('click', function(e) { e.stopPropagation(); window.WebCopilot.refresh(true); });
    header.addEventListener('mousedown', startDrag);
  }

  function startDrag(e) {
    if (e.target.closest('.wc-btn')) return;
    isDragging = true;
    const rect = shadowRoot.querySelector('.wc-widget').getBoundingClientRect();
    dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
  }

  function drag(e) {
    if (!isDragging) return;
    const widget = shadowRoot.querySelector('.wc-widget');
    const x = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - widget.offsetWidth));
    const y = Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - widget.offsetHeight));
    widget.style.left = x + 'px'; widget.style.top = y + 'px'; widget.style.right = 'auto';
  }

  function stopDrag() {
    isDragging = false;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
  }

  function startAutoRefresh() {
    if (autoRefreshInterval) return;
    autoRefreshInterval = setInterval(function() { if (!isMinimized) window.WebCopilot.refresh(); }, AUTO_REFRESH_DELAY);
  }

  function stopAutoRefresh() {
    if (!autoRefreshInterval) return;
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }

  function init() {
    container = document.createElement('div');
    container.id = 'webcopilot-widget-container';
    container.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';
    shadowRoot = container.attachShadow({ mode: 'closed' });
    const style = document.createElement('style'); style.textContent = STYLES;
    shadowRoot.appendChild(style);
    document.body.appendChild(container);
  }

  function destroy() { stopAutoRefresh(); disableSelectionMode(); container.remove(); container = shadowRoot = null; }

  // Toggle modo selección
  function toggleSelectionMode() {
    selectionMode = !selectionMode;
    if (selectionMode) {
      enableSelectionMode();
    } else {
      disableSelectionMode();
    }
    updateModeIndicator();
  }

  // Habilitar modo selección
  function enableSelectionMode() {
    document.body.style.cursor = 'crosshair';
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleSelectionClick, true);
  }

  // Deshabilitar modo selección
  function disableSelectionMode() {
    document.body.style.cursor = '';
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handleSelectionClick, true);
    DOMInspector.clearHighlight();
  }

  // Mouse over en modo selección
  function handleMouseOver(e) {
    if (!selectionMode) return;
    if (e.target.closest('#webcopilot-widget-container')) return;
    
    const interactiveEl = findInteractiveParent(e.target);
    if (interactiveEl) {
      DOMInspector.highlightElement(interactiveEl);
    }
  }

  // Mouse out en modo selección
  function handleMouseOut(e) {
    if (!selectionMode) return;
    if (!e.relatedTarget || e.relatedTarget.closest('#webcopilot-widget-container')) {
      DOMInspector.clearHighlight();
    }
  }

  // Click en modo selección
  function handleSelectionClick(e) {
    if (!selectionMode) return;
    if (e.target.closest('#webcopilot-widget-container')) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const interactiveEl = findInteractiveParent(e.target);
    if (interactiveEl) {
      selectElement(interactiveEl);
      DOMInspector.highlightSelected(interactiveEl);
      setTimeout(() => DOMInspector.clearHighlight(), 500);
    }
  }

  // Encontrar elemento interactivo padre
  function findInteractiveParent(el) {
    const selectors = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [onclick], [tabindex]:not([tabindex="-1"])';
    return el.closest(selectors);
  }

  // Seleccionar elemento
  function selectElement(domElement) {
    const elementMap = DOMInspector.getElementMap();
    const info = elementMap.get(domElement);
    
    if (!info) {
      // Elemento no registrado, escaneamos primero
      window.WebCopilot.refresh(true);
      const newInfo = elementMap.get(domElement);
      if (newInfo) {
        addToSelected(newInfo);
      }
      return;
    }
    
    addToSelected(info);
  }

  // Agregar a seleccionados
  function addToSelected(info) {
    if (selectedElements.has(info.id)) {
      // Ya está seleccionado, lo deseleccionamos
      selectedElements.delete(info.id);
    } else {
      selectedElements.set(info.id, {
        id: info.id,
        type: info.type,
        text: info.text,
        reference: info.reference,
        timestamp: Date.now()
      });
    }
    updateSelectedSection();
    updateElementSelection(info.id);
  }

  // Actualizar sección de seleccionados
  function updateSelectedSection() {
    const content = shadowRoot.querySelector('.wc-content');
    let section = content.querySelector('.wc-selected-section');
    
    if (selectedElements.size === 0) {
      if (section) section.remove();
      return;
    }
    
    const newHtml = renderSelectedSection();
    const tmp = document.createElement('div');
    tmp.innerHTML = newHtml;
    const newSection = tmp.firstElementChild;
    
    if (section) {
      section.innerHTML = newSection.innerHTML;
    } else {
      content.insertBefore(newSection, content.firstChild);
    }
    
    attachSelectedEvents();
  }

  // Actualizar indicador de modo
  function updateModeIndicator() {
    const controls = shadowRoot.querySelector('.wc-controls');
    let indicator = controls.querySelector('.wc-mode-indicator');
    
    if (selectionMode && !indicator) {
      const span = document.createElement('span');
      span.className = 'wc-mode-indicator';
      span.textContent = 'SELECCIÓN ACTIVA';
      controls.insertBefore(span, controls.firstChild);
    } else if (!selectionMode && indicator) {
      indicator.remove();
    }
  }

  // Actualizar clase de selección en elemento
  function updateElementSelection(elementId) {
    const el = shadowRoot.querySelector('[data-element-id="' + elementId + '"]');
    if (el) {
      el.classList.toggle('selected', selectedElements.has(elementId));
    }
  }

  // Eventos de elementos en la lista
  function attachElementEvents() {
    shadowRoot.querySelectorAll('.wc-element').forEach(attachSingleElementEvents);
  }

  function attachSingleElementEvents(el) {
    el.addEventListener('mouseenter', function() {
      const id = el.dataset.elementId;
      const domEl = DOMInspector.getDOMElementById(id);
      if (domEl) DOMInspector.highlightElement(domEl);
    });
    
    el.addEventListener('mouseleave', function() {
      DOMInspector.clearHighlight();
    });
    
    el.addEventListener('click', function() {
      const id = el.dataset.elementId;
      const domEl = DOMInspector.getDOMElementById(id);
      if (domEl) {
        domEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        DOMInspector.highlightSelected(domEl);
        setTimeout(() => DOMInspector.clearHighlight(), 1000);
      }
    });
  }

  // Eventos de sección seleccionados
  function attachSelectedEvents() {
    shadowRoot.querySelectorAll('.wc-remove-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const id = btn.dataset.removeId;
        selectedElements.delete(id);
        updateSelectedSection();
        updateElementSelection(id);
      });
    });
    
    shadowRoot.querySelectorAll('.wc-selected-item').forEach(item => {
      item.addEventListener('mouseenter', function() {
        const id = item.dataset.selectedId;
        const domEl = DOMInspector.getDOMElementById(id);
        if (domEl) DOMInspector.highlightElement(domEl);
      });
      
      item.addEventListener('mouseleave', function() {
        DOMInspector.clearHighlight();
      });
      
      item.addEventListener('click', function(e) {
        if (e.target.closest('.wc-remove-btn')) return;
        const id = item.dataset.selectedId;
        const domEl = DOMInspector.getDOMElementById(id);
        if (domEl) {
          domEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          DOMInspector.highlightSelected(domEl);
          setTimeout(() => DOMInspector.clearHighlight(), 1000);
        }
      });
    });
  }

  // Obtener elementos seleccionados
  function getSelectedElements() {
    return Array.from(selectedElements.values());
  }

  // Limpiar selección
  function clearSelection() {
    selectedElements.clear();
    updateSelectedSection();
    shadowRoot.querySelectorAll('.wc-element.selected').forEach(el => el.classList.remove('selected'));
  }

  return { 
    init: init, 
    render: render, 
    destroy: destroy, 
    startAutoRefresh: startAutoRefresh, 
    stopAutoRefresh: stopAutoRefresh, 
    isMinimized: function() { return isMinimized; },
    // MVP 2 exports
    toggleSelectionMode: toggleSelectionMode,
    isSelectionMode: function() { return selectionMode; },
    getSelectedElements: getSelectedElements,
    clearSelection: clearSelection
  };
})();

window.Widget = Widget;
