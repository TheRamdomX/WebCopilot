/**
 * Memory DB - Apertura y versionado de IndexedDB
 * MVP 5: Sistema de memoria persistente
 */
const MemoryDB = (function() {
  'use strict';

  const DB_NAME = 'web_copilot';
  const DB_VERSION = 1;

  let dbInstance = null;

  // Abre o crea la base de datos
  function open() {
    if (dbInstance) {
      return Promise.resolve(dbInstance);
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Sites: conocimiento por dominio
        if (!db.objectStoreNames.contains('sites')) {
          db.createObjectStore('sites', { keyPath: 'id' });
        }

        // Elements: referencias semánticas
        if (!db.objectStoreNames.contains('elements')) {
          const store = db.createObjectStore('elements', { keyPath: 'id' });
          store.createIndex('siteId', 'siteId', { unique: false });
          store.createIndex('role', 'role', { unique: false });
        }

        // Patterns: intenciones y acciones exitosas
        if (!db.objectStoreNames.contains('patterns')) {
          const store = db.createObjectStore('patterns', { keyPath: 'id' });
          store.createIndex('siteId', 'siteId', { unique: false });
          store.createIndex('intent', 'intent', { unique: false });
        }
      };

      request.onsuccess = () => {
        dbInstance = request.result;
        resolve(dbInstance);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  // Cierra la conexión
  function close() {
    if (dbInstance) {
      dbInstance.close();
      dbInstance = null;
    }
  }

  // Elimina toda la base de datos
  function destroy() {
    close();
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Helper: ejecutar transacción de lectura
  async function readTransaction(storeName, callback) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      callback(store, resolve, reject);
      tx.onerror = () => reject(tx.error);
    });
  }

  // Helper: ejecutar transacción de escritura
  async function writeTransaction(storeName, callback) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      callback(store, resolve, reject);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    open,
    close,
    destroy,
    readTransaction,
    writeTransaction,
    DB_NAME,
    DB_VERSION
  };
})();

window.MemoryDB = MemoryDB;
