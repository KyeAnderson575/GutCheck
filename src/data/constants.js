/**
 * constants.js — App-wide constants
 *
 * These are the reference data that ship with the app.
 * NO personal data (medical history, food orders, etc.) goes here.
 * Personal data is imported by the user via backup files.
 */

// Allergen definitions
export const AL = [
  { id: 'gluten', l: 'Gluten/Wheat', i: '🌾' },
  { id: 'dairy', l: 'Dairy', i: '🥛' },
  { id: 'soy', l: 'Soy', i: '🫘' },
  { id: 'eggs', l: 'Eggs', i: '🥚' },
  { id: 'nuts', l: 'Tree Nuts', i: '🥜' },
  { id: 'peanuts', l: 'Peanuts', i: '🥜' },
  { id: 'shellfish', l: 'Shellfish', i: '🦐' },
  { id: 'fish', l: 'Fish', i: '🐟' },
  { id: 'sesame', l: 'Sesame', i: '🫓' },
];

// Food tags
export const FTAGS = ['Homemade', 'Restaurant', 'Takeout', 'Processed', 'Spicy', 'Fried', 'Raw', 'Fermented', 'High Fiber', 'High Protein', 'Low Carb'];

// Meal types
export const MT = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drink'];

// Symptom list
export const SYM_LIST = [
  'Nausea', 'Stomach Pain', 'Vomiting', 'Diarrhea', 'Difficulty Swallowing',
  'Food Getting Stuck', 'Throat Tightness', 'Chest Pain (eating)',
  'Abdominal Cramping', 'Bloating', 'Gas', 'Heartburn/Reflux', 'Headache',
  'Fatigue', 'Brain Fog', 'Skin Rash', 'Hives', 'Congestion', 'Joint Pain',
  'Constipation', 'Energy Crash', 'Mood Change', 'Bowel Movement (normal)',
];

// Severity levels
export const SEV = ['Mild', 'Moderate', 'Severe'];

// Bristol Stool Scale
export const BRISTOL = [
  { t: 1, d: 'Hard lumps', i: '⚫' },
  { t: 2, d: 'Lumpy sausage', i: '🟤' },
  { t: 3, d: 'Cracked sausage', i: '🟫' },
  { t: 4, d: 'Smooth soft', i: '✅' },
  { t: 5, d: 'Soft blobs', i: '🟡' },
  { t: 6, d: 'Mushy', i: '🟠' },
  { t: 7, d: 'Liquid', i: '🔴' },
];

// Elimination diet foods
export const ELIM_FOODS = ['Dairy', 'Wheat/Gluten', 'Eggs', 'Soy', 'Nuts/Peanuts', 'Seafood/Fish', 'Sesame'];

// Diet phases
export const DIET_PHASES = ['baseline', 'elimination', 'reintroduction'];

// Procedure types
export const PROC_TYPES = [
  'Endoscopy (EGD)', 'Colonoscopy', 'Biopsy', 'pH Study', 'Motility Study',
  'Breath Test (SIBO)', 'Breath Test (Lactose)', 'Breath Test (Fructose)',
  'CT Scan', 'Ultrasound', 'MRI', 'Blood Draw', 'Allergy Testing', 'Other',
];

// Diagnosis statuses
export const DX_STATUS = ['Confirmed', 'Suspected', 'Ruled Out', 'Under Evaluation'];

// Lab types with reference ranges
export const LAB_TYPES = [
  { id: 'eos_prox', name: 'Eosinophils — Proximal Esophagus', unit: 'eos/hpf', ref: '<15' },
  { id: 'eos_dist', name: 'Eosinophils — Distal Esophagus', unit: 'eos/hpf', ref: '<15' },
  { id: 'eos_stomach', name: 'Eosinophils — Stomach', unit: 'eos/hpf', ref: '<10' },
  { id: 'eos_duod', name: 'Eosinophils — Duodenum', unit: 'eos/hpf', ref: '<10' },
  { id: 'crp', name: 'CRP', unit: 'mg/L', ref: '<3.0' },
  { id: 'esr', name: 'ESR', unit: 'mm/hr', ref: '0-20' },
  { id: 'ige', name: 'Total IgE', unit: 'IU/mL', ref: '<100' },
  { id: 'ttg_iga', name: 'tTG-IgA (Celiac)', unit: 'CU', ref: '≤19.90' },
  { id: 'iga', name: 'IgA', unit: 'mg/dL', ref: '40-350' },
  { id: 'wbc', name: 'WBC', unit: 'K/uL', ref: '4.5-11.0' },
  { id: 'rbc', name: 'RBC', unit: 'M/uL', ref: '4.5-5.5' },
  { id: 'hgb', name: 'Hemoglobin', unit: 'g/dL', ref: '13.5-17.5' },
  { id: 'hct', name: 'Hematocrit', unit: '%', ref: '38-50' },
  { id: 'plt', name: 'Platelets', unit: 'K/uL', ref: '150-400' },
  { id: 'iron', name: 'Iron', unit: 'mcg/dL', ref: '60-170' },
  { id: 'ferritin', name: 'Ferritin', unit: 'ng/mL', ref: '20-250' },
  { id: 'vitd', name: 'Vitamin D', unit: 'ng/mL', ref: '30-100' },
  { id: 'alt', name: 'ALT', unit: 'U/L', ref: '<50' },
  { id: 'ast', name: 'AST', unit: 'U/L', ref: '5-40' },
  { id: 'alb', name: 'Albumin', unit: 'g/dL', ref: '3.5-5.0' },
  { id: 'sodium', name: 'Sodium', unit: 'mEq/L', ref: '135-145' },
  { id: 'potassium', name: 'Potassium', unit: 'mEq/L', ref: '3.5-5.0' },
  { id: 'chloride', name: 'Chloride', unit: 'mEq/L', ref: '98-109' },
  { id: 'co2', name: 'CO2', unit: 'mmol/L', ref: '20-31' },
  { id: 'bun', name: 'BUN', unit: 'mg/dL', ref: '10-23.0' },
  { id: 'creatinine', name: 'Creatinine', unit: 'mg/dL', ref: '0.60-1.30' },
  { id: 'egfr', name: 'eGFR (CKD-EPI)', unit: 'mL/min/1.73m²', ref: '≥60' },
  { id: 'glucose', name: 'Glucose, Random', unit: 'mg/dL', ref: '55-127' },
  { id: 'calcium', name: 'Calcium', unit: 'mg/dL', ref: '8.5-10.5' },
  { id: 'calcium_corr', name: 'Calcium, Corrected for Albumin', unit: 'mg/dL', ref: '8.5-10.5' },
  { id: 'total_protein', name: 'Total Protein', unit: 'g/dL', ref: '6.5-8.0' },
  { id: 'bilirubin', name: 'Bilirubin, Total', unit: 'mg/dL', ref: '0.10-1.20' },
  { id: 'alk_phos', name: 'Alkaline Phosphatase', unit: 'IU/L', ref: '45-129' },
  { id: 'anion_gap', name: 'Anion Gap', unit: 'mmol/L', ref: '6-17' },
  { id: 'tsh', name: 'TSH', unit: 'mIU/L', ref: '0.270-4.200' },
  { id: 'hba1c', name: 'Hemoglobin A1C', unit: '%', ref: '4.2-5.6' },
  { id: 'cholesterol', name: 'Total Cholesterol', unit: 'mg/dL', ref: '0-199' },
  { id: 'triglycerides', name: 'Triglycerides', unit: 'mg/dL', ref: '≤200' },
  { id: 'hdl', name: 'HDL', unit: 'mg/dL', ref: '≥40' },
  { id: 'ldl', name: 'LDL-c', unit: 'mg/dL', ref: '<100 optimal' },
  { id: 'non_hdl', name: 'Cholesterol, non-HDL', unit: 'mg/dL', ref: '<189' },
  { id: 'elastase', name: 'Pancreatic Elastase (Stool)', unit: 'mcg/gm', ref: '>200' },
  { id: 'hpylori_ag', name: 'H. pylori Antigen (Stool)', unit: '', ref: 'Not Detected' },
];

// Food categories for ingredient picker
// Added 🥜 Nuts and 🍽️ Meal to match new COMMON_FOODS categories
export const FOOD_CATS = ['🍎 Fruit', '🥬 Vegetable', '🍗 Protein', '🥜 Nuts', '🌾 Grain', '🍽️ Meal', '🧂 Sauce', '🧀 Cheese', '🥛 Dairy', '🥤 Drink'];
