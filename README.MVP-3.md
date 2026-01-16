# MVP 3 — Ejecución de Acciones

## Objetivo

Extender el MVP 2 con la capacidad de **ejecutar acciones** sobre los elementos detectados, permitiendo interactuar programáticamente con la página web.

Este MVP establece el concepto de **"acción ejecutable"**, base para la automatización.

---

## Arquitectura

```text
extension/
├── manifest.json          # v3.2.2
└── content/
    ├── dom-inspector.js   # Escaneo y referencias
    ├── actions.js         # 🆕 Ejecución de acciones
    ├── widget.js          # UI con popup de acciones
    └── content.js         # Orquestación
```

---

## Nueva Funcionalidad: Popup de Acciones

Al hacer **click en un elemento** en el widget, aparece un **popup flotante** con:

- Información del elemento (tipo, texto)
- Botones de acción disponibles según el tipo de elemento
- Campo de texto (para inputs)
- Selector de opciones (para dropdowns)
- Feedback visual del resultado

### Acciones en el Popup

| Botón | Acción | Disponible en |
|-------|--------|---------------|
| 👆 Click | Hace clic | Todos |
| ⌨️ Escribir | Escribe texto | Inputs, textareas, contenteditable |
| 🎯 Focus | Da focus | Todos |
| 📜 Scroll | Scroll al elemento | Todos |
| 🖱️ Hover | Simula hover | Todos |
| 📋 Seleccionar | Selecciona opción | Dropdowns (<select>) |
| ☑️/☐ Marcar | Toggle checkbox | Checkboxes, radios |

---

## API v3.0

```javascript
window.WebCopilot = {
  // === Scan (MVP 1) ===
  refresh(force),
  rescan(),
  
  // === Data (MVP 1) ===
  getElements(),
  getSummary(),
  getStats(),
  
  // === Selection (MVP 2) ===
  toggleSelectionMode(),
  getSelectedElements(),
  clearSelection(),
  
  // === References (MVP 2) ===
  getElementByReference(ref),
  isElementValid(id),
  getDOMElement(id),
  
  // === Actions (MVP 3) 🆕 ===
  click(ref),
  type(ref, text, options?),
  focus(ref),
  scroll(ref, options?),
  hover(ref),
  select(ref, value),
  check(ref, checked?),
  pressKey(ref?, key, modifiers?),
  sequence(actionList),
  
  // === Debug ===
  logStats(),
  
  version: '3.0.0'
}
```

---

## Características

### Auto-scroll
Todas las acciones hacen scroll automático al elemento si no está visible.

### Feedback visual
Las acciones muestran highlight en el elemento mientras se ejecutan.

### Eventos realistas
Las acciones disparan secuencias completas de eventos:
- `click()`: mouseenter → mouseover → mousedown → focus → mouseup → click
- `type()`: keydown → input → keyup (por cada caracter)
- `hover()`: mouseenter → mouseover → mousemove

---

## Ejemplos de Uso

### Login automático
```javascript
await WebCopilot.sequence([
  { action: 'type', args: ['wc-el-1', 'admin'] },
  { action: 'type', args: ['wc-el-2', 'secret'] },
  { action: 'click', args: ['wc-el-3'] }
]);
```

### Búsqueda
```javascript
await WebCopilot.type('wc-el-5', 'JavaScript');
await WebCopilot.pressKey('wc-el-5', 'Enter');
```

### Formulario con selects
```javascript
await WebCopilot.type('wc-el-1', 'Juan Pérez');
await WebCopilot.select('wc-el-2', 'Chile');
await WebCopilot.check('wc-el-3', true);
await WebCopilot.click('wc-el-4');
```

---

## Próximo: MVP 4

El MVP 4 agregará **comunicación con backend** para:
- Recibir comandos del agente LLM
- Enviar resultados de acciones
- Streaming de cambios en el DOM
