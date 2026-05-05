/**
 * db.js — IndexedDB storage layer using Dexie.js
 * 
 * This replaces the Claude artifact's window.storage API.
 * Same interface as the old PS object: get, set, del, listKeys
 * but backed by IndexedDB for permanent persistence.
 * 
 * Storage schema (v2 — split keys):
 *   nl-config:   { pin, aiOn, phase, elimFoods, elimStart, reintroFood, reintroStart, customSymptoms }
 *   nl-meals:    [ meal entries ]
 *   nl-syms:     [ symptom entries ]
 *   nl-medical:  { procs, meds, dxs, labs }
 *   nl-library:  { orders, homeMeals, myFoods, favs, dn, water, medLog, restaurants, customFoods }
 */

import Dexie from 'dexie';

// Create the database
const db = new Dexie('GutCheckDB');

// Single table for key-value storage (mirrors the split-key approach)
db.version(1).stores({
  kvstore: 'key', // primary key is the string key name
});

/**
 * PS — Persistent Storage interface
 * Drop-in replacement for the old window.storage wrapper.
 * All methods are async and handle errors gracefully.
 */
export const PS = {
  async get(key) {
    try {
      const record = await db.kvstore.get(key);
      return record ? record.value : null;
    } catch (err) {
      console.error('PS.get error:', key, err);
      return null;
    }
  },

  async set(key, value) {
    try {
      await db.kvstore.put({ key, value });
    } catch (err) {
      console.error('PS.set error:', key, err);
    }
  },

  async del(key) {
    try {
      await db.kvstore.delete(key);
    } catch (err) {
      console.error('PS.del error:', key, err);
    }
  },

  async listKeys(prefix) {
    try {
      const allKeys = await db.kvstore.toCollection().primaryKeys();
      if (!prefix) return allKeys;
      return allKeys.filter(k => k.startsWith(prefix));
    } catch (err) {
      console.error('PS.listKeys error:', err);
      return [];
    }
  },
};

/** Storage key constants — same as the artifact version */
export const SK = {
  meals: 'nl-meals',
  syms: 'nl-syms',
  config: 'nl-config',
  medical: 'nl-medical',
  library: 'nl-library',
  legacy: 'nl-data', // kept for migration from old exports
};

export default db;
