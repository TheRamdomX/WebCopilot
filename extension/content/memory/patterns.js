/**
 * Memory Patterns - Intenciones y acciones exitosas
 * MVP 5: Sistema de memoria persistente
 */
const MemoryPatterns = (function() {
  'use strict';

  const STORE_NAME = 'patterns';

  // Genera ID único para patrón
  function generateId() {
    return 'pat_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // Normaliza una intención para comparación
  function normalizeIntent(intent) {
    return intent
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remover acentos
      .replace(/[^\w\s]/g, '')         // Solo alfanuméricos
      .trim();
  }

  // Registra o actualiza un patrón exitoso
  async function recordSuccess(patternData) {
    const { siteId, intent, elementId, action } = patternData;
    
    // Buscar patrón existente
    const existing = await findByIntent(siteId, intent);
    
    if (existing) {
      existing.successCount++;
      existing.lastUsed = Date.now();
      
      // Agregar elementId si no existe
      if (!existing.elementIds.includes(elementId)) {
        existing.elementIds.push(elementId);
      }
      
      // Actualizar acción preferida
      existing.preferredAction = action;
      
      await save(existing);
      return existing;
    }

    // Crear nuevo patrón
    const pattern = {
      id: generateId(),
      siteId,
      intent: normalizeIntent(intent),
      intentVariants: [intent],
      elementIds: [elementId],
      preferredAction: action,
      successCount: 1,
      failCount: 0,
      createdAt: Date.now(),
      lastUsed: Date.now()
    };

    await save(pattern);
    return pattern;
  }

  // Registra un fallo de patrón
  async function recordFailure(siteId, intent) {
    const existing = await findByIntent(siteId, intent);
    
    if (existing) {
      existing.failCount++;
      existing.lastUsed = Date.now();
      await save(existing);
      return existing;
    }
    
    return null;
  }

  // Normaliza una intención para comparación
  function normalizeIntent(intent) {
    return intent
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remover acentos
      .replace(/[^\w\s]/g, '')         // Solo alfanuméricos
      .trim();
  }

  // Guarda un patrón
  async function save(pattern) {
    return MemoryDB.writeTransaction(STORE_NAME, (store) => {
      store.put(pattern);
    });
  }

  // Obtiene un patrón por ID
  async function get(id) {
    return MemoryDB.readTransaction(STORE_NAME, (store, resolve) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  // Obtiene patrones de un sitio
  async function getBySite(siteId) {
    return MemoryDB.readTransaction(STORE_NAME, (store, resolve) => {
      const index = store.index('siteId');
      const request = index.getAll(siteId);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  // Busca patrón por intención (fuzzy)
  async function findByIntent(siteId, intent) {
    const patterns = await getBySite(siteId);
    const normalized = normalizeIntent(intent);
    
    // Búsqueda exacta primero
    let match = patterns.find(p => p.intent === normalized);
    if (match) return match;
    
    // Búsqueda en variantes
    match = patterns.find(p => 
      p.intentVariants.some(v => normalizeIntent(v) === normalized)
    );
    if (match) return match;
    
    // Búsqueda por similitud (contiene)
    return patterns.find(p => 
      p.intent.includes(normalized) || normalized.includes(p.intent)
    ) || null;
  }

  // Obtiene patrones más exitosos de un sitio
  async function getTopPatterns(siteId, limit = 10) {
    const patterns = await getBySite(siteId);
    
    return patterns
      .filter(p => p.successCount > 0)
      .sort((a, b) => {
        // Ordenar por ratio de éxito y frecuencia
        const ratioA = a.successCount / (a.successCount + a.failCount);
        const ratioB = b.successCount / (b.successCount + b.failCount);
        if (ratioA !== ratioB) return ratioB - ratioA;
        return b.successCount - a.successCount;
      })
      .slice(0, limit);
  }

  // Agrega variante de intención a un patrón
  async function addIntentVariant(patternId, variant) {
    const pattern = await get(patternId);
    if (!pattern) return false;

    const normalized = normalizeIntent(variant);
    if (!pattern.intentVariants.includes(variant) && 
        !pattern.intentVariants.some(v => normalizeIntent(v) === normalized)) {
      pattern.intentVariants.push(variant);
      await save(pattern);
    }
    
    return true;
  }

  // Elimina patrones de un sitio
  async function removeBySite(siteId) {
    const patterns = await getBySite(siteId);
    return MemoryDB.writeTransaction(STORE_NAME, (store) => {
      for (const p of patterns) {
        store.delete(p.id);
      }
    });
  }

  return {
    recordSuccess,
    recordFailure,
    save,
    get,
    getBySite,
    findByIntent,
    getTopPatterns,
    addIntentVariant,
    removeBySite,
    normalizeIntent
  };
})();

window.MemoryPatterns = MemoryPatterns;
