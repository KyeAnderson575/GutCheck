/**
 * searchDB.js — Unified food search across ALL data sources
 *
 * Single function that searches (in priority order):
 *   1. User's saved foods (myFoods — homemade, store, restaurant, favorites)
 *   2. Custom ingredients (user-added)
 *   3. Restaurant menus (built-in + user-added)
 *   4. Common foods database (COMMON_FOODS)
 *
 * Deduplicates results by name, ranks by relevance.
 */
import { COMMON_FOODS } from '../data/commonFoods';
import { getGIRisk } from '../data/giRisk';

/**
 * Search across all food sources
 * @param {string} q - Search query (min 2 chars)
 * @param {Object} opts - Data sources
 * @param {Object} opts.restaurants - Restaurant menus object
 * @param {Array} opts.customFoods - User-added custom ingredients
 * @param {Array} opts.myFoods - User's unified saved foods
 * @returns {Array} Matching food items (max 14), deduplicated
 */
export const searchAllFoods = (q, opts = {}) => {
  if (!q || q.length < 2) return [];
  const ql = q.toLowerCase();
  const results = [];
  const seen = new Set(); // track by lowercase name to deduplicate

  const add = (item) => {
    const key = item.n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    results.push(item);
  };

  const { restaurants, customFoods, myFoods } = opts;

  // 1. User's unified saved foods (myFoods — homemade, store, restaurant)
  (myFoods || []).forEach(f => {
    const name = f.name || f.desc || '';
    if (!name) return;
    const matchName = name.toLowerCase().includes(ql);
    const matchBrand = (f.brand || '').toLowerCase().includes(ql);
    const matchIngs = (f.ings || f.ingredients || []).some(i => i.toLowerCase().includes(ql));
    if (matchName || matchBrand || matchIngs) {
      const src = f.source || 'store';
      const displayName = src === 'store' && f.brand
        ? `${name} (${f.brand})${f.variant ? ' — ' + f.variant : ''}`
        : name;
      add({
        n: displayName,
        a: f.al || f.allergens || [],
        c: src === 'homemade' ? 'Homemade' : src === 'store' ? 'Store' : src === 'restaurant' ? 'Order' : 'Saved',
        src: src === 'homemade' ? 'hm' : src === 'store' ? 'mf' : src === 'restaurant' ? 'ord' : 'fav',
        ic: src === 'homemade' ? '🏠' : src === 'store' ? '🛒' : src === 'restaurant' ? '⚡' : '⭐',
        ss: f.safeStatus,
        ds: f.desc,
        mt: f.mt,
        tg: f.tg || f.tags,
        ings: f.ings || f.ingredients,
        rf: getGIRisk(name, f.al || f.allergens || []),
      });
    }
  });

  // 2. Custom ingredients (user-added)
  (customFoods || []).forEach(f => {
    if (f.n.toLowerCase().includes(ql)) {
      add({
        n: f.n,
        a: f.al || [],
        c: '⭐ Custom',
        src: 'cf',
        ic: '⭐',
        rf: getGIRisk(f.n, f.al),
      });
    }
  });

  // 3. Restaurant menus
  Object.entries(restaurants || {}).forEach(([rn, d]) => {
    // Match restaurant name → show all items
    const restMatch = rn.toLowerCase().includes(ql);
    (d.it || []).forEach(item => {
      if (restMatch || item.n.toLowerCase().includes(ql)) {
        add({
          n: item.n,
          a: item.a || [],
          c: rn,
          src: 'r',
          ic: d.ic || '🍽️',
          rf: getGIRisk(item.n, item.a || []),
        });
      }
    });
  });

  // 4. Common foods database (built-in)
  COMMON_FOODS.forEach(f => {
    if (f.n.toLowerCase().includes(ql)) {
      add({
        n: f.n,
        a: f.al || [],
        c: f.cat,
        src: 'cf',
        ic: f.cat.split(' ')[0],
        rf: getGIRisk(f.n, f.al),
      });
    }
  });

  // Sort: exact prefix matches first, then user data first, then alphabetical
  const srcPriority = { hm: 0, mf: 0, ord: 0, fav: 0, cf: 1, r: 2 };
  results.sort((a, b) => {
    // Prefix match wins
    const aPrefix = a.n.toLowerCase().startsWith(ql) ? 0 : 1;
    const bPrefix = b.n.toLowerCase().startsWith(ql) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    // User data > built-in
    const aPri = srcPriority[a.src] ?? 3;
    const bPri = srcPriority[b.src] ?? 3;
    if (aPri !== bPri) return aPri - bPri;
    // Alphabetical
    return a.n.localeCompare(b.n);
  });

  return results.slice(0, 14);
};

// Keep old export name for backward compatibility during migration
export const searchDB = (q, _fdb, rest) => searchAllFoods(q, { restaurants: rest });
