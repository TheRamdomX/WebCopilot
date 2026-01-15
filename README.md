# WebCopilot

**Agente de navegador autónomo que observa, comprende y actúa sobre páginas web.**

WebCopilot es una extensión de navegador que evoluciona desde un simple inspector de DOM hasta un agente inteligente capaz de ejecutar tareas complejas en cualquier sitio web mediante lenguaje natural.

---

## Visión

Crear un copiloto de navegación que:
- **Observe** cualquier página web y extraiga su estructura semántica
- **Comprenda** intenciones del usuario en lenguaje natural
- **Actúe** de forma autónoma ejecutando tareas en el navegador
- **Aprenda** patrones de cada sitio para mejorar con el uso

---

## Roadmap de MVPs

### MVP 1 — Observación del DOM ✅
> *Rol: VER*

**Qué hace**
- Lee el DOM de la página activa
- Identifica elementos interactivos visibles
- Presenta una representación estructurada en widget sobrepuesto

**Qué valida**
- Inyección estable de widget
- Lectura confiable del DOM en sitios arbitrarios
- Abstracción semántica del HTML

---

### MVP 2 — Selección y referencia de elementos
> *Rol: IDENTIFICAR*

**Qué hace**
- Permite seleccionar elementos del DOM (click o hover)
- Asocia elementos a identificadores estables
- Resalta visualmente la correspondencia widget ↔ página

**Qué valida**
- Correspondencia entre UI real y modelo interno
- Referenciabilidad de elementos (base para acciones)
- Manejo de páginas dinámicas (SPAs, contenido lazy)

---

### MVP 3 — Ejecutor de acciones básicas
> *Rol: ACTUAR*

**Qué hace**
- Ejecuta acciones simples desde instrucciones estructuradas
- Soporta: click, focus, escritura en inputs, scroll
- Reporta resultado de cada acción

**Qué valida**
- Capacidad del navegador como "manos" del agente
- Seguridad y reversibilidad de acciones
- Robustez frente a cambios de estado

---

### MVP 4 — Agente con lenguaje natural (LLM)
> *Rol: ENTENDER*

**Qué hace**
- Traduce lenguaje natural en acciones estructuradas
- Ejecuta secuencias de pasos para completar tareas
- Interpreta el estado de la página para decidir siguiente acción

**Qué valida**
- Traducción intención → acción
- Control del LLM mediante esquemas estrictos
- Flujo percepción–razonamiento–acción

---

### MVP 5 — Memoria y modelo por sitio
> *Rol: APRENDER*

**Qué hace**
- Aprende estructura y patrones de cada sitio
- Almacena relaciones entre elementos, acciones y resultados
- Mejora velocidad y precisión en visitas futuras

**Qué valida**
- Persistencia de conocimiento
- Reducción de dependencia del DOM en bruto
- Navegación más estable y eficiente

---

## Resumen

| MVP | Rol | Capacidad | Riesgo que reduce |
|-----|-----|-----------|-------------------|
| 1 | Ver | Observar DOM | Acceso y abstracción |
| 2 | Identificar | Seleccionar elementos | Referencias estables |
| 3 | Actuar | Ejecutar acciones | Control del navegador |
| 4 | Entender | Interpretar intención | Comunicación humana |
| 5 | Aprender | Recordar patrones | Escalabilidad y UX |

---

## Stack Técnico

- **Plataforma**: Chrome Extension (Manifest V3)
- **Inyección**: Content Scripts + Shadow DOM
- **Aislamiento**: Widget sin colisión de estilos
- **LLM** (MVP4+): API externa con esquemas JSON estrictos
- **Storage** (MVP5): IndexedDB para persistencia local

---

## Instalación (Desarrollo)

```bash
# Clonar repositorio
git clone https://github.com/user/WebCopilot.git
cd WebCopilot

# Cargar en Chrome
# 1. Abrir chrome://extensions/
# 2. Activar "Modo desarrollador"
# 3. Click "Cargar descomprimida"
# 4. Seleccionar carpeta extension/
```

---

## Estructura del Proyecto

```
WebCopilot/
├── extension/
│   ├── manifest.json
│   ├── content/
│   │   ├── dom-inspector.js    # Lectura del DOM
│   │   ├── widget.js           # UI flotante
│   │   └── content.js          # Coordinador
│   └── icons/
└── README.md
```
