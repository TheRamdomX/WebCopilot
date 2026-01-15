# WebCopilot - DOM Inspector

Extensión Chrome MV3 que inspecciona el DOM y muestra elementos interactivos en un widget flotante.

## Instalación

1. Abrir `chrome://extensions/`
2. Activar **Modo desarrollador**
3. Click en **Cargar descomprimida**
4. Seleccionar carpeta `extension/`

## Uso

- Widget aparece automáticamente en cualquier página
- Auto-refresh cada 1 segundo (pausable al minimizar)
- Arrastrable y minimizable

## Elementos Detectados

`button` `a[href]` `input` `select` `textarea` + roles ARIA + `onclick` + `tabindex`

## Estructura

```
extension/
├── manifest.json
└── content/
    ├── content.js
    ├── dom-inspector.js
    └── widget.js
```

## API Debug

```javascript
WebCopilot.refresh(true)   // Forzar actualización
WebCopilot.getElements()   // Elementos actuales
WebCopilot.getSummary()    // Resumen
WebCopilot.getRegistry()   // Registro con fingerprints
```

## Características

- Shadow DOM aislado
- Actualización incremental (solo cambios)
- Fingerprinting para tracking estable
- Animaciones de entrada/salida
