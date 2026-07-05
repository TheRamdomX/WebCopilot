/**
 * Widget - Orbe flotante con Shadow DOM
 * Rediseño: orbe circular con máquina de estados
 */
const Widget = (function() {
  'use strict';

  let container, shadowRoot, isDragging = false, dragOffset = { x: 0, y: 0 }, dragStartPos = null;
  let autoRefreshInterval = null, currentElementIds = new Set();
  let selectionMode = false;
  let currentState = 'idle'; // 'idle' | 'listening' | 'text' | 'settings' | 'manual'
  const AUTO_REFRESH_DELAY = 1000;
  const STORAGE_KEY = 'webcopilot_gemini_key';
  const DRAG_THRESHOLD = 5;

  const STYLES = `
    :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    /* Widget container */
    .wc-widget { position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; font-size: 13px; color: #e6e6ea; }

    /* Orb area */
    .wc-orb-area { position: relative; display: flex; align-items: center; justify-content: center; }
    .wc-orb { width: 78px; height: 78px; border-radius: 50%; background: rgba(139,124,246,0.12); border: 1px solid rgba(139,124,246,0.45); display: flex; align-items: center; justify-content: center; cursor: pointer; animation: breathe 2.6s ease-in-out infinite; transition: transform .15s ease; }
    .wc-orb:active { transform: scale(0.96); }
    .wc-orb svg { width: 26px; height: 26px; stroke: #b3a6fb; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .wc-orb.listening { background: rgba(139,124,246,0.25); border-color: rgba(139,124,246,0.7); }
    @keyframes breathe { 0%, 100% { box-shadow: 0 0 0 0 rgba(139,124,246,0.25); } 50% { box-shadow: 0 0 0 10px rgba(139,124,246,0); } }

    /* Status dot */
    .wc-status-dot { position: absolute; top: 2px; right: 2px; width: 10px; height: 10px; border-radius: 50%; background: #fbbf24; border: 2px solid #1a1a22; z-index: 1; transition: background .3s ease; }
    .wc-status-dot.configured { background: #3ecf8e; }

    /* Peripherals */
    .wc-peripherals { position: absolute; bottom: -8px; right: -8px; display: flex; gap: 10px; }
    .wc-peripherals svg { width: 16px; height: 16px; stroke: #5c5c66; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; cursor: pointer; transition: stroke .15s ease; }
    .wc-peripherals svg:hover { stroke: #b3a6fb; }

    /* Panel */
    .wc-panel { display: none; width: 340px; background: #1a1a22; border: 1px solid #2a2a35; border-radius: 16px; padding: 18px 16px; margin-top: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.35); animation: fadeIn .2s ease; max-height: 450px; overflow-y: auto; }
    .wc-panel::-webkit-scrollbar { width: 5px; }
    .wc-panel::-webkit-scrollbar-track { background: transparent; }
    .wc-panel::-webkit-scrollbar-thumb { background: #2a2a35; border-radius: 3px; }

    /* State containers */
    .wc-state-listening, .wc-state-text, .wc-state-settings, .wc-state-manual { display: none; }

    /* Animations */
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes wave { 0%,100% { transform: scaleY(.5); } 50% { transform: scaleY(1); } }

    /* Listening state */
    .wc-state-listening { flex-direction: column; align-items: center; gap: 12px; }
    .wc-waveform { display: flex; align-items: center; gap: 3px; height: 30px; }
    .wc-waveform span { width: 3px; background: #b3a6fb; border-radius: 2px; animation: wave 1s ease-in-out infinite; }
    .wc-waveform span:nth-child(1) { height: 8px; animation-delay: 0s; }
    .wc-waveform span:nth-child(2) { height: 18px; animation-delay: .1s; }
    .wc-waveform span:nth-child(3) { height: 26px; animation-delay: .2s; }
    .wc-waveform span:nth-child(4) { height: 14px; animation-delay: .3s; }
    .wc-waveform span:nth-child(5) { height: 22px; animation-delay: .4s; }
    .wc-waveform span:nth-child(6) { height: 10px; animation-delay: .5s; }
    .wc-waveform span:nth-child(7) { height: 16px; animation-delay: .6s; }
    .wc-caption { font-size: 13px; color: #8b8b96; text-align: center; }
    .wc-voice-transcript { width: 100%; max-height: 150px; overflow-y: auto; }
    .wc-voice-transcript::-webkit-scrollbar { width: 4px; }
    .wc-voice-transcript::-webkit-scrollbar-thumb { background: #2a2a35; border-radius: 2px; }
    .wc-voice-msg { padding: 6px 10px; border-radius: 8px; margin-bottom: 4px; font-size: 12px; line-height: 1.4; word-break: break-word; }
    .wc-voice-msg.user { background: rgba(139,124,246,0.1); color: #e6e6ea; }
    .wc-voice-msg.agent { background: #14141b; color: #3ecf8e; border-left: 2px solid #3ecf8e; }
    .wc-voice-msg.tool { background: #14141b; color: #fbbf24; border-left: 2px solid #fbbf24; font-size: 10px; font-family: monospace; }
    .wc-voice-stop { background: rgba(243,139,168,0.15); border: 1px solid rgba(243,139,168,0.4); color: #f38ba8; padding: 8px 16px; border-radius: 10px; cursor: pointer; font-size: 11px; font-weight: 600; width: 100%; transition: all 0.2s; }
    .wc-voice-stop:hover { background: rgba(243,139,168,0.25); }

    /* Text state */
    .wc-state-text { flex-direction: column; gap: 10px; }
    .wc-text-row { display: flex; gap: 8px; }
    .wc-text-input { flex: 1; background: #14141b; border: 1px solid #2a2a35; color: #e6e6ea; border-radius: 10px; padding: 10px 12px; font-size: 13px; outline: none; font-family: inherit; }
    .wc-text-input::placeholder { color: #5c5c66; }
    .wc-text-input:focus { border-color: rgba(139,124,246,0.5); }
    .wc-text-send { background: rgba(139,124,246,0.15); border: 1px solid rgba(139,124,246,0.3); color: #b3a6fb; width: 40px; border-radius: 10px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; transition: all .2s; flex-shrink: 0; }
    .wc-text-send:hover { background: rgba(139,124,246,0.25); }

    /* Agent response (shared between text and listening) */
    .wc-agent-response { padding: 10px; background: #14141b; border-radius: 10px; font-size: 12px; line-height: 1.5; display: none; }
    .wc-agent-response.visible { display: block; animation: fadeIn .2s ease; }
    .wc-agent-response.thinking { color: #8b8b96; font-style: italic; }
    .wc-agent-response.clarification { color: #fbbf24; border-left: 3px solid #fbbf24; padding-left: 10px; }
    .wc-agent-response.error { color: #f38ba8; border-left: 3px solid #f38ba8; padding-left: 10px; }
    .wc-agent-response.success { color: #3ecf8e; }

    /* Action proposal */
    .wc-agent-action { padding: 10px; background: rgba(139,124,246,0.08); border-radius: 10px; border: 1px solid rgba(139,124,246,0.3); display: none; }
    .wc-agent-action.visible { display: block; animation: fadeIn .2s ease; }
    .wc-agent-action-header { font-size: 10px; text-transform: uppercase; color: #b3a6fb; margin-bottom: 6px; letter-spacing: 0.5px; }
    .wc-agent-action-detail { font-size: 12px; color: #e6e6ea; margin-bottom: 8px; }
    .wc-agent-action-target { font-size: 11px; color: #3ecf8e; background: #14141b; padding: 4px 8px; border-radius: 6px; display: inline-block; margin-bottom: 10px; }
    .wc-agent-action-buttons { display: flex; gap: 8px; }
    .wc-agent-confirm { background: rgba(62,207,142,0.15); border: 1px solid rgba(62,207,142,0.4); color: #3ecf8e; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 11px; font-weight: 600; transition: all .2s; }
    .wc-agent-confirm:hover { background: rgba(62,207,142,0.25); }
    .wc-agent-cancel { background: transparent; border: 1px solid rgba(243,139,168,0.4); color: #f38ba8; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 11px; transition: all .2s; }
    .wc-agent-cancel:hover { background: rgba(243,139,168,0.15); }

    /* Settings state */
    .wc-state-settings { flex-direction: column; gap: 12px; }
    .wc-settings-back { background: transparent; border: none; color: #5c5c66; cursor: pointer; font-size: 16px; padding: 0; align-self: flex-start; transition: color .15s; }
    .wc-settings-back:hover { color: #b3a6fb; }
    .wc-settings-label { font-size: 11px; color: #6c6c78; }
    .wc-settings-key { width: 100%; background: #14141b; border: 1px solid #2a2a35; color: #e6e6ea; border-radius: 10px; padding: 10px 12px; font-size: 13px; outline: none; font-family: monospace; }
    .wc-settings-key::placeholder { color: #5c5c66; }
    .wc-settings-key:focus { border-color: rgba(139,124,246,0.5); }
    .wc-settings-save { background: rgba(139,124,246,0.15); border: 1px solid rgba(139,124,246,0.3); color: #b3a6fb; padding: 8px 16px; border-radius: 10px; cursor: pointer; font-size: 12px; width: 100%; transition: all .2s; }
    .wc-settings-save:hover { background: rgba(139,124,246,0.25); }
    .wc-settings-status { font-size: 11px; color: #8b8b96; text-align: center; }

    /* Manual state */
    .wc-state-manual { flex-direction: column; gap: 10px; }
    .wc-manual-back { background: transparent; border: none; color: #5c5c66; cursor: pointer; font-size: 16px; padding: 0; align-self: flex-start; transition: color .15s; }
    .wc-manual-back:hover { color: #b3a6fb; }

    /* Summary */
    .wc-summary { background: #14141b; border-radius: 10px; padding: 10px; }
    .wc-summary-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6c6c78; margin-bottom: 6px; }
    .wc-summary-stats { display: flex; flex-wrap: wrap; gap: 6px; }
    .wc-stat { background: #1a1a22; border: 1px solid #2a2a35; padding: 4px 8px; border-radius: 6px; font-size: 11px; color: #8b8b96; }
    .wc-stat-value { font-weight: 600; color: #b3a6fb; }

    /* Elements list */
    .wc-elements-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6c6c78; }
    .wc-element-list { display: flex; flex-direction: column; gap: 4px; }
    .wc-element { background: #14141b; border-radius: 10px; padding: 10px 12px; border-left: 3px solid #b3a6fb; transition: all 0.2s; cursor: pointer; }
    .wc-element:hover { background: #1e1e28; }
    .wc-element-new { animation: slideIn 0.3s ease; background: rgba(139,124,246,0.08); }
    .wc-element-removing { animation: slideOut 0.2s ease forwards; }
    .wc-element-updated { animation: pulse 0.5s ease; }
    @keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes slideOut { from { opacity: 1; max-height: 100px; } to { opacity: 0; max-height: 0; padding: 0; margin: 0; } }
    @keyframes pulse { 0%, 100% { background: #14141b; } 50% { background: rgba(139,124,246,0.08); } }
    .wc-element.type-button { border-left-color: #f38ba8; }
    .wc-element.type-link { border-left-color: #89b4fa; }
    .wc-element.type-text-input, .wc-element.type-text-area { border-left-color: #3ecf8e; }
    .wc-element.type-dropdown { border-left-color: #fbbf24; }
    .wc-element.type-checkbox, .wc-element.type-radio { border-left-color: #b3a6fb; }
    .wc-element-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .wc-element-type { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #6c6c78; background: #1a1a22; padding: 2px 6px; border-radius: 4px; }
    .wc-element-id { font-size: 9px; color: #5c5c66; font-family: monospace; }
    .wc-element-text { font-size: 12px; color: #e6e6ea; word-break: break-word; }
    .wc-element-text.empty { font-style: italic; color: #5c5c66; }
    .wc-element-meta { display: flex; gap: 8px; margin-top: 4px; font-size: 10px; color: #6c6c78; }
    .wc-element-zone { background: #1a1a22; padding: 2px 6px; border-radius: 4px; }
    .wc-element-reference { font-size: 9px; color: #b3a6fb; font-family: monospace; margin-top: 4px; word-break: break-all; background: #1a1a22; padding: 4px 6px; border-radius: 6px; }

    /* Element actions inline */
    .wc-element.expanded { background: rgba(139,124,246,0.06); }
    .wc-element-actions { display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid #2a2a35; }
    .wc-element.expanded .wc-element-actions { display: block; animation: fadeIn 0.2s ease; }
    .wc-action-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
    .wc-action-btn { background: #1a1a22; border: 1px solid #2a2a35; color: #e6e6ea; padding: 6px 10px; border-radius: 8px; cursor: pointer; font-size: 11px; display: flex; align-items: center; gap: 4px; transition: all 0.2s; }
    .wc-action-btn:hover { border-color: rgba(139,124,246,0.4); }
    .wc-action-btn:active { transform: scale(0.95); }
    .wc-action-btn.primary { background: rgba(139,124,246,0.15); border-color: rgba(139,124,246,0.3); color: #b3a6fb; }
    .wc-action-btn.primary:hover { background: rgba(139,124,246,0.25); }
    .wc-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .wc-action-input-group { display: none; margin-top: 8px; }
    .wc-action-input-group.visible { display: flex; gap: 6px; }
    .wc-action-input { flex: 1; background: #14141b; border: 1px solid #2a2a35; border-radius: 8px; padding: 8px 10px; color: #e6e6ea; font-size: 12px; outline: none; }
    .wc-action-input:focus { border-color: rgba(139,124,246,0.5); }
    .wc-action-input::placeholder { color: #5c5c66; }
    .wc-action-input-submit { background: rgba(62,207,142,0.15); border: 1px solid rgba(62,207,142,0.3); color: #3ecf8e; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
    .wc-action-input-submit:hover { background: rgba(62,207,142,0.25); }
    .wc-action-result { margin-top: 8px; padding: 6px 8px; border-radius: 6px; font-size: 10px; display: none; }
    .wc-action-result.visible { display: block; }
    .wc-action-result.success { background: rgba(62,207,142,0.1); border: 1px solid rgba(62,207,142,0.3); color: #3ecf8e; }
    .wc-action-result.error { background: rgba(243,139,168,0.1); border: 1px solid rgba(243,139,168,0.3); color: #f38ba8; }
    .wc-action-select-group { display: none; margin-top: 8px; }
    .wc-action-select-group.visible { display: flex; gap: 6px; }
    .wc-action-select-group select { flex: 1; background: #14141b; border: 1px solid #2a2a35; border-radius: 8px; padding: 8px 10px; color: #e6e6ea; font-size: 12px; }

    /* Manual footer */
    .wc-manual-footer { display: flex; gap: 8px; margin-top: 6px; }
    .wc-manual-footer button { flex: 1; background: #14141b; border: 1px solid #2a2a35; color: #8b8b96; padding: 7px 12px; border-radius: 8px; cursor: pointer; font-size: 11px; transition: all .2s; }
    .wc-manual-footer button:hover { border-color: rgba(139,124,246,0.4); color: #e6e6ea; }
    .wc-manual-footer button.active { background: rgba(139,124,246,0.15); border-color: rgba(139,124,246,0.4); color: #b3a6fb; }
    .wc-manual-status { font-size: 10px; color: #5c5c66; text-align: center; }

    /* Empty state */
    .wc-empty { text-align: center; padding: 20px; color: #5c5c66; font-size: 12px; }
    .wc-empty-icon { font-size: 24px; margin-bottom: 8px; }

    /* Selection mode indicator on orb */
    .wc-orb.selection-active { border-color: #3ecf8e; background: rgba(62,207,142,0.12); }
    .wc-orb.selection-active svg { stroke: #3ecf8e; }
  `;

  // ============ SVG ICONS ============

  const SVG_MIC = '<svg viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>';
  const SVG_KEYBOARD = '<svg data-action="text" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h12"/></svg>';
  const SVG_SETTINGS = '<svg data-action="settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  const SVG_CODE = '<svg data-action="manual" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';

  // ============ RENDER ============

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

    const actionsHtml = '<div class="wc-element-actions">' +
      '<div class="wc-action-buttons"></div>' +
      '<div class="wc-action-input-group"><input type="text" class="wc-action-input" placeholder="Escribe el texto..."><button class="wc-action-btn wc-action-input-submit">⌨️</button></div>' +
      '<div class="wc-action-select-group"><select class="wc-action-select"></select><button class="wc-action-btn wc-action-input-submit wc-select-submit">✓</button></div>' +
      '<div class="wc-action-result"></div>' +
      '</div>';

    return '<div class="wc-element type-' + el.type + '" data-element-id="' + el.id + '"><div class="wc-element-header"><span class="wc-element-type">' + el.type + '</span><span class="wc-element-id">' + el.id + '</span></div><div class="wc-element-text ' + (el.text ? '' : 'empty') + '">' + escapeHtml(text) + '</div><div class="wc-element-meta">' + meta + '</div>' + refHtml + actionsHtml + '</div>';
  }

  function render(elements, summary) {
    shadowRoot.querySelector('.wc-widget') ? renderIncremental(elements, summary) : renderFull(elements, summary);
  }

  function renderFull(elements, summary) {
    const html = elements.length ? elements.map(renderElement).join('') : '<div class="wc-empty"><div class="wc-empty-icon">🔍</div><div>No se encontraron elementos</div></div>';

    const widget = `<div class="wc-widget">
      <div class="wc-orb-area">
        <div class="wc-status-dot" title="Estado de configuración"></div>
        <div class="wc-orb">${SVG_MIC}</div>
        <div class="wc-peripherals">
          ${SVG_KEYBOARD}
          ${SVG_SETTINGS}
          ${SVG_CODE}
        </div>
      </div>
      <div class="wc-panel">
        <div class="wc-state-listening">
          <div class="wc-waveform"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
          <p class="wc-caption">Escuchando...</p>
          <div class="wc-voice-transcript"></div>
          <button class="wc-voice-stop">⏹ Detener voz</button>
        </div>
        <div class="wc-state-text">
          <div class="wc-text-row">
            <input class="wc-text-input" type="text" placeholder="Escribe una instrucción...">
            <button class="wc-text-send">➤</button>
          </div>
          <div class="wc-agent-response"></div>
          <div class="wc-agent-action">
            <div class="wc-agent-action-header">Acción propuesta</div>
            <div class="wc-agent-action-detail"></div>
            <div class="wc-agent-action-target"></div>
            <div class="wc-agent-action-buttons">
              <button class="wc-agent-confirm">✓ Ejecutar</button>
              <button class="wc-agent-cancel">✗ Cancelar</button>
            </div>
          </div>
        </div>
        <div class="wc-state-settings">
          <button class="wc-settings-back">←</button>
          <label class="wc-settings-label">Clave de API</label>
          <input class="wc-settings-key" type="password" placeholder="AIza...">
          <button class="wc-settings-save">Guardar</button>
          <div class="wc-settings-status"></div>
        </div>
        <div class="wc-state-manual">
          <button class="wc-manual-back">←</button>
          ${renderSummary(summary)}
          <div class="wc-elements-title">Elementos detectados</div>
          <div class="wc-element-list">${html}</div>
          <div class="wc-manual-footer">
            <button class="wc-selection-btn">⎯⊙ Seleccionar</button>
            <button class="wc-refresh-btn">↻ Actualizar</button>
          </div>
          <div class="wc-manual-status">${summary.totalElements} elementos • ${new Date().toLocaleTimeString()}</div>
        </div>
      </div>
    </div>`;

    const t = document.createElement('template'); t.innerHTML = widget;
    shadowRoot.appendChild(t.content.cloneNode(true));
    currentElementIds = new Set(elements.map(function(e) { return e.id; }));
    attachEvents();
    attachElementEvents();
    attachAgentEvents();
    attachVoiceEvents();
    updateStatusDot();
  }

  function renderIncremental(elements, summary) {
    // Always update internal data
    const newIds = new Set(elements.map(function(e) { return e.id; }));

    // Only update DOM if manual state is active
    if (currentState === 'manual') {
      const widget = shadowRoot.querySelector('.wc-widget');
      const sumEl = widget.querySelector('.wc-summary');
      if (sumEl) {
        const tmp = document.createElement('div'); tmp.innerHTML = renderSummary(summary);
        sumEl.innerHTML = tmp.querySelector('.wc-summary').innerHTML;
      }

      const list = widget.querySelector('.wc-element-list');
      if (list) {
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

        const statusEl = widget.querySelector('.wc-manual-status');
        if (statusEl) statusEl.textContent = summary.totalElements + ' elementos • ' + new Date().toLocaleTimeString();
      }
    }

    currentElementIds = newIds;
  }

  // ============ STATE MACHINE ============

  function setState(newState) {
    if (newState === currentState) {
      if (newState === 'listening') {
        setState('idle');
        return;
      }
      return;
    }

    const prev = currentState;
    currentState = newState;

    // Hide all state panels
    ['listening', 'text', 'settings', 'manual'].forEach(function(s) {
      const el = shadowRoot.querySelector('.wc-state-' + s);
      if (el) el.style.display = 'none';
    });

    // Panel visible only when not idle
    const panel = shadowRoot.querySelector('.wc-panel');
    if (panel) panel.style.display = newState === 'idle' ? 'none' : 'block';

    // Show active state panel
    if (newState !== 'idle') {
      const active = shadowRoot.querySelector('.wc-state-' + newState);
      if (active) active.style.display = 'flex';
    }

    // Update orb appearance
    const orb = shadowRoot.querySelector('.wc-orb');
    if (orb) {
      orb.classList.toggle('listening', newState === 'listening');
    }

    // Side effects
    if (newState === 'listening' && prev !== 'listening') startVoice();
    if (prev === 'listening' && newState !== 'listening') stopVoice();
    if (newState === 'manual') startAutoRefresh();
    if (prev === 'manual' && newState !== 'manual' && newState !== 'idle') stopAutoRefresh();
    if (newState === 'text') {
      const input = shadowRoot.querySelector('.wc-text-input');
      if (input) setTimeout(() => input.focus(), 100);
    }
    if (newState === 'settings') {
      const keyInput = shadowRoot.querySelector('.wc-settings-key');
      if (keyInput) keyInput.value = Agent.isConfigured() ? '••••••••' : '';
    }

    // If leaving manual and selection was active, disable it
    if (prev === 'manual' && newState !== 'manual' && selectionMode) {
      toggleSelectionMode();
    }

    updateStatusDot();
  }

  function updateStatusDot() {
    const dot = shadowRoot.querySelector('.wc-status-dot');
    if (dot) {
      dot.classList.toggle('configured', Agent.isConfigured());
      dot.title = Agent.isConfigured() ? 'Agente configurado' : 'Falta API key';
    }
  }

  // ============ EVENTS ============

  function attachEvents() {
    const orbArea = shadowRoot.querySelector('.wc-orb-area');
    const orb = shadowRoot.querySelector('.wc-orb');

    // Orb click vs drag
    orb.addEventListener('mousedown', function(e) {
      dragStartPos = { x: e.clientX, y: e.clientY };
      startDrag(e);
    });

    orb.addEventListener('mouseup', function(e) {
      if (dragStartPos) {
        const dx = Math.abs(e.clientX - dragStartPos.x);
        const dy = Math.abs(e.clientY - dragStartPos.y);
        if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) {
          // It's a click, not a drag
          if (currentState === 'listening') {
            setState('idle');
          } else {
            setState('listening');
          }
        }
        dragStartPos = null;
      }
    });

    // Peripheral icons
    shadowRoot.querySelectorAll('.wc-peripherals svg').forEach(function(icon) {
      icon.addEventListener('click', function(e) {
        e.stopPropagation();
        const action = icon.dataset.action;
        if (action) {
          if (currentState === action) {
            setState('idle');
          } else {
            setState(action);
          }
        }
      });
    });

    // Back buttons
    const settingsBack = shadowRoot.querySelector('.wc-settings-back');
    if (settingsBack) settingsBack.addEventListener('click', () => setState('idle'));

    const manualBack = shadowRoot.querySelector('.wc-manual-back');
    if (manualBack) manualBack.addEventListener('click', () => setState('idle'));

    // Voice stop
    const stopBtn = shadowRoot.querySelector('.wc-voice-stop');
    if (stopBtn) stopBtn.addEventListener('click', () => setState('idle'));

    // Selection button
    const selBtn = shadowRoot.querySelector('.wc-selection-btn');
    if (selBtn) {
      selBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleSelectionMode();
        selBtn.classList.toggle('active', selectionMode);
      });
    }

    // Refresh button
    const refBtn = shadowRoot.querySelector('.wc-refresh-btn');
    if (refBtn) refBtn.addEventListener('click', function(e) { e.stopPropagation(); window.WebCopilot.refresh(true); });
  }

  // ============ DRAG ============

  function startDrag(e) {
    isDragging = true;
    const rect = shadowRoot.querySelector('.wc-widget').getBoundingClientRect();
    dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', stopDrag);
  }

  function drag(e) {
    if (!isDragging) return;
    if (dragStartPos) {
      const dx = Math.abs(e.clientX - dragStartPos.x);
      const dy = Math.abs(e.clientY - dragStartPos.y);
      if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
    }
    const widget = shadowRoot.querySelector('.wc-widget');
    const x = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - widget.offsetWidth));
    const y = Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - widget.offsetHeight));
    widget.style.left = x + 'px';
    widget.style.top = y + 'px';
    widget.style.right = 'auto';
    widget.style.bottom = 'auto';
  }

  function stopDrag() {
    isDragging = false;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', stopDrag);
  }

  // ============ AUTO REFRESH ============

  function startAutoRefresh() {
    if (autoRefreshInterval) return;
    autoRefreshInterval = setInterval(function() { if (currentState === 'manual') window.WebCopilot.refresh(); }, AUTO_REFRESH_DELAY);
  }

  function stopAutoRefresh() {
    if (!autoRefreshInterval) return;
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }

  // ============ INIT / DESTROY ============

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

  function getRealTarget(e) {
    const path = e.composedPath?.();
    if (path && path.length > 0) return path[0];
    return e.target;
  }

  function isInsideWidget(el) {
    if (!el) return false;
    if (el.id === 'webcopilot-widget-container') return true;
    let current = el;
    while (current) {
      if (current.id === 'webcopilot-widget-container') return true;
      if (current.id === 'wc-highlight-overlay') return true;
      current = current.parentElement || current.parentNode?.host;
    }
    return false;
  }

  // ============ SELECTION MODE ============

  function toggleSelectionMode() {
    selectionMode = !selectionMode;
    if (selectionMode) {
      enableSelectionMode();
    } else {
      disableSelectionMode();
    }
    const orb = shadowRoot.querySelector('.wc-orb');
    if (orb) orb.classList.toggle('selection-active', selectionMode);
  }

  function enableSelectionMode() {
    document.body.style.cursor = 'crosshair';
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleSelectionClick, true);
  }

  function disableSelectionMode() {
    if (!selectionMode) return;
    selectionMode = false;
    document.body.style.cursor = '';
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handleSelectionClick, true);
    DOMInspector.clearHighlight();
    const orb = shadowRoot.querySelector('.wc-orb');
    if (orb) orb.classList.remove('selection-active');
    const btn = shadowRoot.querySelector('.wc-selection-btn');
    if (btn) btn.classList.remove('active');
  }

  function handleMouseOver(e) {
    if (!selectionMode) return;
    const realTarget = getRealTarget(e);
    if (!realTarget) return;
    if (isInsideWidget(realTarget)) return;
    const interactiveEl = findInteractiveParent(realTarget);
    if (interactiveEl) DOMInspector.highlightElement(interactiveEl);
  }

  function handleMouseOut(e) {
    if (!selectionMode) return;
    const relatedTarget = e.relatedTarget;
    if (!relatedTarget || isInsideWidget(relatedTarget)) DOMInspector.clearHighlight();
  }

  function handleSelectionClick(e) {
    if (!selectionMode) return;
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

  function findInteractiveParent(el) {
    let current = el;
    while (current && current !== document.body) {
      if (isSelectableElement(current)) return current;
      current = current.parentElement || current.parentNode?.host;
    }
    return null;
  }

  function isSelectableElement(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a' && el.hasAttribute('href')) return true;
    if (tag === 'button') return true;
    if (tag === 'input' && el.type !== 'hidden') return true;
    if (tag === 'select') return true;
    if (tag === 'textarea') return true;
    if (el.tabIndex >= 0) return true;
    const role = el.getAttribute('role');
    if (role && ['button', 'link', 'checkbox', 'radio', 'textbox', 'combobox', 'listbox', 'menuitem', 'tab', 'switch', 'option', 'searchbox'].includes(role)) return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function selectElement(domElement) {
    const info = DOMInspector.getInfoByDOMElement(domElement);
    if (!info) {
      window.WebCopilot.refresh(true);
      const newInfo = DOMInspector.getInfoByDOMElement(domElement);
      if (newInfo) {
        expandElementInWidget(newInfo.id);
      } else {
        disableSelectionMode();
      }
      return;
    }
    expandElementInWidget(info.id);
  }

  function expandElementInWidget(elementId) {
    // Switch to manual if not already there
    if (currentState !== 'manual') setState('manual');

    const elementDiv = shadowRoot.querySelector('[data-element-id="' + elementId + '"]');
    if (!elementDiv) return;

    elementDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    disableSelectionMode();
    toggleElementActions(elementId, elementDiv);
  }

  // ============ ELEMENT EVENTS ============

  function attachElementEvents() {
    shadowRoot.querySelectorAll('.wc-element').forEach(attachSingleElementEvents);
  }

  let currentExpandedElement = null;

  function attachSingleElementEvents(el) {
    el.addEventListener('mouseenter', function() {
      const id = el.dataset.elementId;
      const domEl = DOMInspector.getDOMElementById(id);
      if (domEl) DOMInspector.highlightElement(domEl);
    });

    el.addEventListener('mouseleave', function() {
      if (!el.classList.contains('expanded')) DOMInspector.clearHighlight();
    });

    el.addEventListener('click', function(e) {
      if (e.target.closest('.wc-action-btn') || e.target.closest('.wc-action-input') || e.target.closest('.wc-action-select')) return;
      const id = el.dataset.elementId;
      toggleElementActions(id, el);
    });
  }

  // ============ INLINE ACTIONS ============

  function toggleElementActions(elementId, elementDiv) {
    if (elementDiv.classList.contains('expanded')) {
      collapseElement(elementDiv);
      return;
    }
    if (currentExpandedElement && currentExpandedElement !== elementDiv) {
      collapseElement(currentExpandedElement);
    }
    expandElement(elementId, elementDiv);
  }

  function expandElement(elementId, elementDiv) {
    const info = DOMInspector.getInfoByDOMElement(DOMInspector.getDOMElementById(elementId));
    if (!info) return;
    const domEl = DOMInspector.getDOMElementById(elementId);
    const actions = getAvailableActions(info, domEl);

    const buttonsContainer = elementDiv.querySelector('.wc-action-buttons');
    buttonsContainer.innerHTML = actions.map(a =>
      `<button class="wc-action-btn ${a.primary ? 'primary' : ''}" data-action="${a.action}" ${a.disabled ? 'disabled' : ''}>${a.icon} ${a.label}</button>`
    ).join('');

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

    elementDiv.querySelector('.wc-action-input-group').classList.remove('visible');
    elementDiv.querySelector('.wc-action-select-group').classList.remove('visible');
    elementDiv.querySelector('.wc-action-result').className = 'wc-action-result';
    elementDiv.querySelector('.wc-action-input').value = '';

    elementDiv.classList.add('expanded');
    currentExpandedElement = elementDiv;

    if (domEl) DOMInspector.highlightSelected(domEl);
    attachInlineActionEvents(elementDiv, elementId, info);
  }

  function collapseElement(elementDiv) {
    elementDiv.classList.remove('expanded');
    elementDiv.querySelector('.wc-action-input-group').classList.remove('visible');
    elementDiv.querySelector('.wc-action-select-group').classList.remove('visible');
    if (currentExpandedElement === elementDiv) currentExpandedElement = null;
    DOMInspector.clearHighlight();
  }

  function attachInlineActionEvents(elementDiv, elementId, info) {
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

    const inputSubmit = elementDiv.querySelector('.wc-action-input-submit:not(.wc-select-submit)');
    if (inputSubmit) {
      inputSubmit.onclick = async function(e) {
        e.stopPropagation();
        const text = elementDiv.querySelector('.wc-action-input').value;
        if (text) await executeInlineAction('type', elementId, text, elementDiv);
      };
    }

    const textInput = elementDiv.querySelector('.wc-action-input');
    if (textInput) {
      textInput.onclick = e => e.stopPropagation();
      textInput.onkeydown = async function(e) {
        if (e.key === 'Enter') {
          e.stopPropagation();
          const text = this.value;
          if (text) await executeInlineAction('type', elementId, text, elementDiv);
        }
      };
    }

    const selectSubmit = elementDiv.querySelector('.wc-select-submit');
    if (selectSubmit) {
      selectSubmit.onclick = async function(e) {
        e.stopPropagation();
        const value = elementDiv.querySelector('.wc-action-select').value;
        await executeInlineAction('select', elementId, value, elementDiv);
      };
    }

    const selectEl = elementDiv.querySelector('.wc-action-select');
    if (selectEl) selectEl.onclick = e => e.stopPropagation();
  }

  function getAvailableActions(info, domEl) {
    const actions = [];
    const type = info.type;
    const tag = info.tag;
    actions.push({ action: 'click', icon: '👆', label: 'Click', primary: type === 'action' || type === 'navigation' });
    if (type === 'input' || tag === 'input' || tag === 'textarea' || domEl?.isContentEditable) {
      actions.push({ action: 'type', icon: '⌨️', label: 'Escribir', primary: true });
    }
    if (tag === 'select') {
      actions.push({ action: 'select', icon: '📋', label: 'Elegir', primary: true });
    }
    if (domEl?.type === 'checkbox' || domEl?.type === 'radio') {
      const isChecked = domEl.checked;
      actions.push({ action: 'check', icon: isChecked ? '☑️' : '☐', label: isChecked ? 'Desmarcar' : 'Marcar', primary: true });
    }
    actions.push({ action: 'focus', icon: '🎯', label: 'Focus' });
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
        case 'click': result = await Actions.click(elementId); break;
        case 'type': result = await Actions.type(elementId, value, { instant: false, delayMs: 20 }); break;
        case 'focus': result = await Actions.focus(elementId); break;
        case 'scroll': result = await Actions.scroll(elementId); break;
        case 'hover': result = await Actions.hover(elementId); break;
        case 'select': result = await Actions.select(elementId, value); break;
        case 'check': result = await Actions.check(elementId); break;
        default: result = { success: false, reason: 'Acción desconocida' };
      }

      if (result.success) {
        resultEl.className = 'wc-action-result visible success';
        resultEl.textContent = `✓ ${action} OK`;
        if (action !== 'hover') setTimeout(() => collapseElement(elementDiv), 1200);
      } else {
        resultEl.className = 'wc-action-result visible error';
        resultEl.textContent = `✗ ${result.reason}`;
      }
    } catch (err) {
      resultEl.className = 'wc-action-result visible error';
      resultEl.textContent = `✗ ${err.message}`;
    }
  }

  // ============ AGENT ============

  let pendingAction = null;

  function attachAgentEvents() {
    const input = shadowRoot.querySelector('.wc-text-input');
    const sendBtn = shadowRoot.querySelector('.wc-text-send');
    const saveKeyBtn = shadowRoot.querySelector('.wc-settings-save');
    const apiKeyInput = shadowRoot.querySelector('.wc-settings-key');
    const confirmBtn = shadowRoot.querySelector('.wc-agent-confirm');
    const cancelBtn = shadowRoot.querySelector('.wc-agent-cancel');

    loadApiKey();

    // Save API key
    saveKeyBtn.addEventListener('click', () => {
      const key = apiKeyInput.value.trim();
      if (key && !key.startsWith('•')) {
        saveApiKey(key);
        Agent.setApiKey(key);
        updateStatusDot();
        const statusEl = shadowRoot.querySelector('.wc-settings-status');
        if (statusEl) statusEl.textContent = '✓ Configurado';
        setTimeout(() => setState('idle'), 600);
      }
    });

    // Send instruction
    sendBtn.addEventListener('click', () => sendInstruction());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendInstruction();
      }
    });

    // Confirm action
    confirmBtn.addEventListener('click', async () => {
      if (pendingAction) {
        const result = await Agent.confirmAndExecute(pendingAction);
        if (result.success) {
          hideActionProposal();
          showResponse('✓ Acción ejecutada correctamente', 'success');
        }
      }
    });

    // Cancel action
    cancelBtn.addEventListener('click', () => {
      Agent.cancelPendingAction();
      pendingAction = null;
      hideActionProposal();
    });

    // Agent callbacks
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
    const input = shadowRoot.querySelector('.wc-text-input');
    const instruction = input?.value.trim();
    if (!instruction) return;

    if (!Agent.isConfigured()) {
      showResponse('⚙️ Configura tu API key primero', 'error');
      setState('settings');
      return;
    }

    input.value = '';
    hideActionProposal();
    showResponse('🤔 Analizando...', 'thinking');

    const result = await Agent.processInstruction(instruction);
    if (result.success) {
      if (result.requiresConfirmation) showResponse(result.action.reasoning, '');
    } else if (result.clarification) {
      showResponse(result.clarification, 'clarification');
    } else if (result.error) {
      showResponse(result.error, 'error');
    }
  }

  function updateAgentStatus(status, message) {
    // Status is reflected in the dot and response area, not a separate badge
    updateStatusDot();
  }

  function showResponse(message, type) {
    // Ensure we're in a state that can show the response
    if (currentState === 'idle') setState('text');

    const responseEl = shadowRoot.querySelector('.wc-agent-response');
    if (!responseEl) return;
    responseEl.textContent = message;
    responseEl.className = 'wc-agent-response visible';
    if (type) responseEl.classList.add(type);
  }

  function showActionProposal(action) {
    pendingAction = action;

    if (currentState === 'idle') setState('text');

    const actionEl = shadowRoot.querySelector('.wc-agent-action');
    const detailEl = shadowRoot.querySelector('.wc-agent-action-detail');
    const targetEl = shadowRoot.querySelector('.wc-agent-action-target');

    const actionLabels = {
      click: '👆 Click',
      type: '⌨️ Escribir',
      focus: '🎯 Focus',
      hover: '🖱️ Hover',
      select: '📋 Seleccionar',
      check: '☑️ Marcar'
    };

    let detail = actionLabels[action.type] || action.type;
    if (action.value) detail += `: "${action.value}"`;

    detailEl.textContent = detail;
    targetEl.textContent = action.elementInfo?.text || action.elementId;
    actionEl.classList.add('visible');

    const domEl = DOMInspector.getDOMElementById(action.elementId);
    if (domEl) DOMInspector.highlightSelected(domEl);
  }

  function hideActionProposal() {
    const actionEl = shadowRoot.querySelector('.wc-agent-action');
    if (actionEl) actionEl.classList.remove('visible');
    DOMInspector.clearHighlight();
  }

  function saveApiKey(key) {
    try { localStorage.setItem(STORAGE_KEY, btoa(key)); } catch (e) { console.warn('No se pudo guardar la API key'); }
  }

  function loadApiKey() {
    try {
      const encoded = localStorage.getItem(STORAGE_KEY);
      if (encoded) {
        const key = atob(encoded);
        Agent.setApiKey(key);
      }
    } catch (e) { console.warn('No se pudo cargar la API key'); }
  }

  // ============ VOICE ============

  let voiceCurrentMsgEl = null;
  let voiceCurrentMsgType = null;

  async function startVoice() {
    if (typeof VoiceAgent === 'undefined') {
      setState('idle');
      return;
    }
    if (VoiceAgent.isActive()) return;

    if (!Agent.isConfigured()) {
      showResponse('Configura tu API key primero', 'error');
      setState('settings');
      return;
    }

    try {
      const encoded = localStorage.getItem(STORAGE_KEY);
      if (!encoded) throw new Error('API key no encontrada');
      const key = atob(encoded);

      const caption = shadowRoot.querySelector('.wc-caption');
      if (caption) caption.textContent = 'Conectando...';

      const transcript = shadowRoot.querySelector('.wc-voice-transcript');
      if (transcript) transcript.innerHTML = '';
      voiceCurrentMsgEl = null;
      voiceCurrentMsgType = null;

      await VoiceAgent.start(key);
    } catch (err) {
      setState('idle');
      showResponse('Error al iniciar voz: ' + err.message, 'error');
    }
  }

  function stopVoice() {
    if (typeof VoiceAgent !== 'undefined' && VoiceAgent.isActive()) {
      VoiceAgent.stop();
    }
  }

  function attachVoiceEvents() {
    if (typeof VoiceAgent === 'undefined') return;

    VoiceAgent.setCallbacks({
      onStatus: (status, message) => {
        const caption = shadowRoot.querySelector('.wc-caption');
        if (caption) caption.textContent = message;
        if (status === 'idle' || status === 'disconnected') {
          if (currentState === 'listening') setState('idle');
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
        if (currentState === 'listening') setState('idle');
      }
    });
  }

  function appendVoiceTranscript(type, text) {
    if (voiceCurrentMsgType === type && voiceCurrentMsgEl) {
      voiceCurrentMsgEl.textContent += text;
    } else {
      voiceCurrentMsgEl = addVoiceMessage(type, text);
      voiceCurrentMsgType = type;
    }
    const transcript = shadowRoot.querySelector('.wc-voice-transcript');
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }

  function addVoiceMessage(type, text) {
    const transcript = shadowRoot.querySelector('.wc-voice-transcript');
    if (!transcript) return null;
    const msg = document.createElement('div');
    msg.className = `wc-voice-msg ${type}`;
    msg.textContent = text;
    transcript.appendChild(msg);
    transcript.scrollTop = transcript.scrollHeight;
    return msg;
  }

  // ============ PUBLIC API ============

  return {
    init: init,
    render: render,
    destroy: destroy,
    startAutoRefresh: startAutoRefresh,
    stopAutoRefresh: stopAutoRefresh,
    isMinimized: function() { return currentState === 'idle'; },
    toggleSelectionMode: toggleSelectionMode,
    isSelectionMode: function() { return selectionMode; },
    expandElementInWidget: expandElementInWidget,
    setMode: function(mode) { setState(mode === 'manual' ? 'manual' : 'idle'); },
    getMode: function() { return currentState === 'manual' ? 'manual' : 'ia'; }
  };
})();

window.Widget = Widget;
