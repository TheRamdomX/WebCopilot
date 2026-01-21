# MVP 5 — Memoria y Modelo de Conocimiento por Sitio

## Objetivo

Incorporar memoria persistente y conocimiento estructurado por sitio web, permitiendo que el agente reconozca patrones, reutilice referencias y optimice decisiones en interacciones futuras.

El agente **consume** contexto histórico; el orquestador **decide** qué se aprende.

---

## Arquitectura

```text
extension/
├── manifest.json          # v5.0.0
└── content/
    ├── dom-inspector.js   # Escaneo y referencias
    ├── actions.js         # Ejecución de acciones
    ├── agent.js           # Agente LLM (consume memoria)
    ├── widget.js          # UI con interfaz conversacional
    ├── content.js         # Orquestación (único que escribe)
    ├── console-bridge.js  # 🆕 Bridge content script ↔ page
    ├── page-bridge.js     # 🆕 Expone $wc en consola
    └── memory/            # 🆕 Sistema de memoria
        ├── db.js          # IndexedDB wrapper
        ├── sites.js       # Conocimiento por dominio
        ├── elements.js    # Elementos semánticos
        └── patterns.js    # Intenciones y acciones
```

---

## Modelo de Datos

### Base de datos: `web_copilot`

#### Sites (por dominio)

```javascript
{
  id: "github.com",           // keyPath
  lastVisited: 1704800000
}
```

#### Elements (referencias semánticas)

```javascript
{
  id: "el_abc123",            // keyPath
  siteId: "github.com",       // index
  role: "button",
  semanticHint: "login",
  descriptors: ["Iniciar sesión", "Sign in"],
  confidence: 0.8,
  lastSeen: 1704800100
}
```

#### Patterns (intención → referencias)

```javascript
{
  id: "pat_login",            // keyPath
  siteId: "github.com",       // index
  intent: "login",            // index
  elementIds: ["el_abc123"],
  successCount: 3,
  failCount: 0
}
```

---

## Principios de Diseño

### Separación de responsabilidades

| Componente | Lee memoria | Escribe memoria |
|------------|:-----------:|:---------------:|
| agent.js | ✓ (contexto) | ✗ |
| actions.js | ✗ | ✗ |
| widget.js | ✗ | ✗ |
| content.js | ✓ | ✓ |

### Aislamiento por dominio

- Cada sitio tiene su propio espacio de memoria
- No se comparten datos entre dominios
- El `siteId` es siempre `location.hostname`

### Referencias semánticas (no selectores)

```javascript
// ❌ NO guardar
{ selector: "#login-btn-v2-new" }

// ✓ SÍ guardar
{ 
  role: "button",
  semanticHint: "login",
  descriptors: ["Iniciar sesión", "Log in"]
}
```

---

## API v5.0

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

  // === Agent (MVP 4) ===
  agent: {
    process(instruction),
    confirm(action),
    cancel(),
    isConfigured(),
    isProcessing()

  // === Memory (MVP 5) 🆕 ===
  memory: {
    getSiteKnowledge(),      // Elementos y patrones del sitio actual
    clearSiteMemory(),       // Borrar memoria del sitio actual
    getStats(),              // Estadísticas de memoria
    invalidateElement(id),   // Marcar elemento como obsoleto
  },
  
  version: '5.0.0'
}
```

---

## Gestión de Obsolescencia

### Detección automática

Cuando un elemento conocido no se encuentra en el DOM actual:

1. Se marca `confidence -= 0.2`
2. Si `confidence < 0.3`, se invalida
3. Se notifica al usuario para reentrenamiento

### Invalidación manual

```javascript
WebCopilot.memory.invalidateElement("el_abc123");
```

---

## Casos de Uso

### Usuario recurrente

```
Primera visita a github.com:
1. Usuario: "click en iniciar sesión"
2. Agente busca en DOM → encuentra botón
3. Usuario confirma → éxito
4. Sistema aprende: intent="login" → element="Sign in button"


Segunda visita:
1. Usuario: "login"
2. Agente consulta memoria → conoce el patrón
3. Prioriza el elemento conocido
4. Resolución más rápida y confiable
```

### Sitio actualizado

```
El botón cambió de "Sign in" a "Log in":
1. Referencia semántica incluye ambos descriptores
2. Sistema encuentra por similitud semántica
3. Actualiza descriptores automáticamente
```

---

## Console Bridge (Acceso desde Consola)

### Introducción

El Console Bridge proporciona una interfaz para interactuar con WebCopilot desde la consola del navegador. Disponible como `$wc` o `WebCopilotBridge`.

### API

```javascript
// Ayuda
$wc.help()                    // Muestra comandos disponibles

// Navegación de elementos
$wc.elements()                // Lista todos los elementos
$wc.elements({ type: 'button' })  // Filtra por tipo/tag/text
$wc.find('login')             // Busca por texto, id o referencia
$wc.inspect(5)                // Inspección detallada
$wc.highlight(5)              // Resalta elemento en página

// Acciones
$wc.click(5)                  // Click en elemento
$wc.type(3, 'hola')           // Escribir texto
$wc.focus(2)                  // Enfocar elemento
$wc.hover(4)                  // Hover
$wc.select(6, 'opcion')       // Seleccionar en dropdown
$wc.check(7, true)            // Marcar/desmarcar checkbox

// Agente IA
$wc.do('click en iniciar sesión')  // Comando en lenguaje natural
$wc.confirm()                      // Confirmar acción propuesta
$wc.cancel()                       // Cancelar

// Memoria
$wc.memory.show()             // Ver conocimiento del sitio
$wc.memory.stats()            // Estadísticas
$wc.memory.clear()            // Borrar memoria del sitio

// Debug
$wc.debug.dom()               // Análisis DOM y estadísticas
$wc.debug.benchmark(10)       // Medir rendimiento (n iteraciones)

// Utilidades
$wc.scan()                    // Re-escanear página
$wc.summary()                 // Resumen de página
$wc.export()                  // Exportar estado a JSON
$wc.status()                  // Estado general
```

### Ejemplos

```javascript
// Automatización
await $wc.click('login')
await $wc.type('email', 'usuario@ejemplo.com')
await $wc.click('submit')

// Lenguaje natural
await $wc.do('busca el campo de email y escribe test@test.com')
await $wc.confirm()

// Debug
$wc.elements({ type: 'button' })
$wc.debug.benchmark(5)
```

---

## Limitaciones (por diseño)

- ❌ No generaliza entre dominios distintos
- ❌ No toma decisiones autónomas
- ❌ No almacena datos sensibles
- ❌ No sincroniza entre dispositivos

---

## Seguridad

| Aspecto | Implementación |
|---------|----------------|
| Aislamiento | Memoria separada por dominio |
| Privacidad | Solo descriptores semánticos, no contenido |
| Control | Usuario puede borrar memoria por sitio |
| Integridad | Solo el orquestador escribe |
