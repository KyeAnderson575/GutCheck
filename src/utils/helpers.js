/**
 * helpers.js — Utility functions used across the app
 */

/** Today's date as YYYY-MM-DD string */
export const td = () => new Date().toISOString().split('T')[0];

/** Current time as HH:MM string (24hr) */
export const nt = () => { const n = new Date(); return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; };

/** Format 24hr time to 12hr display */
export const fmt12 = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
};

/** Short month name */
export const mn = (m) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m];

/** Full month name */
export const mnf = (m) => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m];

/** Day abbreviations */
export const dA = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Get days array for calendar grid */
export const gD = (y, m) => {
  const f = new Date(y, m, 1);
  const l = new Date(y, m + 1, 0);
  const d = [];
  for (let i = 0; i < f.getDay(); i++) d.push(null);
  for (let i = 1; i <= l.getDate(); i++) d.push(i);
  return d;
};


// ═══════════════════════════════════════════════════════════════
// CORRELATION ENGINE V2
// Research basis: FAST diary (PMC6970560), mySymptoms (PMC6683644),
// Monash FODMAP timing, EoE dietary therapy literature
// ═══════════════════════════════════════════════════════════════

/**
 * Symptom category mapping — mirrors SYM_CATS in App.jsx
 * Used to determine time windows for correlation
 */
const ENGINE_SYM_CATS = {
  'gi-upper': ['Nausea', 'Vomiting', 'Heartburn/Reflux', 'Chest Pain (eating)'],
  'gi-lower': ['Abdominal Cramping', 'Bloating', 'Gas'],
  'bm':       ['Diarrhea', 'Bowel Movement (normal)', 'Constipation'],
  'eoe':      ['Difficulty Swallowing', 'Food Getting Stuck', 'Throat Tightness'],
  'systemic': ['Headache', 'Fatigue', 'Brain Fog', 'Energy Crash', 'Mood Change'],
  'skin':     ['Skin Rash', 'Hives', 'Congestion', 'Joint Pain'],
};

/**
 * Time windows per symptom category (hours)
 * Weight profiles: higher weight = stronger temporal association
 */
const TIME_WINDOWS = {
  'gi-upper':  { ranges: [[0,3,3], [3,6,2], [6,8,1]],        maxHrs: 8  },
  'gi-lower':  { ranges: [[2,6,3], [6,12,2], [12,24,1]],     maxHrs: 24 },
  'bm':        { ranges: [[2,6,3], [6,12,2], [12,24,1]],     maxHrs: 24 },
  'eoe':       { ranges: [[0,24,2], [24,48,1.5], [48,72,1]], maxHrs: 72, cumulative: true },
  'systemic':  { ranges: [[4,12,2], [12,24,2], [24,48,1]],   maxHrs: 48 },
  'skin':      { ranges: [[4,12,2], [12,24,2], [24,48,1]],   maxHrs: 48 },
  'default':   { ranges: [[2,6,3], [6,12,2], [12,24,1]],     maxHrs: 24 },  // custom symptoms
};

/** Get the engine category for a symptom type string */
const getEngineCategory = (symType) => {
  for (const [cat, syms] of Object.entries(ENGINE_SYM_CATS)) {
    if (syms.includes(symType)) return cat;
  }
  return 'default'; // custom symptoms get the broad GI Delayed window
};

/** Parse a date+time into epoch ms */
const toMs = (date, time) => new Date(`${date}T${time || '12:00'}`).getTime();

/** Get weight for a given hour gap and category */
const getWeight = (hrs, category) => {
  const tw = TIME_WINDOWS[category] || TIME_WINDOWS['default'];
  for (const [lo, hi, w] of tw.ranges) {
    if (hrs >= lo && hrs < hi) return w;
  }
  return 0;
};

/** Get max hours for a category */
const getMaxHrs = (category) => {
  return (TIME_WINDOWS[category] || TIME_WINDOWS['default']).maxHrs;
};

/** Is this an EoE cumulative category? */
const isCumulative = (category) => {
  return !!(TIME_WINDOWS[category] || {}).cumulative;
};


// ─── HELPER: Build meal timestamp index ───
const buildMealIndex = (meals) => {
  return meals.map(m => ({
    ...m,
    _ts: toMs(m.date, m.time),
    _ings: (m.ings || []).map(i => typeof i === 'string' ? i.toLowerCase().trim() : (i.name || '').toLowerCase().trim()).filter(Boolean),
    _al: m.al || m.allergens || [],
  })).sort((a, b) => a._ts - b._ts);
};

/** Build symptom timestamp index */
const buildSymIndex = (syms) => {
  return syms.map(s => ({
    ...s,
    _ts: toMs(s.date, s.time),
    _types: s.types || [],
  })).sort((a, b) => a._ts - b._ts);
};


// ═══ LAYER 1: Ingredient-Level Correlation ═══

const calcIngredientCorr = (mealIdx, symIdx, minDataPoints) => {
  // Track: for each ingredient, how often it appears and how often symptoms follow
  const ingStats = {};  // ingName -> { total, symHits: {symType: weightedScore}, noSymCount }

  // First pass: count total meals per ingredient
  mealIdx.forEach(m => {
    m._ings.forEach(ing => {
      if (!ingStats[ing]) ingStats[ing] = { total: 0, symHits: {}, noSymMeals: 0 };
      ingStats[ing].total++;
    });
  });

  // Second pass: for each symptom, find preceding meals and score ingredients
  symIdx.forEach(s => {
    s._types.forEach(symType => {
      const cat = getEngineCategory(symType);
      const maxH = getMaxHrs(cat);

      // Skip EoE — handled separately with cumulative scoring
      if (isCumulative(cat)) return;

      // Find meals in the time window before this symptom
      const windowStart = s._ts - (maxH * 36e5);
      const precedingMeals = mealIdx.filter(m => m._ts >= windowStart && m._ts < s._ts);

      precedingMeals.forEach(m => {
        const hrs = (s._ts - m._ts) / 36e5;
        const weight = getWeight(hrs, cat);
        if (weight <= 0) return;

        m._ings.forEach(ing => {
          if (!ingStats[ing]) ingStats[ing] = { total: 0, symHits: {}, noSymMeals: 0 };
          if (!ingStats[ing].symHits[symType]) ingStats[ing].symHits[symType] = 0;
          ingStats[ing].symHits[symType] += weight;
        });
      });
    });
  });

  // Delta scoring: penalize ingredients in meals NOT followed by symptoms
  // Scale penalty by confidence (fewer data points = lighter penalty)
  mealIdx.forEach(m => {
    m._ings.forEach(ing => {
      if (!ingStats[ing]) return;
      // Check if any symptom follows this meal within broadest window (48h)
      const hasFollowingSym = symIdx.some(s => {
        const gap = s._ts - m._ts;
        return gap > 0 && gap <= 48 * 36e5;
      });
      if (!hasFollowingSym) {
        ingStats[ing].noSymMeals++;
      }
    });
  });

  // Build results with lift calculation
  const totalMeals = mealIdx.length;
  const totalSymEpisodes = symIdx.length;
  if (totalMeals === 0 || totalSymEpisodes === 0) return [];

  const results = [];
  for (const [ing, stats] of Object.entries(ingStats)) {
    if (stats.total < minDataPoints) continue;

    // Aggregate across symptom types
    const symEntries = Object.entries(stats.symHits);
    if (symEntries.length === 0) continue;

    const totalWeightedScore = symEntries.reduce((sum, [, w]) => sum + w, 0);
    const topSymptom = symEntries.sort((a, b) => b[1] - a[1])[0];

    // Baseline exposure: how often this ingredient appears in meals
    const baselineExposure = stats.total / totalMeals;

    // Symptom association rate: proportion of symptom episodes preceded by this ingredient
    // Count unique symptom episodes where this ingredient was in the window
    const symEpisodesWithIng = new Set();
    symIdx.forEach((s, idx) => {
      s._types.forEach(symType => {
        const cat = getEngineCategory(symType);
        if (isCumulative(cat)) return;
        const maxH = getMaxHrs(cat);
        const windowStart = s._ts - (maxH * 36e5);
        const hasMealWithIng = mealIdx.some(m =>
          m._ts >= windowStart && m._ts < s._ts && m._ings.includes(ing)
        );
        if (hasMealWithIng) symEpisodesWithIng.add(idx);
      });
    });

    const symptomAssocRate = symEpisodesWithIng.size / totalSymEpisodes;
    const lift = baselineExposure > 0 ? symptomAssocRate / baselineExposure : 0;

    // Apply delta penalty: reduce score based on no-symptom meals
    const penaltyScale = stats.total >= 10 ? 0.5 : 0.2;
    const penalty = stats.noSymMeals * penaltyScale;
    const adjustedScore = Math.max(0, totalWeightedScore - penalty);

    if (adjustedScore <= 0 && lift < 1.2) continue;

    const confidence = stats.total < 5 ? 'Low' : stats.total < 15 ? 'Medium' : 'High';

    results.push({
      ingredient: ing,
      timesEaten: stats.total,
      symptomEpisodes: symEpisodesWithIng.size,
      totalSymEpisodes,
      topSymptom: topSymptom ? topSymptom[0] : null,
      allSymptoms: Object.fromEntries(symEntries),
      lift: Math.round(lift * 100) / 100,
      confidence,
      score: Math.round(adjustedScore * 10) / 10,
      baselineExposure: Math.round(baselineExposure * 1000) / 10,  // as percentage
    });
  }

  return results
    .filter(r => r.lift >= 1.0 || r.score > 3)  // Only show meaningful correlations
    .sort((a, b) => b.lift - a.lift || b.score - a.score)
    .slice(0, 20);
};


// ═══ LAYER 2: Allergen-Category Correlation (with lift) ═══

const calcAllergenCorr = (mealIdx, symIdx, minDataPoints) => {
  const totalMeals = mealIdx.length;
  const totalSymEpisodes = symIdx.length;
  if (totalMeals === 0 || totalSymEpisodes === 0) return [];

  // Count meals per allergen
  const allergenMealCount = {};
  mealIdx.forEach(m => {
    m._al.forEach(a => {
      allergenMealCount[a] = (allergenMealCount[a] || 0) + 1;
    });
  });

  // For each allergen, count symptom episodes preceded by it
  const allergenSymData = {};  // allergen -> { symTypeScores, episodeSet }

  symIdx.forEach((s, sIdx) => {
    s._types.forEach(symType => {
      const cat = getEngineCategory(symType);

      // Skip EoE — handled by cumulative scoring below
      if (isCumulative(cat)) return;

      const maxH = getMaxHrs(cat);
      const windowStart = s._ts - (maxH * 36e5);
      const precedingMeals = mealIdx.filter(m => m._ts >= windowStart && m._ts < s._ts);

      const seenAllergens = new Set();
      precedingMeals.forEach(m => {
        const hrs = (s._ts - m._ts) / 36e5;
        const weight = getWeight(hrs, cat);
        if (weight <= 0) return;

        m._al.forEach(a => {
          if (!allergenSymData[a]) allergenSymData[a] = { symScores: {}, episodes: new Set() };
          if (!allergenSymData[a].symScores[symType]) allergenSymData[a].symScores[symType] = 0;
          allergenSymData[a].symScores[symType] += weight;
          seenAllergens.add(a);
        });
      });

      // Mark this symptom episode as associated with these allergens
      seenAllergens.forEach(a => {
        allergenSymData[a].episodes.add(sIdx);
      });
    });
  });

  // Build results
  const results = [];
  for (const [allergen, data] of Object.entries(allergenSymData)) {
    const mealCount = allergenMealCount[allergen] || 0;
    if (mealCount < minDataPoints) continue;

    const baselineExposure = mealCount / totalMeals;
    const symptomAssocRate = data.episodes.size / totalSymEpisodes;
    const lift = baselineExposure > 0 ? symptomAssocRate / baselineExposure : 0;

    const symEntries = Object.entries(data.symScores).sort((a, b) => b[1] - a[1]);
    const totalScore = symEntries.reduce((sum, [, w]) => sum + w, 0);
    const confidence = mealCount < 5 ? 'Low' : mealCount < 15 ? 'Medium' : 'High';

    results.push({
      allergen,
      mealsWithAllergen: mealCount,
      totalMeals,
      symptomEpisodes: data.episodes.size,
      totalSymEpisodes,
      topSymptom: symEntries[0] ? symEntries[0][0] : null,
      allSymptoms: Object.fromEntries(symEntries),
      lift: Math.round(lift * 100) / 100,
      confidence,
      score: Math.round(totalScore * 10) / 10,
      baselineExposure: Math.round(baselineExposure * 1000) / 10,  // percentage
      symptomAssocRate: Math.round(symptomAssocRate * 1000) / 10,   // percentage
    });
  }

  return results
    .sort((a, b) => b.lift - a.lift || b.score - a.score)
    .slice(0, 15);
};


// ═══ EoE CUMULATIVE EXPOSURE SCORING ═══

const calcEoECumulative = (mealIdx, symIdx) => {
  const EOE_SYMS = ['Difficulty Swallowing', 'Food Getting Stuck', 'Throat Tightness'];
  const eoeEpisodes = symIdx.filter(s => s._types.some(t => EOE_SYMS.includes(t)));

  if (eoeEpisodes.length < 2) return null; // Need multiple episodes for meaningful analysis

  // For each EoE episode, look at 72hr rolling allergen exposure
  const allergenExposure = {};  // allergen -> { eoeWindowMeals, eoeWindowTotal, baselineMeals, baselineTotal }

  // Get all unique allergens
  const allAllergens = new Set();
  mealIdx.forEach(m => m._al.forEach(a => allAllergens.add(a)));

  // For baseline: use ALL non-EoE days (days with no swallowing symptoms).
  // This is more statistically honest than slicing the first 20, which would
  // skew toward early data and miss pattern changes over time (e.g. diet phases).
  // Computed once, outside the per-allergen loop.
  const eoeDates = new Set(eoeEpisodes.map(s => s.date));
  const baselineDates = [...new Set(mealIdx.map(m => m.date))].filter(d => !eoeDates.has(d));

  allAllergens.forEach(allergen => {
    let eoeWindowMeals = 0;
    let eoeWindowTotal = 0;
    let baseWindowMeals = 0;
    let baseWindowTotal = 0;

    // For each EoE episode, count meals with this allergen in 72hr window
    eoeEpisodes.forEach(s => {
      const windowStart = s._ts - (72 * 36e5);
      const windowMeals = mealIdx.filter(m => m._ts >= windowStart && m._ts < s._ts);
      const withAllergen = windowMeals.filter(m => m._al.includes(allergen));
      eoeWindowMeals += withAllergen.length;
      eoeWindowTotal += windowMeals.length;
    });

    baselineDates.forEach(d => {
      const dayEnd = toMs(d, '23:59');
      const windowStart = dayEnd - (72 * 36e5);
      const windowMeals = mealIdx.filter(m => m._ts >= windowStart && m._ts <= dayEnd);
      const withAllergen = windowMeals.filter(m => m._al.includes(allergen));
      baseWindowMeals += withAllergen.length;
      baseWindowTotal += windowMeals.length;
    });

    if (eoeWindowTotal > 0) {
      allergenExposure[allergen] = {
        eoeRate: eoeWindowMeals / eoeWindowTotal,
        eoeCount: eoeWindowMeals,
        eoeTotal: eoeWindowTotal,
        baseRate: baseWindowTotal > 0 ? baseWindowMeals / baseWindowTotal : 0,
        baseCount: baseWindowMeals,
        baseTotal: baseWindowTotal,
      };
    }
  });

  // Build results: only allergens with higher rate in EoE windows vs baseline
  const results = [];
  for (const [allergen, data] of Object.entries(allergenExposure)) {
    const lift = data.baseRate > 0 ? data.eoeRate / data.baseRate : (data.eoeRate > 0 ? 999 : 0);
    if (lift <= 1.0 && data.eoeRate <= 0) continue;

    results.push({
      allergen,
      eoeRate: Math.round(data.eoeRate * 1000) / 10,
      baseRate: Math.round(data.baseRate * 1000) / 10,
      lift: Math.round(lift * 100) / 100,
      eoeEpisodes: eoeEpisodes.length,
      detail: `${data.eoeCount} of ${data.eoeTotal} meals in 72hr windows before swallowing episodes`,
    });
  }

  return results.length > 0
    ? { episodes: eoeEpisodes.length, correlations: results.sort((a, b) => b.lift - a.lift) }
    : null;
};


// ═══ LAYER 3: Pattern Detection ═══

const calcPatterns = (mealIdx, symIdx) => {
  const patterns = {};

  // ─── Time-of-day patterns ───
  const timeBuckets = { Morning: [5, 11], Afternoon: [11, 17], Evening: [17, 22], Night: [22, 5] };

  const getBucket = (time) => {
    if (!time) return 'Afternoon'; // default
    const hr = parseInt(time.split(':')[0], 10);
    if (hr >= 5 && hr < 11) return 'Morning';
    if (hr >= 11 && hr < 17) return 'Afternoon';
    if (hr >= 17 && hr < 22) return 'Evening';
    return 'Night';
  };

  // Symptom distribution by time of day
  const symByTime = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
  const symByTimeByType = {};  // symType -> {Morning:n, ...}
  symIdx.forEach(s => {
    const bucket = getBucket(s.time);
    symByTime[bucket]++;
    s._types.forEach(t => {
      if (!symByTimeByType[t]) symByTimeByType[t] = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
      symByTimeByType[t][bucket]++;
    });
  });

  const totalSyms = Object.values(symByTime).reduce((a, b) => a + b, 0);
  const timeOfDay = {};
  if (totalSyms >= 5) {
    // Find significant clustering
    const alerts = [];
    for (const [type, buckets] of Object.entries(symByTimeByType)) {
      const typeTotal = Object.values(buckets).reduce((a, b) => a + b, 0);
      if (typeTotal < 3) continue;
      for (const [bucket, count] of Object.entries(buckets)) {
        const pct = count / typeTotal;
        if (pct >= 0.6 && count >= 3) {
          alerts.push({
            symptom: type,
            bucket,
            pct: Math.round(pct * 100),
            count,
            total: typeTotal,
          });
        }
      }
    }
    timeOfDay.distribution = symByTime;
    timeOfDay.total = totalSyms;
    timeOfDay.alerts = alerts;
  }
  patterns.timeOfDay = timeOfDay;

  // Meal distribution by time of day (for comparison)
  const mealByTime = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
  mealIdx.forEach(m => { mealByTime[getBucket(m.time)]++; });
  patterns.mealTimeDistribution = mealByTime;

  // ─── Day-of-week patterns ───
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const symByDay = [0, 0, 0, 0, 0, 0, 0];
  symIdx.forEach(s => {
    const dow = new Date(s.date + 'T12:00').getDay();
    symByDay[dow]++;
  });

  const avgPerDay = totalSyms / 7;
  const dayAlerts = [];
  if (totalSyms >= 7) {
    symByDay.forEach((count, i) => {
      if (count > avgPerDay * 1.5 && count >= 3) {
        dayAlerts.push({
          day: dayNames[i],
          count,
          avg: Math.round(avgPerDay * 10) / 10,
          ratio: Math.round((count / avgPerDay) * 10) / 10,
        });
      }
    });
  }
  patterns.dayOfWeek = {
    distribution: dayNames.map((name, i) => ({ day: name, short: name.slice(0, 3), count: symByDay[i] })),
    alerts: dayAlerts,
    total: totalSyms,
  };

  // ─── Meal-gap analysis ───
  const gapBuckets = { '<1hr': 0, '1-3hr': 0, '3-6hr': 0, '6-12hr': 0, '12hr+': 0 };
  let gapCount = 0;
  symIdx.forEach(s => {
    // Find most recent meal before this symptom
    const precedingMeals = mealIdx.filter(m => m._ts < s._ts);
    if (precedingMeals.length === 0) return;
    const lastMeal = precedingMeals[precedingMeals.length - 1]; // already sorted asc
    const gapHrs = (s._ts - lastMeal._ts) / 36e5;

    if (gapHrs < 1) gapBuckets['<1hr']++;
    else if (gapHrs < 3) gapBuckets['1-3hr']++;
    else if (gapHrs < 6) gapBuckets['3-6hr']++;
    else if (gapHrs < 12) gapBuckets['6-12hr']++;
    else gapBuckets['12hr+']++;
    gapCount++;
  });

  const gapAlerts = [];
  if (gapCount >= 5) {
    for (const [bucket, count] of Object.entries(gapBuckets)) {
      const pct = count / gapCount;
      if (pct >= 0.5 && count >= 3) {
        gapAlerts.push({ bucket, pct: Math.round(pct * 100), count, total: gapCount });
      }
    }
  }
  patterns.mealGap = { distribution: gapBuckets, total: gapCount, alerts: gapAlerts };

  // ─── Stacking detection ───
  // Compare symptom rate for meals with 2+ trigger allergens vs single allergen
  // A "trigger allergen" is one with lift > 1.2 (passed in or calculated)
  // For now, just compare multi-allergen meals vs single-allergen meals.
  // Only count symptoms in GI-relevant categories (gi-upper/gi-lower/bm/eoe)
  // — skin/systemic symptoms 23hrs later aren't meaningfully "stacking" evidence.
  const GI_CATS = new Set(['gi-upper', 'gi-lower', 'bm', 'eoe']);
  const isGiSym = (s) => s._types.some(t => GI_CATS.has(getEngineCategory(t)));

  let singleAllergenMeals = 0, singleAllergenSymFollowed = 0;
  let multiAllergenMeals = 0, multiAllergenSymFollowed = 0;

  mealIdx.forEach(m => {
    if (m._al.length === 0) return;
    const hasFollowingSym = symIdx.some(s => {
      const gap = s._ts - m._ts;
      return gap > 0 && gap <= 24 * 36e5 && isGiSym(s);
    });
    if (m._al.length === 1) {
      singleAllergenMeals++;
      if (hasFollowingSym) singleAllergenSymFollowed++;
    } else {
      multiAllergenMeals++;
      if (hasFollowingSym) multiAllergenSymFollowed++;
    }
  });

  const singleRate = singleAllergenMeals > 0 ? singleAllergenSymFollowed / singleAllergenMeals : 0;
  const multiRate = multiAllergenMeals > 0 ? multiAllergenSymFollowed / multiAllergenMeals : 0;
  const stackingMultiplier = singleRate > 0 ? multiRate / singleRate : 0;

  patterns.stacking = {
    singleAllergenMeals,
    singleAllergenSymRate: Math.round(singleRate * 1000) / 10,
    multiAllergenMeals,
    multiAllergenSymRate: Math.round(multiRate * 1000) / 10,
    multiplier: Math.round(stackingMultiplier * 100) / 100,
    significant: multiAllergenMeals >= 5 && singleAllergenMeals >= 5 && stackingMultiplier > 1.3,
  };

  return patterns;
};


// ═══ TIMELINE (kept for backward compat + Insights chart) ═══

const calcTimeline = (syms) => {
  const now = new Date();
  const tl = [];
  for (let w = 7; w >= 0; w--) {
    const ws = new Date(now); ws.setDate(now.getDate() - (w * 7 + 6));
    const we = new Date(now); we.setDate(now.getDate() - w * 7);
    const wss = ws.toISOString().split('T')[0];
    const wes = we.toISOString().split('T')[0];
    const wSym = syms.filter(s => s.date >= wss && s.date <= wes);
    tl.push({
      w: `W${8 - w}`, n: wSym.length,
      sv: wSym.reduce((s, x) => s + (x.severity === 'Severe' ? 3 : x.severity === 'Moderate' ? 2 : 1), 0),
      lb: wss.slice(5),
    });
  }
  return tl;
};


// ═══ MAIN ENTRY POINT ═══

/**
 * Correlation Engine V2
 *
 * Returns: {
 *   ingredients: [...],    // Layer 1: ingredient-level correlations with lift
 *   allergens: [...],      // Layer 2: allergen-category correlations with lift
 *   eoe: null | {...},     // EoE cumulative exposure analysis
 *   patterns: {...},       // Layer 3: time-of-day, day-of-week, meal-gap, stacking
 *   timeline: [...],       // Weekly symptom trend (backward compat)
 *   // Backward compat aliases:
 *   ac: [...],             // = allergens (old format, mapped)
 *   fc: [...],             // = top food correlations (old format, mapped)
 *   tl: [...],             // = timeline
 * }
 */
export const calcCorr = (meals, syms) => {
  if (!meals.length || !syms.length) {
    return {
      ingredients: [], allergens: [], eoe: null,
      patterns: { timeOfDay: {}, dayOfWeek: { distribution: [], alerts: [] }, mealGap: { distribution: {}, alerts: [] }, stacking: {} },
      timeline: [],
      ac: [], fc: [], tl: [],
    };
  }

  const MIN_DATA_POINTS = 3;

  // Build indexed data
  const mealIdx = buildMealIndex(meals);
  const symIdx = buildSymIndex(syms);

  // Layer 1: Ingredient-level
  const ingredients = calcIngredientCorr(mealIdx, symIdx, MIN_DATA_POINTS);

  // Layer 2: Allergen-category
  const allergens = calcAllergenCorr(mealIdx, symIdx, MIN_DATA_POINTS);

  // EoE cumulative
  const eoe = calcEoECumulative(mealIdx, symIdx);

  // Layer 3: Patterns
  const patterns = calcPatterns(mealIdx, symIdx);

  // Timeline
  const timeline = calcTimeline(syms);

  // ─── Backward compatibility mapping ───
  // Map new allergen format to old { a, s, c, t, r, w } format
  const ac = allergens.map(a => ({
    a: a.allergen,
    s: a.topSymptom || '',
    c: a.symptomEpisodes,
    t: a.mealsWithAllergen,
    r: Math.min(100, Math.round(a.lift * 33)),  // rough visual mapping: lift 3.0 = 100%
    w: a.score,
    lift: a.lift,
    confidence: a.confidence,
  }));

  // Map ingredients to old food correlation format
  const fc = ingredients.slice(0, 10).map(ig => ({
    f: ig.ingredient,
    s: ig.topSymptom || '',
    c: ig.symptomEpisodes,
    t: ig.timesEaten,
    r: Math.min(100, Math.round(ig.lift * 33)),
    w: ig.score,
    lift: ig.lift,
    confidence: ig.confidence,
  }));

  return {
    ingredients,
    allergens,
    eoe,
    patterns,
    timeline,
    // Backward compat
    ac,
    fc,
    tl: timeline,
  };
};
