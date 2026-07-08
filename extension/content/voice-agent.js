/**
 * VoiceAgent - Control por voz usando Gemini Live API
 * WebSocket bidireccional con VAD automático
 * Audio-in streaming -> razonamiento + function calling -> audio-out
 */
const VoiceAgent = (function() {
  'use strict';

  // ============ CONFIGURACIÓN ============

  const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
  const VOICE_MODEL = 'gemini-3.1-flash-live-preview';
  const CAPTURE_RATE = 16000;
  const PLAYBACK_RATE = 24000;
  const CHUNK_SIZE = 4096;

  // ============ ESTADO ============

  let ws = null;
  let isSessionActive = false;
  let mediaStream = null;
  let captureCtx = null;
  let playbackCtx = null;
  let processor = null;
  let nextPlayTime = 0;
  let activeSources = [];
  let callbacks = {};

  // ============ SYSTEM PROMPT ============

  const SYSTEM_PROMPT = `Eres WebCopilot Voice, un ejecutor de acciones web por voz. Hablas español, conciso y directo.

REGLAS:
1. {confirmationRule}
2. Los elementos con "inViewport": true son los que el usuario ve ahora. Priorízalos.
3. Usa "context" para desambiguar entre elementos similares (indica a qué sección/post/comentario pertenecen).
4. Si tras una acción recibes un [CONTEXTO ACTUALIZADO], úsalo — los IDs de elementos habrán cambiado.
5. No digas "no tengo acceso" — si no ves un elemento, di "no lo encuentro en la lista de elementos".
6. Cuando el usuario termine, llama end_session.
7. Respuestas de voz máximo 2 oraciones. No sugieras pasos siguientes.

PÁGINA ACTUAL: {pageTitle} ({pageUrl})

ELEMENTOS DISPONIBLES (los primeros son visibles en pantalla):
{elements}`;

  // ============ TOOL DECLARATIONS ============

  const TOOL_DECLARATIONS = [
    {
      name: 'click',
      description: 'Hace click en un elemento interactivo de la página web',
      parameters: {
        type: 'OBJECT',
        properties: {
          elementId: { type: 'STRING', description: 'ID del elemento (formato wc-el-X)' }
        },
        required: ['elementId']
      }
    },
    {
      name: 'type_text',
      description: 'Escribe texto en un campo de entrada (input, textarea)',
      parameters: {
        type: 'OBJECT',
        properties: {
          elementId: { type: 'STRING', description: 'ID del elemento input o textarea' },
          text: { type: 'STRING', description: 'Texto a escribir en el campo' }
        },
        required: ['elementId', 'text']
      }
    },
    {
      name: 'select_option',
      description: 'Selecciona una opción en un menú desplegable (select)',
      parameters: {
        type: 'OBJECT',
        properties: {
          elementId: { type: 'STRING', description: 'ID del elemento select' },
          value: { type: 'STRING', description: 'Valor o texto visible de la opción a seleccionar' }
        },
        required: ['elementId', 'value']
      }
    },
    {
      name: 'hover',
      description: 'Pasa el cursor sobre un elemento para revelar tooltips o menús',
      parameters: {
        type: 'OBJECT',
        properties: {
          elementId: { type: 'STRING', description: 'ID del elemento' }
        },
        required: ['elementId']
      }
    },
    {
      name: 'focus',
      description: 'Da foco a un elemento (útil para inputs antes de escribir)',
      parameters: {
        type: 'OBJECT',
        properties: {
          elementId: { type: 'STRING', description: 'ID del elemento' }
        },
        required: ['elementId']
      }
    },
    {
      name: 'check',
      description: 'Marca o desmarca un checkbox o radio button',
      parameters: {
        type: 'OBJECT',
        properties: {
          elementId: { type: 'STRING', description: 'ID del checkbox o radio button' }
        },
        required: ['elementId']
      }
    },
    {
      name: 'scroll_to',
      description: 'Hace scroll hasta un elemento para hacerlo visible en pantalla',
      parameters: {
        type: 'OBJECT',
        properties: {
          elementId: { type: 'STRING', description: 'ID del elemento' }
        },
        required: ['elementId']
      }
    },
    {
      name: 'end_session',
      description: 'Finaliza la sesión de voz cuando el usuario indica que no necesita nada más',
      parameters: {
        type: 'OBJECT',
        properties: {}
      }
    }
  ];

  // ============ HELPERS DE AUDIO ============

  function float32ToInt16(float32) {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16;
  }

  function int16ToFloat32(int16) {
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7FFF);
    }
    return float32;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  }

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function resample(float32, fromRate, toRate) {
    if (fromRate === toRate) return float32;
    const ratio = fromRate / toRate;
    const newLength = Math.round(float32.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const srcLow = Math.floor(srcIndex);
      const srcHigh = Math.min(srcLow + 1, float32.length - 1);
      const frac = srcIndex - srcLow;
      result[i] = float32[srcLow] * (1 - frac) + float32[srcHigh] * frac;
    }
    return result;
  }

  // ============ CONTEXTO DE ELEMENTOS ============

  const MAX_VOICE_ELEMENTS = 60;

  function buildElementContext() {
    const elements = window.WebCopilot?.getElements?.() || [];
    const mapped = elements.map(el => {
      const entry = {
        id: el.id,
        type: el.type,
        text: (el.text || '').slice(0, 100),
        tag: el.tag,
        inputType: el.inputType || null,
        isDisabled: el.isDisabled || false,
        inViewport: el.inViewport || false
      };
      if (el.nearestContext) entry.context = el.nearestContext;
      return entry;
    });
    const inView = mapped.filter(e => e.inViewport);
    const offView = mapped.filter(e => !e.inViewport);
    return [...inView, ...offView].slice(0, MAX_VOICE_ELEMENTS);
  }

  function sendContextUpdate() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const elements = buildElementContext();
    const msg = `[CONTEXTO ACTUALIZADO] Página: ${document.title} (${location.href})\nElementos disponibles ahora:\n${JSON.stringify(elements, null, 2)}`;
    ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text: msg }] }],
        turnComplete: true
      }
    }));
  }

  function buildSystemPrompt() {
    const elements = buildElementContext();
    const autoExec = localStorage.getItem('webcopilot_auto_execute') === '1';
    const confirmationRule = autoExec
      ? 'Ejecuta las acciones inmediatamente usando las herramientas. No pidas confirmación salvo acciones destructivas.'
      : 'Antes de ejecutar una acción, confirma brevemente lo que vas a hacer. Espera la aprobación verbal del usuario.';
    return SYSTEM_PROMPT
      .replace('{confirmationRule}', confirmationRule)
      .replace('{pageTitle}', document.title || 'Sin título')
      .replace('{pageUrl}', location.href)
      .replace('{elements}', elements.length > 0
        ? JSON.stringify(elements, null, 2)
        : '(No hay elementos interactivos detectados)');
  }

  // ============ WEBSOCKET PARSING ============

  function parseWsMessage(data) {
    if (typeof data === 'string') return JSON.parse(data);
    if (data instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(data));
    if (data instanceof Blob) return null;
    return null;
  }

  // ============ CONEXIÓN WEBSOCKET ============

  function connect(apiKey) {
    return new Promise((resolve, reject) => {
      const prompt = buildSystemPrompt();
      const url = `${WS_URL}?key=${apiKey}`;
      let settled = false;

      function settle(fn, val) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        fn(val);
      }

      try {
        ws = new WebSocket(url);
        ws.binaryType = 'arraybuffer';
      } catch (err) {
        reject(new Error('No se pudo crear la conexión WebSocket'));
        return;
      }

      const timeout = setTimeout(() => {
        settle(reject, new Error('Timeout: no se recibió setupComplete en 15s'));
        if (ws) ws.close();
      }, 15000);

      ws.onopen = () => {
        console.log('[VoiceAgent] WebSocket abierto, enviando setup...');
        const setupMsg = {
          setup: {
            model: `models/${VOICE_MODEL}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: 'Aoede'
                  }
                }
              }
            },
            systemInstruction: {
              parts: [{ text: prompt }]
            },
            tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
                endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                silenceDurationMs: 700
              },
              activityHandling: 'START_OF_ACTIVITY_INTERRUPTS'
            },
            outputAudioTranscription: {}
          }
        };
        ws.send(JSON.stringify(setupMsg));
      };

      ws.onmessage = (event) => {
        let msg;
        try {
          msg = parseWsMessage(event.data);
        } catch (e) {
          console.warn('[VoiceAgent] Error parseando mensaje WS:', e);
          return;
        }
        if (!msg) return;

        if (msg.setupComplete !== undefined) {
          console.log('[VoiceAgent] setupComplete recibido');
          isSessionActive = true;
          settle(resolve);
          return;
        }

        handleMessage(msg);
      };

      ws.onerror = (err) => {
        console.error('[VoiceAgent] WebSocket error:', err);
        callbacks.onStatus?.('error', 'Error de conexión');
        settle(reject, new Error('Error en WebSocket'));
      };

      ws.onclose = (event) => {
        console.log('[VoiceAgent] WebSocket cerrado:', event.code, event.reason);
        settle(reject, new Error(`Conexión cerrada: ${event.code} ${event.reason || ''}`));
        const wasActive = isSessionActive;
        isSessionActive = false;
        if (wasActive) {
          callbacks.onStatus?.('disconnected', 'Desconectado');
          callbacks.onSessionEnd?.();
        }
        cleanup();
      };
    });
  }

  // ============ HANDLER DE MENSAJES ============

  function handleMessage(msg) {
    if (msg.toolCall) {
      handleToolCall(msg.toolCall);
      return;
    }

    const sc = msg.serverContent;
    if (!sc) return;

    // Transcripción del usuario (lo que dijo)
    if (sc.inputTranscription?.text) {
      callbacks.onUserTranscript?.(sc.inputTranscription.text);
    }

    // Transcripción del agente (lo que respondió)
    if (sc.outputTranscription?.text) {
      callbacks.onAgentTranscript?.(sc.outputTranscription.text);
    }

    // Audio del modelo
    if (sc.modelTurn?.parts) {
      for (const part of sc.modelTurn.parts) {
        if (part.inlineData?.data) {
          playAudioChunk(part.inlineData.data);
        }
      }
    }

    // Turno completo
    if (sc.turnComplete) {
      callbacks.onTurnComplete?.();
    }

    // Interrupción (usuario empezó a hablar)
    if (sc.interrupted) {
      interruptPlayback();
    }
  }

  // ============ TOOL CALLS ============

  async function handleToolCall(toolCall) {
    if (!toolCall.functionCalls) return;

    for (const fc of toolCall.functionCalls) {
      if (fc.name === 'end_session') {
        sendToolResponse(fc.id, fc.name, { status: 'ok' });
        callbacks.onSessionEnd?.();
        stop();
        return;
      }

      callbacks.onStatus?.('executing', `Ejecutando ${fc.name}...`);
      callbacks.onToolExec?.(fc.name, fc.args || {});

      let result;
      try {
        switch (fc.name) {
          case 'click':
            result = await Actions.click(fc.args.elementId);
            break;
          case 'type_text':
            result = await Actions.type(fc.args.elementId, fc.args.text);
            break;
          case 'select_option':
            result = await Actions.select(fc.args.elementId, fc.args.value);
            break;
          case 'hover':
            result = await Actions.hover(fc.args.elementId);
            break;
          case 'focus':
            result = await Actions.focus(fc.args.elementId);
            break;
          case 'check':
            result = await Actions.check(fc.args.elementId);
            break;
          case 'scroll_to':
            result = await Actions.scroll(fc.args.elementId);
            break;
          default:
            result = { success: false, reason: `Acción desconocida: ${fc.name}` };
        }
      } catch (err) {
        result = { success: false, reason: err.message };
      }

      sendToolResponse(fc.id, fc.name, result);

      // Después de acciones que pueden cambiar el DOM, actualizar contexto
      if (result.success && (fc.name === 'click' || fc.name === 'select_option' || fc.name === 'check')) {
        setTimeout(() => {
          window.WebCopilot?.refresh?.(true);
          setTimeout(sendContextUpdate, 500);
        }, 800);
      }

      callbacks.onStatus?.('listening', 'Escuchando...');
    }
  }

  function sendToolResponse(id, name, response) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
      toolResponse: {
        functionResponses: [{
          id: id,
          name: name,
          response: response
        }]
      }
    }));
  }

  // ============ CAPTURA DE AUDIO ============

  async function startCapture() {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: CAPTURE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    captureCtx = new AudioContext({ sampleRate: CAPTURE_RATE });
    const source = captureCtx.createMediaStreamSource(mediaStream);

    processor = captureCtx.createScriptProcessor(CHUNK_SIZE, 1, 1);

    const actualRate = captureCtx.sampleRate;

    processor.onaudioprocess = (e) => {
      if (!isSessionActive || !ws || ws.readyState !== WebSocket.OPEN) return;

      let float32 = e.inputBuffer.getChannelData(0);

      if (actualRate !== CAPTURE_RATE) {
        float32 = resample(float32, actualRate, CAPTURE_RATE);
      }

      const int16 = float32ToInt16(float32);
      const base64 = arrayBufferToBase64(int16.buffer);

      ws.send(JSON.stringify({
        realtimeInput: {
          audio: {
            data: base64,
            mimeType: `audio/pcm;rate=${CAPTURE_RATE}`
          }
        }
      }));
    };

    source.connect(processor);
    processor.connect(captureCtx.destination);
  }

  // ============ REPRODUCCIÓN DE AUDIO ============

  function playAudioChunk(base64Data) {
    if (!playbackCtx) {
      playbackCtx = new AudioContext({ sampleRate: PLAYBACK_RATE });
    }

    const pcmBuffer = base64ToArrayBuffer(base64Data);
    const int16 = new Int16Array(pcmBuffer);
    const float32 = int16ToFloat32(int16);

    if (float32.length === 0) return;

    const audioBuffer = playbackCtx.createBuffer(1, float32.length, PLAYBACK_RATE);
    audioBuffer.copyToChannel(float32, 0);

    const source = playbackCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(playbackCtx.destination);

    source.onended = () => {
      activeSources = activeSources.filter(s => s !== source);
    };
    activeSources.push(source);

    const now = playbackCtx.currentTime;
    if (nextPlayTime < now) nextPlayTime = now;

    source.start(nextPlayTime);
    nextPlayTime += audioBuffer.duration;
  }

  function interruptPlayback() {
    activeSources.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    activeSources = [];
    nextPlayTime = 0;
  }

  // ============ CICLO DE VIDA ============

  async function start(apiKey) {
    if (isSessionActive) return;

    callbacks.onStatus?.('connecting', 'Conectando...');

    try {
      await connect(apiKey);
      callbacks.onStatus?.('listening', 'Escuchando...');
      await startCapture();
    } catch (err) {
      stop();
      throw err;
    }
  }

  function stop() {
    const wasActive = isSessionActive;
    isSessionActive = false;

    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          realtimeInput: { audioStreamEnd: true }
        }));
      } catch (e) {}
      ws.close();
    }
    ws = null;

    if (processor) {
      try { processor.disconnect(); } catch (e) {}
      processor = null;
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }

    if (captureCtx) {
      captureCtx.close().catch(() => {});
      captureCtx = null;
    }

    interruptPlayback();

    if (playbackCtx) {
      playbackCtx.close().catch(() => {});
      playbackCtx = null;
    }

    if (wasActive) {
      callbacks.onStatus?.('idle', 'Listo');
    }
  }

  function cleanup() {
    if (processor) {
      try { processor.disconnect(); } catch (e) {}
      processor = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    if (captureCtx) {
      captureCtx.close().catch(() => {});
      captureCtx = null;
    }
    interruptPlayback();
    if (playbackCtx) {
      playbackCtx.close().catch(() => {});
      playbackCtx = null;
    }
  }

  // ============ API PÚBLICA ============

  return {
    start,
    stop,
    isActive: () => isSessionActive,
    setCallbacks: (cbs) => { callbacks = cbs; }
  };
})();

window.VoiceAgent = VoiceAgent;
