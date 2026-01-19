/**
 * Agent - Agente de Navegación con Lenguaje Natural
 * MVP 4: Interpreta instrucciones y las traduce en acciones
 * Usa Gemini
 */
const Agent = (function() {
  'use strict';

  // ============ CONFIGURACIÓN ============
  
  const GEMINI_MODEL = 'gemini-2.5-flash';
  const API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
  
  let apiKey = null;
  let isProcessing = false;
  let onStatusChange = null;
  let onActionProposed = null;
  let onActionExecuted = null;
  let onError = null;

  // ============ PROMPT DEL SISTEMA ============

  const SYSTEM_PROMPT = 
  
`Eres un agente de navegación web. Tu trabajo es traducir instrucciones en lenguaje natural a acciones específicas sobre elementos de la página.

REGLAS ESTRICTAS:
1. Solo puedes usar las acciones: click, type, focus, hover, select, check
2. Solo puedes actuar sobre elementos que existen en la lista proporcionada
3. Si la instrucción es ambigua, pide aclaración
4. Si no encuentras el elemento, indica que no está disponible
5. NUNCA inventes elementos o referencias que no estén en la lista

FORMATO DE RESPUESTA (JSON estricto):
{
  "understood": true/false,
  "reasoning": "explicación breve de tu interpretación",
  "action": {
    "type": "click|type|focus|hover|select|check",
    "elementId": "wc-el-X",
    "elementDescription": "descripción del elemento elegido",
    "value": "valor para type/select (opcional)"
  },
  "clarification": "pregunta si necesitas más información (solo si understood=false)"
}

Si no puedes ejecutar la acción, responde:
{
  "understood": false,
  "reasoning": "explicación del problema",
  "action": null,
  "clarification": "pregunta o mensaje al usuario"
}`;

  // ============ BUILD ============

  function buildElementContext() {
    const elements = window.WebCopilot?.getElements() || [];
    
    // Construir contexto compacto de elementos
    const elementList = elements.map(el => ({
      id: el.id,
      type: el.type,
      text: (el.text || '').slice(0, 100),
      tag: el.tag,
      reference: el.reference,
      inputType: el.inputType || null,
      isDisabled: el.isDisabled || false
    }));

    return elementList;
  }

  function buildPrompt(userInstruction, elements) {
    const elementContext = elements.length > 0 
      ? JSON.stringify(elements, null, 2)
      : '(No hay elementos interactivos detectados)';

    return `ELEMENTOS DISPONIBLES EN LA PÁGINA:
${elementContext}

INSTRUCCIÓN DEL USUARIO:
"${userInstruction}"

Analiza la instrucción y responde en JSON estricto según el formato especificado.`;
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
   * @param {boolean} options.autoExecute - Ejecutar automáticamente si es seguro
   * @returns {Object} Resultado del procesamiento
   */
  async function processInstruction(instruction, options = {}) {

    isProcessing = true;
    notifyStatus('thinking', 'Analizando instrucción...');

    // 1. Obtener contexto de elementos
    const elements = buildElementContext();


    // 2. Construir prompt
    const prompt = buildPrompt(instruction, elements);

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

    notifyActionProposed(proposedAction);
    notifyStatus('proposed', 'Confirmar?');

/*
    // 7. Ejecutar si autoExecute está habilitado
    if (options.autoExecute) {
    return await confirmAndExecute(proposedAction);
    }
*/
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

    notifyStatus('executing', `Ejecutando ${action.type}...`);

    const result = await executeAction(action);
    
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
