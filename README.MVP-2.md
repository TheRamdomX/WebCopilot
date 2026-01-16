# MVP 2 — Selección y Referenciación de Elementos

## Objetivo

Extender el MVP 1 con la capacidad de **seleccionar elementos reales** de la página y asignarles **referencias internas estables**, permitiendo vincular la representación semántica con la interfaz visible.

Este MVP establece el concepto de **"elemento direccionable"**, base para cualquier acción futura del agente.

---

## v2.1 - Mejoras de Escaneo

### Estabilidad del DOM
- **No escanea en DOMContentLoaded** - espera estabilidad real
- DOM "estable" = 400ms sin mutaciones relevantes
- Re-escaneo automático tras cambios de ruta

### Traversal con Shadow DOM
```javascript
function* walkDOM(root) {
  // Recorre document + shadowRoot de cada nodo
}
```
- Entra en Shadow DOM abiertos
- Recolecta elementos en light y shadow DOM

### Detección de Routing SPA
- Intercepta `history.pushState` / `replaceState`
- Escucha `popstate` (back/forward)
- Invalida cache y re-escanea tras cambio de ruta

### Visibilidad Efectiva
```javascript
function isEffectivelyVisible(el) {
  // offsetParent !== null
  // getClientRects().length > 0
  // pointer-events !== 'none'
  // En viewport
}
```

### Interactividad Relajada
**Siempre interactivo:**
- `<a href>` → NAVIGATION
- `<button>` → ACTION
- `<input>`, `<select>`, `<textarea>` → INPUT
- `tabIndex >= 0` → INTERACTIVE

**ARIA como señal adicional, no requisito.**

### Tipos Semánticos
| Tipo | Elementos |
|------|-----------|
| `navigation` | `<a href>`, `role="link"` |
| `action` | `<button>`, toggles, tabs |
| `input` | campos editables |
| `select` | dropdowns |
| `interactive` | otros focusables |

### Texto Accesible (prioridad)
1. `innerText.trim()`
2. `aria-label`
3. `aria-labelledby`
4. `title`
5. `alt` de img/SVG
6. `placeholder`
7. `value`
8. `[icon]` si solo tiene SVG

### Logging de Debug
```javascript
WebCopilot.logStats()
// 🔍 WebCopilot Scan Stats
// Total: 45 elementos
// Por tipo: { navigation: 20, action: 15, input: 10 }
// Por tag: { a: 20, button: 12, input: 10, div: 3 }
```

---

## Arquitectura

```
extension/
├── manifest.json          # v2.1.0
└── content/
    ├── dom-inspector.js   # Shadow DOM, visibilidad efectiva, tipos semánticos
    ├── widget.js          # modo selección, panel seleccionados
    └── content.js         # estabilidad DOM, routing SPA
```

---

## API v2.1

```javascript
window.WebCopilot = {
  // Scan
  refresh(force),
  rescan(),              // invalida cache + re-escanea
  
  // Data
  getElements(),
  getSummary(),
  getStats(),            // estadísticas último scan
  
  // Selection
  toggleSelectionMode(),
  getSelectedElements(),
  clearSelection(),
  
  // References
  getElementByReference(ref),
  isElementValid(id),
  getDOMElement(id),
  
  // Debug
  logStats(),
  
  version: '2.1.0'
}
```

---

## Próximo: MVP 3

El MVP 3 usará las referencias estables para **ejecutar acciones**:
- `click(ref)`
- `type(ref, text)`
- `focus(ref)`
- `scroll(ref)`
