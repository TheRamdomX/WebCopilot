/**
 * Widget - Widget flotante con Shadow DOM
 */
const Widget = (function() {
  'use strict';

  let container, shadowRoot, isMinimized = false, isDragging = false, dragOffset = { x: 0, y: 0 };
  let autoRefreshInterval = null, currentElementIds = new Set();
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
  `;

  function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

  function renderSummary(s) {
    const stats = Object.entries(s.byType).map(([t, c]) => '<span class="wc-stat"><span class="wc-stat-value">' + c + '</span> ' + t + '</span>').join('');
    return '<div class="wc-summary"><div class="wc-summary-title">Resumen</div><div class="wc-summary-stats"><span class="wc-stat"><span class="wc-stat-value">' + s.totalElements + '</span> elementos</span>' + stats + '</div></div>';
  }

  function renderElement(el) {
    const text = el.text || '(sin texto)';
    let meta = '<span class="wc-element-zone">' + el.position.zone + '</span>';
    if (el.href) meta += '<span>→ ' + escapeHtml(el.href) + '</span>';
    if (el.inputType && el.inputType !== 'text') meta += '<span>tipo: ' + el.inputType + '</span>';
    if (el.isDisabled) meta += '<span>deshabilitado</span>';
    return '<div class="wc-element type-' + el.type + '" data-element-id="' + el.id + '"><div class="wc-element-header"><span class="wc-element-type">' + el.type + '</span><span class="wc-element-id">' + el.id + '</span></div><div class="wc-element-text ' + (el.text ? '' : 'empty') + '">' + escapeHtml(text) + '</div><div class="wc-element-meta">' + meta + '</div></div>';
  }

  function render(elements, summary) {
    shadowRoot.querySelector('.wc-widget') ? renderIncremental(elements, summary) : renderFull(elements, summary);
  }

  function renderFull(elements, summary) {
    const html = elements.length ? elements.map(renderElement).join('') : '<div class="wc-empty"><div class="wc-empty-icon">🔍</div><div>No se encontraron elementos</div></div>';
    const widget = '<div class="wc-widget ' + (isMinimized ? 'minimized' : '') + '"><div class="wc-header"><div class="wc-title"><div class="wc-title-icon"></div>WebCopilot</div><div class="wc-controls"><button class="wc-btn" id="wc-minimize" title="Minimizar">−</button></div></div><div class="wc-content">' + renderSummary(summary) + '<div class="wc-elements-title">Elementos detectados</div><div class="wc-element-list">' + html + '</div></div><div class="wc-footer"><span class="wc-status">' + summary.totalElements + ' elementos • ' + new Date().toLocaleTimeString() + '</span><button class="wc-refresh-btn" id="wc-refresh">↻ Actualizar</button></div></div>';
    const t = document.createElement('template'); t.innerHTML = widget;
    shadowRoot.appendChild(t.content.cloneNode(true));
    currentElementIds = new Set(elements.map(function(e) { return e.id; }));
    attachEvents();
  }

  function renderIncremental(elements, summary) {
    const widget = shadowRoot.querySelector('.wc-widget');
    const sumEl = widget.querySelector('.wc-summary');
    const tmp = document.createElement('div'); tmp.innerHTML = renderSummary(summary);
    sumEl.innerHTML = tmp.querySelector('.wc-summary').innerHTML;

    const list = widget.querySelector('.wc-element-list');
    const newIds = new Set(elements.map(function(e) { return e.id; }));

    currentElementIds.forEach(function(id) {
      if (!newIds.has(id)) {
        const el = list.querySelector('[data-element-id="' + id + '"]');
        el.classList.add('wc-element-removing');
        setTimeout(function() { el.remove(); }, 200);
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
      } else {
        const t = document.createElement('template'); t.innerHTML = renderElement(el);
        const newEl = t.content.firstElementChild;
        newEl.classList.add('wc-element-new');
        const next = list.children[i];
        next ? list.insertBefore(newEl, next) : list.appendChild(newEl);
        setTimeout(function() { newEl.classList.remove('wc-element-new'); }, 300);
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
  }

  function attachEvents() {
    const widget = shadowRoot.querySelector('.wc-widget');
    const header = shadowRoot.querySelector('.wc-header');
    const minBtn = shadowRoot.querySelector('#wc-minimize');
    const refBtn = shadowRoot.querySelector('#wc-refresh');

    minBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      isMinimized = !isMinimized;
      widget.classList.toggle('minimized', isMinimized);
      minBtn.textContent = isMinimized ? '□' : '−';
      isMinimized ? stopAutoRefresh() : startAutoRefresh();
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

  function destroy() { stopAutoRefresh(); container.remove(); container = shadowRoot = null; }

  return { init: init, render: render, destroy: destroy, startAutoRefresh: startAutoRefresh, stopAutoRefresh: stopAutoRefresh, isMinimized: function() { return isMinimized; } };
})();

window.Widget = Widget;
