/**
 * Memory Elements - Referencias semánticas de elementos
 * MVP 5: Sistema de memoria persistente
 */
const MemoryElements = (function() {
  'use strict';

  const STORE_NAME = 'elements';

  // Genera ID único para elemento
  function generateId() {
    return 'el_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // Guarda o actualiza un elemento
  async function saveOrUpdate(elementData) {
    const { siteId, role, semanticHint, descriptors } = elementData;
    
    // Buscar elemento similar existente
    const existing = await findSimilar(siteId, role, descriptors);
    
    if (existing) {
      existing.lastSeen = Date.now();
      existing.confidence = Math.min(1, existing.confidence + 0.1);
      
      const allDescriptors = new Set([...existing.descriptors, ...descriptors]);
      existing.descriptors = [...allDescriptors].slice(0, 10);
      
      if (semanticHint && !existing.semanticHints.includes(semanticHint)) {
        existing.semanticHints.push(semanticHint);
      }
      
      await save(existing);
      return existing;
    }

    // Crear nuevo
    const element = {
      id: generateId(),
      siteId,
      role,
      semanticHint,
      semanticHints: semanticHint ? [semanticHint] : [],
      descriptors: descriptors.slice(0, 10),
      confidence: 0.5,
      createdAt: Date.now(),
      lastSeen: Date.now()
    };

    await save(element);
    return element;
  }

  // Guarda un elemento
  async function save(element) {
    return MemoryDB.writeTransaction(STORE_NAME, (store) => {
      store.put(element);
    });
  }

  // Obtiene un elemento por ID
  async function get(id) {
    return MemoryDB.readTransaction(STORE_NAME, (store, resolve) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  // Obtiene elementos de un sitio
   
  async function getBySite(siteId) {
    return MemoryDB.readTransaction(STORE_NAME, (store, resolve) => {
      const index = store.index('siteId');
      const request = index.getAll(siteId);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  // Busca elemento similar por role y descriptors
  async function findSimilar(siteId, role, descriptors) {
    const elements = await getBySite(siteId);
    
    for (const el of elements) {
      if (el.role !== role) continue;
      
      // Verificar si algún descriptor coincide
      const hasMatch = descriptors.some(d => 
        el.descriptors.some(ed => 
          ed.toLowerCase().includes(d.toLowerCase()) ||
          d.toLowerCase().includes(ed.toLowerCase())
        )
      );
      
      if (hasMatch) return el;
    }
    
    return null;
  }

  // Busca elementos por hint semántico
  async function findByHint(siteId, hint) {
    const elements = await getBySite(siteId);
    const hintLower = hint.toLowerCase();
    
    return elements.filter(el => 
      el.semanticHint?.toLowerCase().includes(hintLower) ||
      el.semanticHints?.some(h => h.toLowerCase().includes(hintLower)) ||
      el.descriptors.some(d => d.toLowerCase().includes(hintLower))
    );
  }

  // Reduce confianza de un elemento (cuando no se encuentra)
  async function decreaseConfidence(id) {
    const element = await get(id);
    if (!element) return null;

    element.confidence = Math.max(0, element.confidence - 0.2);
    
    if (element.confidence < 0.3) {
      element.invalid = true;
    }
    
    await save(element);
    return element;
  }

  // Invalida un elemento manualmente
  async function invalidate(id) {
    const element = await get(id);
    if (!element) return false;

    element.invalid = true;
    element.confidence = 0;
    await save(element);
    return true;
  }

  // Elimina elementos de un sitio
  async function removeBySite(siteId) {
    const elements = await getBySite(siteId);
    return MemoryDB.writeTransaction(STORE_NAME, (store) => {
      for (const el of elements) {
        store.delete(el.id);
      }
    });
  }

  // Obtiene elementos válidos (no invalidados) de un sitio
  async function getValidBySite(siteId) {
    const elements = await getBySite(siteId);
    return elements.filter(el => !el.invalid && el.confidence >= 0.3);
  }

  return {
    saveOrUpdate,
    save,
    get,
    getBySite,
    getValidBySite,
    findSimilar,
    findByHint,
    decreaseConfidence,
    invalidate,
    removeBySite
  };
})();

window.MemoryElements = MemoryElements;
