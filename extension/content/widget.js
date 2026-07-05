/**
 * Widget - Widget flotante con Shadow DOM
 * MVP 3: Ejecución de acciones sobre elementos
 */
const Widget = (function() {
  'use strict';

  let container, shadowRoot, isMinimized = false, isDragging = false, dragOffset = { x: 0, y: 0 };
  let autoRefreshInterval = null, currentElementIds = new Set();
  let selectionMode = false;
  let widgetMode = 'ia'; // 'ia' o 'manual'
  const AUTO_REFRESH_DELAY = 1000;
  const MODE_STORAGE_KEY = 'webcopilot_widget_mode';

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
    .wc-content { max-height: 400px; overflow-y: auto; overflow-x: hidden; padding: 12px; }
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
    .wc-element-reference { font-size: 9px; color: #89b4fa; font-family: monospace; margin-top: 4px; word-break: break-all; background: #1e1e2e; padding: 4px 6px; border-radius: 4px; }
    .wc-mode-indicator { background: #cba6f7; color: #1e1e2e; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; animation: pulse 1s infinite; }
    
    /* MVP 3: Acciones inline en elemento */
    .wc-element.expanded { background: #3b4261; }
    .wc-element-actions { display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid #45475a; }
    .wc-element.expanded .wc-element-actions { display: block; animation: fadeIn 0.2s ease; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .wc-action-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
    .wc-action-btn { background: #45475a; border: none; color: #cdd6f4; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 11px; display: flex; align-items: center; gap: 4px; transition: all 0.2s; }
    .wc-action-btn:hover { background: #585b70; }
    .wc-action-btn:active { transform: scale(0.95); }
    .wc-action-btn.primary { background: #cba6f7; color: #1e1e2e; }
    .wc-action-btn.primary:hover { background: #b490e0; }
    .wc-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .wc-action-input-group { display: none; margin-top: 8px; }
    .wc-action-input-group.visible { display: flex; gap: 6px; }
    .wc-action-input { flex: 1; background: #1e1e2e; border: 1px solid #45475a; border-radius: 6px; padding: 8px 10px; color: #cdd6f4; font-size: 12px; outline: none; }
    .wc-action-input:focus { border-color: #cba6f7; }
    .wc-action-input::placeholder { color: #6c7086; }
    .wc-action-input-submit { background: #a6e3a1; color: #1e1e2e; padding: 8px 12px; }
    .wc-action-input-submit:hover { background: #94d990; }
    .wc-action-result { margin-top: 8px; padding: 6px 8px; border-radius: 4px; font-size: 10px; display: none; }
    .wc-action-result.visible { display: block; }
    .wc-action-result.success { background: rgba(166, 227, 161, 0.2); border: 1px solid #a6e3a1; color: #a6e3a1; }
    .wc-action-result.error { background: rgba(243, 139, 168, 0.2); border: 1px solid #f38ba8; color: #f38ba8; }
    .wc-action-select-group { display: none; margin-top: 8px; }
    .wc-action-select-group.visible { display: flex; gap: 6px; }
    .wc-action-select-group select { flex: 1; background: #1e1e2e; border: 1px solid #45475a; border-radius: 6px; padding: 8px 10px; color: #cdd6f4; font-size: 12px; }
    
    /* MVP 4: Agente conversacional */
    .wc-agent-section { background: #313244; border-radius: 8px; padding: 12px; margin-bottom: 12px; border: 1px solid #45475a; }
    .wc-agent-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .wc-agent-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #f9e2af; display: flex; align-items: center; gap: 6px; }
    .wc-agent-title::before { content: '🤖'; }
    .wc-agent-status { font-size: 10px; padding: 2px 8px; border-radius: 10px; background: #45475a; color: #6c7086; }
    .wc-agent-status.thinking { background: #f9e2af; color: #1e1e2e; animation: pulse 1s infinite; }
    .wc-agent-status.success { background: #a6e3a1; color: #1e1e2e; }
    .wc-agent-status.error { background: #f38ba8; color: #1e1e2e; }
    .wc-agent-status.proposed { background: #89b4fa; color: #1e1e2e; }
    .wc-agent-input-row { display: flex; gap: 8px; }
    .wc-agent-input { flex: 1; background: #1e1e2e; border: 1px solid #45475a; border-radius: 8px; padding: 10px 12px; color: #cdd6f4; font-size: 13px; outline: none; resize: none; min-height: 40px; max-height: 80px; }
    .wc-agent-input:focus { border-color: #f9e2af; }
    .wc-agent-input::placeholder { color: #6c7086; }
    .wc-agent-input:disabled { opacity: 0.6; cursor: not-allowed; }
    .wc-agent-send { background: #f9e2af; border: none; color: #1e1e2e; padding: 10px 14px; border-radius: 8px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
    .wc-agent-send:hover { background: #f5d67a; }
    .wc-agent-send:disabled { opacity: 0.5; cursor: not-allowed; }
    .wc-agent-response { margin-top: 10px; padding: 10px; background: #1e1e2e; border-radius: 8px; font-size: 12px; line-height: 1.5; display: none; }
    .wc-agent-response.visible { display: block; animation: fadeIn 0.2s ease; }
    .wc-agent-response.thinking { color: #6c7086; font-style: italic; }
    .wc-agent-response.clarification { color: #f9e2af; border-left: 3px solid #f9e2af; padding-left: 10px; }
    .wc-agent-response.error { color: #f38ba8; border-left: 3px solid #f38ba8; padding-left: 10px; }
    .wc-agent-action { margin-top: 10px; padding: 10px; background: #3b4261; border-radius: 8px; border: 1px solid #89b4fa; display: none; }
    .wc-agent-action.visible { display: block; animation: fadeIn 0.2s ease; }
    .wc-agent-action-header { font-size: 10px; text-transform: uppercase; color: #89b4fa; margin-bottom: 6px; }
    .wc-agent-action-detail { font-size: 12px; color: #cdd6f4; margin-bottom: 8px; }
    .wc-agent-action-target { font-size: 11px; color: #a6e3a1; background: #1e1e2e; padding: 4px 8px; border-radius: 4px; display: inline-block; margin-bottom: 10px; }
    .wc-agent-action-buttons { display: flex; gap: 8px; }
    .wc-agent-confirm { background: #a6e3a1; border: none; color: #1e1e2e; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600; }
    .wc-agent-confirm:hover { background: #94d990; }
    .wc-agent-cancel { background: transparent; border: 1px solid #f38ba8; color: #f38ba8; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 11px; }
    .wc-agent-cancel:hover { background: #f38ba8; color: #1e1e2e; }
    .wc-agent-config { margin-top: 10px; padding: 10px; background: #1e1e2e; border-radius: 8px; display: none; }
    .wc-agent-config.visible { display: block; }
    .wc-agent-config-label { font-size: 10px; color: #6c7086; margin-bottom: 6px; }
    .wc-agent-config-input { width: 100%; background: #313244; border: 1px solid #45475a; border-radius: 6px; padding: 8px 10px; color: #cdd6f4; font-size: 12px; font-family: monospace; }
    .wc-agent-config-input:focus { border-color: #f9e2af; outline: none; }
    .wc-agent-config-btn { margin-top: 8px; background: #f9e2af; border: none; color: #1e1e2e; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 11px; width: 100%; }
    .wc-agent-toggle { background: transparent; border: none; color: #6c7086; cursor: pointer; font-size: 12px; padding: 2px 6px; }
    .wc-agent-toggle:hover { color: #cdd6f4; }
    
    /* Mode switcher */
    .wc-mode-switch { display: flex; background: #1e1e2e; border-radius: 6px; padding: 2px; margin-bottom: 12px; }
    .wc-mode-btn { flex: 1; background: transparent; border: none; color: #6c7086; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; }
    .wc-mode-btn:hover { color: #cdd6f4; }
    .wc-mode-btn.active { background: #45475a; color: #cdd6f4; }
    .wc-mode-btn.active.ia { background: #f9e2af; color: #1e1e2e; }
    .wc-mode-btn.active.manual { background: #89b4fa; color: #1e1e2e; }
    .wc-agent-section.hidden, .wc-manual-section.hidden { display: none; }
    .wc-manual-section { background: #313244; border-radius: 8px; padding: 12px; margin-bottom: 12px; border: 1px solid #45475a; }
    .wc-manual-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .wc-manual-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #89b4fa; display: flex; align-items: center; gap: 6px; }
    .wc-manual-title::before { content: '🎯'; }
    .wc-manual-hint { font-size: 12px; color: #6c7086; line-height: 1.5; }
    .wc-widget.mode-ia .wc-summary, .wc-widget.mode-ia .wc-elements-title, .wc-widget.mode-ia .wc-element-list, .wc-widget.mode-ia .wc-footer { display: none; }

    /* Voice mode */
    .wc-agent-mic { background: #45475a; border: none; color: #cdd6f4; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 16px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .wc-agent-mic:hover { background: #585b70; }
    .wc-agent-mic.active { background: #f38ba8; color: #1e1e2e; }
    .wc-agent-mic:disabled { opacity: 0.5; cursor: not-allowed; }
    .wc-voice-panel { display: none; }
    .wc-voice-panel.visible { display: block; animation: fadeIn 0.2s ease; }
    .wc-voice-indicator { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 6px 0; }
    .wc-voice-dot { width: 10px; height: 10px; border-radius: 50%; background: #a6e3a1; flex-shrink: 0; animation: voicePulse 1.5s infinite; }
    .wc-voice-dot.executing { background: #f9e2af; }
    .wc-voice-dot.error { background: #f38ba8; animation: none; }
    @keyframes voicePulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.3); } }
    .wc-voice-status-text { font-size: 11px; color: #6c7086; }
    .wc-voice-transcript { max-height: 150px; overflow-y: auto; margin-bottom: 8px; }
    .wc-voice-transcript::-webkit-scrollbar { width: 4px; }
    .wc-voice-transcript::-webkit-scrollbar-thumb { background: #45475a; border-radius: 2px; }
    .wc-voice-msg { padding: 6px 10px; border-radius: 6px; margin-bottom: 4px; font-size: 12px; line-height: 1.4; word-break: break-word; }
    .wc-voice-msg.user { background: #45475a; color: #cdd6f4; }
    .wc-voice-msg.agent { background: #1e1e2e; color: #a6e3a1; border-left: 2px solid #a6e3a1; }
    .wc-voice-msg.tool { background: #1e1e2e; color: #f9e2af; border-left: 2px solid #f9e2af; font-size: 10px; font-family: monospace; }
    .wc-voice-stop { background: #f38ba8; border: none; color: #1e1e2e; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 11px; font-weight: 600; width: 100%; transition: all 0.2s; }
    .wc-voice-stop:hover { background: #e67a98; }
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
    const refHtml = el.reference ? '<div class="wc-element-reference">' + escapeHtml(el.reference) + '</div>' : '';
    
    // Sección de acciones (oculta por defecto)
    const actionsHtml = '<div class="wc-element-actions">' +
      '<div class="wc-action-buttons"></div>' +
      '<div class="wc-action-input-group"><input type="text" class="wc-action-input" placeholder="Escribe el texto..."><button class="wc-action-btn wc-action-input-submit">⌨️</button></div>' +
      '<div class="wc-action-select-group"><select class="wc-action-select"></select><button class="wc-action-btn wc-action-input-submit wc-select-submit">✓</button></div>' +
      '<div class="wc-action-result"></div>' +
      '</div>';
    
    return '<div class="wc-element type-' + el.type + '" data-element-id="' + el.id + '"><div class="wc-element-header"><span class="wc-element-type">' + el.type + '</span><span class="wc-element-id">' + el.id + '</span></div><div class="wc-element-text ' + (el.text ? '' : 'empty') + '">' + escapeHtml(text) + '</div><div class="wc-element-meta">' + meta + '</div>' + refHtml + actionsHtml + '</div>';
  }

  // MVP 4: Renderizar sección del agente
  function renderAgentSection() {
    return `<div class="wc-agent-section${widgetMode !== 'ia' ? ' hidden' : ''}">
      <div class="wc-agent-header">
        <span class="wc-agent-title">Agente IA</span>
        <span class="wc-agent-status" id="wc-agent-status">Listo</span>
        <button class="wc-agent-toggle" id="wc-agent-config-toggle" title="Configurar API">⚙️</button>
      </div>
      <div class="wc-agent-config" id="wc-agent-config">
        <div class="wc-agent-config-label">API Key de Gemini</div>
        <input type="password" class="wc-agent-config-input" id="wc-agent-apikey" placeholder="AIza...">
        <button class="wc-agent-config-btn" id="wc-agent-save-key">Guardar</button>
      </div>
      <div class="wc-agent-input-row" id="wc-agent-input-row">
        <textarea class="wc-agent-input" id="wc-agent-input" placeholder="Escribe una instrucción..." rows="1"></textarea>
        <button class="wc-agent-send" id="wc-agent-send">➤</button>
        <button class="wc-agent-mic" id="wc-agent-mic" title="Modo voz">🎤</button>
      </div>
      <div class="wc-voice-panel" id="wc-voice-panel">
        <div class="wc-voice-indicator">
          <div class="wc-voice-dot" id="wc-voice-dot"></div>
          <span class="wc-voice-status-text" id="wc-voice-status-text">Conectando...</span>
        </div>
        <div class="wc-voice-transcript" id="wc-voice-transcript"></div>
        <button class="wc-voice-stop" id="wc-voice-stop">⏹ Detener voz</button>
      </div>
      <div class="wc-agent-response" id="wc-agent-response"></div>
      <div class="wc-agent-action" id="wc-agent-action">
        <div class="wc-agent-action-header">Acción propuesta</div>
        <div class="wc-agent-action-detail" id="wc-agent-action-detail"></div>
        <div class="wc-agent-action-target" id="wc-agent-action-target"></div>
        <div class="wc-agent-action-buttons">
          <button class="wc-agent-confirm" id="wc-agent-confirm">✓ Ejecutar</button>
          <button class="wc-agent-cancel" id="wc-agent-cancel">✗ Cancelar</button>
        </div>
      </div>
    </div>`;
  }

  // Renderizar sección manual
  function renderManualSection() {
    return `<div class="wc-manual-section${widgetMode !== 'manual' ? ' hidden' : ''}">
      <div class="wc-manual-header">
        <span class="wc-manual-title">Modo Manual</span>
      </div>
      <div class="wc-manual-hint">
        Haz click en los elementos de la lista para ver las acciones disponibles, o usa el botón <strong>Seleccionar</strong> para elegir elementos directamente en la página.
      </div>
    </div>`;
  }

  // Renderizar switch de modo
  function renderModeSwitch() {
    return `<div class="wc-mode-switch">
      <button class="wc-mode-btn ia${widgetMode === 'ia' ? ' active' : ''}" data-mode="ia">🤖 Modo IA</button>
      <button class="wc-mode-btn manual${widgetMode === 'manual' ? ' active' : ''}" data-mode="manual">🎯 Modo Manual</button>
    </div>`;
  }

  function render(elements, summary) {
    shadowRoot.querySelector('.wc-widget') ? renderIncremental(elements, summary) : renderFull(elements, summary);
  }

  function renderFull(elements, summary) {
    // Cargar modo guardado
    loadWidgetMode();
    
    const html = elements.length ? elements.map(renderElement).join('') : '<div class="wc-empty"><div class="wc-empty-icon">🔍</div><div>No se encontraron elementos</div></div>';
    const modeIndicator = selectionMode ? '<span class="wc-mode-indicator">SELECCIÓN ACTIVA</span>' : '';
    const modeSwitch = renderModeSwitch();
    const agentSection = renderAgentSection();
    const manualSection = renderManualSection();
    const modeClass = 'mode-' + widgetMode;
    const widget = '<div class="wc-widget ' + modeClass + ' ' + (isMinimized ? 'minimized' : '') + '"><div class="wc-header"><div class="wc-title"><div class="wc-title-icon"></div>WebCopilot</div><div class="wc-controls">' + modeIndicator + '<button class="wc-btn" id="wc-minimize" title="Minimizar">−</button></div></div><div class="wc-content">' + modeSwitch + agentSection + manualSection + renderSummary(summary) + '<div class="wc-elements-title">Elementos detectados</div><div class="wc-element-list">' + html + '</div></div><div class="wc-footer"><span class="wc-status">' + summary.totalElements + ' elementos • ' + new Date().toLocaleTimeString() + '</span><button class="wc-selection-btn' + (selectionMode ? ' active' : '') + '" id="wc-selection">⎯⊙ Seleccionar</button><button class="wc-refresh-btn" id="wc-refresh">↻ Actualizar</button></div></div>';
    const t = document.createElement('template'); t.innerHTML = widget;
    shadowRoot.appendChild(t.content.cloneNode(true));
    currentElementIds = new Set(elements.map(function(e) { return e.id; }));
    attachEvents();
    attachElementEvents();
    attachAgentEvents();
    attachVoiceEvents();
    attachModeEvents();
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

  // ============ HELPERS SHADOW DOM ============

  // Obtener el target real del evento (atraviesa Shadow DOM)
  function getRealTarget(e) {
    // composedPath() devuelve el camino completo incluyendo Shadow DOM
    const path = e.composedPath?.();
    if (path && path.length > 0) {
      // El primer elemento es el target más profundo
      return path[0];
    }
    return e.target;
  }

  // Verificar si un elemento está dentro del widget
  function isInsideWidget(el) {
    if (!el) return false;
    // Verificar por ID directamente
    if (el.id === 'webcopilot-widget-container') return true;
    // Verificar ancestros (incluyendo salir de Shadow DOM)
    let current = el;
    while (current) {
      if (current.id === 'webcopilot-widget-container') return true;
      if (current.id === 'wc-highlight-overlay') return true;
      current = current.parentElement || current.parentNode?.host;
    }
    return false;
  }

  // ============ MODO SELECCIÓN ============

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
    
    // Obtener el target real (considerando composedPath para Shadow DOM)
    const realTarget = getRealTarget(e);
    if (!realTarget) return;
    if (isInsideWidget(realTarget)) return;
    
    const interactiveEl = findInteractiveParent(realTarget);
    if (interactiveEl) {
      DOMInspector.highlightElement(interactiveEl);
    }
  }

  // Mouse out en modo selección
  function handleMouseOut(e) {
    if (!selectionMode) return;
    const relatedTarget = e.relatedTarget;
    if (!relatedTarget || isInsideWidget(relatedTarget)) {
      DOMInspector.clearHighlight();
    }
  }

  // Click en modo selección
  function handleSelectionClick(e) {
    if (!selectionMode) return;
    
    // Obtener el target real (considerando composedPath para Shadow DOM)
    const realTarget = getRealTarget(e);
    if (!realTarget) return;
    if (isInsideWidget(realTarget)) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const interactiveEl = findInteractiveParent(realTarget);
    if (interactiveEl) {
      selectElement(interactiveEl);
      DOMInspector.highlightSelected(interactiveEl);
      setTimeout(() => DOMInspector.clearHighlight(), 500);
    }
  }

  // Encontrar elemento interactivo (el mismo o ancestro)
  function findInteractiveParent(el) {
    // Verificar el propio elemento y ancestros
    let current = el;
    while (current && current !== document.body) {
      if (isSelectableElement(current)) {
        return current;
      }
      // Navegar hacia arriba, incluso fuera del Shadow DOM
      current = current.parentElement || current.parentNode?.host;
    }
    return null;
  }

  // Verificar si un elemento es seleccionable (misma lógica que dom-inspector)
  function isSelectableElement(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    
    // Elementos nativos interactivos
    if (tag === 'a' && el.hasAttribute('href')) return true;
    if (tag === 'button') return true;
    if (tag === 'input' && el.type !== 'hidden') return true;
    if (tag === 'select') return true;
    if (tag === 'textarea') return true;
    
    // Focusable por tabIndex
    if (el.tabIndex >= 0) return true;
    
    // Roles ARIA interactivos
    const role = el.getAttribute('role');
    if (role && ['button', 'link', 'checkbox', 'radio', 'textbox', 'combobox', 
                 'listbox', 'menuitem', 'tab', 'switch', 'option', 'searchbox'].includes(role)) {
      return true;
    }
    
    // ContentEditable
    if (el.isContentEditable) return true;
    
    return false;
  }

  // Seleccionar elemento - expande acciones en el widget
  function selectElement(domElement) {
    const info = DOMInspector.getInfoByDOMElement(domElement);
    
    if (!info) {
      // Elemento no registrado, escaneamos primero
      window.WebCopilot.refresh(true);
      const newInfo = DOMInspector.getInfoByDOMElement(domElement);
      if (newInfo) {
        expandElementInWidget(newInfo.id);
      } else {
        // No se encontró, desactivar modo de todos modos
        disableSelectionMode();
      }
      return;
    }
    
    expandElementInWidget(info.id);
  }

  // Desactivar modo selección
  function disableSelectionMode() {
    if (!selectionMode) return;
    selectionMode = false;
    document.removeEventListener('click', handleSelectionClick, true);
    DOMInspector.clearHighlight();
    updateModeIndicator();
    
    const btn = shadowRoot.querySelector('#wc-selection');
    if (btn) btn.classList.remove('active');
  }

  // Expandir elemento en el widget y hacer scroll
  function expandElementInWidget(elementId) {
    const elementDiv = shadowRoot.querySelector('[data-element-id="' + elementId + '"]');
    if (!elementDiv) return;
    
    // Hacer scroll en el widget para mostrar el elemento
    const content = shadowRoot.querySelector('.wc-content');
    elementDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Desactivar modo selección después del scroll
    disableSelectionMode();
    
    // Expandir las acciones del elemento
    toggleElementActions(elementId, elementDiv);
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

  // Eventos de elementos en la lista
  function attachElementEvents() {
    shadowRoot.querySelectorAll('.wc-element').forEach(attachSingleElementEvents);
  }

  let currentExpandedElement = null; // Elemento expandido actualmente

  function attachSingleElementEvents(el) {
    el.addEventListener('mouseenter', function() {
      const id = el.dataset.elementId;
      const domEl = DOMInspector.getDOMElementById(id);
      if (domEl) DOMInspector.highlightElement(domEl);
    });
    
    el.addEventListener('mouseleave', function() {
      if (!el.classList.contains('expanded')) {
        DOMInspector.clearHighlight();
      }
    });
    
    el.addEventListener('click', function(e) {
      // Ignorar clicks en botones de acción
      if (e.target.closest('.wc-action-btn') || e.target.closest('.wc-action-input') || e.target.closest('.wc-action-select')) {
        return;
      }
      
      const id = el.dataset.elementId;
      toggleElementActions(id, el);
    });
  }

  // ============ MVP 3: ACCIONES INLINE ============

  function toggleElementActions(elementId, elementDiv) {
    // Si ya está expandido, colapsar
    if (elementDiv.classList.contains('expanded')) {
      collapseElement(elementDiv);
      return;
    }
    
    // Colapsar elemento anteriormente expandido
    if (currentExpandedElement && currentExpandedElement !== elementDiv) {
      collapseElement(currentExpandedElement);
    }
    
    // Expandir este elemento
    expandElement(elementId, elementDiv);
  }

  function expandElement(elementId, elementDiv) {
    const info = DOMInspector.getInfoByDOMElement(DOMInspector.getDOMElementById(elementId));
    if (!info) return;
    
    const domEl = DOMInspector.getDOMElementById(elementId);
    const actions = getAvailableActions(info, domEl);
    
    // Poblar botones de acción
    const buttonsContainer = elementDiv.querySelector('.wc-action-buttons');
    buttonsContainer.innerHTML = actions.map(a => 
      `<button class="wc-action-btn ${a.primary ? 'primary' : ''}" data-action="${a.action}" ${a.disabled ? 'disabled' : ''}>${a.icon} ${a.label}</button>`
    ).join('');
    
    // Poblar select si es dropdown
    if (info.tag === 'select' && domEl) {
      const selectEl = elementDiv.querySelector('.wc-action-select');
      selectEl.innerHTML = '';
      Array.from(domEl.options).forEach((opt, i) => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.textContent || `Opción ${i + 1}`;
        if (domEl.selectedIndex === i) option.selected = true;
        selectEl.appendChild(option);
      });
    }
    
    // Limpiar estado anterior
    elementDiv.querySelector('.wc-action-input-group').classList.remove('visible');
    elementDiv.querySelector('.wc-action-select-group').classList.remove('visible');
    elementDiv.querySelector('.wc-action-result').className = 'wc-action-result';
    elementDiv.querySelector('.wc-action-input').value = '';
    
    // Expandir
    elementDiv.classList.add('expanded');
    currentExpandedElement = elementDiv;
    
    // Highlight permanente
    if (domEl) {
      DOMInspector.highlightSelected(domEl);
    }
    
    // Agregar eventos a los botones
    attachInlineActionEvents(elementDiv, elementId, info);
  }

  function collapseElement(elementDiv) {
    elementDiv.classList.remove('expanded');
    elementDiv.querySelector('.wc-action-input-group').classList.remove('visible');
    elementDiv.querySelector('.wc-action-select-group').classList.remove('visible');
    if (currentExpandedElement === elementDiv) {
      currentExpandedElement = null;
    }
    DOMInspector.clearHighlight();
  }

  function attachInlineActionEvents(elementDiv, elementId, info) {
    // Botones de acción
    elementDiv.querySelectorAll('.wc-action-btn[data-action]').forEach(btn => {
      btn.onclick = async function(e) {
        e.stopPropagation();
        const action = btn.dataset.action;
        
        if (action === 'type') {
          elementDiv.querySelector('.wc-action-input-group').classList.add('visible');
          elementDiv.querySelector('.wc-action-input').focus();
          return;
        }
        
        if (action === 'select') {
          elementDiv.querySelector('.wc-action-select-group').classList.add('visible');
          return;
        }
        
        await executeInlineAction(action, elementId, null, elementDiv);
      };
    });
    
    // Submit de texto
    const inputSubmit = elementDiv.querySelector('.wc-action-input-submit:not(.wc-select-submit)');
    if (inputSubmit) {
      inputSubmit.onclick = async function(e) {
        e.stopPropagation();
        const text = elementDiv.querySelector('.wc-action-input').value;
        if (text) {
          await executeInlineAction('type', elementId, text, elementDiv);
        }
      };
    }
    
    // Enter en input
    const textInput = elementDiv.querySelector('.wc-action-input');
    if (textInput) {
      textInput.onclick = e => e.stopPropagation();
      textInput.onkeydown = async function(e) {
        if (e.key === 'Enter') {
          e.stopPropagation();
          const text = this.value;
          if (text) {
            await executeInlineAction('type', elementId, text, elementDiv);
          }
        }
      };
    }
    
    // Submit de select
    const selectSubmit = elementDiv.querySelector('.wc-select-submit');
    if (selectSubmit) {
      selectSubmit.onclick = async function(e) {
        e.stopPropagation();
        const value = elementDiv.querySelector('.wc-action-select').value;
        await executeInlineAction('select', elementId, value, elementDiv);
      };
    }
    
    // Click en select no cierra
    const selectEl = elementDiv.querySelector('.wc-action-select');
    if (selectEl) {
      selectEl.onclick = e => e.stopPropagation();
    }
  }

  function getAvailableActions(info, domEl) {
    const actions = [];
    const type = info.type;
    const tag = info.tag;
    
    // Click siempre disponible
    actions.push({ action: 'click', icon: '👆', label: 'Click', primary: type === 'action' || type === 'navigation' });
    
    // Type para inputs
    if (type === 'input' || tag === 'input' || tag === 'textarea' || domEl?.isContentEditable) {
      actions.push({ action: 'type', icon: '⌨️', label: 'Escribir', primary: true });
    }
    
    // Select para dropdowns
    if (tag === 'select') {
      actions.push({ action: 'select', icon: '📋', label: 'Elegir', primary: true });
    }
    
    // Check para checkboxes/radios
    if (domEl?.type === 'checkbox' || domEl?.type === 'radio') {
      const isChecked = domEl.checked;
      actions.push({ action: 'check', icon: isChecked ? '☑️' : '☐', label: isChecked ? 'Desmarcar' : 'Marcar', primary: true });
    }
    
    // Focus
    actions.push({ action: 'focus', icon: '🎯', label: 'Focus' });
    
    // Hover
    actions.push({ action: 'hover', icon: '🖱️', label: 'Hover' });
    
    return actions;
  }

  async function executeInlineAction(action, elementId, value, elementDiv) {
    const resultEl = elementDiv.querySelector('.wc-action-result');
    resultEl.className = 'wc-action-result visible';
    resultEl.textContent = '⏳ Ejecutando...';
    
    let result;
    
    try {
      switch (action) {
        case 'click':
          result = await Actions.click(elementId);
          break;
        case 'type':
          result = await Actions.type(elementId, value, { instant: false, delayMs: 20 });
          break;
        case 'focus':
          result = await Actions.focus(elementId);
          break;
        case 'scroll':
          result = await Actions.scroll(elementId);
          break;
        case 'hover':
          result = await Actions.hover(elementId);
          break;
        case 'select':
          result = await Actions.select(elementId, value);
          break;
        case 'check':
          result = await Actions.check(elementId);
          break;
        default:
          result = { success: false, reason: 'Acción desconocida' };
      }
      
      if (result.success) {
        resultEl.className = 'wc-action-result visible success';
        resultEl.textContent = `✓ ${action} OK`;
        
        // Colapsar después de acción exitosa (excepto hover)
        if (action !== 'hover') {
          setTimeout(() => collapseElement(elementDiv), 1200);
        }
      } else {
        resultEl.className = 'wc-action-result visible error';
        resultEl.textContent = `✗ ${result.reason}`;
      }
    } catch (err) {
      resultEl.className = 'wc-action-result visible error';
      resultEl.textContent = `✗ ${err.message}`;
    }
  }

  // ============ MVP 4: AGENTE ============

  let pendingAction = null;
  const STORAGE_KEY = 'webcopilot_gemini_key';

  function attachAgentEvents() {
    const input = shadowRoot.querySelector('#wc-agent-input');
    const sendBtn = shadowRoot.querySelector('#wc-agent-send');
    const configToggle = shadowRoot.querySelector('#wc-agent-config-toggle');
    const configSection = shadowRoot.querySelector('#wc-agent-config');
    const saveKeyBtn = shadowRoot.querySelector('#wc-agent-save-key');
    const apiKeyInput = shadowRoot.querySelector('#wc-agent-apikey');
    const confirmBtn = shadowRoot.querySelector('#wc-agent-confirm');
    const cancelBtn = shadowRoot.querySelector('#wc-agent-cancel');

    // Cargar API key guardada
    loadApiKey();

    // Toggle configuración
    configToggle.addEventListener('click', () => {
      configSection.classList.toggle('visible');
      if (configSection.classList.contains('visible')) {
        apiKeyInput.value = Agent.isConfigured() ? '••••••••' : '';
      }
    });

    // Guardar API key
    saveKeyBtn.addEventListener('click', () => {
      const key = apiKeyInput.value.trim();
      if (key && !key.startsWith('••')) {
        saveApiKey(key);
        Agent.setApiKey(key);
        configSection.classList.remove('visible');
        updateAgentStatus('idle', 'Configurado');
      }
    });

    // Enviar instrucción
    sendBtn.addEventListener('click', () => sendInstruction());
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendInstruction();
      }
    });

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 80) + 'px';
    });

    // Confirmar acción
    confirmBtn.addEventListener('click', async () => {
      if (pendingAction) {
        const result = await Agent.confirmAndExecute(pendingAction);
        if (result.success) {
          hideActionProposal();
          showResponse('✓ Acción ejecutada correctamente', 'success');
        }
      }
    });

    // Cancelar acción
    cancelBtn.addEventListener('click', () => {
      Agent.cancelPendingAction();
      pendingAction = null;
      hideActionProposal();
      updateAgentStatus('idle', 'Cancelado');
    });

    // Configurar callbacks del agente
    Agent.setCallbacks({
      onStatusChange: updateAgentStatus,
      onActionProposed: showActionProposal,
      onActionExecuted: (action, result) => {
        pendingAction = null;
        hideActionProposal();
      },
      onError: (error) => {
        showResponse(error.message, 'error');
      }
    });
  }

  async function sendInstruction() {
    const input = shadowRoot.querySelector('#wc-agent-input');
    const instruction = input?.value.trim();
    
    if (!instruction) return;
    
    if (!Agent.isConfigured()) {
      showResponse('⚙️ Configura tu API key de Gemini primero', 'error');
      shadowRoot.querySelector('#wc-agent-config').classList.add('visible');
      return;
    }

    input.value = '';
    input.style.height = 'auto';
    hideActionProposal();
    
    showResponse('🤔 Analizando...', 'thinking');
    
    const result = await Agent.processInstruction(instruction);
    
    if (result.success) {
      if (result.requiresConfirmation) {
        showResponse(result.action.reasoning, '');
      }
    } else if (result.clarification) {
      showResponse(result.clarification, 'clarification');
    } else if (result.error) {
      showResponse(result.error, 'error');
    }
  }

  function updateAgentStatus(status, message) {
    const statusEl = shadowRoot.querySelector('#wc-agent-status');
    
    statusEl.textContent = message || status;
    statusEl.className = 'wc-agent-status';
    
    if (status === 'thinking' || status === 'executing') {
      statusEl.classList.add('thinking');
    } else if (status === 'success') {
      statusEl.classList.add('success');
    } else if (status === 'error') {
      statusEl.classList.add('error');
    } else if (status === 'proposed') {
      statusEl.classList.add('proposed');
    }
  }

  function showResponse(message, type) {
    const responseEl = shadowRoot.querySelector('#wc-agent-response');
    
    responseEl.textContent = message;
    responseEl.className = 'wc-agent-response visible';
    if (type) responseEl.classList.add(type);
  }

  function showActionProposal(action) {
    pendingAction = action;
    
    const actionEl = shadowRoot.querySelector('#wc-agent-action');
    const detailEl = shadowRoot.querySelector('#wc-agent-action-detail');
    const targetEl = shadowRoot.querySelector('#wc-agent-action-target');
    
    const actionLabels = {
      click: '👆 Click',
      type: '⌨️ Escribir',
      focus: '🎯 Focus',
      hover: '🖱️ Hover',
      select: '📋 Seleccionar',
      check: '☑️ Marcar'
    };
    
    let detail = actionLabels[action.type] || action.type;
    if (action.value) {
      detail += `: "${action.value}"`;
    }
    
    detailEl.textContent = detail;
    targetEl.textContent = action.elementInfo?.text || action.elementId;
    
    actionEl.classList.add('visible');
    
    // Highlight del elemento objetivo
    const domEl = DOMInspector.getDOMElementById(action.elementId);
    if (domEl) {
      DOMInspector.highlightSelected(domEl);
    }
  }

  function hideActionProposal() {
    const actionEl = shadowRoot.querySelector('#wc-agent-action');
    actionEl.classList.remove('visible');
    DOMInspector.clearHighlight();
  }

  function saveApiKey(key) {
    try {
      localStorage.setItem(STORAGE_KEY, btoa(key));
    } catch (e) {
      console.warn('No se pudo guardar la API key');
    }
  }

  function loadApiKey() {
    try {
      const encoded = localStorage.getItem(STORAGE_KEY);
      if (encoded) {
        const key = atob(encoded);
        Agent.setApiKey(key);
        updateAgentStatus('idle', 'Configurado');
      }
    } catch (e) {
      console.warn('No se pudo cargar la API key');
    }
  }

  // ============ VOZ ============

  let voiceCurrentMsgEl = null;
  let voiceCurrentMsgType = null;

  function attachVoiceEvents() {
    if (typeof VoiceAgent === 'undefined') return;

    const micBtn = shadowRoot.querySelector('#wc-agent-mic');
    const stopBtn = shadowRoot.querySelector('#wc-voice-stop');

    micBtn.addEventListener('click', async () => {
      if (VoiceAgent.isActive()) {
        VoiceAgent.stop();
        return;
      }

      if (!Agent.isConfigured()) {
        showResponse('Configura tu API key de Gemini primero', 'error');
        shadowRoot.querySelector('#wc-agent-config').classList.add('visible');
        return;
      }

      try {
        micBtn.classList.add('active');
        micBtn.disabled = true;
        showVoicePanel();

        const encoded = localStorage.getItem(STORAGE_KEY);
        if (!encoded) throw new Error('API key no encontrada');
        const key = atob(encoded);

        await VoiceAgent.start(key);
        micBtn.disabled = false;
      } catch (err) {
        micBtn.classList.remove('active');
        micBtn.disabled = false;
        hideVoicePanel();
        showResponse('Error al iniciar voz: ' + err.message, 'error');
      }
    });

    stopBtn.addEventListener('click', () => {
      VoiceAgent.stop();
    });

    VoiceAgent.setCallbacks({
      onStatus: (status, message) => {
        updateVoiceStatus(status, message);
        if (status === 'idle' || status === 'disconnected') {
          const mic = shadowRoot.querySelector('#wc-agent-mic');
          if (mic) {
            mic.classList.remove('active');
            mic.disabled = false;
          }
          hideVoicePanel();
        }
      },
      onUserTranscript: (text) => {
        appendVoiceTranscript('user', text);
      },
      onAgentTranscript: (text) => {
        appendVoiceTranscript('agent', text);
      },
      onToolExec: (name, args) => {
        voiceCurrentMsgEl = null;
        voiceCurrentMsgType = null;
        const argsStr = Object.keys(args).length > 0 ? JSON.stringify(args) : '';
        addVoiceMessage('tool', `${name}(${argsStr})`);
      },
      onTurnComplete: () => {
        voiceCurrentMsgEl = null;
        voiceCurrentMsgType = null;
      },
      onSessionEnd: () => {
        const mic = shadowRoot.querySelector('#wc-agent-mic');
        if (mic) {
          mic.classList.remove('active');
          mic.disabled = false;
        }
        hideVoicePanel();
        showResponse('Sesión de voz finalizada', '');
      }
    });
  }

  function showVoicePanel() {
    const panel = shadowRoot.querySelector('#wc-voice-panel');
    const inputRow = shadowRoot.querySelector('#wc-agent-input-row');
    const response = shadowRoot.querySelector('#wc-agent-response');
    const action = shadowRoot.querySelector('#wc-agent-action');

    if (panel) panel.classList.add('visible');
    if (inputRow) inputRow.style.display = 'none';
    if (response) response.classList.remove('visible');
    if (action) action.classList.remove('visible');

    const transcript = shadowRoot.querySelector('#wc-voice-transcript');
    if (transcript) transcript.innerHTML = '';
    voiceCurrentMsgEl = null;
    voiceCurrentMsgType = null;
  }

  function hideVoicePanel() {
    const panel = shadowRoot.querySelector('#wc-voice-panel');
    const inputRow = shadowRoot.querySelector('#wc-agent-input-row');

    if (panel) panel.classList.remove('visible');
    if (inputRow) inputRow.style.display = '';
  }

  function updateVoiceStatus(status, message) {
    const dot = shadowRoot.querySelector('#wc-voice-dot');
    const text = shadowRoot.querySelector('#wc-voice-status-text');
    if (text) text.textContent = message;
    if (dot) {
      dot.className = 'wc-voice-dot';
      if (status === 'executing') dot.classList.add('executing');
      if (status === 'error') dot.classList.add('error');
    }
  }

  function appendVoiceTranscript(type, text) {
    if (voiceCurrentMsgType === type && voiceCurrentMsgEl) {
      voiceCurrentMsgEl.textContent += text;
    } else {
      voiceCurrentMsgEl = addVoiceMessage(type, text);
      voiceCurrentMsgType = type;
    }
    const transcript = shadowRoot.querySelector('#wc-voice-transcript');
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }

  function addVoiceMessage(type, text) {
    const transcript = shadowRoot.querySelector('#wc-voice-transcript');
    if (!transcript) return null;
    const msg = document.createElement('div');
    msg.className = `wc-voice-msg ${type}`;
    msg.textContent = text;
    transcript.appendChild(msg);
    transcript.scrollTop = transcript.scrollHeight;
    return msg;
  }

  // ============ MODO DEL WIDGET ============

  function saveWidgetMode() {
    try {
      localStorage.setItem(MODE_STORAGE_KEY, widgetMode);
    } catch (e) {}
  }

  function loadWidgetMode() {
    try {
      const saved = localStorage.getItem(MODE_STORAGE_KEY);
      if (saved === 'ia' || saved === 'manual') {
        widgetMode = saved;
      }
    } catch (e) {}
  }

  function setWidgetMode(mode) {
    if (mode !== 'ia' && mode !== 'manual') return;
    widgetMode = mode;
    saveWidgetMode();
    
    const widget = shadowRoot.querySelector('.wc-widget');
    const agentSection = shadowRoot.querySelector('.wc-agent-section');
    const manualSection = shadowRoot.querySelector('.wc-manual-section');
    const modeBtns = shadowRoot.querySelectorAll('.wc-mode-btn');
    
    // Actualizar clase del widget para mostrar/ocultar elementos
    if (widget) {
      widget.classList.remove('mode-ia', 'mode-manual');
      widget.classList.add('mode-' + mode);
    }
    
    modeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    
    if (agentSection) agentSection.classList.toggle('hidden', mode !== 'ia');
    if (manualSection) manualSection.classList.toggle('hidden', mode !== 'manual');
  }

  function attachModeEvents() {
    shadowRoot.querySelectorAll('.wc-mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setWidgetMode(btn.dataset.mode);
      });
    });
  }

  return { 
    init: init, 
    render: render, 
    destroy: destroy, 
    startAutoRefresh: startAutoRefresh, 
    stopAutoRefresh: stopAutoRefresh, 
    isMinimized: function() { return isMinimized; },
    toggleSelectionMode: toggleSelectionMode,
    isSelectionMode: function() { return selectionMode; },
    expandElementInWidget: expandElementInWidget,
    setMode: setWidgetMode,
    getMode: function() { return widgetMode; }
  };
})();

window.Widget = Widget;
