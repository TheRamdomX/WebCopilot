/**
 * Console Bridge - Content Script
 * Comunicación entre page script y WebCopilot API
 */
(function() {
  'use strict';

  const VERSION = '5.0.0';
  const BRIDGE_ID = 'wc-' + Math.random().toString(36).slice(2);

  const handlers = {
    elements: (filter) => {
      filter = filter || {};
      let elements = window.WebCopilot.getElements();
      if (filter.type) elements = elements.filter(el => el.type === filter.type);
      if (filter.tag) elements = elements.filter(el => el.tag === filter.tag);
      if (filter.text) {
        const lt = filter.text.toLowerCase();
        elements = elements.filter(el => el.text && el.text.toLowerCase().includes(lt));
      }
      return elements.map(el => ({
        id: el.id, ref: el.reference, type: el.type,
        text: (el.text || '').slice(0, 50), tag: el.tag,
        position: Math.round(el.position.top) + 'x' + Math.round(el.position.left)
      }));
    },

    find: (query) => {
      const elements = window.WebCopilot.getElements();
      query = String(query);
      if (query.startsWith('wc-el-')) return elements.find(el => el.id === query) || null;
      if (/^\d+$/.test(query)) return elements.find(el => el.reference === parseInt(query)) || null;
      const lq = query.toLowerCase();
      return elements.find(el => 
        (el.text && el.text.toLowerCase().includes(lq)) ||
        (el.id && el.id.toLowerCase().includes(lq))
      ) || null;
    },

    inspect: (ref) => {
      const el = handlers.find(ref);
      if (!el) return { error: 'No encontrado' };
      const domEl = window.WebCopilot.getDOMElement(el.id);
      const attrs = {};
      if (domEl) Array.from(domEl.attributes).forEach(a => attrs[a.name] = a.value);
      return { webcopilot: el, domAvailable: !!domEl, attributes: attrs };
    },

    click: async (ref) => {
      const el = handlers.find(ref);
      return el ? await window.WebCopilot.click(el.reference) : { success: false, error: 'No encontrado' };
    },

    type: async (ref, text, options) => {
      const el = handlers.find(ref);
      return el ? await window.WebCopilot.type(el.reference, text, options || {}) : { success: false, error: 'No encontrado' };
    },

    focus: async (ref) => {
      const el = handlers.find(ref);
      return el ? await window.WebCopilot.focus(el.reference) : { success: false, error: 'No encontrado' };
    },

    hover: async (ref) => {
      const el = handlers.find(ref);
      return el ? await window.WebCopilot.hover(el.reference) : { success: false, error: 'No encontrado' };
    },

    select: async (ref, value) => {
      const el = handlers.find(ref);
      return el ? await window.WebCopilot.select(el.reference, value) : { success: false, error: 'No encontrado' };
    },

    check: async (ref, checked) => {
      const el = handlers.find(ref);
      return el ? await window.WebCopilot.check(el.reference, checked !== false) : { success: false, error: 'No encontrado' };
    },

    do: async (instruction) => {
      if (!window.WebCopilot.agent.isConfigured()) return { success: false, error: 'API key no configurada' };
      return await window.WebCopilot.agent.process(instruction);
    },

    confirm: () => window.WebCopilot.agent.confirm(),
    cancel: () => { window.WebCopilot.agent.cancel(); return { success: true }; },

    'memory.show': () => window.WebCopilot.memory.getSiteKnowledge(),
    'memory.stats': () => window.WebCopilot.memory.getStats(),
    'memory.clear': async () => { await window.WebCopilot.memory.clearSiteMemory(); return { success: true }; },

    scan: () => { window.WebCopilot.refresh(true); return { success: true, count: window.WebCopilot.getElements().length }; },
    summary: () => window.WebCopilot.getSummary(),
    status: () => ({
      version: VERSION, elements: window.WebCopilot.getElements().length,
      apiConfigured: window.WebCopilot.agent.isConfigured(), domain: location.hostname
    }),

    'debug.dom': () => {
      const elements = window.WebCopilot.getElements();
      const byType = {};
      elements.forEach(el => byType[el.type] = (byType[el.type] || 0) + 1);
      return { stats: window.WebCopilot.getStats(), summary: window.WebCopilot.getSummary(), byType };
    },

    'debug.benchmark': (n) => {
      n = n || 5;
      const times = [];
      for (let i = 0; i < n; i++) {
        const start = performance.now();
        window.WebCopilot.refresh(true);
        times.push(performance.now() - start);
      }
      return { avg: (times.reduce((a,b)=>a+b,0)/n).toFixed(2), min: Math.min(...times).toFixed(2), max: Math.max(...times).toFixed(2) };
    },

    export: () => ({
      timestamp: new Date().toISOString(), url: location.href, domain: location.hostname,
      elements: window.WebCopilot.getElements(), summary: window.WebCopilot.getSummary()
    }),

    highlight: (ref, duration) => {
      const el = handlers.find(ref);
      if (!el) return { success: false, error: 'No encontrado' };
      const domEl = window.WebCopilot.getDOMElement(el.id);
      if (!domEl) return { success: false, error: 'DOM no disponible' };
      const overlay = document.createElement('div');
      const rect = domEl.getBoundingClientRect();
      overlay.style.cssText = `position:fixed;pointer-events:none;background:rgba(139,92,246,0.3);border:2px solid #8b5cf6;border-radius:4px;z-index:999999;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px`;
      document.body.appendChild(overlay);
      domEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => overlay.remove(), duration || 2000);
      return { success: true };
    }
  };

  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || event.data.type !== 'WC_BRIDGE_REQUEST' || event.data.bridgeId !== BRIDGE_ID) return;
    const { id, command, args } = event.data;
    try {
      const handler = handlers[command];
      if (!handler) throw new Error('Comando desconocido');
      const result = await handler.apply(null, args || []);
      window.postMessage({ type: 'WC_BRIDGE_RESPONSE', bridgeId: BRIDGE_ID, id, success: true, result }, '*');
    } catch (error) {
      window.postMessage({ type: 'WC_BRIDGE_RESPONSE', bridgeId: BRIDGE_ID, id, success: false, error: error.message }, '*');
    }
  });

  function init() {
    if (!window.WebCopilot) return setTimeout(init, 100);
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/page-bridge.js');
    script.dataset.bridgeId = BRIDGE_ID;
    script.dataset.version = VERSION;
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }
  init();
})();
