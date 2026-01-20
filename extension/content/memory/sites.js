/**
 * Memory Sites - Conocimiento por dominio
 * MVP 5: Sistema de memoria persistente
 */
const MemorySites = (function() {
  'use strict';

  const STORE_NAME = 'sites';

  // Obtiene o crea un sitio por dominio
  async function getOrCreate(domain) {
    const existing = await get(domain);
    if (existing) {
      // Actualizar lastVisited
      existing.lastVisited = Date.now();
      await save(existing);
      return existing;
    }

    const site = {
      id: domain,
      lastVisited: Date.now(),
      createdAt: Date.now()
    };

    await save(site);
    return site;
  }

  // Obtiene un sitio por dominio
  async function get(domain) {
    return MemoryDB.readTransaction(STORE_NAME, (store, resolve) => {
      const request = store.get(domain);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  // Guarda un sitio
  async function save(site) {
    return MemoryDB.writeTransaction(STORE_NAME, (store) => {
      store.put(site);
    });
  }

  // Elimina un sitio y todos sus datos relacionados
  async function remove(domain) {
    // Eliminar elementos del sitio
    await MemoryElements.removeBySite(domain);
    
    // Eliminar patrones del sitio
    await MemoryPatterns.removeBySite(domain);
    
    // Eliminar el sitio
    return MemoryDB.writeTransaction(STORE_NAME, (store) => {
      store.delete(domain);
    });
  }

  // Lista todos los sitios
  async function getAll() {
    return MemoryDB.readTransaction(STORE_NAME, (store, resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  // Obtiene estadísticas del sitio actual
  async function getStats(domain) {
    const site = await get(domain);
    if (!site) return null;

    const elements = await MemoryElements.getBySite(domain);
    const patterns = await MemoryPatterns.getBySite(domain);

    return {
      domain,
      lastVisited: site.lastVisited,
      createdAt: site.createdAt,
      elementsCount: elements.length,
      patternsCount: patterns.length,
      totalSuccesses: patterns.reduce((sum, p) => sum + p.successCount, 0)
    };
  }

  return {
    getOrCreate,
    get,
    save,
    remove,
    getAll,
    getStats
  };
})();

window.MemorySites = MemorySites;
