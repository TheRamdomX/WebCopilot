/**
 * Agent - Agente de Navegación con Lenguaje Natural
 * MVP 4: Interpreta instrucciones y las traduce en acciones
 * Usa Gemini
 */
const Agent = (function() {
  'use strict';

  // ============ CONFIGURACIÓN ============
  
  const GEMINI_MODEL = 'gemini-3.1-flash-lite';
  const API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
  
  let apiKey = null;
  let isProcessing = false;
  let onStatusChange = null;
  let onActionProposed = null;
  let onActionExecuted = null;
  let onError = null;

  // ============ PROMPT DEL SISTEMA ============

  const SYSTEM_PROMPT =
`Eres un ejecutor de acciones web. Traduces instrucciones a UNA acción concreta sobre un elemento de la página. No das sugerencias, no explicas qué más se podría hacer, no ofreces pasos siguientes. Solo ejecutas lo pedido.

ACCIONES DISPONIBLES: click, type, focus, hover, select, check

REGLAS:
1. Usa SOLO elementos de la lista proporcionada (por su "id" exacto, ej: "wc-el-3")
2. Si la instrucción es ambigua, pide aclaración
3. Si no encuentras el elemento, di que no está disponible
4. NUNCA inventes IDs ni elementos que no estén en la lista
5. El campo "reasoning" debe ser máximo 10 palabras
6. No sugieras acciones adicionales ni pasos siguientes

RESPUESTA (JSON estricto):
{
  "understood": true,
  "reasoning": "máximo 10 palabras",
  "action": {
    "type": "click|type|focus|hover|select|check",
    "elementId": "wc-el-X",
    "value": "solo para type/select"
  }
}

Si NO puedes ejecutar:
{
  "understood": false,
  "reasoning": "por qué no",
  "action": null,
  "clarification": "pregunta breve"
}`;

  // ============ BUILD ============

  function buildElementContext() {
    const elements = window.WebCopilot.getElements();
    
    return elements.map(el => ({
      id: el.id,
      type: el.type,
      text: (el.text || '').slice(0, 100),
      tag: el.tag,
      reference: el.reference,
      inputType: el.inputType || null,
      isDisabled: el.isDisabled || false
    }));
  }

  function buildPrompt(userInstruction, elements, memoryContext = null) {
    const elementContext = elements.length > 0 
      ? JSON.stringify(elements, null, 2)
      : '(No hay elementos interactivos detectados)';

    let memorySection = '';
    if (memoryContext) {
      const { knownElements, successfulPatterns } = memoryContext;
      
      if (knownElements.length > 0) {
        memorySection += `\nELEMENTOS CONOCIDOS (de visitas anteriores):
${JSON.stringify(knownElements.slice(0, 10), null, 2)}`;
      }
      
      if (successfulPatterns.length > 0) {
        memorySection += `\nPATRONES EXITOSOS (acciones que funcionaron antes):
${JSON.stringify(successfulPatterns.slice(0, 5), null, 2)}`;
      }
    }

    return `ELEMENTOS DISPONIBLES EN LA PÁGINA:
${elementContext}
${memorySection}
INSTRUCCIÓN DEL USUARIO:
"${userInstruction}"

Analiza la instrucción y responde en JSON estricto según el formato especificado.
${memoryContext ? 'NOTA: Si hay patrones exitosos relevantes, prioriza esos elementos.' : ''}`;
  }

  // ============ API DE GEMINI ============

  async function callGemini(prompt) {
    if (!apiKey) {
      throw new Error('API key no configurada');
    }

    const url = `${API_ENDPOINT}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: SYSTEM_PROMPT },
            { text: prompt }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json'
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Error ${response.status}`);
    }

    const data = await response.json();
    
    // Extraer texto de la respuesta
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    // Parsear JSON
    return JSON.parse(text);

  }

  // ============ VALIDACIÓN ============

  function validateAction(action, elements) {
    if (!action) return { valid: false, reason: 'No hay acción propuesta' };
    
    const validTypes = ['click', 'type', 'focus', 'hover', 'select', 'check'];
    
    if (!validTypes.includes(action.type)) {
      return { valid: false, reason: `Tipo de acción inválido: ${action.type}` };
    }

    if (!action.elementId) {
      return { valid: false, reason: 'No se especificó elemento objetivo' };
    }

    // Verificar que el elemento existe
    const element = elements.find(el => el.id === action.elementId);
    if (!element) {
      return { valid: false, reason: `Elemento ${action.elementId} no encontrado` };
    }

    // Verificar que el elemento no está deshabilitado
    if (element.isDisabled) {
      return { valid: false, reason: `Elemento ${action.elementId} está deshabilitado` };
    }

    // Validaciones específicas por tipo
    if (action.type === 'type' && !action.value) {
      return { valid: false, reason: 'Acción "type" requiere un valor' };
    }

    if (action.type === 'select' && action.value === undefined) {
      return { valid: false, reason: 'Acción "select" requiere un valor' };
    }

    return { valid: true, element };
  }

  // ============ EJECUCIÓN ============

  async function executeAction(action) {
    let result;
    
    switch (action.type) {
      case 'click':
        result = await Actions.click(action.elementId);
        break;
      case 'type':
        result = await Actions.type(action.elementId, action.value, { instant: false, delayMs: 30 });
        break;
      case 'focus':
        result = await Actions.focus(action.elementId);
        break;
      case 'hover':
        result = await Actions.hover(action.elementId);
        break;
      case 'select':
        result = await Actions.select(action.elementId, action.value);
        break;
      case 'check':
        result = await Actions.check(action.elementId, action.value);
        break;
      default:
        throw new Error(`Acción no soportada: ${action.type}`);
    }

    return result;
  }

  // ============ API PRINCIPAL ============

  /**
   * Procesa una instrucción en lenguaje natural
   * @param {string} instruction - Instrucción del usuario
   * @param {Object} options - Opciones
   * @param {Object} options.memoryContext - Contexto de memoria (MVP 5)
   * @returns {Object} Resultado del procesamiento
   */
  async function processInstruction(instruction, options = {}) {

    isProcessing = true;
    notifyStatus('thinking', 'Analizando instrucción...');

    // 1. Obtener contexto de elementos
    const elements = buildElementContext();

    // 2. Construir prompt (con memoria si está disponible)
    const prompt = buildPrompt(instruction, elements, options.memoryContext);

    // 3. Llamar a Gemini
    notifyStatus('thinking', 'Consultando al agente...');
    const response = await callGemini(prompt);

    // 4. Verificar si entendió la instrucción
    if (!response.understood) {
    notifyStatus('clarification', 'Necesito más info');
    return {
        success: false,
        understood: false,
        reasoning: response.reasoning,
        clarification: response.clarification
    };
    }

    // 5. Validar la acción propuesta
    const validation = validateAction(response.action, elements);
    
    if (!validation.valid) {
    notifyStatus('error', 'Error');
    return {
        success: false,
        error: validation.reason,
        reasoning: response.reasoning
    };
    }

    // 6. Notificar acción propuesta
    const proposedAction = {
    ...response.action,
    reasoning: response.reasoning,
    elementInfo: validation.element
    };

    // 7. Ejecutar directamente si autoExecute está habilitado
    if (options.autoExecute) {
      return await confirmAndExecute(proposedAction);
    }

    notifyActionProposed(proposedAction);
    notifyStatus('proposed', 'Confirmar?');

    isProcessing = false;

    return {
        success: true,
        action: proposedAction,
        requiresConfirmation: true
        };
  }

  /**
   * Confirma y ejecuta una acción propuesta
   */
  async function confirmAndExecute(action) {
    isProcessing = true;
    notifyStatus('executing', `Ejecutando ${action.type}...`);

    const result = await executeAction(action);
    isProcessing = false;

    if (result.success) {
      notifyStatus('success', `✓ ${action.type} ejecutado`);
      notifyActionExecuted(action, result);
      return { success: true, action, result };
    } else {
      notifyStatus('error', result.reason || 'Error en ejecución');
      return { success: false, error: result.reason, action };
    }
  }

  // Cancela la acción pendiente

  function cancelPendingAction() {
    notifyStatus('idle', 'Acción cancelada');
    return { success: true, cancelled: true };
  }

  // ============ CALLBACKS ============

  function notifyStatus(status, message) {
    onStatusChange?.(status, message);
  }

  function notifyActionProposed(action) {
    onActionProposed?.(action);
  }

  function notifyActionExecuted(action, result) {
    onActionExecuted?.(action, result);
  }

  // ============ CONFIGURACIÓN ============

  function setApiKey(key) {
    apiKey = key;
  }

  function getApiKey() {
    return apiKey ? '***' + apiKey.slice(-4) : null;
  }

  function isConfigured() {
    return !!apiKey;
  }

  function setCallbacks(callbacks) {
    onStatusChange = callbacks.onStatusChange;
    onActionProposed = callbacks.onActionProposed;
    onActionExecuted = callbacks.onActionExecuted;
    onError = callbacks.onError;
  }

  // ============ API PÚBLICA ============

  return {
    // Configuración
    setApiKey,
    getApiKey,
    isConfigured,
    setCallbacks,
    
    // Procesamiento
    processInstruction,
    confirmAndExecute,
    cancelPendingAction,
    
    // Estado
    isProcessing: () => isProcessing,
    
    // Utilidades
    buildElementContext
  };
})();

window.Agent = Agent;
