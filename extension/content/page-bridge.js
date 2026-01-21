/**
 * Page Bridge - Expone $wc en el contexto de la página
 */
(function() {
  'use strict';

  const BRIDGE_ID = document.currentScript.dataset.bridgeId;
  const VERSION = document.currentScript.dataset.version;
  if (!BRIDGE_ID) return;

  const pending = new Map();
  let reqId = 0;

  function call(cmd) {
    const args = Array.prototype.slice.call(arguments, 1);
    return new Promise((resolve, reject) => {
      const id = ++reqId;
      pending.set(id, { resolve, reject });
      window.postMessage({ type: 'WC_BRIDGE_REQUEST', bridgeId: BRIDGE_ID, id, command: cmd, args }, '*');
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('Timeout')); } }, 30000);
    });
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.type !== 'WC_BRIDGE_RESPONSE' || e.data.bridgeId !== BRIDGE_ID) return;
    const p = pending.get(e.data.id);
    if (p) { pending.delete(e.data.id); e.data.success ? p.resolve(e.data.result) : p.reject(new Error(e.data.error)); }
  });

  const C = { i: '#3b82f6', s: '#22c55e', e: '#ef4444', h: '#8b5cf6', m: '#6b7280' };
  const log = (m, c) => console.log('%c[WC]%c ' + m, 'color:' + C.h + ';font-weight:bold', 'color:' + (c || C.i));
  const table = (d, t) => { if (t) console.log('%c' + t, 'color:' + C.h + ';font-weight:bold'); console.table(d); };

  window.$wc = window.WebCopilotBridge = {
    version: VERSION,
    help: function() {
      console.log('%c WebCopilot Console Bridge v' + VERSION + ' %c\n\n' +
        'NAVEGACIÓN: elements() find() inspect() highlight()\n' +
        'ACCIONES: click() type() focus() hover() select() check()\n' +
        'AGENTE: do() confirm() cancel()\n' +
        'MEMORIA: memory.show() .stats() .clear()\n' +
        'DEBUG: debug.dom() .benchmark()\n' +
        'UTILS: scan() summary() export() status()\n',
        'background:#8b5cf6;color:white;padding:4px 8px;border-radius:4px', 'color:inherit');
      return this;
    },
    elements: (f) => call('elements', f || {}).then(r => { table(r, r.length + ' elementos'); return r; }),
    find: (q) => call('find', q).then(r => { r ? console.dir(r) : log('No encontrado', C.e); return r; }),
    inspect: (r) => call('inspect', r).then(r => { console.dir(r); return r; }),
    highlight: (r, d) => call('highlight', r, d || 2000),
    click: (r) => call('click', r).then(r => { log(r.success ? '✓ Click' : '✗ ' + r.error, r.success ? C.s : C.e); return r; }),
    type: (r, t, o) => call('type', r, t, o || {}).then(r => { log(r.success ? '✓ Escrito' : '✗ ' + r.error, r.success ? C.s : C.e); return r; }),
    focus: (r) => call('focus', r),
    hover: (r) => call('hover', r),
    select: (r, v) => call('select', r, v),
    check: (r, c) => call('check', r, c !== false),
    do: (i) => { log('Procesando...'); return call('do', i).then(r => { console.dir(r); if (r.action) log('Usa $wc.confirm() o cancel()'); return r; }); },
    confirm: () => call('confirm').then(r => { log(r.success ? '✓ Ejecutado' : '✗ ' + r.error, r.success ? C.s : C.e); return r; }),
    cancel: function() { call('cancel'); log('Cancelado', C.s); return this; },
    memory: {
      show: () => call('memory.show').then(r => { console.dir(r); return r; }),
      stats: () => call('memory.stats').then(r => { console.dir(r); return r; }),
      clear: () => call('memory.clear').then(() => { log('Memoria borrada', C.s); })
    },
    debug: {
      dom: () => call('debug.dom').then(r => { console.dir(r); return r; }),
      benchmark: (n) => call('debug.benchmark', n || 5).then(r => { console.dir(r); return r; })
    },
    scan: function() { call('scan').then(r => log(r.count + ' elementos', C.s)); return this; },
    summary: () => call('summary').then(r => { console.dir(r); return r; }),
    export: () => call('export').then(r => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }));
      a.download = 'webcopilot-' + location.hostname + '.json';
      a.click();
      return r;
    }),
    status: () => call('status').then(r => { log('v' + r.version + ' | ' + r.elements + ' elem | API: ' + (r.apiConfigured ? '✓' : '✗')); return r; })
  };

  console.log('%c🤖 $wc.help()%c para comandos', 'color:#8b5cf6;font-weight:bold', 'color:#6b7280');
})();
