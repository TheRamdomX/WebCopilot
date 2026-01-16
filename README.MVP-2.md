# MVP 2 — Selección y Referenciación de Elementos

## Objetivo

Extender el MVP 1 con la capacidad de **seleccionar elementos reales** de la página y asignarles **referencias internas estables**, permitiendo vincular la representación semántica con la interfaz visible.

Este MVP establece el concepto de **"elemento direccionable"**, base para cualquier acción futura del agente.

---

## Arquitectura

```
extension/
├── manifest.json          # v2.0.0
└── content/
    ├── dom-inspector.js   # + highlightElement, referencias estables
    ├── widget.js          # + modo selección, panel seleccionados
    └── content.js         # + MutationObserver
```

---

## Qué Valida

| Capacidad | Validación |
|-----------|------------|
| Correspondencia UI ↔ modelo | El elemento seleccionado coincide con su representación |
| Referencias estables | El identificador sobrevive recargas parciales |
| Páginas dinámicas | MutationObserver detecta cambios en SPAs |
| No interferencia | El sitio sigue funcionando normalmente |

---

## Próximo: MVP 3

El MVP 3 usará las referencias estables para **ejecutar acciones**:
- `click(ref)`
- `type(ref, text)`
- `focus(ref)`
- `scroll(ref)`
