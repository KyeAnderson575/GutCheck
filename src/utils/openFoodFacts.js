/**
 * openFoodFacts.js — Open Food Facts API integration
 * 
 * Free, no API key required.
 * Looks up food products by barcode or search query.
 * Returns allergens, ingredients, nutrition data.
 */

const BASE_URL = 'https://world.openfoodfacts.org';

/**
 * Look up a product by barcode (UPC/EAN)
 */
export async function lookupBarcode(barcode) {
  try {
    const res = await fetch(`${BASE_URL}/api/v2/product/${barcode}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;
    return parseProduct(data.product);
  } catch (err) {
    console.error('Barcode lookup error:', err);
    return null;
  }
}

/**
 * Search for products by name
 * Strategy: Try the .json search endpoint first (some have CORS),
 * then fall back to a Cloudflare Workers proxy if needed.
 */
export async function searchProducts(query, limit = 10) {
  // Approach 1: Use the search API with .json (has CORS on some endpoints)
  try {
    const res = await fetch(
      `${BASE_URL}/api/v2/search?search_terms=${encodeURIComponent(query)}&page_size=${limit}&fields=code,product_name,brands,allergens_tags,ingredients_text,image_front_small_url,nutriscore_grade&json=1`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (res.ok) {
      const data = await res.json();
      const results = (data.products || []).filter(p => p.product_name).map(p => parseProduct(p));
      if (results.length > 0) return results;
    }
  } catch (e) {
    // CORS blocked — try approach 2
  }

  // Approach 2: Search by looking up individual category/brand pages (these have CORS)
  try {
    // Use the brand or category facet which does support CORS
    const res = await fetch(
      `${BASE_URL}/api/v2/search?brands_tags=${encodeURIComponent(query)}&page_size=${limit}&fields=code,product_name,brands,allergens_tags,ingredients_text,image_front_small_url,nutriscore_grade`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (res.ok) {
      const data = await res.json();
      const results = (data.products || []).filter(p => p.product_name).map(p => parseProduct(p));
      if (results.length > 0) return results;
    }
  } catch (e) {
    // Also blocked
  }

  // Approach 3: Use JSONP-style workaround — fetch as script
  // This won't work in all cases, so return empty with a helpful message
  console.warn('Product search: All endpoints blocked by CORS. Use barcode scan or manual barcode entry instead.');
  return [];
}

/**
 * Parse an Open Food Facts product into our app's format
 */
function parseProduct(p) {
  const allergenMap = {
    'en:gluten': 'gluten', 'en:wheat': 'gluten',
    'en:milk': 'dairy', 'en:lactose': 'dairy',
    'en:eggs': 'eggs',
    'en:soybeans': 'soy', 'en:soya': 'soy',
    'en:nuts': 'nuts', 'en:tree-nuts': 'nuts',
    'en:almonds': 'nuts', 'en:walnuts': 'nuts', 'en:cashews': 'nuts',
    'en:pecans': 'nuts', 'en:pistachios': 'nuts', 'en:hazelnuts': 'nuts',
    'en:peanuts': 'peanuts',
    'en:crustaceans': 'shellfish', 'en:molluscs': 'shellfish',
    'en:fish': 'fish',
    'en:sesame-seeds': 'sesame', 'en:sesame': 'sesame',
  };

  const detectedAllergens = new Set();

  (p.allergens_tags || []).forEach(tag => {
    const mapped = allergenMap[tag.toLowerCase()];
    if (mapped) detectedAllergens.add(mapped);
  });

  // Also scan ingredients text for allergen keywords
  const ingText = (p.ingredients_text || '').toLowerCase();
  const kwMap = [
    [['milk','cream','cheese','butter','whey','casein','lactose'], 'dairy'],
    [['wheat','flour','gluten','barley','rye'], 'gluten'],
    [['egg'], 'eggs'],
    [['soy','soja'], 'soy'],
    [['peanut'], 'peanuts'],
    [['almond','walnut','cashew','pecan','pistachio','hazelnut'], 'nuts'],
    [['shrimp','crab','lobster'], 'shellfish'],
    [['fish','anchov','salmon','tuna'], 'fish'],
    [['sesame','tahini'], 'sesame'],
  ];
  kwMap.forEach(([keywords, allergen]) => {
    if (keywords.some(kw => ingText.includes(kw))) detectedAllergens.add(allergen);
  });

  const ingredients = (p.ingredients_text || '')
    .split(/,|;/)
    .map(i => i.trim())
    .filter(i => i.length > 0 && i.length < 80)
    .slice(0, 30);

  return {
    barcode: p.code || '',
    name: p.product_name || 'Unknown Product',
    brand: p.brands || '',
    allergens: [...detectedAllergens],
    ingredients,
    ingredientsRaw: p.ingredients_text || '',
    image: p.image_front_small_url || null,
    nutriscore: p.nutriscore_grade || null,
    source: 'openfoodfacts',
  };
}
