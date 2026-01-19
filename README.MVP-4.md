# MVP 4 — Agente de Navegación con Lenguaje Natural

## Objetivo

Incorporar un agente basado en LLM (Gemini) capaz de interpretar instrucciones en lenguaje natural y traducirlas en acciones ejecutables a través del sistema.

El agente **propone** acciones; el usuario **confirma** y el sistema **ejecuta**.

---

## Arquitectura

```text
extension/
├── manifest.json          # v4.0.0 + host_permissions
└── content/
    ├── dom-inspector.js   # Escaneo y referencias
    ├── actions.js         # Ejecución de acciones
    ├── agent.js           # 🆕 Agente LLM
    ├── widget.js          # UI con interfaz conversacional
    └── content.js         # Orquestación
```

---

## Interfaz Conversacional

El widget incluye una sección de **Agente IA** con:

- Campo de texto para instrucciones en lenguaje natural
- Indicador de estado (Listo, Pensando, Propuesto, Error)
- Panel de configuración para API key
- Vista previa de acción propuesta
- Botones de confirmar/cancelar

### Flujo de Interacción

1. Usuario escribe: *"Haz click en iniciar sesión"*
2. Agente analiza elementos disponibles
3. Propone: **Click en "Iniciar sesión"**
4. Usuario confirma → Acción se ejecuta
5. Feedback visual del resultado

---

## Modelo de Contexto

El agente recibe **solo** información estructurada:

```javascript
{
  id: "wc-el-5",
  type: "button",
  text: "Iniciar sesión",
  tag: "button",
  reference: "button[Iniciar sesión]",
  inputType: null,
  isDisabled: false
}
```

**NO** se envía:
- HTML completo
- Información sensible
- Cookies o tokens
- Contenido de inputs

---

## API v4.0

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
  
  // === Actions (MVP 3) ===
  click(ref),
  type(ref, text, options?),
  focus(ref),
  scroll(ref, options?),
  hover(ref),
  select(ref, value),
  check(ref, checked?),
  pressKey(ref?, key, modifiers?),
  sequence(actionList),

  // === Agent (MVP 4) 🆕 ===
  agent: {
    process(instruction),
    confirm(action),
    cancel(),
    isConfigured(),
    isProcessing()
  },
  
  version: '4.0.0'
}
```

---

## Configuración

### API Key de Gemini

1. Obtener key en [Google AI Studio](https://aistudio.google.com/apikey)
2. Click en ⚙️ en la sección del agente
3. Pegar la API key
4. Click en "Guardar"

**La key se almacena localmente** (localStorage) codificada en base64.

---

## Ejemplos de Uso

### Desde la interfaz

```
"Escribe mi correo en el campo email"
→ Acción: type en input[Email] con valor solicitado

"Selecciona Chile en el país"
→ Acción: select en select[País] valor "Chile"

"Marca el checkbox de términos"
→ Acción: check en checkbox[Acepto términos]
```

### Desde consola

```javascript
// Procesar instrucción
const result = await WebCopilot.agent.process("click en buscar");

// Si requiere confirmación
if (result.requiresConfirmation) {
  await WebCopilot.agent.confirm(result.action);
}
```

---

## Validaciones de Seguridad

1. **Elemento existe**: Solo actúa sobre elementos detectados
2. **Elemento habilitado**: No actúa sobre elementos disabled
3. **Acción válida**: Solo acciones del catálogo (click, type, etc.)
4. **Confirmación**: Usuario debe confirmar antes de ejecutar
5. **Sin ambigüedad**: Si hay duda, pide aclaración

---

## Manejo de Errores

| Situación | Comportamiento |
|-----------|----------------|
| Instrucción ambigua | Pide aclaración |
| Elemento no encontrado | Indica que no está disponible |
| API key inválida | Muestra error de configuración |

---

## Limitaciones (por diseño)

- ❌ No encadena múltiples acciones automáticamente
- ❌ No navega entre páginas
- ❌ No tiene memoria entre sesiones
- ❌ No ejecuta sin confirmación del usuario
- ❌ No accede a información sensible

---

## Próximo: MVP 5

El MVP 5 agregará:
- Memoria de patrones exitosos
- Conocimiento específico por sitio
- Sugerencias basadas en historial
