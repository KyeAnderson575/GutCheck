/**
 * giRisk.js — GI Risk Flag System & Smart Allergen Detection
 * 
 * Sources: AGA EoE guidelines (6-FED), Monash University FODMAP, ACG reflux guidelines.
 * These are NOT diagnoses — they flag foods with known GI-symptom associations.
 */

// Risk flag categories
export const GI_RISK_CATS = [
  { id: 'eoe', l: 'EoE trigger', ic: '🔬', c: '#c084fc', desc: 'One of the 6 foods most commonly associated with eosinophilic esophagitis (AGA 6-food elimination diet protocol: dairy, wheat, eggs, soy, nuts/peanuts, seafood/fish).' },
  { id: 'fodmap', l: 'High FODMAP', ic: '💨', c: '#fbbf24', desc: 'Contains fermentable carbohydrates (FODMAPs) associated with IBS-type GI symptoms including bloating, gas, cramping, and diarrhea (Monash University FODMAP database).' },
  { id: 'reflux', l: 'Reflux trigger', ic: '🔥', c: '#fb923c', desc: 'Known to relax the lower esophageal sphincter or increase acid production, associated with GERD/reflux symptoms (ACG clinical guidelines).' },
  { id: 'irritant', l: 'GI irritant', ic: '⚡', c: '#f87171', desc: 'Foods commonly reported to aggravate GI symptoms through direct mucosal irritation, high fat content, or osmotic effects.' },
];

// Allergen-based flags
const GI_RISK_BY_ALLERGEN = {
  dairy: ['eoe', 'fodmap', 'reflux'], wheat: ['eoe', 'fodmap'], gluten: ['eoe', 'fodmap'],
  eggs: ['eoe'], soy: ['eoe'], nuts: ['eoe'], peanuts: ['eoe'],
  shellfish: ['eoe'], fish: ['eoe'], sesame: [],
};

// Name-based flags (case-insensitive partial match)
const GI_RISK_BY_NAME = [
  // High FODMAP foods (Monash University database)
  { q: ['onion', 'garlic', 'leek', 'shallot'], f: ['fodmap'] },
  { q: ['apple', 'pear', 'mango', 'watermelon', 'cherry', 'peach', 'plum', 'nectarine', 'apricot'], f: ['fodmap'] },
  { q: ['honey', 'agave', 'high fructose', 'hfcs'], f: ['fodmap'] },
  { q: ['cauliflower', 'mushroom', 'artichoke', 'asparagus', 'sugar snap', 'snow pea'], f: ['fodmap'] },
  { q: ['black beans', 'kidney beans', 'baked beans', 'lentil', 'chickpea', 'hummus'], f: ['fodmap'] },
  { q: ['wheat bread', 'rye', 'barley'], f: ['fodmap'] },
  // Reflux triggers (ACG clinical guidelines)
  { q: ['coffee', 'espresso', 'americano', 'cold brew', 'pike place', 'caffeine'], f: ['reflux'] },
  { q: ['chocolate', 'cocoa', 'mocha'], f: ['reflux'] },
  { q: ['tomato', 'marinara', 'salsa', 'pico', 'ketchup'], f: ['reflux'] },
  { q: ['orange juice', 'lemon', 'lime', 'grapefruit', 'citrus'], f: ['reflux'] },
  { q: ['mint', 'peppermint', 'spearmint'], f: ['reflux'] },
  { q: ['alcohol', 'beer', 'wine', 'cocktail', 'margarita', 'tequila', 'vodka', 'whiskey'], f: ['reflux'] },
  { q: ['soda', 'cola', 'sprite', 'mountain dew', 'dr pepper', 'carbonated', 'sparkling', 'energy drink'], f: ['reflux', 'irritant'] },
  { q: ['bacon', 'sausage', 'hot dog', 'pepperoni', 'salami', 'bratwurst'], f: ['reflux', 'irritant'] },
  // GI irritants
  { q: ['fried', 'deep fried', 'crispy', 'breaded', 'battered', 'fries', 'nugget', 'tenders', 'strips'], f: ['irritant'] },
  { q: ['spicy', 'hot sauce', 'jalapeño', 'habanero', 'sriracha', 'buffalo', 'cayenne', 'chili flake', 'tabasco'], f: ['irritant'] },
  { q: ['artificial sweetener', 'sugar free', 'diet soda', 'sucralose', 'aspartame', 'sorbitol', 'xylitol', 'maltitol'], f: ['irritant', 'fodmap'] },
  { q: ['cream sauce', 'alfredo', 'gravy', 'cream cheese', 'sour cream', 'heavy cream'], f: ['reflux'] },
  { q: ['ice cream', 'milkshake', 'mcflurry', 'frosty', 'sundae', 'gelato'], f: ['reflux', 'fodmap'] },
  { q: ['pizza'], f: ['reflux', 'irritant'] },
];

/**
 * Get risk flags for a food item
 * @param {string} name - Food name/description
 * @param {string[]} allergens - Array of allergen IDs
 * @returns {string[]} Array of risk flag IDs
 */
export const getGIRisk = (name, allergens) => {
  const flags = new Set();
  (allergens || []).forEach(a => {
    (GI_RISK_BY_ALLERGEN[a] || []).forEach(f => flags.add(f));
  });
  if (name) {
    const nl = name.toLowerCase();
    GI_RISK_BY_NAME.forEach(rule => {
      if (rule.q.some(q => nl.includes(q))) rule.f.forEach(f => flags.add(f));
    });
  }
  return [...flags];
};

// Smart allergen detection from ingredient names
export const ING_ALLERGEN_MAP = [
  // Dairy
  { q: ['milk', 'cream', 'cheese', 'butter', 'yogurt', 'whey', 'casein', 'lactose', 'ghee', 'sour cream', 'cream cheese', 'half and half', 'condensed milk', 'evaporated milk', 'ricotta', 'mozzarella', 'parmesan', 'cheddar', 'provolone', 'swiss', 'gouda', 'brie', 'feta', 'cottage cheese', 'queso', 'ranch', 'alfredo', 'bechamel', 'custard', 'ice cream', 'gelato', 'milkshake', 'latte', 'cappuccino', 'mocha', 'frosty', 'mcflurry', 'sundae', 'nacho cheese', 'velveeta', 'colby', 'pepper jack', 'american cheese', 'string cheese', 'chowder', 'au gratin', 'scalloped potatoes', 'creamy', 'tzatziki', 'raita', 'burrata', 'mascarpone', 'cool whip', 'whipped cream', 'coffee creamer'], a: 'dairy' },
  // Gluten/Wheat
  { q: ['flour', 'bread', 'pasta', 'noodle', 'tortilla', 'bun', 'roll', 'crouton', 'breadcrumb', 'panko', 'soy sauce', 'teriyaki', 'worcestershire', 'barley', 'rye', 'couscous', 'orzo', 'farro', 'semolina', 'durum', 'seitan', 'beer batter', 'gravy', 'roux', 'cracker', 'pretzel', 'pita', 'naan', 'croissant', 'biscuit', 'dumpling', 'wonton', 'pie crust', 'cake', 'cookie', 'muffin', 'pancake', 'waffle', 'bagel', 'english muffin', 'cornbread', 'stuffing', 'dressing', 'breading', 'fried chicken', 'chicken tender', 'chicken nugget', 'chicken strip', 'onion ring', 'mozzarella stick', 'cinnamon roll', 'donut', 'doughnut', 'brownie', 'pizza dough', 'pizza crust', 'calzone', 'stromboli', 'wrap', 'sub', 'hoagie', 'pho', 'ramen', 'udon', 'lo mein', 'chow mein', 'mac and cheese', 'mac & cheese', 'lasagna', 'ravioli', 'tortellini', 'gnocchi', 'cereal', 'granola', 'oat', 'oatmeal', 'wheat', 'flour tortilla'], a: 'gluten' },
  // Eggs
  { q: ['egg', 'eggs', 'mayo', 'mayonnaise', 'aioli', 'meringue', 'custard', 'hollandaise', 'béarnaise', 'french toast', 'quiche', 'frittata', 'egg wash', 'egg noodle', 'ranch', 'caesar dressing', 'eggnog', 'egg roll', 'egg drop', 'deviled', 'shakshuka', 'carbonara', 'egg salad', 'thousand island', 'tartar sauce'], a: 'eggs' },
  // Soy
  { q: ['soy sauce', 'soy', 'tofu', 'tempeh', 'edamame', 'miso', 'soybean', 'soy milk', 'teriyaki', 'hoisin', 'ranch', 'mayo', 'mayonnaise', 'vegetable oil', 'soybean oil', 'miso soup', 'soy lecithin'], a: 'soy' },
  // Tree nuts
  { q: ['almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'macadamia', 'hazelnut', 'brazil nut', 'pine nut', 'chestnut', 'praline', 'marzipan', 'nougat', 'pesto', 'almond milk', 'nutella', 'baklava', 'trail mix', 'mixed nuts', 'almond butter', 'cashew butter'], a: 'nuts' },
  // Peanuts
  { q: ['peanut', 'peanut butter', 'peanut oil', 'satay', 'pad thai', 'peanut sauce', 'kung pao', 'boiled peanut', 'trail mix', 'snickers', 'reese'], a: 'peanuts' },
  // Shellfish
  { q: ['shrimp', 'crab', 'lobster', 'crawfish', 'crayfish', 'prawn', 'scallop', 'clam', 'mussel', 'oyster', 'calamari', 'squid', 'crab cake', 'crab rangoon', 'shrimp cocktail', 'lobster roll', 'clam chowder', 'paella', 'gumbo', 'jambalaya'], a: 'shellfish' },
  // Fish
  { q: ['salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'trout', 'anchovy', 'sardine', 'mackerel', 'swordfish', 'mahi', 'bass', 'catfish', 'snapper', 'fish sauce', 'worcestershire', 'caesar dressing', 'fish taco', 'fish stick', 'fish fillet', 'sushi', 'sashimi', 'poke', 'lox', 'smoked salmon', 'fish and chips', 'ceviche'], a: 'fish' },
  // Sesame
  { q: ['sesame', 'tahini', 'hummus', 'halvah', 'sesame oil', 'sesame seed', 'everything bagel', 'bao', 'bun (sesame)'], a: 'sesame' },
];

/**
 * Detect allergens from ingredient list
 * @param {string[]} ingredients - Array of ingredient names
 * @returns {string[]} Array of detected allergen IDs
 */
export const detectAllergens = (ingredients) => {
  const found = new Set();
  (ingredients || []).forEach(ing => {
    const il = ing.toLowerCase();
    ING_ALLERGEN_MAP.forEach(rule => {
      if (rule.q.some(q => il.includes(q))) found.add(rule.a);
    });
  });
  return [...found];
};
