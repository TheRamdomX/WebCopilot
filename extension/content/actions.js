/**
 * Actions - Ejecución de acciones sobre elementos
 * MVP 3: Click, Type, Focus, Scroll, Hover, Select, Check
 */
const Actions = (function() {
  'use strict';

  // ============ UTILIDADES ============

  function resolveElement(ref) {
    // Si es un elemento DOM directo
    if (ref instanceof Element) return ref;
    
    // Si es un ID (wc-el-X)
    if (typeof ref === 'string' && ref.startsWith('wc-el-')) {
      return DOMInspector.getDOMElementById(ref);
    }
    
    // Si es una referencia semántica
    if (typeof ref === 'string') {
      const data = DOMInspector.getElementByReference(ref);
      return data?.domElement || null;
    }
    
    return null;
  }

  function createResult(action, success, extra = {}) {
    return {
      success,
      action,
      timestamp: Date.now(),
      ...extra
    };
  }

  function isElementInDOM(el) {
    // Verificar si el elemento está conectado al documento
    // Funciona tanto para elementos en el DOM principal como en Shadow DOM
    if (!el) return false;
    
    // isConnected es la forma moderna de verificar
    if (typeof el.isConnected === 'boolean') {
      return el.isConnected;
    }
    
    // Fallback: verificar si está en el documento o en algún shadow root
    let node = el;
    while (node) {
      if (node === document) return true;
      node = node.parentNode || node.host;
    }
    return false;
  }

  function scrollIntoViewIfNeeded(el) {
    const rect = el.getBoundingClientRect();
    const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
    if (!isVisible) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return new Promise(resolve => setTimeout(resolve, 300));
    }
    return Promise.resolve();
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============ EVENTOS SINTÉTICOS ============

  function dispatchMouseEvent(el, type, options = {}) {
    const rect = el.getBoundingClientRect();
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      ...options
    });
    el.dispatchEvent(event);
  }

  function dispatchKeyboardEvent(el, type, key, options = {}) {
    const event = new KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      key: key,
      code: `Key${key.toUpperCase()}`,
      ...options
    });
    (el || document.activeElement || document.body).dispatchEvent(event);
  }

  function dispatchInputEvent(el, inputType = 'insertText', data = '') {
    const event = new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType,
      data
    });
    el.dispatchEvent(event);
  }

  // ============ ACCIONES ============

  /**
   * Click en un elemento
   */
  async function click(ref, options = {}) {
    const el = resolveElement(ref);
    if (!el) {
      return createResult('click', false, { reason: `No se encontró el elemento: ${ref}` });
    }

    if (!isElementInDOM(el)) {
      return createResult('click', false, { reason: 'Elemento no está en el DOM' });
    }

    try {
      // Highlight
      DOMInspector.highlightElement(el);
      
      // Scroll si es necesario
      await scrollIntoViewIfNeeded(el);
      await delay(50);

      // Secuencia de eventos de mouse
      dispatchMouseEvent(el, 'mouseenter');
      dispatchMouseEvent(el, 'mouseover');
      dispatchMouseEvent(el, 'mousedown', { button: 0 });
      
      // Focus
      if (el.focus) el.focus();
      
      dispatchMouseEvent(el, 'mouseup', { button: 0 });
      dispatchMouseEvent(el, 'click', { button: 0 });

      // Limpiar highlight
      setTimeout(() => DOMInspector.clearHighlight(), 300);

      const rect = el.getBoundingClientRect();
      return createResult('click', true, {
        element: el.tagName.toLowerCase(),
        text: el.innerText?.slice(0, 50) || '',
        position: { x: Math.round(rect.left + rect.width/2), y: Math.round(rect.top + rect.height/2) }
      });
    } catch (err) {
      DOMInspector.clearHighlight();
      return createResult('click', false, { reason: err.message });
    }
  }

  /**
   * Escribir texto en un input/textarea/contenteditable
   */
  async function type(ref, text, options = {}) {
    const { clear = true, instant = false, delayMs = 30 } = options;
    
    const el = resolveElement(ref);
    if (!el) {
      return createResult('type', false, { reason: `No se encontró el elemento: ${ref}` });
    }

    // Verificar que sea editable
    const isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
    const isContentEditable = el.isContentEditable;
    
    if (!isInput && !isContentEditable) {
      return createResult('type', false, { reason: 'El elemento no es editable' });
    }

    if (el.disabled || el.readOnly) {
      return createResult('type', false, { reason: 'Elemento está deshabilitado o es solo lectura' });
    }

    try {
      DOMInspector.highlightElement(el);
      await scrollIntoViewIfNeeded(el);
      
      // Focus
      el.focus();
      await delay(50);

      // Limpiar contenido existente
      if (clear) {
        if (isInput) {
          el.value = '';
        } else {
          el.textContent = '';
        }
        dispatchInputEvent(el, 'deleteContentBackward');
      }

      // Escribir texto
      if (instant) {
        // Escritura instantánea
        if (isInput) {
          el.value = text;
        } else {
          el.textContent = text;
        }
        dispatchInputEvent(el, 'insertText', text);
      } else {
        // Escritura caracter por caracter
        for (const char of text) {
          dispatchKeyboardEvent(el, 'keydown', char);
          
          if (isInput) {
            el.value += char;
          } else {
            el.textContent += char;
          }
          
          dispatchInputEvent(el, 'insertText', char);
          dispatchKeyboardEvent(el, 'keyup', char);
          
          await delay(delayMs);
        }
      }

      // Disparar change
      el.dispatchEvent(new Event('change', { bubbles: true }));

      setTimeout(() => DOMInspector.clearHighlight(), 300);

      return createResult('type', true, {
        element: el.tagName.toLowerCase(),
        text: text,
        length: text.length
      });
    } catch (err) {
      DOMInspector.clearHighlight();
      return createResult('type', false, { reason: err.message });
    }
  }

  /**
   * Focus en un elemento
   */
  async function focus(ref) {
    const el = resolveElement(ref);
    if (!el) {
      return createResult('focus', false, { reason: `No se encontró el elemento: ${ref}` });
    }

    try {
      DOMInspector.highlightElement(el);
      await scrollIntoViewIfNeeded(el);
      
      if (el.focus) {
        el.focus();
      }
      
      setTimeout(() => DOMInspector.clearHighlight(), 300);

      return createResult('focus', true, {
        element: el.tagName.toLowerCase(),
        isFocused: document.activeElement === el
      });
    } catch (err) {
      DOMInspector.clearHighlight();
      return createResult('focus', false, { reason: err.message });
    }
  }

  /**
   * Scroll hasta un elemento
   */
  async function scroll(ref, options = {}) {
    const { behavior = 'smooth', block = 'center' } = options;
    
    const el = resolveElement(ref);
    if (!el) {
      return createResult('scroll', false, { reason: `No se encontró el elemento: ${ref}` });
    }

    try {
      DOMInspector.highlightElement(el);
      
      el.scrollIntoView({ behavior, block });
      
      await delay(behavior === 'smooth' ? 500 : 100);
      
      setTimeout(() => DOMInspector.clearHighlight(), 300);

      const rect = el.getBoundingClientRect();
      return createResult('scroll', true, {
        element: el.tagName.toLowerCase(),
        position: { top: Math.round(rect.top), left: Math.round(rect.left) }
      });
    } catch (err) {
      DOMInspector.clearHighlight();
      return createResult('scroll', false, { reason: err.message });
    }
  }

  /**
   * Hover sobre un elemento
   */
  async function hover(ref) {
    const el = resolveElement(ref);
    if (!el) {
      return createResult('hover', false, { reason: `No se encontró el elemento: ${ref}` });
    }

    try {
      DOMInspector.highlightElement(el);
      await scrollIntoViewIfNeeded(el);
      
      dispatchMouseEvent(el, 'mouseenter');
      dispatchMouseEvent(el, 'mouseover');
      dispatchMouseEvent(el, 'mousemove');

      // No limpiar highlight - mantener hover visual
      
      return createResult('hover', true, {
        element: el.tagName.toLowerCase()
      });
    } catch (err) {
      DOMInspector.clearHighlight();
      return createResult('hover', false, { reason: err.message });
    }
  }

  /**
   * Seleccionar opción en un <select>
   */
  async function select(ref, value) {
    const el = resolveElement(ref);
    if (!el) {
      return createResult('select', false, { reason: `No se encontró el elemento: ${ref}` });
    }

    if (el.tagName !== 'SELECT') {
      return createResult('select', false, { reason: 'El elemento no es un <select>' });
    }

    try {
      DOMInspector.highlightElement(el);
      await scrollIntoViewIfNeeded(el);
      el.focus();

      let selectedOption = null;

      // Buscar por valor
      if (typeof value === 'number') {
        // Por índice
        if (el.options[value]) {
          el.selectedIndex = value;
          selectedOption = el.options[value];
        }
      } else {
        // Por valor o texto
        for (const opt of el.options) {
          if (opt.value === value || opt.textContent.trim() === value) {
            el.value = opt.value;
            selectedOption = opt;
            break;
          }
        }
      }

      if (!selectedOption) {
        DOMInspector.clearHighlight();
        return createResult('select', false, { reason: `No se encontró la opción: ${value}` });
      }

      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));

      setTimeout(() => DOMInspector.clearHighlight(), 300);

      return createResult('select', true, {
        element: 'select',
        value: selectedOption.value,
        text: selectedOption.textContent.trim(),
        index: el.selectedIndex
      });
    } catch (err) {
      DOMInspector.clearHighlight();
      return createResult('select', false, { reason: err.message });
    }
  }

  /**
   * Marcar/desmarcar checkbox o radio
   */
  async function check(ref, checked) {
    const el = resolveElement(ref);
    if (!el) {
      return createResult('check', false, { reason: `No se encontró el elemento: ${ref}` });
    }

    const isCheckbox = el.type === 'checkbox';
    const isRadio = el.type === 'radio';
    
    if (!isCheckbox && !isRadio) {
      return createResult('check', false, { reason: 'El elemento no es checkbox ni radio' });
    }

    try {
      DOMInspector.highlightElement(el);
      await scrollIntoViewIfNeeded(el);
      
      // Si no se especifica checked, toggle
      const newState = checked !== undefined ? checked : !el.checked;
      
      // Para radio, solo se puede marcar (no desmarcar)
      if (isRadio && !newState) {
        DOMInspector.clearHighlight();
        return createResult('check', false, { reason: 'No se puede desmarcar un radio button' });
      }

      el.checked = newState;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));

      // Click para activar comportamiento nativo
      dispatchMouseEvent(el, 'click');

      setTimeout(() => DOMInspector.clearHighlight(), 300);

      return createResult('check', true, {
        element: isCheckbox ? 'checkbox' : 'radio',
        checked: el.checked,
        name: el.name || null
      });
    } catch (err) {
      DOMInspector.clearHighlight();
      return createResult('check', false, { reason: err.message });
    }
  }

  /**
   * Presionar una tecla
   */
  async function pressKey(ref, key, modifiers = {}) {
    const el = ref ? resolveElement(ref) : document.activeElement || document.body;
    
    const { ctrl = false, alt = false, shift = false, meta = false } = modifiers;

    try {
      if (ref) {
        DOMInspector.highlightElement(el);
        await scrollIntoViewIfNeeded(el);
        el.focus?.();
      }

      const eventOptions = {
        ctrlKey: ctrl,
        altKey: alt,
        shiftKey: shift,
        metaKey: meta
      };

      dispatchKeyboardEvent(el, 'keydown', key, eventOptions);
      dispatchKeyboardEvent(el, 'keypress', key, eventOptions);
      dispatchKeyboardEvent(el, 'keyup', key, eventOptions);

      if (ref) {
        setTimeout(() => DOMInspector.clearHighlight(), 300);
      }

      return createResult('pressKey', true, {
        key,
        modifiers: { ctrl, alt, shift, meta },
        target: el.tagName?.toLowerCase() || 'document'
      });
    } catch (err) {
      DOMInspector.clearHighlight();
      return createResult('pressKey', false, { reason: err.message });
    }
  }

  /**
   * Ejecutar secuencia de acciones
   */
  async function sequence(actionList) {
    const results = [];
    let allSuccess = true;

    for (const item of actionList) {
      const { action, args = [], delay: actionDelay = 0 } = item;
      
      if (actionDelay > 0) {
        await delay(actionDelay);
      }

      let result;
      switch (action) {
        case 'click':
          result = await click(...args);
          break;
        case 'type':
          result = await type(...args);
          break;
        case 'focus':
          result = await focus(...args);
          break;
        case 'scroll':
          result = await scroll(...args);
          break;
        case 'hover':
          result = await hover(...args);
          break;
        case 'select':
          result = await select(...args);
          break;
        case 'check':
          result = await check(...args);
          break;
        case 'pressKey':
          result = await pressKey(...args);
          break;
        default:
          result = createResult(action, false, { reason: `Acción desconocida: ${action}` });
      }

      results.push(result);
      if (!result.success) {
        allSuccess = false;
      }
    }

    return {
      success: allSuccess,
      results,
      completed: results.filter(r => r.success).length,
      total: results.length
    };
  }

  // ============ API ============

  return {
    click,
    type,
    focus,
    scroll,
    hover,
    select,
    check,
    pressKey,
    sequence,
    resolveElement
  };
})();

window.Actions = Actions;
