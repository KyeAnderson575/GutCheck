/**
 * App.jsx — GutCheck main application (Stage 3)
 * 
 * Stage 3 changes:
 *   - Warm Aurora theme with light/dark mode toggle
 *   - Schema versioning (SCHEMA_VERSION in IndexedDB config)
 *   - Restaurant database versioning (auto-merge new chains on load)
 *   - Import data validation
 *   - Firebase auth integration (optional — Google + email sign-in)
 *   - Cloud sync via Firestore (manual upload/download)
 *   - Visual polish pass
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { PS, SK } from './db';
import {
  AL, FTAGS, MT, SYM_LIST, SEV, BRISTOL, ELIM_FOODS, DIET_PHASES,
  PROC_TYPES, DX_STATUS, LAB_TYPES, FOOD_CATS,
} from './data/constants';
import { GI_RISK_CATS, getGIRisk, ING_ALLERGEN_MAP, detectAllergens } from './data/giRisk';
import { COMMON_FOODS } from './data/commonFoods';
import { DEFAULT_REST, RESTAURANT_DB_VERSION } from './data/defaultFoods';
import { td, nt, fmt12, mn, mnf, dA, gD, calcCorr } from './utils/helpers';
import { searchAllFoods } from './utils/searchDB';
import SafeBdg from './components/SafeBdg';
import BarcodeScanner from './components/BarcodeScanner';
import {
  isFirebaseReady, onAuthChange, signInWithGoogle,
  signInEmail, signUpEmail, logOut, syncUpload, syncDownload,
} from './firebase';
import './styles/app.css';

// ═══ CONSISTENCY DESCRIPTORS (replaces Bristol Scale) ═══
const CONSISTENCY = [
  { id: 'hard', l: 'Hard', i: '⚫', bristol: [1,2] },
  { id: 'firm', l: 'Firm', i: '🟤', bristol: [3] },
  { id: 'normal', l: 'Normal', i: '✅', bristol: [4] },
  { id: 'soft', l: 'Soft', i: '🟡', bristol: [5] },
  { id: 'loose', l: 'Loose', i: '🟠', bristol: [6] },
  { id: 'watery', l: 'Watery', i: '🔴', bristol: [7] },
];
const consistencyToBristol = (c) => {
  const m = CONSISTENCY.find(x => x.id === c);
  return m ? m.bristol[m.bristol.length - 1] : null;
};
const bristolToConsistency = (b) => {
  if (!b) return null;
  const m = CONSISTENCY.find(x => x.bristol.includes(Number(b)));
  return m ? m.id : null;
};

// ═══ SYMPTOM CATEGORY MAPPING (for smart fields) ═══
const SYM_CATS = {
  'gi-upper': ['Nausea','Vomiting','Heartburn/Reflux','Difficulty Swallowing','Food Getting Stuck','Throat Tightness','Chest Pain (eating)'],
  'gi-lower': ['Abdominal Cramping','Bloating','Gas'],
  'bm': ['Diarrhea','Bowel Movement (normal)','Constipation'],
  'systemic': ['Headache','Fatigue','Brain Fog','Energy Crash','Mood Change'],
  'skin': ['Skin Rash','Hives','Congestion','Joint Pain'],
};
const getSymCats = (types) => {
  const cats = new Set();
  (types || []).forEach(t => {
    Object.entries(SYM_CATS).forEach(([cat, syms]) => {
      if (syms.includes(t)) cats.add(cat);
    });
  });
  return cats;
};

// ═══ DEFAULT PINNED QUICK-LOG SYMPTOMS ═══
const DEFAULT_QUICK_SYMS = [
  { types: ['Bowel Movement (normal)'], label: 'Normal BM', emoji: '🚽', fields: ['consistency','notes'] },
  { types: ['Diarrhea'], label: 'Diarrhea', emoji: '💩', fields: ['consistency','urgency'] },
  { types: ['Nausea','Vomiting'], label: 'Nausea + Vomit', emoji: '🤢', fields: ['severity'] },
  { types: ['Nausea'], label: 'Nausea only', emoji: '🤢', fields: ['severity'] },
  { types: ['Stomach Pain','Abdominal Cramping'], label: 'Stomach Pain', emoji: '😣', fields: ['severity'] },
  { types: ['Difficulty Swallowing'], label: 'Swallowing issue', emoji: '😮', fields: ['severity'] },
];

// ═══ SCHEMA & DATA VERSIONING ═══
const SCHEMA_VERSION = 4; // Bump when data shape changes. Migrations run on load.
// Export format version is "nl-v4" (bumped from nl-v3)

// AI features disabled in PWA (stubs — will be re-implemented later)
const aiPhoto = async () => null;
const aiUrl = async () => null;

// ═══ THEME MANAGEMENT ═══
const getInitialTheme = () => {
  try {
    const saved = localStorage.getItem('gc-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return 'dark'; // default
};
const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('gc-theme', theme); } catch {}
};

// ═══ IMPORT VALIDATION ═══
/**
 * Validates imported data before loading.
 * Returns { valid: boolean, warnings: string[], data: object }
 */
function validateImportData(d) {
  const warnings = [];
  if (!d || typeof d !== 'object') return { valid: false, warnings: ['File is not valid JSON'] };
  if (Array.isArray(d)) return { valid: false, warnings: ['Expected an object, got an array'] };

  // Check for at least some recognizable fields
  const knownKeys = ['meals','syms','dn','water','medLog','pin','aiOn','phase','procs','meds','dxs','labs','myFoods','customSymptoms','restaurants','customFoods','weightLog','hydrationGoal','_version','_exportDate'];
  const hasKnown = knownKeys.some(k => k in d);
  if (!hasKnown) return { valid: false, warnings: ['File doesn\'t look like a GutCheck backup — no recognizable fields found'] };

  // Validate arrays are arrays
  ['meals','syms','myFoods','procs','meds','dxs','labs','customFoods','weightLog','customSymptoms'].forEach(k => {
    if (k in d && !Array.isArray(d[k])) {
      warnings.push(`"${k}" should be an array but isn't — it will be skipped`);
      d[k] = [];
    }
  });

  // Validate objects are objects
  ['dn','water','medLog','restaurants'].forEach(k => {
    if (k in d && (typeof d[k] !== 'object' || Array.isArray(d[k]))) {
      warnings.push(`"${k}" should be an object but isn't — it will be skipped`);
      d[k] = {};
    }
  });

  // Check meals have required fields
  if (d.meals?.length) {
    const badMeals = d.meals.filter(m => !m.desc && !m.date);
    if (badMeals.length > 0) {
      warnings.push(`${badMeals.length} meal(s) missing description or date — they'll still import but may show as blank`);
    }
  }

  return { valid: true, warnings, data: d };
}

// ═══ RESTAURANT DATABASE MERGE ═══
/**
 * Merges new default restaurants into existing user data without
 * overwriting any user-added restaurants or customizations.
 */
function mergeRestaurantUpdates(existing) {
  if (!existing) return { data: DEFAULT_REST, version: RESTAURANT_DB_VERSION };
  const merged = { ...existing };
  let added = 0;
  Object.entries(DEFAULT_REST).forEach(([name, data]) => {
    if (!merged[name]) {
      merged[name] = data;
      added++;
    }
    // If restaurant exists but has fewer items than default, merge new items
    else if (data.it && merged[name].it) {
      const existingNames = new Set(merged[name].it.map(i => i.n.toLowerCase()));
      const newItems = data.it.filter(i => !existingNames.has(i.n.toLowerCase()));
      if (newItems.length > 0) {
        merged[name] = { ...merged[name], it: [...merged[name].it, ...newItems] };
        added += newItems.length;
      }
    }
  });
  return { data: merged, version: RESTAURANT_DB_VERSION, added };
}

// Default drinks seeded into myFoods on first launch (source:"drink")
const DEFAULT_DRINKS = [
  {name:"Water",desc:"Water",source:"drink",mt:"Drink",al:[],tg:[],safeStatus:"safe",favorite:true,hydrating:true,defaultSize:"16oz"},
  {name:"Coffee",desc:"Coffee",source:"drink",mt:"Drink",al:[],tg:[],safeStatus:"unknown",favorite:false,hydrating:true},
  {name:"Tea",desc:"Tea",source:"drink",mt:"Drink",al:[],tg:[],safeStatus:"unknown",favorite:false,hydrating:true},
  {name:"Milk",desc:"Milk",source:"drink",mt:"Drink",al:["dairy"],tg:[],safeStatus:"unknown",favorite:false,hydrating:true},
  {name:"Soda",desc:"Soda",source:"drink",mt:"Drink",al:[],tg:[],safeStatus:"unknown",favorite:false,hydrating:false},
  {name:"Energy Drink",desc:"Energy Drink",source:"drink",mt:"Drink",al:[],tg:[],safeStatus:"unknown",favorite:false,hydrating:false},
  {name:"Beer",desc:"Beer",source:"drink",mt:"Drink",al:["gluten"],tg:[],safeStatus:"unknown",favorite:false,hydrating:false},
  {name:"Wine",desc:"Wine",source:"drink",mt:"Drink",al:[],tg:[],safeStatus:"unknown",favorite:false,hydrating:false},
];
const DEFAULT_HYDRATION_GOAL=64; // oz

/**
 * Migrate old-format library data into unified myFoods array.
 */
function migrateToUnifiedFoods(lib) {
  const unified = [...(lib.myFoods || [])];
  const seen = new Set(unified.map(f => (f.name || f.desc || '').toLowerCase()));
  (lib.orders || []).forEach(o => {
    const key = (o.nm || '').toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      unified.push({
        id: o.id || Date.now() + Math.random(), name: o.nm, desc: o.ds,
        source: 'restaurant', mt: o.mt || 'Lunch', al: o.al || [],
        tg: o.tg || ['Restaurant'], safeStatus: o.safeStatus || 'unknown',
        favorite: false, ts: o.ts || Date.now(),
      });
    }
  });
  (lib.homeMeals || []).forEach(h => {
    const key = (h.name || '').toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      unified.push({
        id: h.id || Date.now() + Math.random(), name: h.name, desc: h.desc || '',
        source: 'homemade', mt: h.mt || 'Dinner', al: h.al || [],
        tg: h.tg || ['Homemade'], ings: h.ings || [], instructions: h.instructions || '',
        safeStatus: h.safeStatus || 'unknown', favorite: false, ts: h.ts || Date.now(),
      });
    }
  });
  (lib.favs || []).forEach(f => {
    const key = (f.desc || '').toLowerCase();
    const existing = unified.find(u => (u.name || u.desc || '').toLowerCase() === key);
    if (existing) { existing.favorite = true; }
    else if (key) {
      unified.push({
        id: Date.now() + Math.random(), name: f.desc?.slice(0, 50) || 'Unnamed',
        desc: f.desc || '', source: 'restaurant', mt: f.mt || 'Lunch',
        al: f.al || [], tg: f.tags || f.tg || [], safeStatus: 'unknown',
        favorite: true, ts: Date.now(),
      });
    }
  });
  return unified.map(f => ({
    ...f, id: f.id || Date.now() + Math.random(),
    source: f.source || 'store', favorite: f.favorite || false, ts: f.ts || Date.now(),
  }));
}

function migrateImportData(d) {
  if (d.orders?.length || d.homeMeals?.length || d.favs?.length) {
    const lib = { myFoods: d.myFoods || [], orders: d.orders, homeMeals: d.homeMeals, favs: d.favs };
    return migrateToUnifiedFoods(lib);
  }
  return (d.myFoods || []).map(f => ({
    ...f, id: f.id || Date.now() + Math.random(),
    source: f.source || 'store', favorite: f.favorite || false, ts: f.ts || Date.now(),
  }));
}

/* ═══ MAIN APP ═══ */
export default function App() {
  const [loaded,setLoaded]=useState(false);
  const [tab,setTab]=useState("meals");
  const [meals,setMeals]=useState([]);
  const [syms,setSyms]=useState([]);
  const [dn,setDn]=useState({});
  const [water,setWater]=useState({});
  const [medLog,setMedLog]=useState({});
  const [pin,setPin]=useState("");
  const [aiOn,setAiOn]=useState(false);
  const [phase,setPhase]=useState("baseline");
  const [hydrationGoal,setHydrationGoal]=useState(DEFAULT_HYDRATION_GOAL);
  const [elimFoods,setElimFoods]=useState([]);
  const [elimStart,setElimStart]=useState("");
  const [reintroFood,setReintroFood]=useState("");
  const [reintroStart,setReintroStart]=useState("");
  const [procs,setProcs]=useState([]);
  const [meds,setMeds]=useState([]);
  const [dxs,setDxs]=useState([]);
  const [labs,setLabs]=useState([]);
  const [myFoods,setMyFoods]=useState([]);
  const [customSymptoms,setCustomSymptoms]=useState([]);
  const [restaurants,setRestaurants]=useState(null);
  const [customFoods,setCustomFoods]=useState([]);
  const [weightLog,setWeightLog]=useState([]);
  const [pinnedQuickSyms,setPinnedQuickSyms]=useState(null); // null = use defaults
  const [toast,setToast]=useState(null);
  const [showFoodForm,setShowFoodForm]=useState(false);
  const [editFood,setEditFood]=useState(null);
  const [foodFormType,setFoodFormType]=useState(null);
  const [showMF,setShowMF]=useState(false);
  const [showSF,setShowSF]=useState(false);
  const [editM,setEditM]=useState(null);
  const [editS,setEditS]=useState(null);
  const [pf,setPf]=useState(null);
  const [selD,setSelD]=useState(td());
  const [cY,setCY]=useState(new Date().getFullYear());
  const [cM,setCM]=useState(new Date().getMonth());
  const [search,setSearch]=useState("");
  const [filterA,setFilterA]=useState(null);
  const [moreTab,setMoreTab]=useState("foods");
  const [medUnlocked,setMedUnlocked]=useState(false);

  // ═══ NEW STATE: Theme + Auth ═══
  const [theme,setTheme]=useState(getInitialTheme);
  const [fbUser,setFbUser]=useState(null);
  const [syncMsg,setSyncMsg]=useState("");
  const [showAuth,setShowAuth]=useState(false);

  const [undoItem,setUndoItem]=useState(null);
  const undoTimerRef=useRef(null);
  const doUndo=()=>{if(!undoItem)return;if(undoItem.type==='meal')setMeals(p=>[undoItem.item,...p]);else if(undoItem.type==='sym')setSyms(p=>[undoItem.item,...p]);clearTimeout(undoTimerRef.current);setUndoItem(null)};
  const delMeal=id=>{const item=meals.find(m=>m.id===id);if(!item)return;setMeals(p=>p.filter(m=>m.id!==id));clearTimeout(undoTimerRef.current);setUndoItem({type:'meal',item});undoTimerRef.current=setTimeout(()=>setUndoItem(null),5000)};
  const delSym=id=>{const item=syms.find(s=>s.id===id);if(!item)return;setSyms(p=>p.filter(s=>s.id!==id));clearTimeout(undoTimerRef.current);setUndoItem({type:'sym',item});undoTimerRef.current=setTimeout(()=>setUndoItem(null),5000)};

  // ═══ THEME EFFECT ═══
  useEffect(()=>{applyTheme(theme)},[theme]);

  // ═══ FIREBASE AUTH LISTENER ═══
  useEffect(()=>{
    if(!isFirebaseReady()) return;
    const unsub=onAuthChange(user=>setFbUser(user||null));
    return ()=>unsub();
  },[]);

  useEffect(()=>{(async()=>{
    const cfg = await PS.get(SK.config);
    if(cfg){
      const ml = await PS.get(SK.meals);
      const sm = await PS.get(SK.syms);
      const med = await PS.get(SK.medical);
      const lib = await PS.get(SK.library);
      setMeals(ml || []);
      setSyms(sm || []);
      setDn(lib?.dn || {});
      setWater(lib?.water || {});
      setMedLog(lib?.medLog || {});
      setPin(cfg.pin || "");
      setAiOn(cfg.aiOn || false);
      setPhase(cfg.phase || "baseline");
      setElimFoods(cfg.elimFoods || []);
      setElimStart(cfg.elimStart || "");
      setReintroFood(cfg.reintroFood || "");
      setReintroStart(cfg.reintroStart || "");
      setProcs(med?.procs || []);
      setMeds(med?.meds || []);
      setDxs(med?.dxs || []);
      setLabs(med?.labs || []);
      setCustomSymptoms(cfg.customSymptoms || []);
      setPinnedQuickSyms(cfg.pinnedQuickSyms || null);
      setHydrationGoal(cfg.hydrationGoal || DEFAULT_HYDRATION_GOAL);
      // ═══ RESTAURANT VERSIONING ═══
      const storedRestVersion = cfg.restaurantDbVersion || 0;
      const storedRest = lib?.restaurants;
      if (storedRestVersion < RESTAURANT_DB_VERSION && storedRest) {
        const { data: mergedRest } = mergeRestaurantUpdates(storedRest);
        setRestaurants(mergedRest);
      } else {
        setRestaurants(storedRest || DEFAULT_REST);
      }
      setCustomFoods(lib?.customFoods || []);
      setWeightLog(lib?.weightLog || []);
      if (lib?.orders?.length || lib?.homeMeals?.length || lib?.favs?.length) {
        const unified = migrateToUnifiedFoods(lib);
        setMyFoods(unified);
      } else {
        let foods = (lib?.myFoods || []).map(f => ({
          ...f, id: f.id || Date.now() + Math.random(),
          source: f.source || 'store', favorite: f.favorite || false, ts: f.ts || Date.now(),
        }));
        // Seed default drinks if no drinks exist yet
        if (!foods.some(f => f.source === 'drink')) {
          const seeded = DEFAULT_DRINKS.map((d, i) => ({ ...d, id: Date.now() + i, ts: Date.now() + i }));
          foods = [...foods, ...seeded];
        }
        // Backfill/update hydrating field on existing drinks
        const HYDRATING_NAMES = ['water','milk','juice','gatorade','liquid death','electrolyte','pedialyte','coconut water','lemonade','coffee','tea','latte','chai','matcha','espresso'];
        foods = foods.map(f => {
          if (f.source === 'drink' && f.hydrating === undefined) {
            const n = (f.name || f.desc || '').toLowerCase();
            return { ...f, hydrating: HYDRATING_NAMES.some(h => n.includes(h)) };
          }
          // One-time fix: update drinks that match hydrating names but were set false by old defaults
          if (f.source === 'drink' && f.hydrating === false && !f._hydratingUserSet) {
            const n = (f.name || f.desc || '').toLowerCase();
            if (HYDRATING_NAMES.some(h => n.includes(h))) return { ...f, hydrating: true };
          }
          return f;
        });
        // Migrate old quickDrinks into myFoods if they exist
        if (lib?.quickDrinks?.length) {
          const existingDrinkNames = new Set(foods.filter(f => f.source === 'drink').map(f => (f.name || '').toLowerCase()));
          lib.quickDrinks.forEach((qd, i) => {
            const name = qd.n || qd.name || '';
            if (name && !existingDrinkNames.has(name.toLowerCase())) {
              existingDrinkNames.add(name.toLowerCase());
              foods.push({ id: Date.now() + 100 + i, name, desc: qd.d || qd.desc || name, source: 'drink', mt: 'Drink', al: qd.a || qd.al || [], tg: [], safeStatus: 'unknown', favorite: false, ts: Date.now() + i });
            }
          });
        }
        setMyFoods(foods);
      }
    } else {
      // First launch — seed default drinks into myFoods
      const seededDrinks = DEFAULT_DRINKS.map((d, i) => ({ ...d, id: Date.now() + i, ts: Date.now() + i }));
      setMyFoods(seededDrinks);
      setRestaurants(DEFAULT_REST);
      await PS.set(SK.config, {pin:"",aiOn:false,phase:"baseline",elimFoods:[],elimStart:"",reintroFood:"",reintroStart:"",customSymptoms:[],hydrationGoal:DEFAULT_HYDRATION_GOAL,schemaVersion:SCHEMA_VERSION,restaurantDbVersion:RESTAURANT_DB_VERSION});
      await PS.set(SK.library, {myFoods:seededDrinks,dn:{},water:{},medLog:{},restaurants:DEFAULT_REST,customFoods:[]});
    }
    setLoaded(true);
  })()},[]); // eslint-disable-line

  useEffect(()=>{if(!loaded)return;PS.set(SK.meals, meals)},[loaded,meals]);
  useEffect(()=>{if(!loaded)return;PS.set(SK.syms, syms)},[loaded,syms]);
  useEffect(()=>{if(!loaded)return;PS.set(SK.config, {pin,aiOn,phase,elimFoods,elimStart,reintroFood,reintroStart,customSymptoms,hydrationGoal,pinnedQuickSyms,schemaVersion:SCHEMA_VERSION,restaurantDbVersion:RESTAURANT_DB_VERSION})},[loaded,pin,aiOn,phase,elimFoods,elimStart,reintroFood,reintroStart,customSymptoms,hydrationGoal,pinnedQuickSyms]);
  useEffect(()=>{if(!loaded)return;PS.set(SK.medical, {procs,meds,dxs,labs})},[loaded,procs,meds,dxs,labs]);
  useEffect(()=>{if(!loaded||!restaurants)return;PS.set(SK.library, {myFoods,dn,water,medLog,restaurants,customFoods,weightLog})},[loaded,myFoods,dn,water,medLog,restaurants,customFoods,weightLog]);

  const doReset = async (mode) => {
    const backup = {meals,syms,dn,water,medLog,pin,aiOn,phase,elimFoods,elimStart,reintroFood,reintroStart,procs,meds,dxs,labs,myFoods,customSymptoms,weightLog,_backupDate:new Date().toISOString()};
    await PS.set("nl-backup-" + Date.now(), backup);
    await PS.del(SK.meals);await PS.del(SK.syms);await PS.del(SK.config);await PS.del(SK.medical);await PS.del(SK.library);await PS.del(SK.legacy);
    setMeals([]);setSyms([]);setDn({});setWater({});setMedLog({});
    setPin("");setAiOn(false);setPhase("baseline");setElimFoods([]);setElimStart("");setReintroFood("");setReintroStart("");
    const seededDrinks=DEFAULT_DRINKS.map((d,i)=>({...d,id:Date.now()+i,ts:Date.now()+i}));
    setMyFoods(seededDrinks);setCustomSymptoms([]);setRestaurants(DEFAULT_REST);setWeightLog([]);
    if(mode !== "with-medical"){setProcs([]);setMeds([]);setDxs([]);setLabs([])}
  };

  const getAllData=()=>({meals,syms,dn,water,medLog,pin,aiOn,phase,elimFoods,elimStart,reintroFood,reintroStart,procs,meds,dxs,labs,myFoods,customSymptoms,restaurants,customFoods,weightLog,hydrationGoal,pinnedQuickSyms,_exportDate:new Date().toISOString(),_version:"nl-v4",_schemaVersion:SCHEMA_VERSION});
  const loadAllData=(d)=>{
    // ═══ VALIDATE IMPORT DATA ═══
    if(!d||typeof d!=="object")return { ok: false, msg: 'Invalid file format' };
    const { valid, warnings } = validateImportData(d);
    if (!valid) return { ok: false, msg: warnings[0] || 'Invalid file' };
    if(d.meals)setMeals(d.meals);if(d.syms)setSyms(d.syms);if(d.dn)setDn(d.dn);if(d.water)setWater(d.water);if(d.medLog)setMedLog(d.medLog);
    if(d.pin!=null)setPin(d.pin);if(d.aiOn!=null)setAiOn(d.aiOn);if(d.phase)setPhase(d.phase);if(d.elimFoods)setElimFoods(d.elimFoods);if(d.elimStart!=null)setElimStart(d.elimStart);if(d.reintroFood!=null)setReintroFood(d.reintroFood);if(d.reintroStart!=null)setReintroStart(d.reintroStart);
    if(d.procs)setProcs(d.procs);if(d.meds)setMeds(d.meds);if(d.dxs)setDxs(d.dxs);if(d.labs)setLabs(d.labs);
    const migrated = migrateImportData(d);
    setMyFoods(migrated);
    if(d.customSymptoms)setCustomSymptoms(d.customSymptoms);
    if(d.pinnedQuickSyms)setPinnedQuickSyms(d.pinnedQuickSyms);
    if(d.restaurants)setRestaurants(d.restaurants);
    if(d.customFoods)setCustomFoods(d.customFoods);
    if(d.weightLog)setWeightLog(d.weightLog);
    if(d.hydrationGoal)setHydrationGoal(d.hydrationGoal);
    // Migrate old quickDrinks into myFoods on import
    if(d.quickDrinks?.length){
      const existingNames=new Set(migrated.map(f=>(f.name||'').toLowerCase()));
      d.quickDrinks.forEach((qd,i)=>{
        const name=qd.n||qd.name||'';
        if(name&&!existingNames.has(name.toLowerCase())){
          existingNames.add(name.toLowerCase());
          migrated.push({id:Date.now()+200+i,name,desc:qd.d||qd.desc||name,source:'drink',mt:'Drink',al:qd.a||qd.al||[],tg:[],safeStatus:'unknown',favorite:false,ts:Date.now()+i});
        }
      });
      setMyFoods(migrated);
    }
    if(d.symptoms&&!d.syms)setSyms(d.symptoms);
    const warnMsg = warnings.length > 0 ? `Imported with ${warnings.length} warning(s): ${warnings[0]}` : '';
    return { ok: true, msg: warnMsg || 'Data imported successfully!' };
  };

  const corr=useMemo(()=>calcCorr(meals,syms),[meals,syms]);
  const filtered=meals.filter(m=>{if(m.mt==="Drink"&&!m._withMeal)return false;if(search){const q=search.toLowerCase();if(!(m.desc?.toLowerCase().includes(q)||m.tags?.some(t=>t.toLowerCase().includes(q))||m.al?.some(a=>AL.find(x=>x.id===a)?.l.toLowerCase().includes(q))))return false}if(filterA&&!m.al?.includes(filterA))return false;return true}).sort((a,b)=>b.date.localeCompare(a.date)||(b.ts||0)-(a.ts||0));

  const saveM=(m,keepOpen)=>{if(editM&&editM.id)setMeals(p=>p.map(x=>x.id===editM.id?{...m,id:editM.id}:x));else{setMeals(p=>[{...m,id:Date.now()},...p])}if(!keepOpen){setEditM(null);setShowMF(false);setPf(null)}};
  const saveS=(s,keepOpen)=>{if(editS&&editS.id)setSyms(p=>p.map(x=>x.id===editS.id?{...s,id:editS.id}:x));else setSyms(p=>[{...s,id:Date.now()},...p]);if(!keepOpen){setEditS(null);setShowSF(false)}};

  const saveToMyFoods=(m)=>{
    setEditFood(null);setFoodFormType(null);
    const src = m.tags?.includes("Restaurant") ? "restaurant" : m.tags?.includes("Homemade") ? "homemade" : "store";
    setPf({
      name: (m.desc || '').split(',').slice(0,3).join(',').slice(0,60),
      desc: m.desc || '', source: src, mt: m.mt || 'Lunch', al: m.al || [],
      tg: m.tags || [], ings: m.ings || [], instructions: m.inst || '',
      safeStatus: 'unknown', favorite: false, _fromMeal: true,
    });
    setFoodFormType(src);
    setShowFoodForm(true);
  };

  const getDC=date=>{const ds=syms.filter(s=>s.date===date);return{v:ds.filter(s=>(s.types||[]).includes("Vomiting")).length,d:ds.filter(s=>(s.types||[]).includes("Diarrhea")).length,bm:ds.filter(s=>(s.types||[]).some(t=>t==="Bowel Movement (normal)"||t==="Diarrhea")).length}};
  const mbd={};meals.forEach(m=>{mbd[m.date]=(mbd[m.date]||0)+1});
  const checkElim=(allergens)=>{if(phase!=="elimination"||!elimFoods.length)return[];const map={"Dairy":"dairy","Wheat/Gluten":"gluten","Eggs":"eggs","Soy":"soy","Nuts/Peanuts":"nuts","Seafood/Fish":"fish","Sesame":"sesame"};const elimIds=elimFoods.flatMap(f=>{const id=map[f];return id==="nuts"?["nuts","peanuts"]:id==="fish"?["fish","shellfish"]:[id]});return(allergens||[]).filter(a=>elimIds.includes(a))};

  const genApptPrep=(mode)=>{const now=new Date(),ago=new Date();ago.setDate(now.getDate()-30);const since=ago.toISOString().split("T")[0];const rm=meals.filter(m=>m.date>=since);const rs=syms.filter(s=>s.date>=since);const topSym=rs.flatMap(s=>s.types||[]).reduce((a,t)=>{a[t]=(a[t]||0)+1;return a},{});const topA=rm.flatMap(m=>m.al||[]).reduce((a,x)=>{a[x]=(a[x]||0)+1;return a},{});const sorted=Object.entries(topSym).sort((a,b)=>b[1]-a[1]).slice(0,5);const vCount=rs.filter(s=>(s.types||[]).includes("Vomiting")).length;const dCount=rs.filter(s=>(s.types||[]).includes("Diarrhea")).length;const bmCount=rs.filter(s=>(s.types||[]).some(t=>t==="Bowel Movement (normal)"||t==="Diarrhea")).length;
    const durStats={};rs.forEach(s=>{if(s.duration)(s.types||[]).forEach(t=>{if(!durStats[t])durStats[t]=[];durStats[t].push(s.duration)})});
    const topWithDur=sorted.map(([s,n])=>{const durs=durStats[s]||[];return[s,n,durs.length>0?durs:null]});
    const symEntries=[...rs].sort((a,b)=>a.date.localeCompare(b.date)||(a.time||"00:00").localeCompare(b.time||"00:00"));
    const dailyBM={};for(let i=0;i<30;i++){const d=new Date(now);d.setDate(now.getDate()-i);const ds=d.toISOString().split("T")[0];dailyBM[ds]={normal:0,diarrhea:0,bristols:[],consistencies:[]};}
    rs.forEach(s=>{if(dailyBM[s.date]){const types=s.types||[];if(types.includes("Bowel Movement (normal)")){dailyBM[s.date].normal++}if(types.includes("Diarrhea")){dailyBM[s.date].diarrhea++}if(s.consistency){const c=CONSISTENCY.find(x=>x.id===s.consistency);dailyBM[s.date].consistencies.push(c?c.l:s.consistency);dailyBM[s.date].bristols.push(consistencyToBristol(s.consistency))}else if(s.bristol){dailyBM[s.date].bristols.push(s.bristol);const cId=bristolToConsistency(s.bristol);if(cId){const c=CONSISTENCY.find(x=>x.id===cId);dailyBM[s.date].consistencies.push(c?c.l:'?')}}}});
    const dailyBMArr=Object.entries(dailyBM).sort((a,b)=>a[0].localeCompare(b[0])).map(([date,d])=>({date,...d,total:d.normal+d.diarrhea}));
    const foodFreq={};rm.forEach(m=>{const d=(m.desc||"").trim();if(d){foodFreq[d]=(foodFreq[d]||0)+1}});
    const topFoods=Object.entries(foodFreq).sort((a,b)=>b[1]-a[1]).slice(0,15);
    const allergenFreq={};rm.forEach(m=>{(m.al||[]).forEach(a=>{allergenFreq[a]=(allergenFreq[a]||0)+1})});
    const topAllergenExposure=Object.entries(allergenFreq).sort((a,b)=>b[1]-a[1]);
    const riskFreq={};rm.forEach(m=>{const rf=getGIRisk(m.desc,m.al);rf.forEach(f=>{riskFreq[f]=(riskFreq[f]||0)+1})});
    const riskSummary=GI_RISK_CATS.map(cat=>({...cat,count:riskFreq[cat.id]||0,pct:rm.length?Math.round((riskFreq[cat.id]||0)/rm.length*100):0})).filter(r=>r.count>0);
    const compStats={finished:rm.filter(m=>m.completion==='Finished').length,partial:rm.filter(m=>m.completion==='Partial').length,couldnt:rm.filter(m=>m.completion==="Couldn't eat").length,drinks:rm.filter(m=>m.mt==='Drink').length};
    return{mode,since,mealCount:rm.length,symCount:rs.length,topSymptoms:topWithDur,topAllergens:Object.entries(topA).sort((a,b)=>b[1]-a[1]).slice(0,5),vCount,dCount,bmCount,phase,elimFoods,recentLabs:labs.slice(0,15),allProcs:procs,activeMeds:meds.filter(m=>!m.end),allMeds:meds,timeline:[],background:{},dxs:mode==="full"?dxs:[],symEntries,dailyBM:dailyBMArr,topFoods,topAllergenExposure,riskSummary,compStats}
  };

  if(!loaded)return <div style={{display:'flex',justifyContent:'center',alignItems:'center',minHeight:'100vh',background:'var(--bg)',color:'var(--pb)',fontFamily:'Outfit'}}>Loading...</div>;

  return (
  <><div className="app">
    <div className="hdr"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div className="logo">GutCheck</div>
      <div style={{display:'flex',gap:6,alignItems:'center'}}>
        {phase!=="baseline"&&<span className="bd" style={{background:'var(--ok-t2)',color:'var(--ok)',fontSize:9}}>{phase==="elimination"?"🚫 Eliminating":"🔄 Reintro"}</span>}
        {isFirebaseReady()&&<button className={`acct-btn${fbUser?' signed-in':''}`} onClick={()=>setShowAuth(true)} title={fbUser?fbUser.email:'Sign in'}>{fbUser?fbUser.displayName?fbUser.displayName[0].toUpperCase():'✓':'👤'}</button>}
      </div>
    </div></div>

    <div style={{padding:'0 16px'}}><div className="phase-bar">
      {DIET_PHASES.map(p=><button key={p} className={`phase-item ${phase===p?'active':''}`} onClick={()=>setPhase(p)}>{p==="baseline"?"📊 Baseline":p==="elimination"?"🚫 Elimination":"🔄 Reintro"}</button>)}
    </div></div>

    {(()=>{
      const banners=[];const now=Date.now();const todayStr=td();
      const todayMeals=meals.filter(m=>m.date===todayStr);
      if(todayMeals.length>0){const lastMealTime=todayMeals.reduce((latest,m)=>{const t=new Date(`${m.date}T${m.time||"12:00"}`).getTime();return t>latest?t:latest},0);const hoursSince=Math.floor((now-lastMealTime)/36e5);if(hoursSince>=6)banners.push({icon:"🍽️",text:`Last meal logged ${hoursSince}h ago`,color:"var(--wn)"})}
      else{const hr=new Date().getHours();if(hr>=10)banners.push({icon:"🍽️",text:"No meals logged today",color:"var(--wn)"})}
      const todayWater=water[todayStr]||0;const hr2=new Date().getHours();
      if(hr2>=12&&todayWater===0)banners.push({icon:"💧",text:"No water logged today",color:"var(--in)"});
      else if(hr2>=18&&todayWater<32)banners.push({icon:"💧",text:`Only ${todayWater}oz of water today`,color:"var(--in)"});
      return banners.length>0?<div style={{padding:'0 16px',marginBottom:2}}>
        {banners.map((b,i)=><div key={i} style={{padding:'5px 10px',background:'var(--pb-t1)',border:'1px solid var(--pb-t1)',borderRadius:8,marginBottom:3,fontSize:11,color:b.color,display:'flex',alignItems:'center',gap:6}}><span>{b.icon}</span><span>{b.text}</span></div>)}
      </div>:null;
    })()}

    <div className="cnt">
      {tab==="meals"&&<MealsTab ms={filtered} search={search} setSearch={setSearch} fa={filterA} setFA={setFilterA} onEdit={m=>{setEditM(m);setShowMF(true)}} onDel={delMeal} saveToMyFoods={saveToMyFoods} myFoods={myFoods} phase={phase} elimFoods={elimFoods} checkElim={checkElim} water={water} syms={syms} getDC={getDC} allMeals={meals} />}
      {tab==="health"&&<HealthTab syms={syms} onEditSym={s=>{setEditS(s);setShowSF(true)}} onDelSym={delSym} onQuickSave={s=>{setSyms(p=>[{...s,id:Date.now()},...p]);setToast(s._toastMsg||'Symptom logged');setTimeout(()=>setToast(null),2500)}} pin={pin} setPin={setPin} meals={meals} customSymptoms={customSymptoms} selD={selD} medLog={medLog} setMedLog={setMedLog} meds={meds} pinnedQuickSyms={pinnedQuickSyms} setPinnedQuickSyms={setPinnedQuickSyms} />}
      {tab==="insights"&&<InsightsTab corr={corr} meals={meals} syms={syms} getDC={getDC} phase={phase} elimFoods={elimFoods} setElimFoods={setElimFoods} elimStart={elimStart} setElimStart={setElimStart} reintroFood={reintroFood} setReintroFood={setReintroFood} reintroStart={reintroStart} setReintroStart={setReintroStart} genApptPrep={genApptPrep} water={water} medLog={medLog} activeMeds={meds} cY={cY} setCY={setCY} cM={cM} setCM={setCM} selD={selD} setSelD={setSelD} mbd={mbd} dn={dn} setDn={setDn} />}
      {tab==="drinks"&&<DrinkTab myFoods={myFoods} setMyFoods={setMyFoods} meals={meals} setMeals={setMeals} water={water} setWater={setWater} onLogDrink={(d,size)=>{saveM({desc:`${d.desc||d.name}${size?' ('+size+')':''}`,mt:"Drink",time:nt(),date:td(),tags:[],al:d.al||[],notes:"",photo:null,ings:[],inst:"",src:"other",portion:size||"",completion:"",ts:Date.now()})}} hydrationGoal={hydrationGoal} setHydrationGoal={setHydrationGoal} showFoodForm={showFoodForm} setShowFoodForm={setShowFoodForm} editFood={editFood} setEditFood={setEditFood} foodFormType={foodFormType} setFoodFormType={setFoodFormType} />}
      {tab==="more"&&<MoreTab mt2={moreTab} setMt2={setMoreTab} aiOn={aiOn} setAiOn={setAiOn} meals={meals} syms={syms} pin={pin} setPin={setPin} procs={procs} setProcs={setProcs} meds2={meds} setMeds2={setMeds} dxs={dxs} setDxs={setDxs} labs={labs} setLabs={setLabs} medUnlocked={medUnlocked} setMedUnlocked={setMedUnlocked} customSymptoms={customSymptoms} setCustomSymptoms={setCustomSymptoms} doReset={doReset} getAllData={getAllData} loadAllData={loadAllData} weightLog={weightLog} setWeightLog={setWeightLog} myFoods={myFoods} setMyFoods={setMyFoods} customFoods={customFoods} onUseFood={f=>{setPf({desc:`${f.name}${f.desc?' — '+f.desc:''}`,al:f.al||[],tags:f.tg||[],ings:f.ings||[],inst:f.instructions||'',mt:f.mt||'Lunch'});setEditM(null);setShowMF(true)}} showFoodForm={showFoodForm} setShowFoodForm={setShowFoodForm} editFood={editFood} setEditFood={setEditFood} foodFormType={foodFormType} setFoodFormType={setFoodFormType} restaurants={restaurants} setRestaurants={setRestaurants} pf={pf} setPf={setPf} aiOn2={aiOn} theme={theme} setTheme={setTheme} fbUser={fbUser} syncMsg={syncMsg} setSyncMsg={setSyncMsg} />}
    </div>

    {(tab==="meals"||tab==="health")&&!showMF&&!showSF&&<button className="fab" onClick={()=>{if(tab==="meals"){setEditM(null);setPf(null);setShowMF(true)}else{setEditS(null);setShowSF(true)}}}>+</button>}

    <div className="bnav">
      {[["meals","🍽️","Meals"],["drinks","🥤","Drinks"],["health","🩺","Health"],["insights","📊","Insights"],["more","☰","More"]].map(([id,ic,l])=><button key={id} className={`bn ${tab===id?'on':''}`} onClick={()=>setTab(id)}><div className="bni">{ic}</div>{l}</button>)}
    </div>

    {showMF&&<MealForm onClose={()=>{setShowMF(false);setEditM(null);setPf(null)}} onSave={saveM} edit={editM} aiOn={aiOn} setAiOn={setAiOn} pf={pf} phase={phase} checkElim={checkElim} myFoods={myFoods} setMyFoods={setMyFoods} restaurants={restaurants} customFoods={customFoods} setCustomFoods={setCustomFoods} />}
    {showSF&&<SymForm onClose={()=>{setShowSF(false);setEditS(null)}} onSave={saveS} edit={editS} meals={meals} customSymptoms={customSymptoms} setCustomSymptoms={setCustomSymptoms} />}

    {showFoodForm&&<AddFoodForm onClose={()=>{setShowFoodForm(false);setEditFood(null);setFoodFormType(null);setPf(null)}} onSave={f=>{
      if(editFood?.id){setMyFoods(p=>p.map(x=>x.id===editFood.id?{...f,id:editFood.id}:x))}
      else{setMyFoods(p=>[{...f,id:Date.now()},...p])}
      setShowFoodForm(false);setEditFood(null);setFoodFormType(null);setPf(null);
    }} edit={editFood} initType={foodFormType} prefill={pf} aiOn={aiOn} restaurants={restaurants} />}

    {undoItem&&<div style={{position:'fixed',bottom:90,left:'50%',transform:'translateX(-50%)',maxWidth:360,width:'calc(100% - 32px)',padding:'10px 14px',background:'var(--c1)',border:'1px solid var(--accent-border)',borderRadius:12,display:'flex',alignItems:'center',gap:10,zIndex:200,boxShadow:'0 8px 24px var(--shadow-strong)',animation:'fu .3s ease'}}>
      <span style={{fontSize:13}}>{undoItem.type==='meal'?'🍽️':'🩺'}</span>
      <span style={{flex:1,fontSize:12,color:'var(--t1)'}}>{undoItem.type==='meal'?'Meal':'Symptom'} deleted</span>
      <button onClick={doUndo} style={{background:'var(--pm)',border:'none',borderRadius:8,color:'#fff',padding:'6px 14px',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'DM Sans'}}>Undo</button>
    </div>}

    {/* ═══ AUTH MODAL ═══ */}
    {showAuth&&<AuthModal user={fbUser} onClose={()=>setShowAuth(false)} />}

    {/* ═══ TOAST NOTIFICATION ═══ */}
    {toast&&<div className="toast">✓ {toast}</div>}
  </div></>);
}

/* ═══ MEALS TAB ═══ */
function MealsTab({ms,search,setSearch,fa,setFA,onEdit,onDel,saveToMyFoods,myFoods,phase,elimFoods,checkElim,water,syms,getDC,allMeals}){
  const [showSummary,setShowSummary]=useState(true);
  const freq={};ms.forEach(m=>{const d=(m.desc||"").trim();if(d){if(!freq[d])freq[d]={count:0,meal:m};freq[d].count++}});
  const topFreq=Object.values(freq).sort((a,b)=>b.count-a.count).slice(0,5).map(v=>v.meal);
  const recent=[];const seen=new Set();
  ms.forEach(m=>{if(!seen.has(m.desc)&&recent.length<5){seen.add(m.desc);recent.push(m)}});
  const quickMeals=topFreq.length>=3?topFreq:recent;
  const restOrders=(myFoods||[]).filter(f=>f.source==='restaurant').slice(0,3);
  const today=td();
  const todayMeals=(allMeals||[]).filter(m=>m.date===today);
  const tc=getDC?getDC(today):{v:0,d:0,bm:0};
  const todayWater=(water||{})[today]||0;
  const todaySyms=(syms||[]).filter(s=>s.date===today);
  const isInMyFoods=(desc)=>(myFoods||[]).some(f=>(f.name||f.desc||'').toLowerCase()===(desc||'').toLowerCase() || (f.desc||'').toLowerCase()===(desc||'').toLowerCase());

  return (
  <>
    <div style={{marginBottom:8}}>
      <div onClick={()=>setShowSummary(!showSummary)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 10px',background:'var(--c1)',borderRadius:showSummary?'10px 10px 0 0':'10px',border:'1px solid var(--pb-t1)',cursor:'pointer'}}>
        <span style={{fontSize:12,fontWeight:600,fontFamily:'Outfit',color:'var(--t1)'}}>📋 Today's Summary</span>
        <span style={{fontSize:10,color:'var(--t3)'}}>{showSummary?'▲':'▼'}</span>
      </div>
      {showSummary&&<div style={{padding:'8px 10px',background:'var(--c1)',borderRadius:'0 0 10px 10px',borderTop:0,border:'1px solid var(--pb-t1)',borderTopColor:'transparent'}}>
        <div style={{display:'flex',gap:6,marginBottom:6}}>
          {[{v:todayMeals.length,l:'Meals',c:'var(--ok)',bg:'var(--ok-t1)'},{v:tc.v,l:'Vomit',c:'var(--er)',bg:'var(--er-t1)'},{v:tc.d,l:'Diarrhea',c:'var(--wn)',bg:'var(--wn-t1)'},{v:tc.bm,l:'BMs',c:'var(--pb)',bg:'var(--pb-t1)'},{v:todayWater?todayWater+'oz':'0',l:'Water',c:'var(--in)',bg:'var(--in-t1)'}].map((s,i)=><div key={i} style={{flex:1,textAlign:'center',padding:'5px 4px',background:s.bg,borderRadius:6}}><div style={{fontSize:18,fontFamily:'Outfit',fontWeight:700,color:s.c}}>{s.v}</div><div style={{fontSize:8,color:'var(--t3)',textTransform:'uppercase'}}>{s.l}</div></div>)}
        </div>
        {todaySyms.length>0&&<div style={{display:'flex',gap:3,flexWrap:'wrap'}}>{[...new Set(todaySyms.flatMap(s=>s.types||[]))].map(t=><span key={t} className="tg ts2" style={{fontSize:9}}>{t}</span>)}</div>}
        {todayMeals.length>0&&<div style={{marginTop:4,fontSize:10,color:'var(--t3)'}}>Meals: {todayMeals.map(m=>m.mt).join(", ")}</div>}
      </div>}
    </div>
    {(quickMeals.length>0||restOrders.length>0)&&<div style={{marginBottom:8}}><div style={{fontSize:10,fontWeight:600,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>⚡ Quick re-log {topFreq.length>=3?"(most eaten)":""}</div><div style={{display:'flex',gap:3,overflowX:'auto',paddingBottom:4,WebkitOverflowScrolling:'touch'}}>{quickMeals.map((m,i)=><button key={i} className="ch" style={{fontSize:10,whiteSpace:'nowrap',flexShrink:0}} onClick={()=>onEdit({...m,id:null,date:td(),time:nt(),_relog:true})}>{m.desc?.slice(0,30)}{m.desc?.length>30?"...":""}</button>)}{restOrders.map((o,i)=><button key={`o${i}`} className="ch" style={{fontSize:10,whiteSpace:'nowrap',flexShrink:0,borderColor:'var(--ok-t2)'}} onClick={()=>onEdit({desc:o.desc||o.name,mt:o.mt||'Lunch',tags:o.tg||["Restaurant"],al:o.al||[],date:td(),time:nt(),_relog:true})}>{o.name?.slice(0,25)}</button>)}</div></div>}
    <div className="sb"><span style={{color:'var(--t3)',fontSize:13}}>🔍</span><input placeholder="Search meals..." value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button style={{background:'none',border:'none',color:'var(--t3)',cursor:'pointer'}} onClick={()=>setSearch("")}>✕</button>}</div>
    <div className="fc2">{AL.map(a=><button key={a.id} className={`fc ${fa===a.id?'on':''}`} onClick={()=>setFA(fa===a.id?null:a.id)}>{a.i} {a.l}</button>)}</div>
    {ms.length===0?<div className="emp"><div className="emp-i">🍽️</div><div className="emp-t">{search||fa?"No meals match your filters":"Start tracking meals"}</div><div className="emp-s">{search||fa?"Try a different search term or clear filters":"Tap the + button below to log your first meal. You can also use Quick Pick or search restaurant menus."}</div></div>
     :ms.map(m=>{const violations=checkElim(m.al);return <div key={m.id} className="card" style={violations.length?{borderColor:'var(--er-t2)'}:{}}>
      <div className="mc-h"><span className={`bd b-${m.mt}`}>{m.mt}</span><span className="ts">{fmt12(m.time)} · {m.date}</span></div>
      {m.photo&&<img src={m.photo} className="mp" alt=""/>}
      <div className="md">{m.desc}</div>
      {(m.portion||m.completion||m.drink)&&<div style={{display:'flex',gap:4,marginBottom:4,flexWrap:'wrap'}}>{m.portion&&<span style={{fontSize:9.5,padding:'2px 6px',borderRadius:6,background:'var(--pb-t2)',color:'var(--pb)'}}>🍽️ {m.portion}</span>}{m.completion&&<span style={{fontSize:9.5,padding:'2px 6px',borderRadius:6,background:m.completion==='Finished'?'var(--ok-t2)':m.completion==='Partial'?'var(--wn-t2)':'var(--er-t2)',color:m.completion==='Finished'?'var(--ok)':m.completion==='Partial'?'var(--wn)':'var(--er)'}}>{m.completion==='Finished'?'✅':'⚠️'} {m.completion}</span>}{m.drink&&<span style={{fontSize:9.5,padding:'2px 6px',borderRadius:6,background:'var(--in-t1)',color:'var(--in)'}}>🥤 {m.drink.desc}{m.drink.size?' ('+m.drink.size+')':''}</span>}</div>}
      {violations.length>0&&<div style={{padding:'4px 8px',background:'var(--er-t1)',borderRadius:6,marginBottom:5,fontSize:10.5,color:'var(--er)'}}>⚠️ Contains eliminated: {violations.map(v=>AL.find(a=>a.id===v)?.l).join(", ")}</div>}
      <div className="tr">{m.al?.map(a=>{const al=AL.find(x=>x.id===a);return al?<span key={a} className="tg ta">{al.i} {al.l}</span>:null})}{m.tags?.map(t=><span key={t} className="tg tf">{t}</span>)}</div>
      {(()=>{const rf=getGIRisk(m.desc,m.al);return rf.length>0?<div style={{display:'flex',gap:3,flexWrap:'wrap',marginBottom:4}}>{rf.map(f=>{const cat=GI_RISK_CATS.find(c=>c.id===f);return cat?<span key={f} style={{fontSize:8,padding:'1px 5px',borderRadius:4,background:`${cat.c}15`,color:cat.c,fontWeight:500}}>{cat.ic} {cat.l}</span>:null})}</div>:null})()}
      <div className="ma2">
        <button className="mb" onClick={()=>onEdit(m)}>✏️</button>
        {!isInMyFoods(m.desc)&&<button className="mb" style={{color:'var(--ok)'}} onClick={()=>saveToMyFoods(m)}>📦 Save</button>}
        {isInMyFoods(m.desc)&&<span style={{fontSize:9,color:'var(--t3)',padding:'4px 6px'}}>📦 Saved</span>}
        <button className="mb" onClick={()=>onDel(m.id)} style={{color:'var(--er)'}}>🗑️</button>
      </div>
    </div>})}
  </>);
}

/* ═══ HEALTH TAB (Symptoms + Daily Meds) ═══ */
function HealthTab({syms,onEditSym,onDelSym,onQuickSave,pin,setPin,meals,customSymptoms,selD,medLog,setMedLog,meds,pinnedQuickSyms,setPinnedQuickSyms}){
  const [hSub,setHSub]=useState("symptoms"); // "symptoms","meds"
  const [qlSheet,setQlSheet]=useState(null); // which quick-log bottom sheet is open
  const [showAddPin,setShowAddPin]=useState(false); // show add-pin sheet
  const [editPin,setEditPin]=useState(null); // { pin, idx } when editing an existing pin
  const [reorderMode,setReorderMode]=useState(false);
  const lpTimer=useRef(null);
  const lpFired=useRef(false); // tracks whether long-press actually fired, to suppress the subsequent click
  const sorted=[...syms].sort((a,b)=>b.date.localeCompare(a.date)||(b.ts||0)-(a.ts||0));
  const todayBMs=syms.filter(s=>s.date===td()&&(s.types||[]).some(t=>t==="Bowel Movement (normal)"||t==="Diarrhea")).length;
  const pins=pinnedQuickSyms||DEFAULT_QUICK_SYMS;

  // Long press → open edit sheet for that pin
  const startLP=(idx)=>{if(reorderMode)return;lpFired.current=false;lpTimer.current=setTimeout(()=>{lpFired.current=true;setEditPin({pin:pins[idx],idx});setQlSheet(null)},500)};
  const cancelLP=()=>clearTimeout(lpTimer.current);

  // Reorder helpers
  const movePin=(from,dir)=>{
    const to=from+dir;
    if(to<0||to>=pins.length)return;
    const next=[...pins];
    const [item]=next.splice(from,1);
    next.splice(to,0,item);
    setPinnedQuickSyms(next);
  };

  return (<>
    <div style={{display:'flex',gap:2,marginBottom:10}}>{[["symptoms","🩺 Symptoms"],["meds","💊 Medications"]].map(([id,l])=><button key={id} className={`fc ${hSub===id?'on':''}`} style={{flex:1,textAlign:'center',padding:'5px 3px'}} onClick={()=>setHSub(id)}>{l}</button>)}</div>

    {hSub==="symptoms"&&<>
      <div style={{marginBottom:10}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
          <div style={{fontSize:10,fontWeight:600,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.5px'}}>⚡ Quick Log {!reorderMode&&<span style={{textTransform:'none',letterSpacing:0,fontWeight:400,color:'var(--t3)',opacity:0.7}}>(long-press to edit)</span>}</div>
          <button className="mb" onClick={()=>setReorderMode(!reorderMode)} style={{fontSize:10,color:reorderMode?'var(--ok)':'var(--pb)',padding:'2px 8px'}}>
            {reorderMode?'✓ Done':'↕ Reorder'}
          </button>
        </div>
        {reorderMode?<>
          <div style={{fontSize:10,color:'var(--t3)',marginBottom:6}}>Use ◀ ▶ to move pins. Tap "Done" when finished.</div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {pins.map((q,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 6px',background:'var(--c1)',border:'1px solid var(--accent-border)',borderRadius:8}}>
              <button className="mb" onClick={()=>movePin(i,-1)} disabled={i===0} style={{color:i===0?'var(--t3)':'var(--pb)',opacity:i===0?0.3:1,padding:'2px 6px',fontSize:14}}>◀</button>
              <button className="mb" onClick={()=>movePin(i,1)} disabled={i===pins.length-1} style={{color:i===pins.length-1?'var(--t3)':'var(--pb)',opacity:i===pins.length-1?0.3:1,padding:'2px 6px',fontSize:14}}>▶</button>
              <span style={{flex:1,fontSize:11,color:'var(--t1)'}}>{q.emoji} {q.label}</span>
              <span style={{fontSize:9,color:'var(--t3)'}}>{i+1}/{pins.length}</span>
            </div>)}
          </div>
        </>:<div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
          {pins.map((q,i)=> <button key={i} className="ch chs" style={{fontSize:10.5}}
            onTouchStart={()=>startLP(i)} onTouchEnd={cancelLP} onTouchCancel={cancelLP} onTouchMove={cancelLP}
            onMouseDown={()=>startLP(i)} onMouseUp={cancelLP} onMouseLeave={cancelLP}
            onClick={()=>{if(lpFired.current){lpFired.current=false;return}setQlSheet(q)}}
          >{q.emoji} {q.label}</button>)}
          <button className="ch" style={{borderStyle:'dashed',color:'var(--pb)',fontSize:10.5}} onClick={()=>setShowAddPin(true)}>+</button>
        </div>}
      </div>
      <div style={{padding:'6px 10px',background:'var(--c1)',borderRadius:8,marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center',border:'1px solid var(--pb-t1)'}}>
        <span style={{fontSize:11,color:'var(--t2)'}}>🚽 Today's bowel movements</span>
        <span style={{fontSize:13,fontWeight:600,color:'var(--pb)'}}>{todayBMs}</span>
      </div>
      <div style={{fontSize:11,color:'var(--t3)',marginBottom:8}}>Tap a quick-log button for a fast entry, or tap + for the full form.</div>
      {sorted.length===0?<div className="emp"><div className="emp-i">🩺</div><div className="emp-t">No symptoms logged yet</div><div className="emp-s">Use the quick-log buttons above for common symptoms, or tap + for the full form. Track everything — even mild symptoms help spot patterns.</div></div>
       :sorted.map(s=><SymCard key={s.id} s={s} onEdit={()=>onEditSym(s)} onDel={()=>onDelSym(s.id)} pin={pin} setPin={setPin} meals={meals}/>)}
    </>}

    {hSub==="meds"&&<MedsSub date={selD||td()} medLog={medLog} setMedLog={setMedLog} activeMeds={meds}/>}

    {/* Quick-Log Bottom Sheet */}
    {qlSheet&&<QuickLogSheet q={qlSheet} onSave={(data)=>{
      // Build the symptom object
      const symTime=new Date(`${td()}T${nt()}`).getTime();
      const lastMeal=(meals||[]).filter(m=>{const mt2=new Date(`${m.date}T${m.time||"12:00"}`).getTime();return mt2<symTime}).sort((a,b)=>new Date(`${b.date}T${b.time||"12:00"}`).getTime()-new Date(`${a.date}T${a.time||"12:00"}`).getTime())[0];
      let autoDelay="";
      if(lastMeal){const hrs=(symTime-new Date(`${lastMeal.date}T${lastMeal.time||"12:00"}`).getTime())/36e5;autoDelay=hrs<0.5?"<30min":hrs<1?"30min":hrs<2?`${Math.round(hrs*10)/10}hr`:hrs<6?`${Math.round(hrs)}hrs`:hrs<12?"6-12hrs":hrs<24?"12-24hrs":"24hrs+"}
      const sym={
        types:qlSheet.types,
        date:td(),
        time:nt(),
        severity:data.severity||"",
        delay:autoDelay,
        duration:"",
        notes:data.notes||"",
        photo:null,
        consistency:data.consistency||null,
        bristol:data.consistency?consistencyToBristol(data.consistency):null,
        urgency:data.urgency||"",
        stoolFlags:[],
        ts:Date.now(),
        _toastMsg:`${qlSheet.emoji} ${qlSheet.label} logged`,
      };
      onQuickSave(sym);
      setQlSheet(null);
    }} onExpand={()=>{
      // Open full form pre-filled with this symptom's types
      onEditSym({types:qlSheet.types,severity:"",date:td(),time:nt(),_quick:true});
      setQlSheet(null);
    }} onClose={()=>setQlSheet(null)} />}

    {/* Add / Edit Pin Bottom Sheet */}
    {showAddPin&&<AddQuickSymSheet pins={pins} customSymptoms={customSymptoms}
      onAdd={(newPin)=>{setPinnedQuickSyms([...pins,newPin]);setShowAddPin(false)}}
      onClose={()=>setShowAddPin(false)} />}

    {editPin&&<AddQuickSymSheet pins={pins} customSymptoms={customSymptoms} edit={editPin}
      onUpdate={(idx,updatedPin)=>{const next=[...pins];next[idx]=updatedPin;setPinnedQuickSyms(next);setEditPin(null)}}
      onRemove={(idx)=>{const next=[...pins];next.splice(idx,1);setPinnedQuickSyms(next);setEditPin(null)}}
      onClose={()=>setEditPin(null)} />}
  </>);
}

/* ═══ QUICK-LOG BOTTOM SHEET ═══ */
function QuickLogSheet({q,onSave,onExpand,onClose}){
  const [severity,setSeverity]=useState("");
  const [consistency,setConsistency]=useState(null);
  const [urgency,setUrgency]=useState("");
  const [notes,setNotes]=useState("");
  const fields=q.fields||['severity'];
  const hasSev=fields.includes('severity');
  const hasCon=fields.includes('consistency');
  const hasUrg=fields.includes('urgency');
  const hasNotes=fields.includes('notes');

  return (<>
    <div className="ql-overlay" onClick={onClose}/>
    <div className="ql-sheet" onClick={e=>e.stopPropagation()}>
      <div className="ql-handle"/>
      <div className="ql-title">{q.emoji} {q.label}</div>

      {hasSev&&<div className="ql-section">
        <div className="ql-label">Severity</div>
        <div className="svr">{SEV.map(s=> <button key={s} className={`svb sv-${s} ${severity===s?'on':''}`} onClick={()=>setSeverity(s)}>{s}</button>)}</div>
      </div>}

      {hasCon&&<div className="ql-section">
        <div className="ql-label">Consistency</div>
        <div className="ql-chips">{CONSISTENCY.map(c=> <button key={c.id} className={`ch ${consistency===c.id?'on':''}`} style={{fontSize:10.5}} onClick={()=>setConsistency(consistency===c.id?null:c.id)}>{c.i} {c.l}</button>)}</div>
      </div>}

      {hasUrg&&<div className="ql-section">
        <div className="ql-label">Urgency</div>
        <div className="ql-chips">{["None","Mild","Moderate","Urgent","Emergency"].map(u=> <button key={u} className={`ch ${urgency===u?'on':''}`} style={{fontSize:10.5}} onClick={()=>setUrgency(urgency===u?"":u)}>{u}</button>)}</div>
      </div>}

      {hasNotes&&<div className="ql-section">
        <div className="ql-label">Notes (optional)</div>
        <textarea className="fta" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Anything to note..." style={{minHeight:36,fontSize:13}}/>
      </div>}

      <button className="bp" style={{width:'100%',marginTop:4}} onClick={()=>onSave({severity,consistency,urgency,notes:notes.trim()})}>Save</button>
      <button className="ql-expand" onClick={onExpand}>Open full form →</button>
    </div>
  </>);
}

/* ═══ ADD / EDIT QUICK-SYM PIN SHEET ═══
   Supports:
   - Single or multi-symptom combos (e.g. Nausea + Vomiting)
   - Edit mode for existing pins (pass `edit` prop with pin object + index)
   - Searchable symptom picker
*/
function AddQuickSymSheet({pins,customSymptoms,onAdd,onUpdate,onRemove,edit,onClose}){
  const isEdit=!!edit;
  const [step,setStep]=useState(isEdit?"configure":"pick");
  const [pickedTypes,setPickedTypes]=useState(isEdit?(edit.pin.types||[]):[]);
  const [label,setLabel]=useState(isEdit?(edit.pin.label||""):"");
  const [emoji,setEmoji]=useState(isEdit?(edit.pin.emoji||"🩺"):"");
  const [editFields,setEditFields]=useState(isEdit?(edit.pin.fields||['severity']):[]);
  const [search,setSearch]=useState("");

  const allSyms=[...SYM_LIST,...(customSymptoms||[])];

  // Build a set of symptom-sets already pinned (as sorted-joined strings) for dedupe indication
  const pinnedCombos=new Set(
    pins
      .map((p,i)=>({combo:[...(p.types||[])].sort().join("|"),i}))
      .filter(x=>!isEdit||x.i!==edit.idx)
      .map(x=>x.combo)
  );
  const currentCombo=[...pickedTypes].sort().join("|");
  const alreadyPinned=pickedTypes.length>0&&pinnedCombos.has(currentCombo);

  const defaultEmoji=(syms)=>{
    const map={'Nausea':'🤢','Vomiting':'🤮','Diarrhea':'💩','Bowel Movement (normal)':'🚽','Stomach Pain':'😣',
      'Abdominal Cramping':'😣','Bloating':'🫧','Gas':'💨','Heartburn/Reflux':'🔥','Difficulty Swallowing':'😮',
      'Food Getting Stuck':'😮','Throat Tightness':'😮','Chest Pain (eating)':'💔','Headache':'🤕',
      'Fatigue':'😴','Brain Fog':'🌫️','Energy Crash':'⚡','Mood Change':'😔','Skin Rash':'🔴',
      'Hives':'🔴','Congestion':'🤧','Joint Pain':'🦴','Constipation':'🚽'};
    // For combos, pick the emoji of the first symptom that has one
    for(const s of syms){ if(map[s])return map[s]; }
    return '🩺';
  };

  const autoLabel=(syms)=>{
    if(syms.length===0)return "";
    if(syms.length===1)return syms[0];
    if(syms.length===2)return `${syms[0]} + ${syms[1].split(' ')[0]}`;
    return `${syms[0]} +${syms.length-1}`;
  };

  const autoFields=(syms)=>{
    const cats=getSymCats(syms);
    const fields=[];
    if(cats.has('bm'))fields.push('consistency','urgency');
    if(cats.size>0&&!cats.has('bm'))fields.push('severity');
    if(cats.size===0&&syms.length>0)fields.push('severity');
    return fields;
  };

  const togSym=(s)=>{
    setPickedTypes(p=>{
      const next=p.includes(s)?p.filter(x=>x!==s):[...p,s];
      // Auto-update emoji/label/fields if user hasn't manually edited them yet,
      // OR if this is the initial pick step
      if(step==="pick"||!isEdit){
        if(!emoji||emoji==='🩺'||emoji===defaultEmoji(p))setEmoji(defaultEmoji(next));
        if(!label||label===autoLabel(p))setLabel(autoLabel(next));
      }
      return next;
    });
  };

  const proceedToConfigure=()=>{
    if(pickedTypes.length===0)return;
    if(!emoji)setEmoji(defaultEmoji(pickedTypes));
    if(!label)setLabel(autoLabel(pickedTypes));
    if(editFields.length===0)setEditFields(autoFields(pickedTypes));
    setStep("configure");
  };

  const FIELD_OPTIONS=[
    {id:'severity',l:'Severity'},
    {id:'consistency',l:'Consistency'},
    {id:'urgency',l:'Urgency'},
    {id:'notes',l:'Notes'},
  ];

  const searchQ=search.trim().toLowerCase();
  const shown=searchQ
    ? allSyms.filter(s=>s.toLowerCase().includes(searchQ))
    : allSyms;

  const doSave=()=>{
    if(!pickedTypes.length)return;
    const payload={
      types:pickedTypes,
      label:label.trim()||autoLabel(pickedTypes),
      emoji:emoji||defaultEmoji(pickedTypes),
      fields:editFields.length?editFields:['severity'],
    };
    if(isEdit)onUpdate(edit.idx,payload);
    else onAdd(payload);
  };

  return (<>
    <div className="ql-overlay" onClick={onClose}/>
    <div className="ql-sheet" style={{maxHeight:'75vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}>
      <div className="ql-handle"/>

      {step==="pick"&&<>
        <div className="ql-title">{isEdit?'Edit Pin':'Add Quick-Log Button'}</div>
        <div className="ql-label" style={{padding:'0 4px',marginBottom:6}}>
          Pick one symptom, or tap multiple for a combo (e.g. Nausea + Vomiting)
        </div>

        {/* Search */}
        <input className="fi" value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search symptoms..." style={{marginBottom:8}}/>

        {/* Selected chips preview */}
        {pickedTypes.length>0&&<div style={{padding:'6px 8px',background:'var(--c1)',borderRadius:8,marginBottom:8,border:'1px solid var(--accent-border)'}}>
          <div style={{fontSize:10,color:'var(--t3)',marginBottom:4}}>Selected:</div>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {pickedTypes.map(s=><button key={s} className="ch on" style={{fontSize:10.5}} onClick={()=>togSym(s)}>✕ {s}</button>)}
          </div>
          {alreadyPinned&&<div style={{fontSize:10,color:'var(--wn)',marginTop:4}}>⚠️ This combo is already pinned</div>}
        </div>}

        {/* Symptom list */}
        <div className="ql-pin-list">
          {shown.length===0?<div style={{padding:16,textAlign:'center',fontSize:12,color:'var(--t3)'}}>No matches for "{search}"</div>
          :shown.map(s=>{
            const picked=pickedTypes.includes(s);
            return <div key={s} className="ql-pin-item" onClick={()=>togSym(s)} style={picked?{background:'var(--accent-soft)'}:{}}>
              <span>{defaultEmoji([s])} {(customSymptoms||[]).includes(s)?'⭐ ':''}{s}</span>
              <button className="ql-pin-add" style={picked?{background:'var(--ok)',color:'#fff'}:{}}>{picked?'✓':'+'}</button>
            </div>;
          })}
        </div>

        <button className="bp" style={{width:'100%',marginTop:10,opacity:pickedTypes.length===0?0.4:1}} disabled={pickedTypes.length===0} onClick={proceedToConfigure}>
          Next: Configure →
        </button>
      </>}

      {step==="configure"&&<>
        <div className="ql-title">{isEdit?'Edit:':'Configure:'} {emoji} {label||autoLabel(pickedTypes)}</div>

        <div className="ql-section">
          <div className="ql-label">Symptoms</div>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {pickedTypes.map(s=><span key={s} className="ch on" style={{fontSize:10.5}}>{s}</span>)}
          </div>
          <button className="mb" onClick={()=>setStep("pick")} style={{color:'var(--pb)',fontSize:10.5,marginTop:4}}>← Change symptoms</button>
        </div>

        <div className="ql-section">
          <div className="ql-label">Button Label</div>
          <input className="fi" value={label} onChange={e=>setLabel(e.target.value)} placeholder={autoLabel(pickedTypes)}/>
        </div>

        <div className="ql-section">
          <div className="ql-label">Emoji</div>
          <input className="fi" value={emoji} onChange={e=>setEmoji(e.target.value)} style={{width:60,textAlign:'center',fontSize:20}} maxLength={4}/>
        </div>

        <div className="ql-section">
          <div className="ql-label">Fields to show in quick-log</div>
          <div className="ql-chips">
            {FIELD_OPTIONS.map(f=> <button key={f.id} className={`ch ${editFields.includes(f.id)?'on':''}`} style={{fontSize:10.5}}
              onClick={()=>setEditFields(p=>p.includes(f.id)?p.filter(x=>x!==f.id):[...p,f.id])}>{f.l}</button>)}
          </div>
          <div style={{fontSize:9,color:'var(--t3)',marginTop:3}}>Pick which fields appear in the quick-log bottom sheet</div>
        </div>

        <div style={{display:'flex',gap:6,marginTop:8}}>
          {!isEdit&&<button className="mb" onClick={()=>setStep("pick")} style={{color:'var(--t3)',fontSize:12}}>← Back</button>}
          {isEdit&&<button className="mb" onClick={()=>{if(confirm('Remove this pin?'))onRemove(edit.idx)}} style={{color:'var(--er-color)',fontSize:12}}>🗑 Remove</button>}
          <button className="bp" style={{flex:1,opacity:alreadyPinned&&!isEdit?0.5:1}} disabled={alreadyPinned&&!isEdit} onClick={doSave}>
            {isEdit?'Save Changes':'Add Button'}
          </button>
        </div>
        {alreadyPinned&&!isEdit&&<div style={{fontSize:10,color:'var(--wn)',marginTop:4,textAlign:'center'}}>⚠️ This combo is already pinned</div>}
      </>}
    </div>
  </>);
}

// (end of AddQuickSymSheet)
function SymCard({s,onEdit,onDel,pin,setPin,meals}){
  const [unlocked,setUnlocked]=useState(false);const [pinIn,setPinIn]=useState("");const [showPin,setShowPin]=useState(false);const [err,setErr]=useState(false);
  const tryU=()=>{if(pinIn===pin){setUnlocked(true);setShowPin(false)}else{setErr(true);setPinIn("")}};
  // Auto-detect nearby meals (read-only context)
  const nearby=(meals||[]).filter(m=>{
    const mt2=new Date(`${m.date}T${m.time||"12:00"}`).getTime();
    const st=new Date(`${s.date}T${s.time||"12:00"}`).getTime();
    const hrs=(st-mt2)/36e5;return hrs>0&&hrs<=12;
  }).sort((a,b)=>{const at=new Date(`${a.date}T${a.time||"12:00"}`).getTime();const bt=new Date(`${b.date}T${b.time||"12:00"}`).getTime();return bt-at}).slice(0,2);
  return(<div className="card">
    <div className="mc-h"><span className="bd" style={s.severity==='Severe'?{background:'var(--er-t2)',color:'var(--er)'}:s.severity==='Moderate'?{background:'var(--wn-t2)',color:'var(--wn)'}:{background:'var(--in-t2)',color:'var(--in)'}}>{s.severity||"—"}</span><span className="ts">{fmt12(s.time)} · {s.date}</span></div>
    <div className="tr" style={{marginTop:3}}>{(s.types||[]).map(t=><span key={t} className="tg ts2">{t}</span>)}</div>
    {s.consistency&&<div style={{fontSize:10.5,color:'var(--t2)',marginTop:2}}>{(CONSISTENCY.find(c=>c.id===s.consistency)||{}).i||''} Consistency: {(CONSISTENCY.find(c=>c.id===s.consistency)||{}).l||s.consistency}</div>}
    {!s.consistency&&s.bristol&&<div style={{fontSize:10.5,color:'var(--t2)',marginTop:2}}>Bristol Type {s.bristol}</div>}
    {s.urgency&&<div style={{fontSize:10.5,color:s.urgency==='Urgent'||s.urgency==='Emergency'?'var(--er)':'var(--t2)',marginTop:2}}>⚡ Urgency: {s.urgency}</div>}
    {s.stoolFlags?.length>0&&<div style={{display:'flex',gap:3,flexWrap:'wrap',marginTop:2}}>{s.stoolFlags.map(f=><span key={f} className="tg" style={{fontSize:9,background:f==='Blood'||f==='Dark/tarry'?'var(--er-t2)':'var(--wn-t1)',color:f==='Blood'||f==='Dark/tarry'?'var(--er)':'var(--wn)'}}>{f}</span>)}</div>}
    {s.duration&&<div style={{fontSize:10.5,color:'var(--pb)',marginTop:2}}>⏱️ Duration: {s.duration}</div>}
    {s.delay&&<div style={{fontSize:10.5,color:'var(--t3)',marginTop:2}}>🍽️ ~{s.delay} after last meal</div>}
    {nearby.length>0&&<div style={{marginTop:3,fontSize:10,color:'var(--t3)'}}>🍽️ Ate before: {nearby.map(m=>{const hrs=Math.round((new Date(`${s.date}T${s.time||"12:00"}`).getTime()-new Date(`${m.date}T${m.time||"12:00"}`).getTime())/36e5*10)/10;return`${(m.desc||"").slice(0,25)}${(m.desc||"").length>25?"...":""} (${hrs<1?Math.round(hrs*60)+"min":Math.round(hrs)+"h"} prior)`}).join(" · ")}</div>}
    {s.notes&&<div style={{fontSize:11.5,color:'var(--t2)',marginTop:3,fontStyle:'italic'}}>"{s.notes}"</div>}
    {s.photo&&!unlocked&&!showPin&&<div onClick={()=>pin?setShowPin(true):setUnlocked(true)} style={{marginTop:5,padding:12,background:'var(--c3)',borderRadius:6,textAlign:'center',cursor:'pointer'}}><div style={{fontSize:18}}>🔒</div><div style={{fontSize:10,color:'var(--t3)',marginTop:2}}>Tap to view photo{pin?" (PIN)":""}</div></div>}
    {s.photo&&showPin&&!unlocked&&<div style={{marginTop:5,padding:10,background:'var(--c3)',borderRadius:6}}><div style={{display:'flex',gap:5}}><input className="fi" type="password" maxLength={8} placeholder="PIN" value={pinIn} onChange={e=>{setPinIn(e.target.value);setErr(false)}} onKeyDown={e=>e.key==="Enter"&&tryU()} style={{flex:1,padding:'6px 8px',letterSpacing:3,textAlign:'center',borderColor:err?'var(--er)':''}} autoFocus/><button className="mb" onClick={tryU} style={{color:'var(--pb)'}}>Go</button><button className="mb" onClick={()=>{setShowPin(false);setPinIn("")}}>✕</button></div>{err&&<div style={{fontSize:12,color:'var(--er)',marginTop:3}}>Wrong PIN</div>}<div style={{textAlign:'center',marginTop:4}}><button className="mb" onClick={()=>{setPin("");setUnlocked(true)}} style={{fontSize:11,color:'var(--t3)'}}>Forgot PIN?</button></div></div>}
    {s.photo&&unlocked&&<img src={s.photo} className="mp" alt="" style={{marginTop:5}}/>}
    <div className="ma2"><button className="mb" onClick={onEdit}>✏️</button><button className="mb" onClick={onDel} style={{color:'var(--er)'}}>🗑️</button></div>
  </div>);
}

/* ═══ INSIGHTS TAB ═══ */
function InsightsTab({corr,meals,syms,getDC,phase,elimFoods,setElimFoods,elimStart,setElimStart,reintroFood,setReintroFood,reintroStart,setReintroStart,genApptPrep,water,medLog,activeMeds,cY,setCY,cM,setCM,selD,setSelD,mbd,dn,setDn}){
  const [showPrep,setShowPrep]=useState(false);
  const [iSub,setISub]=useState("overview"); // "overview","timeline","calendar","data"
  const [tlDate,setTlDate]=useState(td());
  const [inclRiskFlags,setInclRiskFlags]=useState(false); // toggle for PDF export
  const [inclCorrAnalysis,setInclCorrAnalysis]=useState(false); // toggle for correlation appendix in PDF
  const [dataRange,setDataRange]=useState(30); // data view: 7, 30, or 0 (all)
  const [dataAllergen,setDataAllergen]=useState(null); // data view: filter by allergen
  const maxTL=Math.max(...corr.tl.map(t=>t.n),1);
  const tc=getDC(td());
  const l7=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const ds=d.toISOString().split("T")[0];const c=getDC(ds);l7.push({ds,lb:ds.slice(5),dy:dA[d.getDay()],...c})}
  const prep=showPrep?genApptPrep(showPrep):null;

  // Incomplete day warnings (last 3 days including today)
  const warnings=[];
  for(let i=0;i<3;i++){
    const d=new Date();d.setDate(d.getDate()-i);const ds=d.toISOString().split("T")[0];
    const dayMeals=meals.filter(m=>m.date===ds).length;
    const dayWater=water?.[ds]||0;
    const dayBMs=syms.filter(s=>s.date===ds&&(s.types||[]).some(t=>t==="Bowel Movement (normal)"||t==="Diarrhea")).length;
    const issues=[];
    if(dayMeals<2)issues.push(`${dayMeals} meal${dayMeals!==1?'s':''}`);
    if(dayWater===0)issues.push("no water");
    if(dayBMs===0)issues.push("no BMs");
    if(issues.length>0)warnings.push({date:ds,issues,isToday:i===0});
  }

  // Timeline view data
  const tlMeals=meals.filter(m=>m.date===tlDate).sort((a,b)=>(a.time||"00:00").localeCompare(b.time||"00:00"));
  const tlSyms=syms.filter(s=>s.date===tlDate).sort((a,b)=>(a.time||"00:00").localeCompare(b.time||"00:00"));
  const tlAll=[...tlMeals.map(m=>({...m,_type:"meal",_time:m.time||"12:00"})),...tlSyms.map(s=>({...s,_type:"sym",_time:s.time||"12:00"}))].sort((a,b)=>a._time.localeCompare(b._time));
  const tlPrevD=()=>{const d=new Date(tlDate);d.setDate(d.getDate()-1);setTlDate(d.toISOString().split("T")[0])};
  const tlNextD=()=>{const d=new Date(tlDate);d.setDate(d.getDate()+1);setTlDate(d.toISOString().split("T")[0])};

  return(<>
    <div className="fvt">📊 Insights</div>
    <div style={{display:'flex',gap:2,marginBottom:10}}>{[["overview","📊 Overview"],["timeline","🕐 Timeline"],["calendar","📅 Calendar"],["data","📋 Data"]].map(([id,l])=><button key={id} className={`fc ${iSub===id?'on':''}`} style={{flex:1,textAlign:'center',padding:'5px 3px'}} onClick={()=>setISub(id)}>{l}</button>)}</div>

    {iSub==="calendar"&&<CalSub cY={cY} setCY={setCY} cM={cM} setCM={setCM} selD={selD} setSelD={setSelD} mbd={mbd} dn={dn} setDn={setDn}/>}

    {iSub==="timeline"&&<>
      {/* Day picker */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <button className="wm" onClick={tlPrevD}>◀</button>
        <div style={{textAlign:'center'}}>
          <div style={{fontFamily:'Outfit',fontSize:15,fontWeight:600}}>{tlDate===td()?"Today":tlDate}</div>
          <div style={{fontSize:10,color:'var(--t3)'}}>{tlMeals.length} meal{tlMeals.length!==1?'s':''} · {tlSyms.length} symptom{tlSyms.length!==1?'s':''}</div>
        </div>
        <button className="wm" onClick={tlNextD} style={tlDate>=td()?{opacity:.3,pointerEvents:'none'}:{}}>▶</button>
      </div>
      <div style={{display:'flex',gap:4,marginBottom:8,justifyContent:'center'}}>
        <button className="mb" onClick={()=>setTlDate(td())} style={{color:'var(--pb)'}}>Today</button>
        <button className="mb" onClick={()=>{const d=new Date();d.setDate(d.getDate()-1);setTlDate(d.toISOString().split("T")[0])}}>Yesterday</button>
      </div>

      {/* Timeline axis */}
      {tlAll.length===0?<div className="emp"><div className="emp-i">🕐</div><div className="emp-t">Nothing logged {tlDate===td()?"today":"this day"}</div><div className="emp-s">{tlDate===td()?"Log meals and symptoms throughout the day to see your timeline here.":"No meals or symptoms were recorded on this date. Use the arrows to check other days."}</div></div>
       :<div>
        {tlAll.map((item,i)=>{
          const isMeal=item._type==="meal";
          return <div key={i} style={{display:'flex',gap:0,marginBottom:10,alignItems:'flex-start'}}>
            {/* Time label */}
            <div style={{width:58,flexShrink:0,textAlign:'right',paddingRight:8,paddingTop:8,fontSize:10,fontWeight:600,color:'var(--t3)',lineHeight:'14px'}}>{fmt12(item._time)}</div>
            {/* Dot + line */}
            <div style={{width:14,flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center',paddingTop:7}}>
              <div style={{width:10,height:10,borderRadius:5,background:isMeal?'var(--ok)':'var(--er)',border:'2px solid var(--bg)',zIndex:1,flexShrink:0}}/>
              <div style={{width:2,flex:1,background:'var(--pb-t2)',marginTop:2}}/>
            </div>
            {/* Card */}
            <div style={{flex:1,marginLeft:6,background:'var(--c1)',border:`1px solid ${isMeal?'var(--ok-t2)':'var(--er-t2)'}`,borderRadius:10,padding:10}}>
              <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:3}}>
                <span style={{fontSize:12}}>{isMeal?'🍽️':'🩺'}</span>
                <span className="bd" style={isMeal?{background:'var(--ok-t2)',color:'var(--ok)'}:{background:item.severity==='Severe'?'var(--er-t2)':'var(--wn-t2)',color:item.severity==='Severe'?'var(--er)':'var(--wn)'}}>{isMeal?item.mt:(item.severity||"—")}</span>
              </div>
              {isMeal?<>
                <div style={{fontSize:12.5,color:'var(--t1)',lineHeight:1.4}}>{item.desc}</div>
                {item.al?.length>0&&<div className="tr" style={{marginTop:4}}>{item.al.map(a=>{const al2=AL.find(x=>x.id===a);return al2?<span key={a} className="tg ta">{al2.i} {al2.l}</span>:null})}</div>}
              </>:<>
                <div className="tr">{(item.types||[]).map(t=><span key={t} className="tg ts2">{t}</span>)}</div>
                {item.consistency&&<div style={{fontSize:10,color:'var(--t2)',marginTop:2}}>{(CONSISTENCY.find(c=>c.id===item.consistency)||{}).i||''} {(CONSISTENCY.find(c=>c.id===item.consistency)||{}).l||item.consistency}</div>}
                {!item.consistency&&item.bristol&&<div style={{fontSize:10,color:'var(--t2)',marginTop:2}}>Bristol Type {item.bristol}</div>}
                {item.urgency&&<div style={{fontSize:10,color:item.urgency==='Urgent'||item.urgency==='Emergency'?'var(--er)':'var(--t2)',marginTop:1}}>⚡ {item.urgency}</div>}
                {item.stoolFlags?.length>0&&<div style={{display:'flex',gap:2,flexWrap:'wrap',marginTop:1}}>{item.stoolFlags.map(f=><span key={f} style={{fontSize:8,padding:'1px 4px',borderRadius:4,background:f==='Blood'||f==='Dark/tarry'?'var(--er-t2)':'var(--wn-t2)',color:f==='Blood'||f==='Dark/tarry'?'var(--er)':'var(--wn)'}}>{f}</span>)}</div>}
                {item.duration&&<div style={{fontSize:10,color:'var(--pb)',marginTop:1}}>⏱️ {item.duration}</div>}
                {item.delay&&<div style={{fontSize:10,color:'var(--t3)',marginTop:1}}>🍽️ ~{item.delay} after last meal</div>}
                {item.notes&&<div style={{fontSize:10.5,color:'var(--t2)',marginTop:2,fontStyle:'italic'}}>"{item.notes}"</div>}
              </>}
            </div>
          </div>})}
      </div>}
    </>}

    {iSub==="overview"&&<>
      {/* Incomplete day warnings */}
      {warnings.length>0&&<div style={{marginBottom:10}}>
        {warnings.map((w,i)=><div key={i} style={{padding:'6px 10px',background:'var(--wn-t1)',border:'1px solid var(--wn-t2)',borderRadius:8,marginBottom:4,fontSize:11,color:'var(--wn)',display:'flex',alignItems:'center',gap:6}}>
          <span>⚠️</span>
          <span><strong>{w.isToday?"Today":w.date}</strong>: {w.issues.join(", ")} logged</span>
        </div>)}
      </div>}

      {/* Daily counter */}
      <div className="dc"><div className="dct">📅 Today — {td()}</div>
        <div style={{display:'flex',gap:10,marginBottom:10}}>
          <div style={{flex:1,textAlign:'center',padding:8,background:'var(--er-t1)',borderRadius:6}}><div style={{fontSize:10,color:'var(--er)',fontWeight:600}}>🤢 Vomiting</div><div style={{fontSize:24,fontFamily:'Outfit',fontWeight:700,color:'var(--er)'}}>{tc.v}</div></div>
          <div style={{flex:1,textAlign:'center',padding:8,background:'var(--wn-t1)',borderRadius:6}}><div style={{fontSize:10,color:'var(--wn)',fontWeight:600}}>💩 Diarrhea</div><div style={{fontSize:24,fontFamily:'Outfit',fontWeight:700,color:'var(--wn)'}}>{tc.d}</div></div>
          <div style={{flex:1,textAlign:'center',padding:8,background:'var(--pb-t1)',borderRadius:6}}><div style={{fontSize:10,color:'var(--pb)',fontWeight:600}}>🚽 Total BMs</div><div style={{fontSize:24,fontFamily:'Outfit',fontWeight:700,color:'var(--pb)'}}>{tc.bm}</div></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,textAlign:'center'}}>
          {l7.map((d,i)=><div key={i} style={{fontSize:9}}><div style={{color:'var(--t3)',marginBottom:2}}>{d.dy}</div><div style={{padding:'3px 0',background:d.v?'var(--er-t2)':'var(--c3)',borderRadius:3,color:d.v?'var(--er)':'var(--t3)',fontWeight:d.v?600:400,marginBottom:1}}>{d.v}</div><div style={{padding:'3px 0',background:d.d?'var(--wn-t2)':'var(--c3)',borderRadius:3,color:d.d?'var(--wn)':'var(--t3)',fontWeight:d.d?600:400}}>{d.d}</div></div>)}
        </div>
        <div style={{fontSize:9,color:'var(--t3)',textAlign:'center',marginTop:4}}>Auto-counted from symptom log</div>
      </div>

      {/* Symptom streak tracker */}
      {(()=>{
        const TRACK_SYMS=["Vomiting","Diarrhea","Nausea","Difficulty Swallowing"];
        // Build a set of dates that have each symptom
        const symDates={};
        TRACK_SYMS.forEach(s=>{symDates[s]=new Set()});
        syms.forEach(s=>{(s.types||[]).forEach(t=>{if(symDates[t])symDates[t].add(s.date)})});
        // Get all unique dates with any symptom data, sorted
        const allDates=[...new Set(syms.map(s=>s.date))].sort();
        if(allDates.length<2)return null;
        // Calculate streaks for each tracked symptom
        const streaks=TRACK_SYMS.map(sym=>{
          const dates=symDates[sym];
          // Current streak: count back from today
          let cur=0;let curFree=0;
          const todayD=new Date(td());
          // Current WITH streak (consecutive days with this symptom ending today or yesterday)
          for(let i=0;i<90;i++){const d=new Date(todayD);d.setDate(todayD.getDate()-i);const ds=d.toISOString().split("T")[0];
            if(dates.has(ds))cur++;else break;
          }
          // Current FREE streak (consecutive days WITHOUT, going back from today)
          if(cur===0){for(let i=0;i<90;i++){const d=new Date(todayD);d.setDate(todayD.getDate()-i);const ds=d.toISOString().split("T")[0];
            // Only count days we have any data for
            if(allDates.includes(ds)){if(!dates.has(ds))curFree++;else break}
            else break; // stop at gaps in tracking
          }}
          // Longest WITH streak ever
          let longest=0;let run=0;
          for(let i=0;i<allDates.length;i++){if(dates.has(allDates[i])){run++;longest=Math.max(longest,run)}else run=0}
          // Longest FREE streak
          let longestFree=0;let runFree=0;
          for(let i=0;i<allDates.length;i++){if(!dates.has(allDates[i])){runFree++;longestFree=Math.max(longestFree,runFree)}else runFree=0}
          // Last 14 days visual
          const last14=[];
          for(let i=13;i>=0;i--){const d=new Date(todayD);d.setDate(todayD.getDate()-i);const ds=d.toISOString().split("T")[0];last14.push({ds,has:dates.has(ds),tracked:allDates.includes(ds)||ds===td()})}
          return{sym,cur,curFree,longest,longestFree,total:dates.size,last14};
        }).filter(s=>s.total>0); // only show symptoms that have been logged at least once

        if(streaks.length===0)return null;
        return <div className="dc"><div className="dct">🔥 Symptom Streaks</div>
          {streaks.map((s,i)=>{
            const ic=s.sym==="Vomiting"?"🤢":s.sym==="Diarrhea"?"💩":s.sym==="Nausea"?"😣":"😮";
            const isActive=s.cur>0;
            return <div key={i} style={{marginBottom:i<streaks.length-1?10:0}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                <span style={{fontSize:13}}>{ic}</span>
                <span style={{fontSize:12,fontWeight:600,color:'var(--t1)',flex:1}}>{s.sym}</span>
                {isActive?<span style={{fontSize:10,fontWeight:600,color:'var(--er)',padding:'2px 8px',background:'var(--er-t1)',borderRadius:10}}>{s.cur} day{s.cur!==1?'s':''} active</span>
                 :s.curFree>0?<span style={{fontSize:10,fontWeight:600,color:'var(--ok)',padding:'2px 8px',background:'var(--ok-t1)',borderRadius:10}}>{s.curFree} day{s.curFree!==1?'s':''} free</span>
                 :null}
              </div>
              {/* 14-day dot grid */}
              <div style={{display:'flex',gap:2,marginBottom:4}}>
                {s.last14.map((d,j)=><div key={j} style={{flex:1,height:8,borderRadius:2,background:!d.tracked?'var(--c2)':d.has?'var(--er-t3)':'var(--ok-t3)'}} title={`${d.ds}: ${d.has?s.sym:'clear'}`}/>)}
              </div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'var(--t3)'}}>
                <span>14 days ago</span><span>Today</span>
              </div>
              {/* Stats row */}
              <div style={{display:'flex',gap:8,marginTop:4,fontSize:10,color:'var(--t2)'}}>
                <span>Total: <strong>{s.total} day{s.total!==1?'s':''}</strong></span>
                <span>Longest streak: <strong style={{color:'var(--er)'}}>{s.longest}d</strong></span>
                <span>Best free: <strong style={{color:'var(--ok)'}}>{s.longestFree}d</strong></span>
              </div>
            </div>})}
        </div>;
      })()}

      {/* Medication adherence */}
      {(()=>{
        const active=(activeMeds||[]).filter(m=>!m.end);
        if(!active.length||!medLog)return null;
        const days14=[];for(let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days14.push(d.toISOString().split("T")[0])}
        // Parse expected doses per day from freq string
        const parseFreq=(freq)=>{const fl=(freq||"").toLowerCase();if(fl.includes("twice")||fl.includes("2x")||fl.includes("two times")||fl.includes("bid"))return 2;if(fl.includes("three")||fl.includes("3x")||fl.includes("tid"))return 3;return 1};
        const adherence=active.map(m=>{
          const shortName=(m.name||"").split("(")[0].trim().split(" ")[0].toLowerCase();
          const expectedPerDay=parseFreq(m.freq);
          let totalExpected=14*expectedPerDay;
          let totalTaken=0;
          const dayData=days14.map(ds=>{
            const entries=Array.isArray(medLog[ds])?medLog[ds]:[];
            const count=entries.filter(e=>(e.name||"").toLowerCase().includes(shortName)).length;
            totalTaken+=count;
            return{ds,count,expected:expectedPerDay};
          });
          return {name:(m.name||"").split("(")[0].trim(),dose:m.dose,freq:m.freq,expectedPerDay,totalTaken,totalExpected,pct:Math.round(totalTaken/totalExpected*100),dayData};
        });
        return <div className="dc"><div className="dct">💊 Medication Adherence (14 days)</div>
          {adherence.map((a,i)=> <div key={i} style={{marginBottom:i<adherence.length-1?10:0}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
              <div><span style={{fontSize:11.5,fontWeight:500,color:'var(--t1)'}}>{a.name} {a.dose||""}</span>{a.expectedPerDay>1&&<span style={{fontSize:9,color:'var(--t3)',marginLeft:4}}>({a.expectedPerDay}x/day)</span>}</div>
              <span style={{fontSize:11,fontWeight:600,color:a.pct>=80?'var(--ok)':a.pct>=50?'var(--wn)':'var(--er)'}}>{a.pct}%</span>
            </div>
            <div style={{display:'flex',gap:1.5,height:a.expectedPerDay>1?16:8}}>
              {a.dayData.map((d,j)=>{
                if(a.expectedPerDay<=1){
                  const took=d.count>0;
                  return <div key={j} style={{flex:1,borderRadius:2,background:took?'var(--ok)':'var(--er-t3)'}} title={`${d.ds}: ${took?'Taken':'Missed'}`}/>
                }
                // Multi-dose: show stacked segments
                return <div key={j} style={{flex:1,display:'flex',flexDirection:'column',gap:1}}>
                  {Array.from({length:a.expectedPerDay}).map((_,k)=><div key={k} style={{flex:1,borderRadius:1,background:k<d.count?'var(--ok)':'var(--er-t3)'}}/>)}
                </div>
              })}
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:8,color:'var(--t3)',marginTop:2}}>
              <span>14d ago</span>
              <span>{a.totalTaken}/{a.totalExpected} doses</span>
              <span>Today</span>
            </div>
          </div>)}
        </div>;
      })()}

      {/* Symptom time-of-day patterns — V2 from correlation engine */}
      {(()=>{
        const tod=corr.patterns?.timeOfDay;
        if(!tod?.distribution)return null;
        const buckets=tod.distribution;
        const totalP=tod.total||0;
        if(totalP<5)return null;
        const maxB=Math.max(...Object.values(buckets),1);
        const icons={Morning:"🌅",Afternoon:"☀️",Evening:"🌆",Night:"🌙"};
        const colors={Morning:"var(--wn)",Afternoon:"var(--ok)",Evening:"var(--pb)",Night:"var(--in)"};
        const ranges={Morning:"5a–11a",Afternoon:"11a–5p",Evening:"5p–10p",Night:"10p–5a"};
        return <div className="dc"><div className="dct">🕐 Symptom Time Patterns</div>
          <div style={{display:'flex',gap:6}}>
            {Object.entries(buckets).map(([period,count])=> <div key={period} style={{flex:1,textAlign:'center'}}>
              <div style={{height:60,display:'flex',alignItems:'flex-end',justifyContent:'center',marginBottom:4}}>
                <div style={{width:'100%',maxWidth:32,borderRadius:'4px 4px 0 0',background:colors[period],minHeight:4,height:`${Math.max((count/maxB)*100,6)}%`,opacity:count?1:0.3}}/>
              </div>
              <div style={{fontSize:14}}>{icons[period]}</div>
              <div style={{fontSize:10,fontWeight:600,color:colors[period]}}>{count}</div>
              <div style={{fontSize:8,color:'var(--t3)'}}>{period}</div>
              <div style={{fontSize:7,color:'var(--t3)',opacity:0.7}}>{ranges[period]}</div>
            </div>)}
          </div>
          {/* Time-of-day alerts */}
          {tod.alerts?.length>0&&<div style={{marginTop:8}}>
            {tod.alerts.map((a,i)=><div key={i} style={{padding:'5px 8px',background:'var(--wn-t1)',border:'1px solid var(--wn-t2)',borderRadius:6,marginBottom:3,fontSize:10.5,color:'var(--wn)'}}>
              ⚡ {a.pct}% of <strong>{a.symptom}</strong> occurs in the <strong>{a.bucket}</strong> ({a.count}/{a.total})
            </div>)}
          </div>}
          <div style={{fontSize:9,color:'var(--t3)',textAlign:'center',marginTop:6}}>Based on {totalP} symptom entries</div>
        </div>;
      })()}

      {/* Day-of-week patterns */}
      {(()=>{
        const dow=corr.patterns?.dayOfWeek;
        if(!dow?.distribution?.length||dow.total<7)return null;
        const maxD=Math.max(...dow.distribution.map(d=>d.count),1);
        return <div className="dc"><div className="dct">📅 Day-of-Week Patterns</div>
          <div style={{display:'flex',gap:3,alignItems:'flex-end',height:50,marginBottom:4}}>
            {dow.distribution.map((d,i)=><div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center'}}>
              <div style={{width:'100%',borderRadius:'3px 3px 0 0',background:'var(--pd)',minHeight:2,height:`${Math.max((d.count/maxD)*100,4)}%`}}/>
            </div>)}
          </div>
          <div style={{display:'flex',gap:3}}>
            {dow.distribution.map((d,i)=><div key={i} style={{flex:1,textAlign:'center'}}>
              <div style={{fontSize:8,color:'var(--t3)'}}>{d.short}</div>
              <div style={{fontSize:9,fontWeight:600,color:'var(--t2)'}}>{d.count}</div>
            </div>)}
          </div>
          {dow.alerts?.length>0&&<div style={{marginTop:6}}>
            {dow.alerts.map((a,i)=><div key={i} style={{fontSize:10.5,color:'var(--wn)',padding:'4px 8px',background:'var(--wn-t1)',borderRadius:6,marginBottom:2}}>
              📌 <strong>{a.day}s</strong> have {a.ratio}x more symptoms than average ({a.count} vs avg {a.avg})
            </div>)}
          </div>}
        </div>;
      })()}

      {/* Meal-gap analysis */}
      {(()=>{
        const mg=corr.patterns?.mealGap;
        if(!mg?.total||mg.total<5)return null;
        const dist=mg.distribution;
        const maxG=Math.max(...Object.values(dist),1);
        const gapColors={'<1hr':'var(--ok)','1-3hr':'var(--in)','3-6hr':'var(--pb)','6-12hr':'var(--wn)','12hr+':'var(--er)'};
        return <div className="dc"><div className="dct">🍽️ Time Since Last Meal → Symptom</div>
          <div style={{display:'flex',gap:4}}>
            {Object.entries(dist).map(([bucket,count])=><div key={bucket} style={{flex:1,textAlign:'center'}}>
              <div style={{height:45,display:'flex',alignItems:'flex-end',justifyContent:'center',marginBottom:3}}>
                <div style={{width:'100%',borderRadius:'3px 3px 0 0',background:gapColors[bucket]||'var(--pd)',minHeight:2,height:`${Math.max((count/maxG)*100,5)}%`}}/>
              </div>
              <div style={{fontSize:9,fontWeight:600,color:'var(--t2)'}}>{count}</div>
              <div style={{fontSize:7.5,color:'var(--t3)'}}>{bucket}</div>
            </div>)}
          </div>
          {mg.alerts?.length>0&&<div style={{marginTop:6}}>
            {mg.alerts.map((a,i)=><div key={i} style={{fontSize:10.5,color:'var(--wn)',padding:'4px 8px',background:'var(--wn-t1)',borderRadius:6}}>
              ⏱️ {a.pct}% of symptoms occur <strong>{a.bucket}</strong> after eating ({a.count}/{a.total})
            </div>)}
          </div>}
          <div style={{fontSize:9,color:'var(--t3)',textAlign:'center',marginTop:4}}>Based on {mg.total} symptom entries</div>
        </div>;
      })()}

      {/* Stacking detection */}
      {(()=>{
        const st=corr.patterns?.stacking;
        if(!st?.significant)return null;
        return <div className="dc"><div className="dct">⚠️ Allergen Stacking Effect</div>
          <div style={{fontSize:11,color:'var(--t1)',lineHeight:1.6,padding:'4px 0'}}>
            Meals with <strong>2+ allergens</strong> are followed by symptoms <strong>{st.multiAllergenSymRate}%</strong> of the time vs <strong>{st.singleAllergenSymRate}%</strong> for single-allergen meals.
          </div>
          <div style={{display:'flex',gap:8,marginTop:6}}>
            <div style={{flex:1,textAlign:'center',padding:8,background:'var(--wn-t1)',borderRadius:6}}>
              <div style={{fontSize:20,fontFamily:'Outfit',fontWeight:700,color:'var(--wn)'}}>{st.multiplier}x</div>
              <div style={{fontSize:9,color:'var(--t3)'}}>stacking multiplier</div>
            </div>
            <div style={{flex:1,textAlign:'center',padding:8,background:'var(--c1)',borderRadius:6}}>
              <div style={{fontSize:11,color:'var(--t2)',lineHeight:1.5}}>
                <div>{st.singleAllergenMeals} single-allergen meals</div>
                <div>{st.multiAllergenMeals} multi-allergen meals</div>
              </div>
            </div>
          </div>
        </div>;
      })()}

      {phase==="elimination"&&<div className="dc"><div className="dct">🚫 Elimination Tracker</div>
        <div className="cg" style={{marginBottom:6}}>{ELIM_FOODS.map(f=><button key={f} className={`ch ${elimFoods.includes(f)?'on':''}`} onClick={()=>setElimFoods(p=>p.includes(f)?p.filter(x=>x!==f):[...p,f])} style={{fontSize:10.5}}>{f}</button>)}</div>
        {!elimStart&&<button className="mb" onClick={()=>setElimStart(td())} style={{color:'var(--ok)'}}>Start Elimination</button>}
        {elimStart&&<div style={{fontSize:11,color:'var(--ok)'}}>Started: {elimStart} · Day {Math.ceil((Date.now()-new Date(elimStart).getTime())/864e5)}</div>}
      </div>}

      {phase==="reintroduction"&&<div className="dc"><div className="dct">🔄 Reintroduction</div>
        <div className="cg" style={{marginBottom:6}}>{ELIM_FOODS.map(f=><button key={f} className={`ch ${reintroFood===f?'on':''}`} onClick={()=>setReintroFood(f)} style={{fontSize:10.5}}>{f}</button>)}</div>
        {reintroFood&&!reintroStart&&<button className="mb" onClick={()=>setReintroStart(td())} style={{color:'var(--ok)'}}>Start Reintro: {reintroFood}</button>}
        {reintroStart&&<div style={{fontSize:11,color:'var(--in)'}}>Reintroducing: {reintroFood} · Day {Math.ceil((Date.now()-new Date(reintroStart).getTime())/864e5)}</div>}
      </div>}

      {/* Symptom trend */}
      <div className="dc"><div className="dct">📈 8-Week Trend</div>
        {corr.tl.every(t=>t.n===0)?<div style={{textAlign:'center',color:'var(--t3)',fontSize:11.5,padding:12}}>Log more symptoms to see trends</div>:<>
          <div style={{display:'flex',alignItems:'flex-end',gap:2,height:70,padding:'0 3px'}}>{corr.tl.map((t,i)=><div key={i} style={{flex:1,background:t.sv>6?'var(--er)':t.sv>3?'var(--wn)':'var(--pd)',borderRadius:'2px 2px 0 0',minHeight:2,height:`${Math.max((t.n/maxTL)*100,3)}%`}}/>)}</div>
          <div style={{display:'flex',gap:2,padding:'3px 3px 0'}}>{corr.tl.map((t,i)=><div key={i} style={{flex:1,textAlign:'center',fontSize:8,color:'var(--t3)'}}>{t.lb}</div>)}</div></>}
      </div>

      {/* V2 Correlations — Allergen with lift */}
      <div className="dc"><div className="dct">⚠️ Allergen → Symptom Correlation</div>
        {corr.allergens.length===0?<div style={{textAlign:'center',color:'var(--t3)',fontSize:11.5,padding:12}}>Need more data (3+ meals per allergen)</div>
         :corr.allergens.slice(0,8).map((c,i)=>{const al=AL.find(a=>a.id===c.allergen);const liftCl=c.lift>=2.5?'var(--er)':c.lift>=1.5?'var(--wn)':c.lift>=1.0?'var(--in)':'var(--ok)';const confC=c.confidence==='Low'?'var(--t3)':c.confidence==='Medium'?'var(--wn)':'var(--ok)';const barW=Math.min(100,Math.round(c.lift*33));return <div key={i} className="cr" style={{flexWrap:'wrap'}}>
          <span style={{flex:1,fontSize:11.5,color:'var(--t1)',minWidth:80}}>{al?.i} {al?.l||c.allergen}</span>
          <span style={{fontSize:10,color:'var(--t2)',minWidth:55}}>{c.topSymptom?c.topSymptom.slice(0,18):''}</span>
          <div className="crb"><div className="crf" style={{width:`${barW}%`,background:liftCl}}/></div>
          <span style={{fontSize:11,fontWeight:700,minWidth:36,textAlign:'right',color:liftCl}}>{c.lift}x</span>
          <div style={{width:'100%',display:'flex',justifyContent:'space-between',marginTop:-1}}>
            <span style={{fontSize:8,color:'var(--t3)'}}>Lift: {c.lift}x · Exposure: {c.baselineExposure}% of meals</span>
            <span style={{fontSize:8,color:confC}}>{c.confidence} ({c.symptomEpisodes}/{c.mealsWithAllergen})</span>
          </div>
        </div>})}
        <div style={{fontSize:8.5,color:'var(--t3)',padding:'4px 0',lineHeight:1.4}}>Lift = how much more likely symptoms are after this allergen vs baseline. 1.0x = no effect, 2.0x = 2× more likely.</div>
      </div>

      {/* V2 Ingredient-level correlations */}
      <div className="dc"><div className="dct">🥘 Ingredient → Symptom Correlation</div>
        {corr.ingredients.length===0?<div style={{textAlign:'center',color:'var(--t3)',fontSize:11.5,padding:12}}>Need ingredient data (log meals with ingredients)</div>
         :corr.ingredients.slice(0,8).map((c,i)=>{const liftCl=c.lift>=2.5?'var(--er)':c.lift>=1.5?'var(--wn)':c.lift>=1.0?'var(--in)':'var(--ok)';const confC=c.confidence==='Low'?'var(--t3)':c.confidence==='Medium'?'var(--wn)':'var(--ok)';const barW=Math.min(100,Math.round(c.lift*33));return <div key={i} className="cr" style={{flexWrap:'wrap'}}>
          <span style={{flex:1,fontSize:10.5,color:'var(--t1)',minWidth:80}}>{c.ingredient.length>28?c.ingredient.slice(0,26)+'…':c.ingredient}</span>
          <span style={{fontSize:10,color:'var(--t2)',minWidth:55}}>{c.topSymptom?c.topSymptom.slice(0,18):''}</span>
          <div className="crb"><div className="crf" style={{width:`${barW}%`,background:liftCl}}/></div>
          <span style={{fontSize:11,fontWeight:700,minWidth:36,textAlign:'right',color:liftCl}}>{c.lift}x</span>
          <div style={{width:'100%',display:'flex',justifyContent:'space-between',marginTop:-1}}>
            <span style={{fontSize:8,color:'var(--t3)'}}>Eaten {c.timesEaten}x · {c.symptomEpisodes} symptom episodes</span>
            <span style={{fontSize:8,color:confC}}>{c.confidence}</span>
          </div>
        </div>})}
      </div>

      {/* EoE cumulative exposure */}
      {corr.eoe&&<div className="dc"><div className="dct">🔴 Swallowing / EoE Analysis</div>
        <div style={{fontSize:11,color:'var(--t2)',lineHeight:1.5,padding:'4px 0',marginBottom:6}}>
          Based on <strong>{corr.eoe.episodes}</strong> swallowing episodes, using 72-hour cumulative allergen exposure windows.
        </div>
        {corr.eoe.correlations.map((c,i)=>{const al=AL.find(a=>a.id===c.allergen);const liftCl=c.lift>=2.0?'var(--er)':c.lift>=1.3?'var(--wn)':'var(--in)';return <div key={i} style={{padding:'6px 0',borderBottom:'1px solid var(--pb-t1)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:11.5,color:'var(--t1)'}}>{al?.i} {al?.l||c.allergen}</span>
            <span style={{fontSize:12,fontWeight:700,color:liftCl}}>{c.lift}x lift</span>
          </div>
          <div style={{fontSize:9.5,color:'var(--t3)',marginTop:2}}>{c.detail}</div>
          <div style={{fontSize:9,color:'var(--t3)',marginTop:1}}>EoE window: {c.eoeRate}% exposure · Baseline: {c.baseRate}%</div>
        </div>})}
        <div style={{fontSize:8.5,color:'var(--t3)',padding:'6px 0',lineHeight:1.4}}>EoE-type symptoms use 72hr cumulative exposure scoring. High lift means this allergen appears more often in the days before swallowing episodes vs normal days.</div>
      </div>}

      {/* View raw data link */}
      <div style={{textAlign:'center',padding:'8px 0'}}>
        <button className="mb" style={{color:'var(--pb)',fontSize:12}} onClick={()=>setISub("data")}>📋 View raw data →</button>
      </div>

    {/* Appointment Prep */}
    <div className="dc"><div className="dct">🏥 Appointment Prep</div>
      {!showPrep?<div style={{display:'flex',gap:4}}>
        <button className="bp" style={{flex:1,fontSize:12}} onClick={()=>setShowPrep("newdoc")}>🩺 New Doctor View</button>
        <button className="bp" style={{flex:1,fontSize:12,background:'var(--c3)'}} onClick={()=>setShowPrep("full")}>📋 Full View</button>
      </div>
       :prep&&<div style={{fontSize:11.5,lineHeight:1.7,color:'var(--t2)'}}>
        <div style={{fontWeight:600,color:prep.mode==="newdoc"?'var(--ok)':'var(--pb)',marginBottom:6,fontSize:12}}>{prep.mode==="newdoc"?"🩺 NEW DOCTOR — Facts Only (no diagnoses)":"📋 FULL SUMMARY"}</div>

        {/* Background */}
        {prep.background&&<div style={{padding:8,background:'var(--c1)',borderRadius:6,marginBottom:8}}>
          <div style={{fontWeight:600,color:'var(--t1)',fontSize:11,marginBottom:3}}>Patient Background</div>
          <div>Onset: {prep.background.onset} — {prep.background.trigger}</div>
          <div>Prior history: {prep.background.priorHistory}</div>
          <div>Weight: {prep.background.weightLoss}</div>
          <div>Current symptoms: {prep.background.ongoingSymptoms}</div>
          <div>Pattern: {prep.background.noPattern}</div>
        </div>}

        {/* Timeline */}
        {prep.timeline?.length>0&&<div style={{padding:8,background:'var(--c1)',borderRadius:6,marginBottom:8}}>
          <div style={{fontWeight:600,color:'var(--t1)',fontSize:11,marginBottom:3}}>Event Timeline</div>
          {prep.timeline.map((t,i)=><div key={i} style={{padding:'3px 0',borderBottom:'1px solid var(--pb-t1)'}}><span style={{color:'var(--pb)',fontWeight:600,fontSize:10}}>{t.date}</span> — {t.event}</div>)}
        </div>}

        {/* Procedures */}
        {prep.allProcs?.length>0&&<div style={{padding:8,background:'var(--c1)',borderRadius:6,marginBottom:8}}>
          <div style={{fontWeight:600,color:'var(--t1)',fontSize:11,marginBottom:3}}>Procedures</div>
          {prep.allProcs.map((p,i)=><div key={i} style={{padding:'3px 0',borderBottom:'1px solid var(--pb-t1)'}}><span style={{fontWeight:600,fontSize:10,color:'var(--pb)'}}>{p.date}</span> — {p.type}: <span style={{fontSize:10}}>{p.results||"—"}</span></div>)}
        </div>}

        {/* Labs */}
        {prep.recentLabs?.length>0&&<div style={{padding:8,background:'var(--c1)',borderRadius:6,marginBottom:8}}>
          <div style={{fontWeight:600,color:'var(--t1)',fontSize:11,marginBottom:3}}>Lab Values</div>
          {prep.recentLabs.map((l,i)=>{const lt=LAB_TYPES.find(t=>t.id===l.type);return <div key={i}>{lt?.name||l.type}: <span style={{fontWeight:600,color:'var(--pb)'}}>{l.value} {lt?.unit||""}</span> (ref: {lt?.ref||"—"}) — {l.date}</div>})}
        </div>}

        {/* Meds */}
        {prep.allMeds?.length>0&&<div style={{padding:8,background:'var(--c1)',borderRadius:6,marginBottom:8}}>
          <div style={{fontWeight:600,color:'var(--t1)',fontSize:11,marginBottom:3}}>Medications</div>
          {prep.allMeds.map((m,i)=><div key={i}>{m.name} {m.dose} ({m.freq}) — {m.reason} · Started {m.start}{m.end?` · Ended ${m.end}`:' · Active'}</div>)}
        </div>}

        {/* Diagnoses — only in full mode */}
        {prep.dxs?.length>0&&<div style={{padding:8,background:'var(--c1)',borderRadius:6,marginBottom:8}}>
          <div style={{fontWeight:600,color:'var(--t1)',fontSize:11,marginBottom:3}}>Diagnoses</div>
          {prep.dxs.map((d,i)=><div key={i}>{d.name} — <span style={{color:d.status==='Confirmed'?'var(--ok)':d.status==='Ruled Out'?'var(--er)':'var(--wn)'}}>{d.status}</span> ({d.date})</div>)}
        </div>}

        {/* Recent 30 days — summary */}
        <div style={{padding:8,background:'var(--c1)',borderRadius:6,marginBottom:8}}>
          <div style={{fontWeight:600,color:'var(--t1)',fontSize:11,marginBottom:3}}>Last 30 Days — Summary</div>
          <div>📋 {prep.mealCount} meals · {prep.symCount} symptoms{prep.compStats?.drinks?` · ${prep.compStats.drinks} drinks`:''}</div>
          <div>🤢 {prep.vCount} vomiting · 💩 {prep.dCount} diarrhea · 🚽 {prep.bmCount} total BMs</div>
          {(prep.compStats?.partial>0||prep.compStats?.couldnt>0)&&<div>🍽️ Completion: {prep.compStats.finished} finished, {prep.compStats.partial} partial, {prep.compStats.couldnt} couldn't eat</div>}
          {prep.topSymptoms.length>0&&<div>Top symptoms: {prep.topSymptoms.map(([s,n,durs])=>`${s} (${n}x${durs?', typical: '+durs.slice(0,3).join(', '):''})`).join(', ')}</div>}
        </div>

        {/* Daily BM pattern */}
        {prep.dailyBM?.some(d=>d.total>0)&&<div style={{padding:8,background:'var(--c1)',borderRadius:6,marginBottom:8}}>
          <div style={{fontWeight:600,color:'var(--t1)',fontSize:11,marginBottom:3}}>Daily BM Pattern (30 days)</div>
          <div style={{maxHeight:120,overflowY:'auto',fontSize:10,lineHeight:1.5}}>
            {prep.dailyBM.filter(d=>d.total>0).map((d,i)=> <div key={i} style={{display:'flex',gap:6,borderBottom:'1px solid var(--pb-t1)',padding:'2px 0'}}>
              <span style={{color:'var(--pb)',fontWeight:600,minWidth:62}}>{d.date.slice(5)}</span>
              <span style={{color:'var(--ok)'}}>{d.normal} normal</span>
              {d.diarrhea>0&&<span style={{color:'var(--wn)'}}>{d.diarrhea} diarrhea</span>}
              {d.consistencies?.length>0&&<span style={{color:'var(--t3)'}}>{d.consistencies.join(', ')}</span>}
              {!d.consistencies?.length&&d.bristols.length>0&&<span style={{color:'var(--t3)'}}>Bristol: {d.bristols.join(', ')}</span>}
            </div>)}
          </div>
        </div>}

        {/* Individual symptom entries — last 30 days */}
        {prep.symEntries?.length>0&&<div style={{padding:8,background:'var(--c1)',borderRadius:6,marginBottom:8}}>
          <div style={{fontWeight:600,color:'var(--t1)',fontSize:11,marginBottom:3}}>Symptom Log Detail ({prep.symEntries.length} entries)</div>
          <div style={{maxHeight:150,overflowY:'auto',fontSize:10,lineHeight:1.5}}>
            {prep.symEntries.map((s,i)=> <div key={i} style={{borderBottom:'1px solid var(--pb-t1)',padding:'2px 0'}}>
              <span style={{color:'var(--pb)',fontWeight:600}}>{s.date.slice(5)} {fmt12(s.time)}</span>{' '}
              <span style={{color:s.severity==='Severe'?'var(--er)':s.severity==='Moderate'?'var(--wn)':'var(--in)'}}>[{s.severity}]</span>{' '}
              {(s.types||[]).join(', ')}
              {s.duration&&<span style={{color:'var(--t3)'}}> · ⏱️{s.duration}</span>}
              {s.consistency&&<span style={{color:'var(--t3)'}}> · {(CONSISTENCY.find(c=>c.id===s.consistency)||{}).l||s.consistency}</span>}
              {!s.consistency&&s.bristol&&<span style={{color:'var(--t3)'}}> · Bristol {s.bristol}</span>}
              {s.delay&&<span style={{color:'var(--t3)'}}> · {s.delay} after meal</span>}
              {s.notes&&<span style={{color:'var(--t3)',fontStyle:'italic'}}> — {s.notes}</span>}
            </div>)}
          </div>
        </div>}

        {/* Risk flags toggle for PDF */}
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',background:'var(--c1)',borderRadius:6,marginTop:6,marginBottom:4}}>
          <div className={`tt${inclRiskFlags?' on':''}`} onClick={()=>setInclRiskFlags(!inclRiskFlags)}><div className="tth"/></div>
          <div style={{flex:1}}><div style={{fontSize:11,color:'var(--t1)',fontWeight:500}}>Include GI Risk Flags</div><div style={{fontSize:9,color:'var(--t3)'}}>Appendix showing which meals contained known GI trigger categories</div></div>
        </div>

        {/* Correlation analysis toggle for PDF */}
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',background:'var(--c1)',borderRadius:6,marginBottom:4}}>
          <div className={`tt${inclCorrAnalysis?' on':''}`} onClick={()=>setInclCorrAnalysis(!inclCorrAnalysis)}><div className="tth"/></div>
          <div style={{flex:1}}><div style={{fontSize:11,color:'var(--t1)',fontWeight:500}}>Include Correlation Analysis</div><div style={{fontSize:9,color:'var(--t3)'}}>Appendix with allergen/ingredient correlations and pattern analysis</div></div>
        </div>

        <div style={{display:'flex',gap:4,marginTop:6}}>
          <button className="mb" onClick={()=>setShowPrep(false)}>Close</button>
          <button className="bp" style={{flex:1,fontSize:11,padding:'8px 12px'}} onClick={()=>{
            const isNew=prep.mode==="newdoc";const today=td();const inclRF=inclRiskFlags;
            const css=`*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;font-size:11px;color:#1a1a2e;line-height:1.6;padding:20px 28px;max-width:800px;margin:0 auto}h1{font-size:20px;font-weight:700;margin-bottom:2px}h2{font-size:13px;font-weight:700;color:#4a3580;text-transform:uppercase;letter-spacing:.8px;margin:18px 0 8px;padding-bottom:4px;border-bottom:2px solid #e8e0ff}table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:10.5px}th{text-align:left;padding:5px 8px;background:#f5f0ff;color:#4a3580;font-weight:600;font-size:9.5px;border-bottom:1px solid #e0d4ff}td{padding:5px 8px;border-bottom:1px solid #f0ecff;vertical-align:top}.s{background:#fafafe;border:1px solid #eee8ff;border-radius:8px;padding:12px;margin-bottom:12px}.b{display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:600}.bg{background:#dcfce7;color:#166534}.br{background:#fef2f2;color:#991b1b}.ba{background:#fffbeb;color:#92400e}.bb{background:#eff6ff;color:#1e40af}@media print{body{padding:12px 20px}.s{break-inside:avoid}}`;
            const tbl=(hd,rows)=>'<table><tr>'+hd.map(h=>`<th>${h}</th>`).join('')+'</tr>'+rows.map(r=>'<tr>'+r.map(c=>`<td>${c}</td>`).join('')+'</tr>').join('')+'</table>';
            let h=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>GI Health Summary</title><style>${css}</style></head><body>`;
            h+=`<h1>GI Health Summary — ${isNew?'New Provider':'Complete'}</h1><div style="font-size:11px;color:#666;margin-bottom:16px">Generated ${today} · DOB: 4/4/2000 (age 25)${isNew?' · <span class="b bb">FACTS ONLY</span>':''}</div>`;
            if(prep.background){const b=prep.background;h+=`<h2>Patient Background</h2><div class="s">${tbl(['',''],[[`<b>Onset</b>`,`${b.onset} — ${b.trigger}`],[`<b>Prior History</b>`,b.priorHistory],[`<b>Weight</b>`,b.weightLoss],[`<b>Symptoms</b>`,b.ongoingSymptoms],[`<b>Pattern</b>`,b.noPattern]])}</div>`}
            if(prep.timeline?.length){h+=`<h2>Event Timeline</h2><div class="s">${tbl(['Date','Event'],prep.timeline.map(t=>[`<b style="color:#4a3580">${t.date}</b>`,t.event]))}</div>`}
            if(prep.allProcs?.length){h+=`<h2>Procedures</h2><div class="s">${tbl(['Date','Type','Results','Provider'],prep.allProcs.map(p=>[`<b>${p.date}</b>`,p.type,p.results||'—',p.doctor?'Dr. '+p.doctor:'—']))}</div>`}
            if(prep.recentLabs?.length){h+=`<h2>Lab Values</h2><div class="s">${tbl(['Test','Value','Ref','Date'],prep.recentLabs.map(l=>{const lt=LAB_TYPES.find(t=>t.id===l.type);return[lt?.name||l.type,`<b>${l.value} ${lt?.unit||''}</b>`,lt?.ref||'—',l.date]}))}</div>`}
            if(prep.allMeds?.length){h+=`<h2>Medications</h2><div class="s">${tbl(['Medication','Dose','Freq','Reason','Status'],prep.allMeds.map(m=>[`<b>${m.name}</b>`,m.dose||'—',m.freq||'—',m.reason||'—',m.end?'<span class="b br">Ended</span>':'<span class="b bg">Active</span>']))}</div>`}
            if(prep.dxs?.length){h+=`<h2>Diagnoses</h2><div class="s">${tbl(['Condition','Status','Date','Notes'],prep.dxs.map(d=>[`<b>${d.name}</b>`,`<span class="b ${d.status==='Confirmed'?'bg':d.status==='Ruled Out'?'br':'ba'}">${d.status}</span>`,d.date,d.notes||'—']))}</div>`}
            h+=`<h2>Last 30 Days (since ${prep.since})</h2><div class="s"><p><b>${prep.mealCount}</b> meals · <b>${prep.symCount}</b> symptoms · <b>${prep.vCount}</b> vomiting · <b>${prep.dCount}</b> diarrhea · <b>${prep.bmCount}</b> BMs${prep.compStats?.drinks?` · <b>${prep.compStats.drinks}</b> drinks`:''}</p>`;
            if(prep.compStats?.partial>0||prep.compStats?.couldnt>0)h+=`<p>Meal completion: <b>${prep.compStats.finished}</b> finished, <b>${prep.compStats.partial}</b> partial, <b>${prep.compStats.couldnt}</b> couldn't eat</p>`;
            if(prep.topSymptoms.length)h+=tbl(['Symptom','Count','Reported Durations'],prep.topSymptoms.map(([s,n,durs])=>[s,`<b>${n}x</b>`,durs?durs.slice(0,4).join(', '):'—']));
            h+='</div>';
            if(prep.dailyBM?.some(d=>d.total>0)){h+=`<h2>Daily Bowel Movement Pattern</h2><div class="s">`;h+=tbl(['Date','Normal','Diarrhea','Total','Consistency (Bristol)'],prep.dailyBM.filter(d=>d.total>0).map(d=>[`<b>${d.date}</b>`,String(d.normal),d.diarrhea?`<span style="color:#b45309">${d.diarrhea}</span>`:'0',`<b>${d.total}</b>`,d.consistencies?.length?d.consistencies.join(', ')+(d.bristols.length?' (Bristol '+d.bristols.filter(Boolean).join(', ')+')':''):d.bristols.length?d.bristols.map(b=>'Type '+b).join(', '):'—']));h+='</div>'}
            if(prep.symEntries?.length>0){const fmt12p=(t)=>{if(!t)return '—';const[hh,mm]=t.split(':');const hr=parseInt(hh,10);const ap=hr>=12?'PM':'AM';const h12=hr===0?12:hr>12?hr-12:hr;return h12+':'+mm+' '+ap};h+=`<h2>Symptom Log — Individual Entries (${prep.symEntries.length})</h2><div class="s">`;h+=tbl(['Date','Time','Severity','Symptoms','Duration','Consistency (Bristol)','Urgency','Stool Flags','Time Since Meal','Notes'],prep.symEntries.map(s=>{const conLabel=s.consistency?(CONSISTENCY.find(c=>c.id===s.consistency)||{}).l||s.consistency:null;const bLabel=s.bristol?'Type '+s.bristol:null;const cbStr=conLabel?(conLabel+(bLabel?' ('+bLabel+')':'')):bLabel||'—';return [`<b>${s.date}</b>`,fmt12p(s.time),`<span class="b ${s.severity==='Severe'?'br':s.severity==='Moderate'?'ba':'bb'}">${s.severity||'—'}</span>`,(s.types||[]).join(', '),s.duration||'—',cbStr,s.urgency||'—',(s.stoolFlags||[]).length?s.stoolFlags.join(', '):'—',s.delay||'—',s.notes||'—']}));h+='</div>'}
            // Dietary intake
            if(prep.topFoods?.length>0){h+=`<h2>Dietary Intake — Most Frequent Foods</h2><div class="s">`;h+=tbl(['Food','Times Eaten'],prep.topFoods.map(([f,n])=>[f.length>60?f.slice(0,60)+'...':f,`<b>${n}x</b>`]));if(prep.topAllergenExposure?.length>0){h+=`<p style="margin-top:8px"><b>Allergen Exposure Frequency:</b> `;h+=prep.topAllergenExposure.map(([a,n])=>{const al=AL.find(x=>x.id===a);return `${al?.i||''} ${al?.l||a}: ${n}x`}).join(', ');h+=`</p>`}h+='</div>'}
            if(prep.phase!=="baseline")h+=`<h2>Diet</h2><div class="s"><p>Phase: <b>${prep.phase}</b></p>${prep.elimFoods?.length?`<p>Eliminated: ${prep.elimFoods.join(', ')}</p>`:''}</div>`;
            // GI Risk Flags appendix (toggleable)
            if(inclRF&&prep.riskSummary?.length>0){
              h+=`<h2>Appendix: GI Risk Flag Summary</h2><div class="s">`;
              h+=`<p style="font-size:9.5px;color:#666;margin-bottom:10px;line-height:1.5"><b>About this section:</b> Meals were automatically flagged based on their ingredients matching published GI-symptom associations. These flags are informational — they indicate known trigger categories in gastroenterology literature, not confirmed triggers for this patient. Flag frequency may help identify dietary patterns worth investigating.</p>`;
              h+=tbl(['Category','Meals Flagged','% of Meals','Basis'],prep.riskSummary.map(r=>[`<b>${r.l}</b>`,`${r.count} of ${prep.mealCount}`,`<b>${r.pct}%</b>`,r.desc.split('(')[0].trim()]));
              h+=`<p style="font-size:8.5px;color:#999;margin-top:8px;line-height:1.4"><b>Category definitions:</b><br>`;
              h+=prep.riskSummary.map(r=>`• <b>${r.l}</b>: ${r.desc}`).join('<br>');
              h+=`</p></div>`;
            }
            if(inclCorrAnalysis){
              h+=`<h2>Appendix: App-Generated Correlation Analysis</h2><div class="s">`;
              h+=`<p style="font-size:9.5px;color:#666;margin-bottom:10px;line-height:1.5"><b>Disclaimer:</b> This analysis was generated by GutCheck based on logged food and symptom data. It identifies statistical patterns but does not constitute clinical assessment. Correlations may not reflect causation. Lift values indicate how much more likely symptoms are after a given food compared to baseline — a lift of 1.0 means no difference from chance.</p>`;
              if(corr.allergens.length>0){
                h+=`<p style="font-weight:600;margin:8px 0 4px">Allergen Correlations</p>`;
                h+=tbl(['Allergen','Lift','Top Symptom','Confidence','Meals','Symptom Episodes'],corr.allergens.slice(0,10).map(a=>{const al2=AL.find(x=>x.id===a.allergen);return [`${al2?.i||''} ${al2?.l||a.allergen}`,`<b>${a.lift}x</b>`,a.topSymptom||'—',`<span class="b ${a.confidence==='High'?'bg':a.confidence==='Medium'?'ba':'bb'}">${a.confidence}</span>`,String(a.mealsWithAllergen),String(a.symptomEpisodes)]}));
              }
              if(corr.ingredients.length>0){
                h+=`<p style="font-weight:600;margin:8px 0 4px">Ingredient Correlations</p>`;
                h+=tbl(['Ingredient','Lift','Top Symptom','Confidence','Times Eaten'],corr.ingredients.slice(0,10).map(ig=>[ig.ingredient,`<b>${ig.lift}x</b>`,ig.topSymptom||'—',`<span class="b ${ig.confidence==='High'?'bg':ig.confidence==='Medium'?'ba':'bb'}">${ig.confidence}</span>`,String(ig.timesEaten)]));
              }
              if(corr.eoe){
                h+=`<p style="font-weight:600;margin:8px 0 4px">EoE / Swallowing Analysis (72hr cumulative)</p>`;
                h+=`<p style="font-size:10px;margin-bottom:4px">Based on ${corr.eoe.episodes} swallowing episodes</p>`;
                h+=tbl(['Allergen','Lift','EoE Window Exposure','Baseline Exposure'],corr.eoe.correlations.map(c=>{const al2=AL.find(x=>x.id===c.allergen);return [`${al2?.i||''} ${al2?.l||c.allergen}`,`<b>${c.lift}x</b>`,`${c.eoeRate}%`,`${c.baseRate}%`]}));
              }
              const tod=corr.patterns?.timeOfDay;
              if(tod?.alerts?.length>0){
                h+=`<p style="font-weight:600;margin:8px 0 4px">Time-of-Day Patterns</p>`;
                h+=tbl(['Symptom','Peak Time','Concentration','Count'],tod.alerts.map(a=>[a.symptom,a.bucket,`<b>${a.pct}%</b>`,`${a.count}/${a.total}`]));
              }
              const stk=corr.patterns?.stacking;
              if(stk?.significant){
                h+=`<p style="font-weight:600;margin:8px 0 4px">Allergen Stacking</p>`;
                h+=`<p style="font-size:10px">Multi-allergen meals: <b>${stk.multiAllergenSymRate}%</b> followed by symptoms (${stk.multiAllergenMeals} meals) vs single-allergen: <b>${stk.singleAllergenSymRate}%</b> (${stk.singleAllergenMeals} meals). Stacking multiplier: <b>${stk.multiplier}x</b></p>`;
              }
              h+=`</div>`;
            }
            h+=`<div style="margin-top:20px;padding-top:10px;border-top:1px solid #eee;font-size:9px;color:#999;text-align:center">Generated by GutCheck · ${today}</div></body></html>`;
            // Multi-fallback export: blob download → clipboard → inline display
            const fname=`GI-Summary-${today}.html`;
            try{const blob=new Blob([h],{type:'text/html'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=fname;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(()=>URL.revokeObjectURL(url),1000);alert('✅ Downloaded '+fname+'\n\nOpen the file in your browser and use Print → Save as PDF.')}
            catch(e1){try{navigator.clipboard.writeText(h).then(()=>alert('📋 HTML copied to clipboard!\n\nPaste into a text file, save as .html, open in browser, then Print → Save as PDF.')).catch(()=>{const ta=document.createElement('textarea');ta.value=h;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);alert('📋 HTML copied!\n\nPaste into a text file, save as .html, open in browser, then Print → Save as PDF.')})}catch(e2){alert('Export failed. Try using Settings → Export All Data instead.')}}
          }}>📄 Export PDF</button>
        </div>
      </div>}
    </div>

    <div className="dc"><div className="dct">📋 Quick Stats</div>
      <div className="cr"><span style={{flex:1,fontSize:12,color:'var(--t1)'}}>Total meals</span><span style={{color:'var(--pb)',fontWeight:600}}>{meals.length}</span></div>
      <div className="cr"><span style={{flex:1,fontSize:12,color:'var(--t1)'}}>Total symptoms</span><span style={{color:'var(--er)',fontWeight:600}}>{syms.length}</span></div>
      <div className="cr"><span style={{flex:1,fontSize:12,color:'var(--t1)'}}>Days tracked</span><span style={{color:'var(--pb)',fontWeight:600}}>{new Set([...meals.map(m=>m.date),...syms.map(s=>s.date)]).size}</span></div>
    </div>
    </>}

    {iSub==="data"&&<>
      {/* Data View — clean chronological display */}
      <div style={{display:'flex',gap:4,marginBottom:8,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:11,color:'var(--t2)',marginRight:4}}>Range:</span>
        {[[7,"7 days"],[30,"30 days"],[0,"All"]].map(([v,l])=><button key={v} className={`fc ${dataRange===v?'on':''}`} style={{padding:'4px 10px',fontSize:10.5}} onClick={()=>setDataRange(v)}>{l}</button>)}
      </div>
      <div style={{display:'flex',gap:3,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:11,color:'var(--t2)',marginRight:4}}>Allergen:</span>
        <button className={`ch ${!dataAllergen?'on':''}`} style={{fontSize:9,padding:'2px 7px'}} onClick={()=>setDataAllergen(null)}>All</button>
        {AL.map(a=><button key={a.id} className={`ch ${dataAllergen===a.id?'on':''}`} style={{fontSize:9,padding:'2px 7px'}} onClick={()=>setDataAllergen(dataAllergen===a.id?null:a.id)}>{a.i} {a.l}</button>)}
      </div>
      {(()=>{
        const now=new Date();
        const cutoff=dataRange>0?new Date(now.getTime()-dataRange*864e5).toISOString().split('T')[0]:'0000-00-00';
        // Filter meals
        let dMeals=meals.filter(m=>m.date>=cutoff);
        if(dataAllergen)dMeals=dMeals.filter(m=>(m.al||[]).includes(dataAllergen));
        // Filter symptoms — if allergen filter active, only show symptom days that have meals with that allergen
        let dSyms=syms.filter(s=>s.date>=cutoff);
        if(dataAllergen){
          const allergenDates=new Set(dMeals.map(m=>m.date));
          dSyms=dSyms.filter(s=>allergenDates.has(s.date));
        }
        // Group by date
        const allDates=[...new Set([...dMeals.map(m=>m.date),...dSyms.map(s=>s.date)])].sort().reverse();
        if(allDates.length===0) return <div className="emp"><div className="emp-i">📋</div><div className="emp-t">No data in this range</div><div className="emp-s">Try a wider date range or remove the allergen filter.</div></div>;
        return <div>
          <div style={{fontSize:10,color:'var(--t3)',marginBottom:6}}>{allDates.length} day{allDates.length!==1?'s':''} · {dMeals.length} meal{dMeals.length!==1?'s':''} · {dSyms.length} symptom{dSyms.length!==1?'s':''}</div>
          {allDates.map(date=>{
            const dayMeals=dMeals.filter(m=>m.date===date).sort((a,b)=>(a.time||'00:00').localeCompare(b.time||'00:00'));
            const daySyms=dSyms.filter(s=>s.date===date).sort((a,b)=>(a.time||'00:00').localeCompare(b.time||'00:00'));
            const allItems=[...dayMeals.map(m=>({...m,_type:'meal',_time:m.time||'12:00'})),...daySyms.map(s=>({...s,_type:'sym',_time:s.time||'12:00'}))].sort((a,b)=>a._time.localeCompare(b._time));
            const d=new Date(date+'T12:00');
            const dayLabel=`${dA[d.getDay()]} ${mn(d.getMonth())} ${d.getDate()}`;
            return <div key={date} style={{marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--pb)',padding:'4px 0',borderBottom:'1px solid var(--pb-t2)',marginBottom:4}}>{dayLabel}{date===td()?' (Today)':''}</div>
              {allItems.map((item,j)=>{
                const isMeal=item._type==='meal';
                return <div key={j} style={{display:'flex',gap:6,padding:'5px 0',borderBottom:'1px solid var(--pb-t1)'}}>
                  <div style={{width:50,flexShrink:0,fontSize:10,color:'var(--t3)',paddingTop:1,textAlign:'right'}}>{fmt12(item._time)}</div>
                  <div style={{fontSize:11,flex:1}}>
                    {isMeal?<>
                      <span style={{color:'var(--t1)'}}>{item.desc}</span>
                      {item.al?.length>0&&<div style={{display:'flex',gap:2,flexWrap:'wrap',marginTop:2}}>{item.al.map(a=>{const al2=AL.find(x=>x.id===a);return al2?<span key={a} style={{fontSize:8,padding:'1px 5px',borderRadius:4,background:'var(--wn-t1)',color:'var(--wn)'}}>{al2.i} {al2.l}</span>:null})}</div>}
                      {item.ings?.length>0&&<div style={{fontSize:9,color:'var(--t3)',marginTop:1}}>Ingredients: {item.ings.slice(0,6).join(', ')}{item.ings.length>6?` +${item.ings.length-6} more`:''}</div>}
                    </>:<>
                      <span style={{color:item.severity==='Severe'?'var(--er)':item.severity==='Moderate'?'var(--wn)':'var(--in)'}}>
                        [{item.severity||'—'}]
                      </span>{' '}
                      <span style={{color:'var(--t1)'}}>{(item.types||[]).join(', ')}</span>
                      {item.consistency&&<span style={{fontSize:9,color:'var(--t3)',marginLeft:4}}>{(CONSISTENCY.find(c=>c.id===item.consistency)||{}).l||item.consistency}</span>}
                      {!item.consistency&&item.bristol&&<span style={{fontSize:9,color:'var(--t3)',marginLeft:4}}>Bristol {item.bristol}</span>}
                      {item.duration&&<span style={{fontSize:9,color:'var(--pb)',marginLeft:4}}>⏱️{item.duration}</span>}
                    </>}
                  </div>
                </div>
              })}
            </div>
          })}
        </div>;
      })()}
    </>}
  </>);
}

/* ═══ DRINKS TAB ═══ */
const DRINK_SIZES=["8oz","12oz","16oz","20oz","24oz","32oz"];
function DrinkTab({myFoods,setMyFoods,meals,setMeals,water,setWater,onLogDrink,hydrationGoal,setHydrationGoal,showFoodForm,setShowFoodForm,editFood,setEditFood,foodFormType,setFoodFormType}){
  const [showAddDrink,setShowAddDrink]=useState(false);
  const [drinkName,setDrinkName]=useState("");
  const [drinkDesc,setDrinkDesc]=useState("");
  const [drinkAl,setDrinkAl]=useState([]);
  const [drinkSize,setDrinkSize]=useState("");
  const [drinkHydrating,setDrinkHydrating]=useState(true);
  const [editDrinkId,setEditDrinkId]=useState(null);
  const [sizePick,setSizePick]=useState(null);
  const [sizeVal,setSizeVal]=useState("");
  const [customSize,setCustomSize]=useState("");
  const [showGoalEdit,setShowGoalEdit]=useState(false);
  const [goalInput,setGoalInput]=useState(String(hydrationGoal));

  const today=td();
  const drinkLibrary=(myFoods||[]).filter(f=>f.source==='drink');
  const todayDrinks=(meals||[]).filter(m=>m.date===today&&m.mt==='Drink').sort((a,b)=>(b.time||'').localeCompare(a.time||''));

  // Calculate hydration oz: manual water oz + logged hydrating drinks with oz sizes
  const manualWaterOz=water[today]||0; // stored directly as oz
  const getOzFromPortion=(portion)=>{const m=(portion||'').match(/(\d+)\s*oz/i);return m?parseInt(m[1]):0};

  // Match logged drinks to library to check hydrating status
  let hydratingOzFromDrinks=0;
  let waterOzFromDrinks=0;
  // Standalone drinks
  todayDrinks.forEach(d=>{
    const oz=getOzFromPortion(d.portion);
    if(!oz) return;
    const descClean=(d.desc||'').replace(/\s*\(.*?\)\s*$/,'').trim().toLowerCase();
    const libMatch=drinkLibrary.find(ld=>(ld.desc||'').toLowerCase()===descClean||(ld.name||'').toLowerCase()===descClean);
    if(libMatch&&libMatch.hydrating) hydratingOzFromDrinks+=oz;
    if(descClean==='water') waterOzFromDrinks+=oz;
  });
  // Drinks attached to meals
  const todayMealDrinks=(meals||[]).filter(m=>m.date===today&&m.mt!=='Drink'&&m.drink);
  todayMealDrinks.forEach(m=>{
    const oz=getOzFromPortion(m.drink.portion||m.drink.size);
    if(!oz) return;
    // Use hydrating flag from drink data directly (works for custom drinks too)
    // Fall back to library match if flag not present
    let isHydrating=m.drink.hydrating;
    if(isHydrating===undefined){
      const descClean=(m.drink.desc||m.drink.name||'').toLowerCase();
      const libMatch=drinkLibrary.find(ld=>(ld.desc||'').toLowerCase()===descClean||(ld.name||'').toLowerCase()===descClean);
      isHydrating=libMatch?.hydrating;
    }
    if(isHydrating) hydratingOzFromDrinks+=oz;
    const descClean2=(m.drink.desc||m.drink.name||'').toLowerCase();
    if(descClean2==='water') waterOzFromDrinks+=oz;
  });

  const totalWaterOz=manualWaterOz+waterOzFromDrinks;
  const totalHydrationOz=manualWaterOz+hydratingOzFromDrinks;
  const totalAllOz=todayDrinks.reduce((sum,d)=>sum+getOzFromPortion(d.portion),0)+todayMealDrinks.reduce((sum,m)=>sum+getOzFromPortion(m.drink.portion||m.drink.size),0)+manualWaterOz;
  const goal=hydrationGoal||DEFAULT_HYDRATION_GOAL;
  const pct=Math.min(100,Math.round(totalHydrationOz/goal*100));

  const saveDrink=()=>{
    const n=drinkName.trim();if(!n)return;
    if(editDrinkId){
      setMyFoods(p=>p.map(f=>f.id===editDrinkId?{...f,name:n,desc:drinkDesc.trim()||n,al:[...drinkAl],defaultSize:drinkSize.trim()||undefined,hydrating:drinkHydrating,_hydratingUserSet:true}:f));
    } else {
      setMyFoods(p=>[...p,{id:Date.now(),name:n,desc:drinkDesc.trim()||n,source:'drink',mt:'Drink',al:[...drinkAl],tg:[],safeStatus:'unknown',favorite:false,defaultSize:drinkSize.trim()||undefined,hydrating:drinkHydrating,ts:Date.now()}]);
    }
    setDrinkName("");setDrinkDesc("");setDrinkAl([]);setDrinkSize("");setDrinkHydrating(true);setEditDrinkId(null);setShowAddDrink(false);
  };
  const startEdit=(d)=>{setEditDrinkId(d.id);setDrinkName(d.name||'');setDrinkDesc(d.desc||'');setDrinkAl(d.al||[]);setDrinkSize(d.defaultSize||'');setDrinkHydrating(d.hydrating!==false);setShowAddDrink(true)};
  const delDrink=(id)=>setMyFoods(p=>p.filter(f=>f.id!==id));
  const startQuickLog=(d)=>{setSizePick(d);setSizeVal(d.defaultSize||'');setCustomSize("")};
  const confirmQuickLog=()=>{if(!sizePick)return;const sz=customSize.trim()||sizeVal;onLogDrink(sizePick,sz);setSizePick(null);setSizeVal("");setCustomSize("")};
  const saveGoal=()=>{const v=parseInt(goalInput);if(!isNaN(v)&&v>=8&&v<=300){setHydrationGoal(v);setShowGoalEdit(false)}};

  return (
  <div>
    <div className="fvt">🥤 Drinks</div>

    {/* Hydration progress */}
    <div style={{padding:'12px',background:'var(--c1)',borderRadius:12,border:'1px solid var(--in-t2)',marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
        <div>
          <span style={{fontSize:32,fontFamily:'Outfit',fontWeight:700,color:pct>=100?'var(--ok)':'var(--in)'}}>{totalHydrationOz}</span>
          <span style={{fontSize:14,color:'var(--t3)',fontWeight:400}}> / {goal}oz</span>
        </div>
        <button className="mb" onClick={()=>{setGoalInput(String(goal));setShowGoalEdit(!showGoalEdit)}} style={{fontSize:9,color:'var(--t3)'}}>⚙️ Goal</button>
      </div>
      <div style={{display:'flex',gap:1.5,height:8,borderRadius:4,overflow:'hidden',background:'var(--c3)'}}>
        <div style={{width:`${pct}%`,background:pct>=100?'var(--ok)':pct>=50?'var(--in)':'var(--in-t3)',borderRadius:4,transition:'width .3s'}}/>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
        <span style={{fontSize:9,color:'var(--t3)'}}>{pct}% of daily goal</span>
        <span style={{fontSize:9,color:'var(--t3)'}}>{pct>=100?'✅ Goal reached!':pct>=75?'Almost there!':''}</span>
      </div>
      {showGoalEdit&&<div style={{marginTop:8,padding:8,background:'var(--pb-t1)',borderRadius:8,display:'flex',gap:4,alignItems:'center'}}>
        <span style={{fontSize:11,color:'var(--t2)'}}>Daily goal:</span>
        <input className="fi" type="number" min="8" max="300" value={goalInput} onChange={e=>setGoalInput(e.target.value)} style={{width:70,padding:'4px 8px',textAlign:'center'}}/>
        <span style={{fontSize:11,color:'var(--t3)'}}>oz</span>
        <button className="mb" onClick={saveGoal} style={{color:'var(--ok)'}}>Save</button>
      </div>}
    </div>

    {/* Summary cards */}
    <div style={{display:'flex',gap:6,marginBottom:10}}>
      <div style={{flex:1,textAlign:'center',padding:'8px 6px',background:'var(--in-t1)',borderRadius:10,border:'1px solid var(--in-t2)'}}>
        <div style={{fontSize:22,fontFamily:'Outfit',fontWeight:700,color:'var(--in)'}}>{totalWaterOz}<span style={{fontSize:11,fontWeight:400}}>oz</span></div>
        <div style={{fontSize:8,color:'var(--t3)',textTransform:'uppercase'}}>Water</div>
      </div>
      <div style={{flex:1,textAlign:'center',padding:'8px 6px',background:'var(--ok-t1)',borderRadius:10,border:'1px solid var(--ok-t1)'}}>
        <div style={{fontSize:22,fontFamily:'Outfit',fontWeight:700,color:'var(--ok)'}}>{totalHydrationOz}<span style={{fontSize:11,fontWeight:400}}>oz</span></div>
        <div style={{fontSize:8,color:'var(--t3)',textTransform:'uppercase'}}>Hydrating</div>
      </div>
      <div style={{flex:1,textAlign:'center',padding:'8px 6px',background:'var(--pb-t1)',borderRadius:10,border:'1px solid var(--pb-t2)'}}>
        <div style={{fontSize:22,fontFamily:'Outfit',fontWeight:700,color:'var(--pb)'}}>{totalAllOz}<span style={{fontSize:11,fontWeight:400}}>oz</span></div>
        <div style={{fontSize:8,color:'var(--t3)',textTransform:'uppercase'}}>All Drinks</div>
      </div>
    </div>

    {/* Quick water add — 1oz increments, stored as oz directly */}
    <div style={{display:'flex',gap:4,marginBottom:10,alignItems:'center'}}>
      <button className="mb" onClick={()=>setWater(p=>({...p,[today]:Math.max(0,(p[today]||0)-1)}))} style={{padding:'6px 12px',color:'var(--in)',opacity:manualWaterOz<=0?0.3:1,pointerEvents:manualWaterOz<=0?'none':'auto'}}>−1oz</button>
      <div style={{flex:1,textAlign:'center'}}>
        <div style={{fontSize:14,fontWeight:600,color:'var(--t1)'}}>💧 {manualWaterOz}oz</div>
        <div style={{fontSize:9,color:'var(--t3)'}}>extra water (not logged as drink)</div>
      </div>
      <button className="mb" onClick={()=>setWater(p=>({...p,[today]:(p[today]||0)+1}))} style={{padding:'6px 12px',color:'var(--in)'}}>+1oz</button>
    </div>
    {/* Quick water presets */}
    <div style={{display:'flex',gap:3,justifyContent:'center',marginBottom:10}}>
      {[8,12,16,24].map(oz=><button key={oz} className="ch" onClick={()=>setWater(p=>({...p,[today]:(p[today]||0)+oz}))} style={{fontSize:10,padding:'5px 10px',color:'var(--in)',borderColor:'var(--in-t3)'}}>+{oz}oz 💧</button>)}
    </div>

    {/* Quick-log buttons — only favorited drinks */}
    <div style={{marginBottom:10}}>
      <div style={{fontSize:10,fontWeight:600,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:5}}>⚡ Quick Log</div>
      <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
        {drinkLibrary.filter(d=>d.favorite).map((d,i)=>
          <button key={i} className="ch" style={{fontSize:11,padding:'8px 12px',minHeight:36,borderColor:d.hydrating?'var(--in-t3)':'var(--pb-t2)'}} onClick={()=>startQuickLog(d)}>
            {d.name}{d.defaultSize?` (${d.defaultSize})`:''}{d.hydrating?'💧':''}
          </button>
        )}
      </div>
      {drinkLibrary.filter(d=>d.favorite).length===0&&<div style={{fontSize:11,color:'var(--t3)',padding:8,textAlign:'center'}}>⭐ Star drinks in My Drinks below to add them here</div>}
    </div>

    {/* Size picker popup */}
    {sizePick&&<div style={{padding:10,background:'var(--c1)',borderRadius:10,border:'1px solid var(--pb-t2)',marginBottom:10,boxShadow:'0 4px 12px var(--shadow-soft)'}}>
      <div style={{fontSize:12,fontWeight:600,color:'var(--t1)',marginBottom:6}}>🥤 {sizePick.name}{sizePick.hydrating?<span style={{fontSize:9,color:'var(--in)',marginLeft:4}}>💧 hydrating</span>:''}</div>
      <div style={{fontSize:10,color:'var(--t3)',marginBottom:6}}>Pick a size:</div>
      <div style={{display:'flex',gap:3,flexWrap:'wrap',marginBottom:6}}>
        {DRINK_SIZES.map(s=><button key={s} className={`ch ${sizeVal===s&&!customSize?'on':''}`} onClick={()=>{setSizeVal(s);setCustomSize("")}} style={{fontSize:10,padding:'6px 10px'}}>{s}</button>)}
      </div>
      <div style={{display:'flex',gap:4,marginBottom:8}}>
        <input className="fi" value={customSize} onChange={e=>{setCustomSize(e.target.value);setSizeVal("")}} placeholder="Custom size (e.g. Grande, 44oz)..." style={{flex:1,padding:'6px 8px'}}/>
      </div>
      <div style={{display:'flex',gap:4}}>
        <button className="bp" onClick={confirmQuickLog} style={{flex:1}}>Log{(customSize.trim()||sizeVal)?` (${customSize.trim()||sizeVal})`:''}</button>
        <button className="mb" onClick={()=>setSizePick(null)} style={{padding:'8px 12px'}}>Cancel</button>
      </div>
    </div>}

    {/* Today's drink log */}
    {(()=>{
      // Standalone drinks + drinks attached to meals
      const standaloneDrinks=todayDrinks;
      const mealDrinks=(meals||[]).filter(m=>m.date===today&&m.mt!=='Drink'&&m.drink).map(m=>({
        ...m.drink,desc:m.drink.desc||m.drink.name,time:m.time,_fromMeal:true,_mealId:m.id,_mealDesc:m.desc
      }));
      const allTodayDrinks=[...standaloneDrinks,...mealDrinks].sort((a,b)=>(b.time||'').localeCompare(a.time||''));
      if(allTodayDrinks.length===0) return null;
      return <div style={{marginBottom:10}}>
        <div style={{fontSize:10,fontWeight:600,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>Today's Drinks</div>
        {allTodayDrinks.map((d,i)=>{
          const descClean=(d.desc||'').replace(/\s*\(.*?\)\s*$/,'').trim().toLowerCase();
          const libMatch=drinkLibrary.find(ld=>(ld.desc||'').toLowerCase()===descClean||(ld.name||'').toLowerCase()===descClean);
          const isHydrating=libMatch?.hydrating;
          return <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 8px',borderBottom:'1px solid var(--pb-t1)'}}>
            <span style={{fontSize:10,color:'var(--t3)',width:50}}>{fmt12(d.time)}</span>
            <span style={{flex:1,fontSize:12,color:'var(--t1)'}}>{d.desc}{d._fromMeal?<span style={{fontSize:9,color:'var(--t3)',marginLeft:3}}>(w/ meal)</span>:''}</span>
            {d.portion&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:4,background:isHydrating?'var(--in-t2)':'var(--pb-t2)',color:isHydrating?'var(--in)':'var(--pb)'}}>{d.portion}{isHydrating?' 💧':''}</span>}
            {!d._fromMeal&&<button className="mb" onClick={()=>setMeals(p=>p.filter(m=>m.id!==d.id))} style={{color:'var(--er)',fontSize:9,padding:'2px 4px'}}>✕</button>}
          </div>})}
      </div>;
    })()}

    {/* Drink library management */}
    <div style={{marginTop:6}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
        <div style={{fontSize:10,fontWeight:600,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.5px'}}>My Drinks ({drinkLibrary.length})</div>
        <button className="mb" onClick={()=>{setEditDrinkId(null);setDrinkName("");setDrinkDesc("");setDrinkAl([]);setDrinkSize("");setDrinkHydrating(true);setShowAddDrink(!showAddDrink)}} style={{color:'var(--pb)',fontSize:10}}>{showAddDrink?'Cancel':'+ Add Drink'}</button>
      </div>

      {showAddDrink&&<div style={{padding:10,background:'var(--c1)',borderRadius:10,border:'1px solid var(--pb-t2)',marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:600,color:'var(--t1)',marginBottom:6}}>{editDrinkId?'Edit Drink':'Add Drink'}</div>
        <div className="fs"><label className="fl">Name (shown on button)</label><input className="fi" value={drinkName} onChange={e=>setDrinkName(e.target.value)} placeholder="e.g. ☕ Starbucks Latte" autoFocus/></div>
        <div className="fs"><label className="fl">Description (logged in meals)</label><input className="fi" value={drinkDesc} onChange={e=>setDrinkDesc(e.target.value)} placeholder="e.g. Oatmilk Maple Pecan Latte"/></div>
        <div className="fs"><label className="fl">Default Size</label>
          <div style={{display:'flex',gap:3,flexWrap:'wrap',marginBottom:4}}>
            {DRINK_SIZES.map(s=><button key={s} className={`ch ${drinkSize===s?'on':''}`} onClick={()=>setDrinkSize(drinkSize===s?'':s)} style={{fontSize:9,padding:'4px 8px'}}>{s}</button>)}
          </div>
          <input className="fi" value={drinkSize&&!DRINK_SIZES.includes(drinkSize)?drinkSize:''} onChange={e=>setDrinkSize(e.target.value)} placeholder="Or type custom (e.g. Grande, Tall)..." style={{padding:'5px 8px'}}/>
        </div>
        <div className="fs" style={{display:'flex',alignItems:'center',gap:8}}>
          <div className={`tt ${drinkHydrating?'on':''}`} onClick={()=>setDrinkHydrating(!drinkHydrating)}><div className="tth"/></div>
          <div><div style={{fontSize:12,color:'var(--t1)'}}>💧 Counts toward hydration</div><div style={{fontSize:9.5,color:'var(--t3)'}}>Water, juice, electrolyte drinks = yes. Coffee, beer, soda = usually no.</div></div>
        </div>
        <div className="fs"><label className="fl">Allergens</label>
          <div className="cg">{AL.map(a=><button key={a.id} className={`ch cha ${drinkAl.includes(a.id)?'on':''}`} onClick={()=>setDrinkAl(p=>p.includes(a.id)?p.filter(x=>x!==a.id):[...p,a.id])} style={{fontSize:9,padding:'2px 5px'}}>{a.i} {a.l}</button>)}</div>
        </div>
        <button className="bp" onClick={saveDrink} style={{width:'100%'}}>{editDrinkId?'Update Drink':'Add Drink'}</button>
      </div>}

      {drinkLibrary.map(d=><div key={d.id} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 8px',borderBottom:'1px solid var(--pb-t1)'}}>
        <button className="mb" onClick={()=>setMyFoods(p=>p.map(f=>f.id===d.id?{...f,favorite:!f.favorite}:f))} style={{fontSize:14,padding:'0 2px',color:d.favorite?'var(--wn)':'var(--t3)'}}>{d.favorite?'⭐':'☆'}</button>
        <div style={{flex:1}}>
          <div style={{fontSize:12,color:'var(--t1)',fontWeight:500}}>{d.name}{d.hydrating?<span style={{fontSize:9,color:'var(--in)',marginLeft:3}}>💧</span>:''}</div>
          <div style={{fontSize:10,color:'var(--t3)'}}>{d.desc&&d.desc!==d.name?d.desc:''}{d.defaultSize?`${d.desc&&d.desc!==d.name?' · ':''}${d.defaultSize}`:''}</div>
        </div>
        {d.al?.length>0&&<span style={{fontSize:9,color:'var(--wn)'}}>{d.al.map(a=>AL.find(x=>x.id===a)?.i||'').join(' ')}</span>}
        <button className="mb" onClick={()=>startEdit(d)} style={{fontSize:9,padding:'2px 5px'}}>✏️</button>
        <button className="mb" onClick={()=>delDrink(d.id)} style={{color:'var(--er)',fontSize:9,padding:'2px 5px'}}>✕</button>
      </div>)}

      {drinkLibrary.length>0&&<div style={{marginTop:6}}>
        <button className="mb" onClick={()=>{const seeded=DEFAULT_DRINKS.map((d,i)=>({...d,id:Date.now()+i,ts:Date.now()+i}));const existing=new Set(drinkLibrary.map(d=>(d.name||'').toLowerCase()));const toAdd=seeded.filter(d=>!existing.has((d.name||'').toLowerCase()));if(toAdd.length)setMyFoods(p=>[...p,...toAdd]);}} style={{color:'var(--t3)',width:'100%',textAlign:'center',fontSize:10}}>Reset to default drinks</button>
      </div>}
    </div>
  </div>);
}

/* ═══ MY FOODS TAB (unified) ═══ */
function FavsTab({myFoods,setMyFoods,onUseFood,showFoodForm,setShowFoodForm,editFood,setEditFood,foodFormType,setFoodFormType,aiOn,restaurants,setRestaurants,pf,setPf,customFoods}){
  const [sub,setSub]=useState("recipes");
  const [fsearch,setFsearch]=useState("");
  const foodsOnly=myFoods.filter(f=>f.source!=='drink');
  const recipes=foodsOnly.filter(f=>f.source==='homemade'||f.source==='described');
  const srcIcon=(src)=>src==='homemade'?'🏠':src==='store'?'🛒':src==='restaurant'?'🍔':src==='described'?'📝':'📦';
  const srcColor=(src)=>src==='homemade'?'var(--ok)':src==='store'?'var(--in)':src==='restaurant'?'var(--pd)':src==='described'?'var(--wn)':'var(--pb)';

  const filteredRecipes=recipes.filter(f=>{
    if(!fsearch)return true;const q=fsearch.toLowerCase();
    return (f.name||'').toLowerCase().includes(q)||(f.desc||'').toLowerCase().includes(q)||(f.ings||[]).some(i=>i.toLowerCase().includes(q));
  }).sort((a,b)=>(b.ts||0)-(a.ts||0));

  const pantryItems=(customFoods||[]);
  const filteredPantry=pantryItems.filter(f=>{
    if(!fsearch)return true;return f.n.toLowerCase().includes(fsearch.toLowerCase());
  });

  return (
  <div>
    <div style={{display:'flex',gap:2,marginBottom:10}}>{[["recipes","🏠 My Recipes"],["restaurants","🍔 Restaurants"],["pantry","🥘 My Pantry"]].map(([id,l])=><button key={id} className={`fc ${sub===id?'on':''}`} style={{flex:1,textAlign:'center',padding:'5px 3px',fontSize:10}} onClick={()=>{setSub(id);setFsearch("")}}>{l}</button>)}</div>

    {sub==="recipes"&&<>
      <div style={{display:'flex',gap:5,marginBottom:8}}>
        <div className="sb" style={{flex:1,marginBottom:0}}><span style={{color:'var(--t3)',fontSize:12}}>🔍</span><input placeholder="Search my recipes..." value={fsearch} onChange={e=>setFsearch(e.target.value)}/></div>
        <button className="mb" onClick={()=>{setEditFood(null);setFoodFormType('homemade');setPf(null);setShowFoodForm(true)}} style={{color:'var(--pb)',padding:'6px 10px',whiteSpace:'nowrap'}}>+ Add</button>
      </div>
      {filteredRecipes.length===0?<div className="emp"><div className="emp-i">🏠</div><div className="emp-t">{fsearch?"No matches":"No recipes saved yet"}</div><div className="emp-s">{fsearch?"Try a different search":"Recipes are saved automatically when you log meals using 'Build from Ingredients'. You can also add them manually here."}</div></div>
       :filteredRecipes.map(f=><div key={f.id} className="card" style={{borderLeft:`3px solid ${srcColor(f.source)}`}}>
        <div className="mc-h">
          <span style={{fontSize:13,fontWeight:500,color:'var(--t1)'}}>{f.name}</span>
          <div style={{display:'flex',gap:4,alignItems:'center'}}>
            {f.favorite&&<span style={{fontSize:12}}>⭐</span>}
            <SafeBdg s={f.safeStatus}/>
            {f.source==='described'&&<span className="bd" style={{background:'var(--wn-t1)',color:'var(--wn)',fontSize:9}}>📝 Quick</span>}
          </div>
        </div>
        {f.desc&&f.desc!==f.name&&<div style={{fontSize:11,color:'var(--t2)',lineHeight:1.4,marginBottom:4}}>{f.desc}</div>}
        {f.ings?.length>0&&<div style={{fontSize:10,color:'var(--t3)',marginBottom:3}}>🥘 {f.ings.slice(0,6).join(", ")}{f.ings.length>6?"...":""}</div>}
        <div className="tr">{(f.al||[]).map(a=>{const al2=AL.find(x=>x.id===a);return al2?<span key={a} className="tg ta">{al2.i} {al2.l}</span>:null})}{(f.tg||[]).filter(t=>t!=='Homemade'&&t!=='Restaurant').map(t=><span key={t} className="tg tf">{t}</span>)}</div>
        <div className="ma2">
          <button className="mb" onClick={()=>onUseFood(f)} style={{color:'var(--ok)'}}>🍽️ Log</button>
          <button className="mb" onClick={()=>setMyFoods(p=>p.map(x=>x.id===f.id?{...x,favorite:!x.favorite}:x))} style={{color:f.favorite?'var(--wn)':'var(--t3)'}}>{f.favorite?'⭐':'☆'}</button>
          <button className="mb" onClick={()=>{setEditFood(f);setFoodFormType(f.source);setShowFoodForm(true)}}>✏️</button>
          <button className="mb" onClick={()=>setMyFoods(p=>p.filter(x=>x.id!==f.id))} style={{color:'var(--er)'}}>🗑️</button>
        </div>
      </div>)}
    </>}

    {sub==="restaurants"&&<MenusSub restaurants={restaurants} setRestaurants={setRestaurants} fsearch={fsearch} setFsearch={setFsearch}/>}

    {sub==="pantry"&&<>
      <div style={{display:'flex',gap:5,marginBottom:8}}>
        <div className="sb" style={{flex:1,marginBottom:0}}><span style={{color:'var(--t3)',fontSize:12}}>🔍</span><input placeholder="Search my pantry..." value={fsearch} onChange={e=>setFsearch(e.target.value)}/></div>
      </div>
      <div style={{fontSize:10,color:'var(--t3)',marginBottom:8}}>Your custom ingredients. These appear first when building meals from ingredients. Common foods database items shown separately in the ingredient picker.</div>
      {filteredPantry.length===0?<div className="emp"><div className="emp-i">🥘</div><div className="emp-t">{fsearch?"No matches":"Pantry is empty"}</div><div className="emp-s">Custom ingredients you add while logging meals will appear here. They'll show up first in the ingredient picker next time.</div></div>
       :filteredPantry.map((f,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'var(--c1)',borderRadius:8,marginBottom:4,border:'1px solid var(--ok-t2)',borderLeft:'3px solid var(--ok)'}}>
        <span style={{fontSize:12,color:'var(--ok)'}}>⭐</span>
        <span style={{flex:1,fontSize:12,color:'var(--t1)'}}>{f.n}</span>
        {f.al?.length>0&&<div style={{display:'flex',gap:2}}>{f.al.map(a=>{const al2=AL.find(x=>x.id===a);return al2?<span key={a} style={{fontSize:9,color:'var(--wn)'}}>{al2.i}</span>:null})}</div>}
      </div>)}
    </>}
  </div>);
}

function MenusSub({restaurants,setRestaurants,fsearch,setFsearch}){
  const rest=restaurants||DEFAULT_REST;
  const names=Object.keys(rest);
  const [expanded,setExpanded]=useState(null); // restaurant name or null
  const [confirmDel,setConfirmDel]=useState(null); // restaurant name to confirm delete
  const [showAddRest,setShowAddRest]=useState(false);
  const [newRestName,setNewRestName]=useState("");
  const [newRestIcon,setNewRestIcon]=useState("🍽️");
  const [showAddItem,setShowAddItem]=useState(null); // restaurant name or null
  const [newItemName,setNewItemName]=useState("");
  const [newItemAl,setNewItemAl]=useState([]);
  const [editItemIdx,setEditItemIdx]=useState(null); // {rest, idx} or null
  const togAl=(v)=>setNewItemAl(p=>p.includes(v)?p.filter(x=>x!==v):[...p,v]);
  const ICONS=["🍽️","🍔","🍕","🌮","🌯","🥖","🍗","🍜","🥡","🍣","☕","🧁","🥗","🍱","🫔","📍"];

  const filteredNames=names.filter(n=>{if(!fsearch)return true;const q=fsearch.toLowerCase();return n.toLowerCase().includes(q)||rest[n].it.some(it=>it.n.toLowerCase().includes(q))});

  const addRestaurant=()=>{const nm=newRestName.trim();if(!nm||rest[nm])return;setRestaurants(p=>({...p,[nm]:{ic:newRestIcon,it:[]}}));setNewRestName("");setNewRestIcon("🍽️");setShowAddRest(false);setExpanded(nm)};

  const deleteRestaurant=(name)=>{setRestaurants(p=>{const c={...p};delete c[name];return c});if(expanded===name)setExpanded(null)};

  const addItem=(restName)=>{const nm=newItemName.trim();if(!nm)return;setRestaurants(p=>({...p,[restName]:{...p[restName],it:[...p[restName].it,{n:nm,a:[...newItemAl]}]}}));setNewItemName("");setNewItemAl([]);setShowAddItem(null)};

  const deleteItem=(restName,idx)=>{setRestaurants(p=>({...p,[restName]:{...p[restName],it:p[restName].it.filter((_,i)=>i!==idx)}}))};

  const startEditItem=(restName,idx)=>{const item=rest[restName].it[idx];setEditItemIdx({rest:restName,idx});setNewItemName(item.n);setNewItemAl(item.a||[])};

  const saveEditItem=()=>{if(!editItemIdx||!newItemName.trim())return;const{rest:rn,idx}=editItemIdx;setRestaurants(p=>({...p,[rn]:{...p[rn],it:p[rn].it.map((it,i)=>i===idx?{n:newItemName.trim(),a:[...newItemAl]}:it)}}));setEditItemIdx(null);setNewItemName("");setNewItemAl([])};

  const isDefault=(name)=>DEFAULT_REST.hasOwnProperty(name);

  return (<>
    <div style={{display:'flex',gap:5,marginBottom:8}}>
      <div className="sb" style={{flex:1,marginBottom:0}}><span style={{color:'var(--t3)',fontSize:12}}>🔍</span><input placeholder="Search restaurants & items..." value={fsearch} onChange={e=>setFsearch(e.target.value)}/></div>
      <button className="mb" onClick={()=>setShowAddRest(true)} style={{color:'var(--pb)',padding:'6px 10px',whiteSpace:'nowrap'}}>+ Restaurant</button>
    </div>

    {/* Add restaurant form */}
    {showAddRest&&<div style={{padding:10,background:'var(--c1)',borderRadius:10,border:'1px solid var(--pb-t2)',marginBottom:8}}>
      <div style={{fontSize:11,fontWeight:600,color:'var(--t1)',marginBottom:6}}>Add Restaurant</div>
      <div style={{display:'flex',gap:4,marginBottom:6}}>
        <div style={{display:'flex',gap:2,flexWrap:'wrap'}}>{ICONS.map(ic=><button key={ic} className={`ch ${newRestIcon===ic?'on':''}`} onClick={()=>setNewRestIcon(ic)} style={{fontSize:14,padding:'3px 6px'}}>{ic}</button>)}</div>
      </div>
      <div style={{display:'flex',gap:4}}>
        <input className="fi" value={newRestName} onChange={e=>setNewRestName(e.target.value)} placeholder="Restaurant name..." onKeyDown={e=>e.key==="Enter"&&addRestaurant()} autoFocus style={{flex:1}}/>
        <button className="mb" onClick={addRestaurant} style={{color:'var(--ok)'}}>Add</button>
        <button className="mb" onClick={()=>{setShowAddRest(false);setNewRestName("");setNewRestIcon("🍽️")}}>✕</button>
      </div>
      {newRestName.trim()&&rest[newRestName.trim()]&&<div style={{fontSize:10,color:'var(--er)',marginTop:3}}>Restaurant already exists</div>}
    </div>}

    {filteredNames.length===0?<div className="emp"><div className="emp-i">🍔</div><div className="emp-t">{fsearch?"No matches":"No restaurants"}</div><div className="emp-s">Tap + Restaurant to add your own</div></div>
     :filteredNames.map(name=>{
      const r=rest[name];const isExp=expanded===name;const itemCount=r.it.length;
      return <div key={name} style={{marginBottom:6}}>
        {/* Restaurant header */}
        <div onClick={()=>setExpanded(isExp?null:name)} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'var(--c1)',borderRadius:isExp?'10px 10px 0 0':'10px',border:'1px solid var(--pb-t1)',cursor:'pointer'}}>
          <span style={{fontSize:18}}>{r.ic}</span>
          <div style={{flex:1}}>
            <div style={{fontSize:12.5,fontWeight:600,color:'var(--t1)'}}>{name}</div>
            <div style={{fontSize:9.5,color:'var(--t3)'}}>{itemCount} item{itemCount!==1?'s':''}{isDefault(name)?' · Built-in':' · Custom'}</div>
          </div>
          <span style={{fontSize:10,color:'var(--t3)'}}>{isExp?'▲':'▼'}</span>
        </div>

        {/* Expanded: menu items */}
        {isExp&&<div style={{background:'var(--c1)',borderRadius:'0 0 10px 10px',border:'1px solid var(--pb-t1)',borderTop:'none',padding:'4px 0'}}>
          {r.it.length===0?<div style={{padding:'10px',textAlign:'center',fontSize:11,color:'var(--t3)'}}>No menu items yet</div>
           :r.it.map((it,idx)=>{
            const isEditing=editItemIdx?.rest===name&&editItemIdx?.idx===idx;
            if(isEditing) return <div key={idx} style={{padding:'6px 10px',borderBottom:'1px solid var(--pb-t1)'}}>
              <input className="fi" value={newItemName} onChange={e=>setNewItemName(e.target.value)} style={{marginBottom:4}} autoFocus/>
              <div className="cg" style={{marginBottom:4}}>{AL.map(a=><button key={a.id} className={`ch cha ${newItemAl.includes(a.id)?'on':''}`} onClick={()=>togAl(a.id)} style={{fontSize:9,padding:'2px 5px'}}>{a.i} {a.l}</button>)}</div>
              <div style={{display:'flex',gap:3}}><button className="mb" onClick={saveEditItem} style={{color:'var(--ok)'}}>Save</button><button className="mb" onClick={()=>{setEditItemIdx(null);setNewItemName("");setNewItemAl([])}}>Cancel</button></div>
            </div>;
            return <div key={idx} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderBottom:'1px solid var(--pb-t1)'}}>
              <span style={{flex:1,fontSize:11.5,color:'var(--t1)'}}>{it.n}</span>
              {it.a?.length>0&&<div style={{display:'flex',gap:1}}>{it.a.slice(0,4).map((a,j)=>{const al2=AL.find(x=>x.id===a);return <span key={j} style={{fontSize:9,color:'var(--wn)'}}>{al2?.i}</span>})}{it.a.length>4&&<span style={{fontSize:8,color:'var(--t3)'}}>+{it.a.length-4}</span>}</div>}
              <button className="mb" onClick={()=>startEditItem(name,idx)} style={{padding:'2px 5px',fontSize:9}}>✏️</button>
              <button className="mb" onClick={()=>deleteItem(name,idx)} style={{color:'var(--er)',padding:'2px 5px',fontSize:9}}>✕</button>
            </div>})}

          {/* Add item form */}
          {showAddItem===name?<div style={{padding:'6px 10px'}}>
            <input className="fi" value={newItemName} onChange={e=>setNewItemName(e.target.value)} placeholder="Item name..." onKeyDown={e=>e.key==="Enter"&&addItem(name)} autoFocus style={{marginBottom:4}}/>
            <div className="cg" style={{marginBottom:4}}>{AL.map(a=><button key={a.id} className={`ch cha ${newItemAl.includes(a.id)?'on':''}`} onClick={()=>togAl(a.id)} style={{fontSize:9,padding:'2px 5px'}}>{a.i} {a.l}</button>)}</div>
            <div style={{display:'flex',gap:3}}><button className="mb" onClick={()=>addItem(name)} style={{color:'var(--ok)'}}>Add Item</button><button className="mb" onClick={()=>{setShowAddItem(null);setNewItemName("");setNewItemAl([])}}>Cancel</button></div>
          </div>
           :<div style={{padding:'4px 10px'}}><button className="mb" onClick={()=>{setShowAddItem(name);setNewItemName("");setNewItemAl([])}} style={{color:'var(--pb)',width:'100%',textAlign:'center',padding:'5px 0'}}>+ Add Menu Item</button></div>}

          {/* Delete restaurant (only custom) */}
          {!isDefault(name)&&<div style={{padding:'4px 10px',borderTop:'1px solid var(--pb-t1)'}}>
            {confirmDel===name
              ?<div style={{display:'flex',gap:4,alignItems:'center',justifyContent:'center'}}>
                <span style={{fontSize:10,color:'var(--er)'}}>Delete "{name}"?</span>
                <button className="mb" onClick={()=>{deleteRestaurant(name);setConfirmDel(null)}} style={{color:'var(--er)',fontWeight:600}}>Yes, delete</button>
                <button className="mb" onClick={()=>setConfirmDel(null)}>Cancel</button>
              </div>
              :<button className="mb" onClick={()=>setConfirmDel(name)} style={{color:'var(--er)',width:'100%',textAlign:'center',padding:'4px 0',fontSize:10}}>🗑️ Delete Restaurant</button>}
          </div>}
        </div>}
      </div>})}

    <div style={{fontSize:9.5,color:'var(--t3)',marginTop:8,textAlign:'center'}}>Custom restaurants appear in the meal form restaurant browser and food search.</div>
  </>);
}

/* ═══ UNIFIED ADD/EDIT FOOD FORM ═══ */
function AddFoodForm({onClose,onSave,edit,initType,prefill,aiOn,restaurants}){
  const REST=restaurants||DEFAULT_REST;
  const init=edit||prefill||{};
  const [foodType,setFoodType]=useState(edit?.source||initType||null);
  const fr=useRef(null);
  const tog=(a,s,v)=>s(p=>p.includes(v)?p.filter(x=>x!==v):[...p,v]);
  const [name,setName]=useState(init.name||'');
  const [desc,setDesc]=useState(init.desc||'');
  const [mt,setMt]=useState(init.mt||'Lunch');
  const [al,setAl]=useState(init.al||[]);
  const [tg,setTg]=useState(init.tg||[]);
  const [safeStatus,setSafeStatus]=useState(init.safeStatus||'unknown');
  const [favorite,setFavorite]=useState(init.favorite||false);
  const [ings,setIngs]=useState(init.ings||[]);
  const [instructions,setInstructions]=useState(init.instructions||'');
  const [ingText,setIngText]=useState("");
  const [brand,setBrand]=useState(init.brand||'');
  const [variant,setVariant]=useState(init.variant||'');
  const [ingredients,setIngredients]=useState(init.ingredients||[]);
  const [storeIngText,setStoreIngText]=useState("");
  const [notes,setNotes]=useState(init.notes||'');
  const [scanning,setScanning]=useState(false);
  const [scanResult,setScanResult]=useState(null);
  const parseIngs=(text,setter)=>{if(!text.trim())return;const parsed=text.split(/,(?![^()]*\))/).map(s=>s.trim()).filter(Boolean);setter(p=>[...p,...parsed])};
  const autoDetect=(ingList,alSetter)=>{const detected=detectAllergens(ingList);if(detected.length)alSetter(p=>[...new Set([...p,...detected])])};
  const ingRisks=(ings||[]).map(ing=>{const rf=getGIRisk(ing,[]);const da=detectAllergens([ing]);const arf=da.length?getGIRisk("",da):[];return{ing,flags:[...new Set([...rf,...arf])]}}).filter(r=>r.flags.length>0);

  const handleScan=async(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=async(ev)=>{
      if(aiOn){
        setScanning(true);setScanResult(null);
        try{
          const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:file.type||"image/jpeg",data:ev.target.result.split(",")[1]}},{type:"text",text:'Read this ingredient label. Return ONLY JSON: {"name":"product name if visible","brand":"brand if visible","ingredients":["ingredient1","ingredient2"],"allergens":["from: gluten,dairy,soy,eggs,nuts,peanuts,shellfish,fish,sesame"],"warnings":"any allergy warnings on label"}'}]}]})});
          const d=await r.json();const t=(d.content?.[0]?.text||"").replace(/```json|```/g,"").trim();
          const parsed=JSON.parse(t);
          setScanResult(parsed);
          if(parsed.name&&!name)setName(parsed.name);
          if(parsed.brand&&!brand)setBrand(parsed.brand);
          if(parsed.ingredients?.length)setIngredients(parsed.ingredients);
          if(parsed.allergens?.length)setAl(p=>[...new Set([...p,...parsed.allergens])]);
        }catch(e2){setScanResult({error:"Couldn't read label"});}
        setScanning(false);
      }else{setScanResult({error:"Enable AI in Settings to scan labels. You can still add ingredients manually below."});}
    };reader.readAsDataURL(file);
  };

  const save=()=>{
    if(!name.trim())return;
    const base={name:name.trim(),desc:desc.trim(),source:foodType,mt,al,tg,safeStatus,favorite,ts:Date.now()};
    if(foodType==='homemade')onSave({...base,ings,instructions:instructions.trim(),tg:[...new Set([...tg,'Homemade'])]});
    else if(foodType==='store')onSave({...base,brand:brand.trim(),variant:variant.trim(),ingredients,notes:notes.trim()});
    else onSave({...base,tg:[...new Set([...tg,'Restaurant'])]});
  };

  if(!foodType) return (
  <div className="mov" onClick={onClose}><div className="mo" onClick={e=>e.stopPropagation()}>
    <div className="moh"><div className="mot">Add Food</div><button className="mox" onClick={onClose}>✕</button></div>
    <div className="mob">
      <div style={{fontSize:12,color:'var(--t2)',marginBottom:12}}>What type of food are you saving?</div>
      {[{id:'homemade',ic:'🏠',label:'Homemade',sub:'Recipes and meals you cook'},{id:'store',ic:'🛒',label:'Store-Bought',sub:'Packaged foods with ingredient labels'},{id:'restaurant',ic:'🍔',label:'Restaurant Order',sub:'Go-to orders from restaurants'}].map(t=>
        <button key={t.id} onClick={()=>setFoodType(t.id)} style={{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'14px 12px',background:'var(--c1)',border:'1px solid var(--pb-t2)',borderRadius:10,marginBottom:6,cursor:'pointer',textAlign:'left'}}>
          <span style={{fontSize:24}}>{t.ic}</span>
          <div><div style={{fontSize:13,fontWeight:600,color:'var(--t1)'}}>{t.label}</div><div style={{fontSize:10.5,color:'var(--t3)'}}>{t.sub}</div></div>
        </button>)}
    </div>
  </div></div>);

  return (
  <div className="mov" onClick={onClose}><div className="mo" onClick={e=>e.stopPropagation()}>
    <div className="moh"><div className="mot">{edit?'Edit':'Add'} {foodType==='homemade'?'Homemade Meal':foodType==='store'?'Store Food':'Restaurant Order'}</div><button className="mox" onClick={onClose}>✕</button></div>
    <div className="mob">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <span className="bd" style={{background:'var(--pb-t2)',color:'var(--pb)',fontSize:10}}>{foodType==='homemade'?'🏠 Homemade':foodType==='store'?'🛒 Store':'🍔 Restaurant'}</span>
        {!edit&&<button className="mb" onClick={()=>setFoodType(null)} style={{fontSize:10,color:'var(--t3)'}}>Change type</button>}
      </div>

      {foodType==='store'&&<div className="fs"><label className="fl">📸 Scan Ingredient Label</label>
        <div className="pua" onClick={()=>fr.current?.click()} style={{padding:10}}><div style={{fontSize:22}}>📸</div><div style={{fontSize:10.5,color:'var(--t3)'}}>Take photo of ingredient label{!aiOn?" (enable AI for auto-read)":""}</div></div>
        <input ref={fr} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={handleScan}/>
        {scanning&&<div className="aiz"><div className="spn"/>Reading label...</div>}
        {scanResult&&!scanResult.error&&<div style={{marginTop:5,padding:6,borderRadius:5,fontSize:11,background:'var(--ok-t1)',color:'var(--ok)',border:'1px solid var(--ok-t2)'}}>✨ Found: {scanResult.name||"product"}{scanResult.warnings?` · ⚠️ ${scanResult.warnings}`:""}</div>}
        {scanResult?.error&&<div style={{marginTop:5,padding:6,borderRadius:5,fontSize:11,background:'var(--wn-t1)',color:'var(--wn)',border:'1px solid var(--wn-t2)'}}>{scanResult.error}</div>}
      </div>}

      <div className="fs"><label className="fl">{foodType==='homemade'?'Meal Name':foodType==='store'?'Food Name':'Order Name'}</label><input className="fi" value={name} onChange={e=>setName(e.target.value)} placeholder={foodType==='homemade'?"e.g. Chicken & Rice Bowl":foodType==='store'?"e.g. Chicken Noodle Soup":"e.g. 🍔 Wendy's Usual"}/>{foodType==='restaurant'&&<div style={{fontSize:9.5,color:'var(--t3)',marginTop:2}}>Tip: start with an emoji for quick recognition</div>}</div>
      <div className="fs"><label className="fl">{foodType==='restaurant'?'Full Order Description':'Description'}</label><textarea className="fta" value={desc} onChange={e=>setDesc(e.target.value)} placeholder={foodType==='restaurant'?"e.g. Dave's Single (no mayo), Nuggets, Fries — Wendy's":"Brief description..."} style={{minHeight:foodType==='restaurant'?60:44}}/></div>
      {foodType==='store'&&<div className="fs"><div className="fr"><div><label className="fl">Brand</label><input className="fi" value={brand} onChange={e=>setBrand(e.target.value)} placeholder="e.g. Campbell's"/></div><div><label className="fl">Variant</label><input className="fi" value={variant} onChange={e=>setVariant(e.target.value)} placeholder="e.g. Chunky"/></div></div></div>}
      <div className="fs"><label className="fl">Default Meal Type</label><div className="cg">{MT.map(t=><button key={t} className={`ch ${mt===t?'on':''}`} onClick={()=>setMt(t)}>{t}</button>)}</div></div>

      {foodType==='homemade'&&<div className="fs"><label className="fl">Ingredients</label>
        <div style={{display:'flex',gap:4,marginBottom:5}}><textarea className="fta" value={ingText} onChange={e=>setIngText(e.target.value)} placeholder="Paste or type ingredients (comma-separated)..." style={{minHeight:44,flex:1}}/><button className="mb" onClick={()=>{parseIngs(ingText,setIngs);setIngText("")}} style={{color:'var(--pb)',alignSelf:'flex-end'}}>Parse</button></div>
        {ings.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:3}}>{ings.map((ing,i)=>{const ir=ingRisks.find(r=>r.ing===ing);return <span key={i} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 7px',background:ir?'var(--wn-t1)':'var(--c1)',borderRadius:10,fontSize:10,color:ir?'var(--wn)':'var(--t2)',border:`1px solid ${ir?'var(--wn-t2)':'var(--pb-t1)'}`}}>{ing}{ir&&<span style={{fontSize:7,color:'var(--t3)'}}>{ir.flags.map(f=>GI_RISK_CATS.find(c=>c.id===f)?.ic||'').join('')}</span>}<button style={{background:'none',border:'none',color:'var(--er)',cursor:'pointer',fontSize:10,padding:0}} onClick={()=>setIngs(p=>p.filter((_,j)=>j!==i))}>✕</button></span>})}</div>}
        <button className="mb" onClick={()=>{const v=prompt("Add ingredient:");if(v)setIngs(p=>[...p,v.trim()])}} style={{color:'var(--pb)',marginTop:4}}>+ Add single</button>
        {ingRisks.length>0&&<div style={{marginTop:5,padding:'5px 8px',background:'var(--wn-t1)',borderRadius:6,fontSize:9.5,color:'var(--t3)'}}>{ingRisks.map((r,i)=><div key={i}><span style={{color:'var(--wn)'}}>{r.ing}</span>: {r.flags.map(f=>GI_RISK_CATS.find(c=>c.id===f)?.l).join(', ')}</div>)}</div>}
      </div>}

      {foodType==='store'&&<div className="fs"><label className="fl">Ingredients</label>
        <div style={{display:'flex',gap:4,marginBottom:5}}><textarea className="fta" value={storeIngText} onChange={e=>setStoreIngText(e.target.value)} placeholder="Paste ingredient list here..." style={{minHeight:44,flex:1}}/><button className="mb" onClick={()=>{parseIngs(storeIngText,setIngredients);setStoreIngText("")}} style={{color:'var(--pb)',alignSelf:'flex-end'}}>Parse</button></div>
        {ingredients.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:3}}>{ingredients.map((ing,i)=><span key={i} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 7px',background:'var(--c1)',borderRadius:10,fontSize:10,color:'var(--t2)',border:'1px solid var(--pb-t1)'}}>{ing}<button style={{background:'none',border:'none',color:'var(--er)',cursor:'pointer',fontSize:10,padding:0}} onClick={()=>setIngredients(p=>p.filter((_,j)=>j!==i))}>✕</button></span>)}</div>}
        <button className="mb" onClick={()=>{const v=prompt("Add ingredient:");if(v)setIngredients(p=>[...p,v.trim()])}} style={{color:'var(--pb)',marginTop:4}}>+ Add single</button>
      </div>}

      <div className="fs"><label className="fl">⚠️ Allergens</label><div className="cg">{AL.map(a=><button key={a.id} className={`ch cha ${al.includes(a.id)?'on':''}`} onClick={()=>tog(al,setAl,a.id)}>{a.i} {a.l}</button>)}</div>
        {(foodType==='homemade'?ings.length>0:ingredients.length>0)&&<button className="mb" onClick={()=>autoDetect(foodType==='homemade'?ings:ingredients,setAl)} style={{color:'var(--ok)',marginTop:6,width:'100%',textAlign:'center'}}>🔍 Auto-detect allergens from ingredients</button>}
      </div>
      <div className="fs"><label className="fl">Tags</label><div className="cg">{FTAGS.map(t=><button key={t} className={`ch ${tg.includes(t)?'on':''}`} onClick={()=>tog(tg,setTg,t)}>{t}</button>)}</div></div>
      <div className="fs"><label className="fl">🛡️ Safety Status</label>
        <div className="cg">{[["safe","✅ Safe","var(--ok-t2)","var(--ok)"],["caution","⚠️ Caution","var(--wn-t2)","var(--wn)"],["avoid","🚫 Avoid","var(--er-t2)","var(--er)"],["unknown","❓ Unknown","var(--pb-t2)","var(--t2)"]].map(([id,l,bg,c])=><button key={id} className={`ch ${safeStatus===id?'on':''}`} onClick={()=>setSafeStatus(id)} style={safeStatus===id?{background:bg,color:c,borderColor:c}:{}}>{l}</button>)}</div>
      </div>
      <div className="fs" style={{display:'flex',alignItems:'center',gap:8}}>
        <button onClick={()=>setFavorite(!favorite)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer'}}>{favorite?'⭐':'☆'}</button>
        <span style={{fontSize:12,color:'var(--t1)'}}>Mark as favorite</span>
      </div>
      {foodType==='homemade'&&<div className="fs"><label className="fl">📝 Prep Notes / Recipe</label><textarea className="fta" value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="Optional — how to make it, cook time, etc." style={{minHeight:60}}/></div>}
      {foodType==='store'&&<div className="fs"><label className="fl">Notes</label><textarea className="fta" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Serving size, where to buy, etc." style={{minHeight:40}}/></div>}
      <button className="bp" onClick={save}>{edit?'Update Food':'Save to My Foods'}</button>
    </div>
  </div></div>);
}

/* ═══ MORE TAB ═══ */
function MoreTab({mt2,setMt2,aiOn,setAiOn,meals,syms,pin,setPin,procs,setProcs,meds2,setMeds2,dxs,setDxs,labs,setLabs,medUnlocked,setMedUnlocked,customSymptoms,setCustomSymptoms,doReset,getAllData,loadAllData,weightLog,setWeightLog,myFoods,setMyFoods,customFoods,onUseFood,showFoodForm,setShowFoodForm,editFood,setEditFood,foodFormType,setFoodFormType,restaurants,setRestaurants,pf,setPf,aiOn2,theme,setTheme,fbUser,syncMsg,setSyncMsg}){
  const tabs=[["foods","📦"],["weight","⚖️"],["medical","🏥"],["settings","⚙️"]];
  return (
  <>
    <div style={{display:'flex',gap:2,marginBottom:10}}>{tabs.map(([id,ic])=><button key={id} className={`fc ${mt2===id?'on':''}`} style={{flex:1,textAlign:'center',padding:'5px 3px'}} onClick={()=>{setMt2(id);if(id!=='medical')setMedUnlocked(false)}}>{ic} {id[0].toUpperCase()+id.slice(1)}</button>)}</div>
    {mt2==="foods"&&<FavsTab myFoods={myFoods} setMyFoods={setMyFoods} onUseFood={onUseFood} showFoodForm={showFoodForm} setShowFoodForm={setShowFoodForm} editFood={editFood} setEditFood={setEditFood} foodFormType={foodFormType} setFoodFormType={setFoodFormType} aiOn={aiOn2} restaurants={restaurants} setRestaurants={setRestaurants} pf={pf} setPf={setPf} customFoods={customFoods}/>}
    {mt2==="weight"&&<WeightSub weightLog={weightLog} setWeightLog={setWeightLog}/>}
    {mt2==="medical"&&<MedicalWithPhotos pin={pin} setPin={setPin} procs={procs} setProcs={setProcs} meds2={meds2} setMeds2={setMeds2} dxs={dxs} setDxs={setDxs} labs={labs} setLabs={setLabs} unlocked={medUnlocked} setUnlocked={setMedUnlocked} syms={syms}/>}
    {mt2==="settings"&&<SettingsSub aiOn={aiOn} setAiOn={setAiOn} meals={meals} syms={syms} pin={pin} setPin={setPin} customSymptoms={customSymptoms} setCustomSymptoms={setCustomSymptoms} doReset={doReset} getAllData={getAllData} loadAllData={loadAllData} theme={theme} setTheme={setTheme} fbUser={fbUser} syncMsg={syncMsg} setSyncMsg={setSyncMsg} />}
  </>);
}

/* ═══ WEIGHT TRACKING ═══ */
function WeightSub({weightLog,setWeightLog}){
  const [wInput,setWInput]=useState("");
  const [wDate,setWDate]=useState(td());
  const [wNote,setWNote]=useState("");
  const [showAdd,setShowAdd]=useState(false);
  const [editIdx,setEditIdx]=useState(null);
  const [range,setRange]=useState(90); // 30, 60, 90, 365

  const sorted=[...weightLog].sort((a,b)=>b.date.localeCompare(a.date));
  const latest=sorted[0];
  const prev=sorted[1];
  const change=latest&&prev?Math.round((latest.weight-prev.weight)*10)/10:null;

  // Stats
  const rangeEntries=sorted.filter(e=>{const d=new Date();d.setDate(d.getDate()-range);return e.date>=d.toISOString().split("T")[0]});
  const allWeights=rangeEntries.map(e=>e.weight);
  const highest=allWeights.length?Math.max(...allWeights):null;
  const lowest=allWeights.length?Math.min(...allWeights):null;
  const totalChange=rangeEntries.length>=2?Math.round((rangeEntries[0].weight-rangeEntries[rangeEntries.length-1].weight)*10)/10:null;

  const addEntry=()=>{
    const w=parseFloat(wInput);if(isNaN(w)||w<50||w>500)return;
    if(editIdx!==null){
      setWeightLog(p=>p.map((e,i)=>i===editIdx?{...e,weight:w,date:wDate,note:wNote.trim()||undefined}:e));
      setEditIdx(null);
    } else {
      setWeightLog(p=>[...p,{weight:w,date:wDate,note:wNote.trim()||undefined,ts:Date.now()}]);
    }
    setWInput("");setWNote("");setWDate(td());setShowAdd(false);
  };
  const startEdit=(i)=>{const e=sorted[i];const origIdx=weightLog.findIndex(x=>x.ts===e.ts&&x.date===e.date);setEditIdx(origIdx);setWInput(String(e.weight));setWDate(e.date);setWNote(e.note||"");setShowAdd(true)};
  const delEntry=(i)=>{const e=sorted[i];setWeightLog(p=>p.filter(x=>!(x.ts===e.ts&&x.date===e.date)))};

  // Chart data — chronological for the selected range
  const chartData=[...rangeEntries].reverse();
  const minW=chartData.length?Math.floor(Math.min(...chartData.map(e=>e.weight))-2):0;
  const maxW=chartData.length?Math.ceil(Math.max(...chartData.map(e=>e.weight))+2):200;
  const wRange=maxW-minW||1;
  const chartW=320;const chartH=140;const padL=36;const padB=20;const padT=10;const padR=10;
  const plotW=chartW-padL-padR;const plotH=chartH-padT-padB;

  return (
  <div>
    <div className="fvt">⚖️ Weight Tracker</div>

    {/* Current weight display */}
    {latest?<div style={{textAlign:'center',padding:'14px 0 10px'}}>
      <div style={{fontSize:42,fontFamily:'Outfit',fontWeight:700,color:'var(--t1)'}}>{latest.weight}<span style={{fontSize:16,color:'var(--t3)',fontWeight:400}}> lbs</span></div>
      {change!==null&&<div style={{fontSize:13,color:change>0?'var(--ok)':change<0?'var(--er)':'var(--t3)',fontWeight:600}}>
        {change>0?'▲':change<0?'▼':'—'} {Math.abs(change)} lbs <span style={{fontWeight:400,color:'var(--t3)'}}>from last</span>
      </div>}
      <div style={{fontSize:10,color:'var(--t3)',marginTop:2}}>Last logged: {latest.date}</div>
    </div>
    :<div style={{textAlign:'center',padding:'20px 0',color:'var(--t3)',fontSize:12}}>No weight entries yet. Tap + to log your first weight.</div>}

    {/* Add/Edit form */}
    <div style={{display:'flex',justifyContent:'center',marginBottom:10}}>
      <button className="mb" onClick={()=>{setShowAdd(!showAdd);setEditIdx(null);setWInput("");setWNote("");setWDate(td())}} style={{color:'var(--pb)',padding:'6px 16px',fontWeight:600}}>{showAdd?'✕ Cancel':'+ Log Weight'}</button>
    </div>
    {showAdd&&<div style={{padding:10,background:'var(--c1)',borderRadius:10,border:'1px solid var(--pb-t2)',marginBottom:10}}>
      <div style={{display:'flex',gap:6,marginBottom:6}}>
        <div style={{flex:1}}><label className="fl">Weight (lbs)</label><input className="fi" type="number" step="0.1" min="50" max="500" value={wInput} onChange={e=>setWInput(e.target.value)} placeholder="e.g. 165.5" autoFocus/></div>
        <div style={{flex:1}}><label className="fl">Date</label><input className="fi" type="date" value={wDate} onChange={e=>setWDate(e.target.value)}/></div>
      </div>
      <div style={{marginBottom:6}}><label className="fl">Note (optional)</label><input className="fi" value={wNote} onChange={e=>setWNote(e.target.value)} placeholder="e.g. morning, after breakfast..."/></div>
      <button className="bp" onClick={addEntry} style={{width:'100%'}}>{editIdx!==null?'Update':'Log Weight'}</button>
    </div>}

    {/* Trend chart */}
    {chartData.length>=2&&<div style={{marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
        <div style={{fontSize:11,fontWeight:600,color:'var(--t3)'}}>📈 Trend</div>
        <div style={{display:'flex',gap:2}}>{[30,60,90,365].map(r=><button key={r} className={`ch ${range===r?'on':''}`} onClick={()=>setRange(r)} style={{fontSize:9,padding:'2px 6px'}}>{r===365?'1yr':`${r}d`}</button>)}</div>
      </div>
      <div style={{background:'var(--c1)',borderRadius:10,border:'1px solid var(--pb-t1)',padding:'8px 4px',overflow:'hidden'}}>
        <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{width:'100%',height:'auto'}}>
          {/* Y-axis labels */}
          {[0,0.25,0.5,0.75,1].map((pct,i)=>{const val=Math.round(maxW-pct*wRange);const y=padT+pct*plotH;return <g key={i}>
            <text x={padL-4} y={y+3} textAnchor="end" fill="var(--t3)" fontSize="8" fontFamily="DM Sans">{val}</text>
            <line x1={padL} y1={y} x2={chartW-padR} y2={y} stroke="var(--pb-t1)" strokeWidth="0.5"/>
          </g>})}
          {/* Line + dots */}
          {chartData.length>=2&&<polyline fill="none" stroke="var(--pb)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={chartData.map((e,i)=>{const x=padL+(i/(chartData.length-1))*plotW;const y=padT+((maxW-e.weight)/wRange)*plotH;return `${x},${y}`}).join(' ')}/>}
          {/* Area fill */}
          {chartData.length>=2&&<polygon fill="url(#wgrad)" opacity="0.15" points={`${padL},${padT+plotH} ${chartData.map((e,i)=>{const x=padL+(i/(chartData.length-1))*plotW;const y=padT+((maxW-e.weight)/wRange)*plotH;return `${x},${y}`}).join(' ')} ${padL+(chartData.length-1)/(chartData.length-1)*plotW},${padT+plotH}`}/>}
          <defs><linearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--pb)"/><stop offset="100%" stopColor="transparent"/></linearGradient></defs>
          {/* Dots */}
          {chartData.map((e,i)=>{const x=padL+(i/(Math.max(chartData.length-1,1)))*plotW;const y=padT+((maxW-e.weight)/wRange)*plotH;return <circle key={i} cx={x} cy={y} r={chartData.length>20?2:3} fill="var(--pb)" stroke="var(--bg)" strokeWidth="1"/>})}
          {/* X-axis labels (first, middle, last) */}
          {chartData.length>=2&&[0,Math.floor(chartData.length/2),chartData.length-1].map(i=>{const e=chartData[i];const x=padL+(i/(chartData.length-1))*plotW;return <text key={i} x={x} y={chartH-2} textAnchor="middle" fill="var(--t3)" fontSize="7" fontFamily="DM Sans">{e.date.slice(5)}</text>})}
        </svg>
      </div>
      {/* Stats row */}
      {rangeEntries.length>=2&&<div style={{display:'flex',gap:6,marginTop:6}}>
        {[{l:'High',v:highest,c:'var(--er)'},{l:'Low',v:lowest,c:'var(--ok)'},{l:'Change',v:totalChange!==null?(totalChange>0?'+':'')+totalChange:null,c:totalChange>0?'var(--ok)':totalChange<0?'var(--er)':'var(--t3)'}].map((s,i)=>s.v!==null?<div key={i} style={{flex:1,textAlign:'center',padding:'5px 4px',background:'var(--c1)',borderRadius:6,border:'1px solid var(--pb-t1)'}}>
          <div style={{fontSize:15,fontFamily:'Outfit',fontWeight:700,color:s.c}}>{s.v}</div>
          <div style={{fontSize:8,color:'var(--t3)',textTransform:'uppercase'}}>{s.l}</div>
        </div>:null)}
      </div>}
    </div>}

    {/* Entry history */}
    {sorted.length>0&&<div>
      <div style={{fontSize:11,fontWeight:600,color:'var(--t3)',marginBottom:4}}>History ({sorted.length} entries)</div>
      {sorted.slice(0,20).map((e,i)=>{
        const prev2=sorted[i+1];
        const ch=prev2?Math.round((e.weight-prev2.weight)*10)/10:null;
        return <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderBottom:'1px solid var(--pb-t1)'}}>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'baseline',gap:6}}>
              <span style={{fontSize:14,fontWeight:600,color:'var(--t1)',fontFamily:'Outfit'}}>{e.weight} lbs</span>
              {ch!==null&&<span style={{fontSize:10,color:ch>0?'var(--ok)':ch<0?'var(--er)':'var(--t3)'}}>{ch>0?'▲':ch<0?'▼':'—'}{Math.abs(ch)}</span>}
            </div>
            <div style={{fontSize:10,color:'var(--t3)'}}>{e.date}{e.note?` · ${e.note}`:''}</div>
          </div>
          <button className="mb" onClick={()=>startEdit(i)} style={{fontSize:9,padding:'2px 5px'}}>✏️</button>
          <button className="mb" onClick={()=>delEntry(i)} style={{color:'var(--er)',fontSize:9,padding:'2px 5px'}}>✕</button>
        </div>})}
      {sorted.length>20&&<div style={{textAlign:'center',fontSize:10,color:'var(--t3)',padding:6}}>Showing last 20 of {sorted.length} entries</div>}
    </div>}
  </div>);
}

function PhotoGallery({syms,pin,setPin,unlocked,setUnlocked}){
  const [pinIn,setPinIn]=useState("");
  const [err,setErr]=useState("");
  const [viewPhoto,setViewPhoto]=useState(null);
  const [filterType,setFilterType]=useState("all");

  // Collect all symptoms with photos, sorted newest first
  const withPhotos=syms.filter(s=>s.photo).sort((a,b)=>b.date.localeCompare(a.date)||(b.time||"").localeCompare(a.time||""));
  const photoCount=withPhotos.length;

  // Unique symptom types across photo entries for filtering
  const allTypes=[...new Set(withPhotos.flatMap(s=>s.types||[]))].sort();
  const filtered=filterType==="all"?withPhotos:withPhotos.filter(s=>(s.types||[]).includes(filterType));

  // Group by month
  const grouped={};
  filtered.forEach(s=>{
    const ym=s.date.slice(0,7);
    if(!grouped[ym])grouped[ym]=[];
    grouped[ym].push(s);
  });
  const months=Object.keys(grouped).sort((a,b)=>b.localeCompare(a));

  if(!unlocked){
    if(!pin)return <div className="pw-g"><div style={{fontSize:40}}>📸</div><div style={{fontFamily:'Outfit',fontSize:16,color:'var(--t2)',margin:'8px 0 3px'}}>Symptom Photos</div><div style={{fontSize:11.5,color:'var(--t3)',marginBottom:12}}>Set a PIN in Settings to protect photos</div></div>;
    return(<div className="pw-g"><div style={{fontSize:40}}>🔒</div><div style={{fontFamily:'Outfit',fontSize:16,color:'var(--t2)',margin:'8px 0 3px'}}>Symptom Photos</div><div style={{fontSize:11.5,color:'var(--t3)',marginBottom:12}}>Enter PIN to view {photoCount} photo{photoCount!==1?'s':''}</div>
      <div style={{display:'flex',gap:5,width:'100%',maxWidth:240}}><input className="fi" type="password" maxLength={8} placeholder="PIN" value={pinIn} onChange={e=>{setPinIn(e.target.value);setErr("")}} onKeyDown={e=>e.key==="Enter"&&(pinIn===pin?(setUnlocked(true),setErr("")):((setErr("Wrong PIN")),setPinIn("")))} style={{flex:1,letterSpacing:3,textAlign:'center'}}/><button className="mb" onClick={()=>{if(pinIn===pin){setUnlocked(true);setErr("")}else{setErr("Wrong PIN");setPinIn("")}}} style={{color:'var(--pb)',padding:'6px 12px'}}>→</button></div>
      {err&&<div style={{fontSize:12,color:'var(--er)',marginTop:6}}>{err}</div>}
      <button className="mb" onClick={()=>{setPin("");setUnlocked(true)}} style={{fontSize:12,color:'var(--t3)',marginTop:8}}>Forgot PIN?</button>
    </div>);
  }

  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
      <div className="fvt" style={{marginBottom:0}}>📸 Symptom Photos</div>
      <button className="mb" onClick={()=>setUnlocked(false)}>Lock 🔒</button>
    </div>

    {photoCount===0?<div className="emp"><div className="emp-i">📸</div><div className="emp-t">No photos yet</div><div className="emp-s">Attach photos when logging symptoms to build a visual record for your doctor</div></div>:<>

      {/* Stats bar */}
      <div style={{padding:'6px 10px',background:'var(--c1)',borderRadius:8,marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center',border:'1px solid var(--pb-t1)'}}>
        <span style={{fontSize:11,color:'var(--t2)'}}>📷 {photoCount} photo{photoCount!==1?'s':''} total</span>
        <span style={{fontSize:10,color:'var(--t3)'}}>{months.length} month{months.length!==1?'s':''}</span>
      </div>

      {/* Filter by symptom type */}
      {allTypes.length>1&&<div style={{marginBottom:8}}>
        <div style={{display:'flex',gap:3,overflowX:'auto',paddingBottom:4,WebkitOverflowScrolling:'touch'}}>
          <button className={`fc ${filterType==='all'?'on':''}`} style={{flexShrink:0}} onClick={()=>setFilterType("all")}>All</button>
          {allTypes.map(t=><button key={t} className={`fc ${filterType===t?'on':''}`} style={{flexShrink:0,fontSize:10}} onClick={()=>setFilterType(filterType===t?"all":t)}>{t}</button>)}
        </div>
      </div>}

      {/* Grouped by month */}
      {months.map(ym=>{
        const [y,m]=ym.split("-");
        const label=`${mnf(parseInt(m)-1)} ${y}`;
        const items=grouped[ym];
        return <div key={ym} style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:600,color:'var(--t3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:6}}>{label} — {items.length} photo{items.length!==1?'s':''}</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:4}}>
            {items.map((s,i)=><div key={s.id||i} style={{position:'relative',cursor:'pointer',borderRadius:8,overflow:'hidden',aspectRatio:'1',border:'1px solid var(--pb-t1)'}} onClick={()=>setViewPhoto(s)}>
              <img src={s.photo} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}} alt=""/>
              {/* Overlay with date + severity */}
              <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'12px 4px 3px',background:'linear-gradient(transparent,var(--shadow-strong))',display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
                <span style={{fontSize:8,color:'#fff',fontWeight:500}}>{s.date.slice(5)}</span>
                <span style={{fontSize:7,padding:'1px 4px',borderRadius:4,background:s.severity==='Severe'?'var(--er-t3)':s.severity==='Moderate'?'var(--wn-t3)':'var(--in-t3)',color:'#fff',fontWeight:600}}>{s.severity||"—"}</span>
              </div>
            </div>)}
          </div>
        </div>})}
    </>}

    {/* Full-size photo viewer modal */}
    {viewPhoto&&<div className="mov" onClick={()=>setViewPhoto(null)}>
      <div style={{width:'100%',maxWidth:480,maxHeight:'92vh',display:'flex',flexDirection:'column',padding:12}} onClick={e=>e.stopPropagation()}>
        {/* Close button */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div style={{fontSize:14,fontFamily:'Outfit',fontWeight:600,color:'#fff'}}>📸 Photo Detail</div>
          <button className="mox" onClick={()=>setViewPhoto(null)}>✕</button>
        </div>
        {/* Photo */}
        <div style={{flex:1,minHeight:0,borderRadius:12,overflow:'hidden',marginBottom:8}}>
          <img src={viewPhoto.photo} style={{width:'100%',maxHeight:'60vh',objectFit:'contain',display:'block',borderRadius:12}} alt=""/>
        </div>
        {/* Details card */}
        <div style={{background:'var(--c1)',borderRadius:12,padding:12,border:'1px solid var(--pb-t1)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
            <span style={{fontSize:12,fontWeight:600,color:'var(--t1)'}}>{viewPhoto.date} at {fmt12(viewPhoto.time)}</span>
            <span className="bd" style={viewPhoto.severity==='Severe'?{background:'var(--er-t2)',color:'var(--er)'}:viewPhoto.severity==='Moderate'?{background:'var(--wn-t2)',color:'var(--wn)'}:{background:'var(--in-t2)',color:'var(--in)'}}>{viewPhoto.severity||"—"}</span>
          </div>
          <div className="tr">{(viewPhoto.types||[]).map(t=><span key={t} className="tg ts2">{t}</span>)}</div>
          {viewPhoto.consistency&&<div style={{fontSize:10.5,color:'var(--t2)',marginTop:3}}>{(CONSISTENCY.find(c=>c.id===viewPhoto.consistency)||{}).i||''} Consistency: {(CONSISTENCY.find(c=>c.id===viewPhoto.consistency)||{}).l||viewPhoto.consistency}</div>}
          {!viewPhoto.consistency&&viewPhoto.bristol&&<div style={{fontSize:10.5,color:'var(--t2)',marginTop:3}}>Bristol Type {viewPhoto.bristol}</div>}
          {viewPhoto.urgency&&<div style={{fontSize:10.5,color:viewPhoto.urgency==='Urgent'||viewPhoto.urgency==='Emergency'?'var(--er)':'var(--t2)',marginTop:3}}>⚡ Urgency: {viewPhoto.urgency}</div>}
          {viewPhoto.stoolFlags?.length>0&&<div style={{display:'flex',gap:3,flexWrap:'wrap',marginTop:3}}>{viewPhoto.stoolFlags.map(f=><span key={f} style={{fontSize:9,padding:'2px 6px',borderRadius:6,background:f==='Blood'||f==='Dark/tarry'?'var(--er-t2)':'var(--wn-t1)',color:f==='Blood'||f==='Dark/tarry'?'var(--er)':'var(--wn)'}}>{f}</span>)}</div>}
          {viewPhoto.duration&&<div style={{fontSize:10.5,color:'var(--pb)',marginTop:3}}>⏱️ Duration: {viewPhoto.duration}</div>}
          {viewPhoto.delay&&<div style={{fontSize:10.5,color:'var(--t3)',marginTop:2}}>⏱️ ~{viewPhoto.delay} after meal</div>}
          {viewPhoto.notes&&<div style={{fontSize:11,color:'var(--t2)',marginTop:4,fontStyle:'italic',padding:'6px 8px',background:'var(--pb-t1)',borderRadius:6}}>"{viewPhoto.notes}"</div>}
        </div>
        {/* Navigation between photos */}
        {(()=>{
          const idx=filtered.findIndex(s=>s.id===viewPhoto.id);
          const hasPrev=idx>0;
          const hasNext=idx<filtered.length-1&&idx>=0;
          return(hasPrev||hasNext)?<div style={{display:'flex',gap:6,marginTop:8,justifyContent:'center'}}>
            {hasPrev&&<button className="mb" onClick={e=>{e.stopPropagation();setViewPhoto(filtered[idx-1])}} style={{color:'var(--pb)',padding:'6px 16px'}}>◀ Prev</button>}
            <span style={{fontSize:10,color:'var(--t3)',alignSelf:'center'}}>{idx+1} of {filtered.length}</span>
            {hasNext&&<button className="mb" onClick={e=>{e.stopPropagation();setViewPhoto(filtered[idx+1])}} style={{color:'var(--pb)',padding:'6px 16px'}}>Next ▶</button>}
          </div>:null;
        })()}
      </div>
    </div>}
  </div>);
}

function CalSub({cY,setCY,cM,setCM,selD,setSelD,mbd,dn,setDn}){
  const days=gD(cY,cM);const prev=()=>{if(cM===0){setCM(11);setCY(cY-1)}else setCM(cM-1)};const next=()=>{if(cM===11){setCM(0);setCY(cY+1)}else setCM(cM+1)};
  const [ed,setEd]=useState(false);const [tx,setTx]=useState(dn[selD]||"");
  useEffect(()=>setTx(dn[selD]||""),[selD,dn]);
  return(<>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}><button className="wm" onClick={prev}>◀</button><div style={{fontFamily:'Outfit',fontSize:15,fontWeight:600}}>{mnf(cM)} {cY}</div><button className="wm" onClick={next}>▶</button></div>
    <div className="cgr">{dA.map(d=><div key={d} className="cdn">{d}</div>)}{days.map((d,i)=>{if(!d)return <div key={`e${i}`}/>;const ds=`${cY}-${String(cM+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;return <div key={ds} className={`cd2 ${mbd[ds]?'hm':''} ${ds===td()?'tod':''} ${ds===selD?'sel':''}`} onClick={()=>setSelD(ds)}>{d}</div>})}</div>
    <div className="dc"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}><span style={{fontSize:11.5,fontWeight:600,color:'var(--pb)'}}>📝 Notes — {selD}</span>{!ed&&<button className="mb" onClick={()=>setEd(true)}>Edit</button>}</div>
      {ed?<><textarea className="fta" value={tx} onChange={e=>setTx(e.target.value)} placeholder="Medications, sleep, stress..." style={{marginBottom:4}}/><button className="mb" onClick={()=>{setDn(p=>({...p,[selD]:tx}));setEd(false)}} style={{color:'var(--ok)'}}>Save</button></>
       :<div style={{fontSize:11.5,color:tx?'var(--t2)':'var(--t3)',lineHeight:1.5}}>{tx||"Tap edit to add notes."}</div>}
    </div>
  </>);
}
function MedsSub({date,medLog,setMedLog,activeMeds}){
  const [showOther,setShowOther]=useState(false);
  const [otherName,setOtherName]=useState("");
  const [otherNote,setOtherNote]=useState("");
  const [editIdx,setEditIdx]=useState(null); // index of entry being time-edited
  const [editTime,setEditTime]=useState("");

  // Get today's entries — backward compatible with old string format
  const raw=medLog[date];
  const entries=Array.isArray(raw)?raw:raw?[{name:raw,time:"",note:"",_legacy:true}]:[];

  // Active meds from Medical tab (no end date = still active)
  const active=(activeMeds||[]).filter(m=>!m.end);

  const addEntry=(name,dose)=>{
    const now=new Date().toTimeString().slice(0,5);
    const entry={name:dose?`${name} ${dose}`:name,time:now,note:""};
    setMedLog(p=>({...p,[date]:[...(Array.isArray(p[date])?p[date]:[]),entry]}));
  };

  const removeEntry=(idx)=>{
    setMedLog(p=>{
      const cur=Array.isArray(p[date])?[...p[date]]:[];
      cur.splice(idx,1);
      return {...p,[date]:cur};
    });
  };

  const updateTime=(idx,newTime)=>{
    setMedLog(p=>{
      const cur=Array.isArray(p[date])?[...p[date]]:[];
      if(cur[idx])cur[idx]={...cur[idx],time:newTime};
      return {...p,[date]:cur};
    });
    setEditIdx(null);setEditTime("");
  };

  const addOther=()=>{
    const nm=otherName.trim();if(!nm)return;
    const now=new Date().toTimeString().slice(0,5);
    const entry={name:nm,time:now,note:otherNote.trim()};
    setMedLog(p=>({...p,[date]:[...(Array.isArray(p[date])?p[date]:[]),entry]}));
    setOtherName("");setOtherNote("");setShowOther(false);
  };

  // Check which active meds have been taken today and count doses
  const parseFreq=(freq)=>{const fl=(freq||"").toLowerCase();if(fl.includes("twice")||fl.includes("2x")||fl.includes("two times")||fl.includes("bid"))return 2;if(fl.includes("three")||fl.includes("3x")||fl.includes("tid"))return 3;return 1};
  const doseCount=(name)=>{const sn=(name||"").split("(")[0].trim().split(" ")[0].toLowerCase();return entries.filter(e=>(e.name||"").toLowerCase().includes(sn)).length};

  return (<>
    {/* Active medications reference */}
    {active.length>0&&<div className="dc">
      <div className="dct">💊 Quick Log — {date}</div>
      <div style={{fontSize:10,color:'var(--t3)',marginBottom:6}}>Tap to log a dose. From your active medications in Medical.</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
        {active.map((m,i)=>{
          const shortName=(m.name||"").split("(")[0].trim();
          const expected=parseFreq(m.freq);
          const taken=doseCount(m.name);
          const complete=taken>=expected;
          return <button key={i} className="ch" onClick={()=>addEntry(shortName,m.dose)} style={{fontSize:10.5,padding:'5px 9px',background:complete?'var(--ok-t1)':taken>0?'var(--wn-t1)':'var(--c1)',borderColor:complete?'var(--ok-t3)':taken>0?'var(--wn-t2)':'var(--pb-t2)',color:complete?'var(--ok)':taken>0?'var(--wn)':'var(--t1)'}}>
            {complete?"✓ ":taken>0?`${taken}/${expected} `:""}
            {shortName}{m.dose?` ${m.dose}`:""}
          </button>
        })}
        <button className="ch" onClick={()=>setShowOther(true)} style={{borderStyle:'dashed',color:'var(--pb)',fontSize:10.5,padding:'5px 9px'}}>+ Other</button>
      </div>
    </div>}

    {/* No active meds fallback */}
    {active.length===0&&<div className="dc">
      <div className="dct">💊 Log Medication — {date}</div>
      <div style={{fontSize:11,color:'var(--t3)',marginBottom:6}}>No active medications in Medical records. Add them there, or use + Other below.</div>
      <button className="ch" onClick={()=>setShowOther(true)} style={{borderStyle:'dashed',color:'var(--pb)',fontSize:10.5,padding:'5px 9px'}}>+ Other</button>
    </div>}

    {/* Add other med form */}
    {showOther&&<div style={{padding:10,background:'var(--c1)',borderRadius:10,border:'1px solid var(--pb-t2)',marginBottom:8,marginTop:6}}>
      <div style={{fontSize:11,fontWeight:600,color:'var(--t1)',marginBottom:5}}>Add Medication / Supplement</div>
      <input className="fi" value={otherName} onChange={e=>setOtherName(e.target.value)} placeholder="Name & dose, e.g. Probiotics 10B CFU" onKeyDown={e=>e.key==="Enter"&&addOther()} autoFocus style={{marginBottom:4}}/>
      <input className="fi" value={otherNote} onChange={e=>setOtherNote(e.target.value)} placeholder="Note (optional)..." style={{marginBottom:4}}/>
      <div style={{display:'flex',gap:4}}>
        <button className="mb" onClick={addOther} style={{color:'var(--ok)'}}>Add</button>
        <button className="mb" onClick={()=>{setShowOther(false);setOtherName("");setOtherNote("")}}>Cancel</button>
      </div>
    </div>}

    {/* Today's log */}
    <div className="dc" style={{marginTop:6}}>
      <div className="dct">📋 Today's Log {entries.length>0&&<span style={{fontSize:10,color:'var(--t3)',fontWeight:400}}>({entries.length} entr{entries.length===1?'y':'ies'})</span>}</div>
      {entries.length===0?<div style={{fontSize:11.5,color:'var(--t3)',textAlign:'center',padding:8}}>Nothing logged yet for {date}</div>
       :entries.map((e,i)=> <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 0',borderBottom:'1px solid var(--pb-t1)'}}>
        {editIdx===i
          ?<div style={{display:'flex',alignItems:'center',gap:4}}><input type="time" className="fi" value={editTime} onChange={ev=>setEditTime(ev.target.value)} style={{width:100,padding:'4px 6px'}} autoFocus/><button className="mb" onClick={()=>updateTime(i,editTime)} style={{color:'var(--ok)',padding:'4px 8px'}}>✓</button><button className="mb" onClick={()=>{setEditIdx(null);setEditTime("")}} style={{padding:'4px 8px'}}>✕</button></div>
          :<button className="mb" onClick={()=>{setEditIdx(i);setEditTime(e.time||nt())}} style={{minWidth:70,textAlign:'center',color:'var(--pb)',padding:'4px 6px'}}>{fmt12(e.time)}</button>}
        <span style={{fontSize:14,color:'var(--t1)',flex:1}}>{e.name}</span>
        {e.note&&<span style={{fontSize:11,color:'var(--t3)',fontStyle:'italic'}}>{e.note}</span>}
        {!e._legacy&&<button className="mb" onClick={()=>removeEntry(i)} style={{color:'var(--er)',padding:'4px 8px'}}>✕</button>}
      </div>)}
    </div>

    <div style={{fontSize:9.5,color:'var(--t3)',marginTop:6,textAlign:'center'}}>Manage prescriptions and medication history in More → 🏥 Medical</div>
  </>);
}

/* ═══ MEDICAL WITH PHOTOS (combined) ═══ */
function MedicalWithPhotos({pin,setPin,procs,setProcs,meds2,setMeds2,dxs,setDxs,labs,setLabs,unlocked,setUnlocked,syms}){
  const [medSub,setMedSub]=useState("records"); // "records","photos"
  if(!unlocked){
    if(!pin) return <div className="pw-g"><div style={{fontSize:40}}>🏥</div><div style={{fontFamily:'Outfit',fontSize:16,color:'var(--t2)',margin:'8px 0 3px'}}>Medical Records & Photos</div><div style={{fontSize:11.5,color:'var(--t3)',marginBottom:12}}>Set a PIN in Settings to protect this section</div><div style={{fontSize:11,color:'var(--t3)',marginTop:8}}>Go to More → Settings to set your PIN</div></div>;
    return <MedicalPinGate pin={pin} setPin={setPin} onUnlock={()=>setUnlocked(true)} label="Medical Records & Photos"/>;
  }
  return (<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
      <div className="fvt" style={{marginBottom:0}}>🏥 Medical</div>
      <button className="mb" onClick={()=>setUnlocked(false)}>Lock 🔒</button>
    </div>
    <div style={{display:'flex',gap:2,marginBottom:10}}>{[["records","📋 Records"],["photos","📸 Photos"]].map(([id,l])=><button key={id} className={`fc ${medSub===id?'on':''}`} style={{flex:1,textAlign:'center',padding:'5px 3px'}} onClick={()=>setMedSub(id)}>{l}</button>)}</div>
    {medSub==="records"&&<MedicalSub pin={pin} setPin={setPin} procs={procs} setProcs={setProcs} meds2={meds2} setMeds2={setMeds2} dxs={dxs} setDxs={setDxs} labs={labs} setLabs={setLabs} unlocked={true} setUnlocked={setUnlocked}/>}
    {medSub==="photos"&&<PhotoGallery syms={syms} pin={pin} setPin={setPin} unlocked={true} setUnlocked={setUnlocked}/>}
  </div>);
}
function MedicalPinGate({pin,setPin,onUnlock,label}){
  const [pinIn,setPinIn]=useState("");const [err,setErr]=useState("");
  return (<div className="pw-g"><div style={{fontSize:40}}>🔒</div><div style={{fontFamily:'Outfit',fontSize:16,color:'var(--t2)',margin:'8px 0 3px'}}>{label||'Medical Records'}</div><div style={{fontSize:11.5,color:'var(--t3)',marginBottom:12}}>Enter PIN to access</div>
    <div style={{display:'flex',gap:5,width:'100%',maxWidth:240}}><input className="fi" type="password" maxLength={8} placeholder="PIN" value={pinIn} onChange={e=>{setPinIn(e.target.value);setErr("")}} onKeyDown={e=>e.key==="Enter"&&(pinIn===pin?(onUnlock(),setErr("")):((setErr("Wrong PIN")),setPinIn("")))} style={{flex:1,letterSpacing:3,textAlign:'center'}}/><button className="mb" onClick={()=>{if(pinIn===pin){onUnlock();setErr("")}else{setErr("Wrong PIN");setPinIn("")}}} style={{color:'var(--pb)',padding:'6px 12px'}}>→</button></div>
    {err&&<div style={{fontSize:12,color:'var(--er)',marginTop:6}}>{err}</div>}
    <button className="mb" onClick={()=>{setPin("");onUnlock()}} style={{fontSize:12,color:'var(--t3)',marginTop:8}}>Forgot PIN?</button>
  </div>);
}

/* ═══ MEDICAL SUB (PIN-gated) ═══ */
function MedicalSub({pin,setPin,unlocked,setUnlocked,procs,setProcs,meds2,setMeds2,dxs,setDxs,labs,setLabs}){
  const [pinIn,setPinIn]=useState("");const [err,setErr]=useState("");const [setup,setSetup]=useState(!pin);
  const [addType,setAddType]=useState(null); // "proc","med","dx","lab"
  if(!unlocked){
    if(!pin)return <div className="pw-g"><div style={{fontSize:40}}>🏥</div><div style={{fontFamily:'Outfit',fontSize:16,color:'var(--t2)',margin:'8px 0 3px'}}>Medical Records</div><div style={{fontSize:11.5,color:'var(--t3)',marginBottom:12}}>Set a PIN in Settings to protect this section</div><div style={{fontSize:11,color:'var(--t3)',marginTop:8}}>Go to More → Settings to set your PIN</div></div>;
    return(<div className="pw-g"><div style={{fontSize:40}}>🔒</div><div style={{fontFamily:'Outfit',fontSize:16,color:'var(--t2)',margin:'8px 0 3px'}}>Medical Records</div><div style={{fontSize:11.5,color:'var(--t3)',marginBottom:12}}>Enter PIN to access</div>
      <div style={{display:'flex',gap:5,width:'100%',maxWidth:240}}><input className="fi" type="password" maxLength={8} placeholder="PIN" value={pinIn} onChange={e=>{setPinIn(e.target.value);setErr("")}} onKeyDown={e=>e.key==="Enter"&&(pinIn===pin?(setUnlocked(true),setErr("")):((setErr("Wrong PIN")),setPinIn("")))} style={{flex:1,letterSpacing:3,textAlign:'center'}}/><button className="mb" onClick={()=>{if(pinIn===pin){setUnlocked(true);setErr("")}else{setErr("Wrong PIN");setPinIn("")}}} style={{color:'var(--pb)',padding:'6px 12px'}}>→</button></div>
      {err&&<div style={{fontSize:12,color:'var(--er)',marginTop:6}}>{err}</div>}
      <button className="mb" onClick={()=>{setPin("");setUnlocked(true)}} style={{fontSize:12,color:'var(--t3)',marginTop:8}}>Forgot PIN?</button>
    </div>);
  }
  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}><div className="fvt">🏥 Medical Records</div><button className="mb" onClick={()=>setUnlocked(false)}>Lock 🔒</button></div>

    {/* Procedures */}
    <div className="dc"><div className="dct">🔬 Procedures & Results <button className="mb" onClick={()=>setAddType("proc")} style={{marginLeft:'auto',color:'var(--pb)'}}>+ Add</button></div>
      {procs.length===0?<div style={{fontSize:11,color:'var(--t3)',textAlign:'center',padding:8}}>No procedures logged</div>
       :procs.sort((a,b)=>b.date.localeCompare(a.date)).map((p,i)=><div key={i} className="med-card"><div className="med-t">{p.type}</div><div className="med-s">{p.results}</div><div className="med-d">{p.date}{p.doctor?` · Dr. ${p.doctor}`:''}{p.location?` · ${p.location}`:''}</div><button className="mb" onClick={()=>setProcs(pr=>pr.filter((_,j)=>j!==i))} style={{color:'var(--er)',marginTop:4}}>Remove</button></div>)}
    </div>

    {/* Medications */}
    <div className="dc"><div className="dct">💊 Medication History <button className="mb" onClick={()=>setAddType("med")} style={{marginLeft:'auto',color:'var(--pb)'}}>+ Add</button></div>
      {meds2.length===0?<div style={{fontSize:11,color:'var(--t3)',textAlign:'center',padding:8}}>No medications logged</div>
       :meds2.map((m,i)=><div key={i} className="med-card"><div className="med-t">{m.name} — {m.dose}</div><div className="med-s">Reason: {m.reason}{m.freq?` · ${m.freq}`:''}</div><div className="med-d">Started: {m.start}{m.end?` · Ended: ${m.end}`:' · Active'}{m.doctor?` · Dr. ${m.doctor}`:''}</div><button className="mb" onClick={()=>setMeds2(p=>p.filter((_,j)=>j!==i))} style={{color:'var(--er)',marginTop:4}}>Remove</button></div>)}
    </div>

    {/* Diagnoses */}
    <div className="dc"><div className="dct">📋 Diagnosis Timeline <button className="mb" onClick={()=>setAddType("dx")} style={{marginLeft:'auto',color:'var(--pb)'}}>+ Add</button></div>
      {dxs.length===0?<div style={{fontSize:11,color:'var(--t3)',textAlign:'center',padding:8}}>No diagnoses logged</div>
       :dxs.sort((a,b)=>b.date.localeCompare(a.date)).map((d,i)=><div key={i} className="med-card"><div className="med-t">{d.name} <span className="bd" style={d.status==='Confirmed'?{background:'var(--ok-t2)',color:'var(--ok)'}:d.status==='Ruled Out'?{background:'var(--er-t1)',color:'var(--er)'}:{background:'var(--wn-t2)',color:'var(--wn)'}}>{d.status}</span></div><div className="med-d">{d.date}{d.doctor?` · Dr. ${d.doctor}`:''}</div>{d.notes&&<div className="med-s" style={{marginTop:2}}>{d.notes}</div>}<button className="mb" onClick={()=>setDxs(p=>p.filter((_,j)=>j!==i))} style={{color:'var(--er)',marginTop:4}}>Remove</button></div>)}
    </div>

    {/* Labs */}
    <div className="dc"><div className="dct">🧪 Lab Values <button className="mb" onClick={()=>setAddType("lab")} style={{marginLeft:'auto',color:'var(--pb)'}}>+ Add</button></div>
      {labs.length===0?<div style={{fontSize:11,color:'var(--t3)',textAlign:'center',padding:8}}>No lab values logged</div>
       :labs.sort((a,b)=>b.date.localeCompare(a.date)).map((l,i)=>{const lt=LAB_TYPES.find(t=>t.id===l.type);return <div key={i} className="lab-row"><span className="lab-nm">{lt?.name||l.type}</span><span className="lab-val" style={{color:'var(--pb)'}}>{l.value} <span style={{fontSize:9,color:'var(--t3)'}}>{lt?.unit||''}</span></span><span className="lab-ref">ref: {lt?.ref||'—'}</span><span className="ts">{l.date}</span><button className="mb" onClick={()=>setLabs(p=>p.filter((_,j)=>j!==i))} style={{color:'var(--er)'}}>✕</button></div>})}
    </div>

    {/* Add forms */}
    {addType&&<AddMedModal type={addType} onClose={()=>setAddType(null)} onSave={item=>{
      if(addType==="proc")setProcs(p=>[...p,item]);
      if(addType==="med")setMeds2(p=>[...p,item]);
      if(addType==="dx")setDxs(p=>[...p,item]);
      if(addType==="lab")setLabs(p=>[...p,item]);
      setAddType(null);
    }}/>}
  </div>);
}

function AddMedModal({type,onClose,onSave}){
  const [f,setF]=useState({});const up=(k,v)=>setF(p=>({...p,[k]:v}));
  return(<div className="mov" onClick={onClose}><div className="mo" onClick={e=>e.stopPropagation()}>
    <div className="moh"><div className="mot">{type==="proc"?"Add Procedure":type==="med"?"Add Medication":type==="dx"?"Add Diagnosis":"Add Lab Value"}</div><button className="mox" onClick={onClose}>✕</button></div>
    <div className="mob">
      {type==="proc"&&<><div className="fs"><label className="fl">Type</label><div className="cg">{PROC_TYPES.map(t=><button key={t} className={`ch ${f.type===t?'on':''}`} onClick={()=>up("type",t)} style={{fontSize:10.5}}>{t}</button>)}</div></div>
        <div className="fs"><label className="fl">Date</label><input className="fi" type="date" value={f.date||""} onChange={e=>up("date",e.target.value)}/></div>
        <div className="fs"><label className="fl">Results / Findings</label><textarea className="fta" value={f.results||""} onChange={e=>up("results",e.target.value)} placeholder="e.g. 45 eos/hpf proximal, 30 eos/hpf distal..."/></div>
        <div className="fs"><div className="fr"><div><label className="fl">Doctor</label><input className="fi" value={f.doctor||""} onChange={e=>up("doctor",e.target.value)}/></div><div><label className="fl">Location</label><input className="fi" value={f.location||""} onChange={e=>up("location",e.target.value)}/></div></div></div></>}
      {type==="med"&&<><div className="fs"><label className="fl">Medication Name</label><input className="fi" value={f.name||""} onChange={e=>up("name",e.target.value)} placeholder="e.g. Omeprazole"/></div>
        <div className="fs"><div className="fr"><div><label className="fl">Dose</label><input className="fi" value={f.dose||""} onChange={e=>up("dose",e.target.value)} placeholder="20mg"/></div><div><label className="fl">Frequency</label><input className="fi" value={f.freq||""} onChange={e=>up("freq",e.target.value)} placeholder="2x daily"/></div></div></div>
        <div className="fs"><label className="fl">Reason Prescribed</label><input className="fi" value={f.reason||""} onChange={e=>up("reason",e.target.value)} placeholder="e.g. GERD, suspected EoE"/></div>
        <div className="fs"><div className="fr"><div><label className="fl">Start Date</label><input className="fi" type="date" value={f.start||""} onChange={e=>up("start",e.target.value)}/></div><div><label className="fl">End Date</label><input className="fi" type="date" value={f.end||""} onChange={e=>up("end",e.target.value)}/></div></div></div>
        <div className="fs"><label className="fl">Doctor</label><input className="fi" value={f.doctor||""} onChange={e=>up("doctor",e.target.value)}/></div></>}
      {type==="dx"&&<><div className="fs"><label className="fl">Diagnosis</label><input className="fi" value={f.name||""} onChange={e=>up("name",e.target.value)} placeholder="e.g. Eosinophilic Esophagitis"/></div>
        <div className="fs"><label className="fl">Status</label><div className="cg">{DX_STATUS.map(s=><button key={s} className={`ch ${f.status===s?'on':''}`} onClick={()=>up("status",s)}>{s}</button>)}</div></div>
        <div className="fs"><div className="fr"><div><label className="fl">Date</label><input className="fi" type="date" value={f.date||""} onChange={e=>up("date",e.target.value)}/></div><div><label className="fl">Doctor</label><input className="fi" value={f.doctor||""} onChange={e=>up("doctor",e.target.value)}/></div></div></div>
        <div className="fs"><label className="fl">Notes</label><textarea className="fta" value={f.notes||""} onChange={e=>up("notes",e.target.value)} style={{minHeight:50}}/></div></>}
      {type==="lab"&&<><div className="fs"><label className="fl">Lab Type</label><div className="cg">{LAB_TYPES.map(t=><button key={t.id} className={`ch ${f.type===t.id?'on':''}`} onClick={()=>up("type",t.id)} style={{fontSize:10}}>{t.name}</button>)}</div></div>
        <div className="fs"><div className="fr"><div><label className="fl">Value</label><input className="fi" value={f.value||""} onChange={e=>up("value",e.target.value)} placeholder="e.g. 45"/></div><div><label className="fl">Date</label><input className="fi" type="date" value={f.date||""} onChange={e=>up("date",e.target.value)}/></div></div></div></>}
      <button className="bp" onClick={()=>onSave(f)}>Save</button>
    </div>
  </div></div>);
}

/* ═══ SETTINGS SUB ═══ */
function SettingsSub({aiOn,setAiOn,meals,syms,pin,setPin,customSymptoms,setCustomSymptoms,doReset,getAllData,loadAllData,theme,setTheme,fbUser,syncMsg,setSyncMsg}){
  const [np,setNp]=useState("");const [msg,setMsg]=useState("");
  const [resetMode,setResetMode]=useState(null);
  const [resetConfirm,setResetConfirm]=useState("");
  const [resetting,setResetting]=useState(false);
  const [impMsg,setImpMsg]=useState("");
  const [syncing,setSyncing]=useState(false);
  const impRef=useRef(null);
  const xp=async()=>{
    const d=JSON.stringify(getAllData(),null,2);
    try{
      const blob=new Blob([d],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download=`gutcheck-backup-${td()}.json`;
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      setImpMsg("✅ Export downloaded!");setTimeout(()=>setImpMsg(""),3000);
    }catch{
      try{
        await navigator.clipboard.writeText(d);
        setImpMsg("✅ Copied to clipboard! Paste into a text file and save as .json");setTimeout(()=>setImpMsg(""),6000);
      }catch{
        const w=window.open('','_blank');
        if(w){w.document.write('<pre>'+d.replace(/</g,'&lt;')+'</pre>');w.document.title='GutCheck Backup';setImpMsg("✅ Opened in new tab — save the page");setTimeout(()=>setImpMsg(""),4000)}
        else setImpMsg("❌ Export blocked — try allowing popups");
      }
    }
  };
  const handleImport=(e)=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=(ev)=>{try{const d=JSON.parse(ev.target.result);const result=loadAllData(d);if(result?.ok)setImpMsg(`✅ ${result.msg||'Data imported successfully!'}`);else if(result?.msg)setImpMsg(`❌ ${result.msg}`);else setImpMsg(result?"✅ Data imported successfully!":"❌ Invalid file format")}catch{setImpMsg("❌ Could not parse file — make sure it's a valid JSON backup")}setTimeout(()=>setImpMsg(""),5000)};r.readAsText(f)};
  const handleSyncUpload=async()=>{
    if(!fbUser)return;setSyncing(true);
    const ok=await syncUpload(getAllData());
    setSyncMsg(ok?"✅ Data synced to cloud!":"❌ Sync failed — try again");
    setSyncing(false);setTimeout(()=>setSyncMsg(""),4000);
  };
  const handleSyncDownload=async()=>{
    if(!fbUser)return;setSyncing(true);
    const data=await syncDownload();
    if(data){const result=loadAllData(data);setSyncMsg(result?.ok?"✅ Data restored from cloud!":"❌ Cloud data couldn't be loaded")}
    else setSyncMsg("❌ No cloud data found — upload first");
    setSyncing(false);setTimeout(()=>setSyncMsg(""),4000);
  };
  const handleReset=async()=>{
    if(resetConfirm!=="RESET")return;
    setResetting(true);
    await doReset(resetMode);
    setResetting(false);setResetMode(null);setResetConfirm("");
  };
  return (
  <div>
    {/* ═══ THEME ═══ */}
    <div className="stit">Appearance</div>
    <div className="sr" style={{flexDirection:'column',alignItems:'stretch',gap:6}}>
      <div style={{fontSize:12.5,color:'var(--t1)'}}>Theme</div>
      <div className="theme-toggle">
        <button className={`theme-opt ${theme==='dark'?'on':''}`} onClick={()=>setTheme('dark')}>🌙 Dark</button>
        <button className={`theme-opt ${theme==='light'?'on':''}`} onClick={()=>setTheme('light')}>☀️ Light</button>
      </div>
    </div>

    {/* ═══ CLOUD SYNC ═══ */}
    {isFirebaseReady()&&<>
      <div className="stit">Cloud Sync</div>
      {fbUser?<div>
        <div className="sr" style={{flexDirection:'column',alignItems:'stretch',gap:4}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:28,height:28,borderRadius:'50%',background:'var(--ok-t2)',border:'1px solid var(--ok-t3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:'var(--ok)'}}>{fbUser.displayName?fbUser.displayName[0].toUpperCase():'✓'}</div>
            <div><div style={{fontSize:12.5,color:'var(--t1)'}}>{fbUser.displayName||'Signed in'}</div><div style={{fontSize:10,color:'var(--t3)'}}>{fbUser.email}</div></div>
          </div>
        </div>
        <div style={{display:'flex',gap:6,marginTop:8,marginBottom:4}}>
          <button className="mb" onClick={handleSyncUpload} disabled={syncing} style={{flex:1,textAlign:'center',color:'var(--in)',padding:'10px 8px'}}>
            <div style={{fontSize:15,marginBottom:2}}>☁️</div>
            <div style={{fontSize:11,fontWeight:600}}>{syncing?'Syncing...':'Upload to Cloud'}</div>
          </button>
          <button className="mb" onClick={handleSyncDownload} disabled={syncing} style={{flex:1,textAlign:'center',color:'var(--ok)',padding:'10px 8px'}}>
            <div style={{fontSize:15,marginBottom:2}}>📥</div>
            <div style={{fontSize:11,fontWeight:600}}>{syncing?'Syncing...':'Download from Cloud'}</div>
          </button>
        </div>
        {syncMsg&&<div style={{padding:6,borderRadius:8,fontSize:11,textAlign:'center',marginBottom:6,background:syncMsg.includes("✅")?'var(--ok-t1)':'var(--er-t1)',color:syncMsg.includes("✅")?'var(--ok)':'var(--er)',border:`1px solid ${syncMsg.includes("✅")?'var(--ok-t2)':'var(--er-t2)'}`}}>{syncMsg}</div>}
        <div style={{fontSize:9.5,color:'var(--t3)',marginBottom:4}}>Photos are not synced (too large). Use Export/Import for full backups with photos.</div>
        <button className="mb" onClick={async()=>{await logOut();setSyncMsg("")}} style={{color:'var(--t3)',fontSize:11,width:'100%',textAlign:'center'}}>Sign Out</button>
      </div>
      :<div className="sr" style={{flexDirection:'column',alignItems:'stretch',gap:4}}>
        <div style={{fontSize:12.5,color:'var(--t1)'}}>Sign in to sync data between devices</div>
        <div style={{fontSize:10.5,color:'var(--t3)'}}>Your data stays on this device. Signing in adds optional cloud backup.</div>
        <button className="mb" onClick={async()=>{try{await signInWithGoogle()}catch(e){setSyncMsg("❌ Sign-in failed: "+e.message);setTimeout(()=>setSyncMsg(""),4000)}}} style={{color:'var(--pb)',marginTop:4,textAlign:'center',width:'100%'}}>Sign in with Google</button>
        {syncMsg&&<div style={{fontSize:11,color:syncMsg.includes("✅")?'var(--ok)':'var(--er)',marginTop:4,textAlign:'center'}}>{syncMsg}</div>}
      </div>}
    </>}

    <div className="stit">PIN (Photos & Medical)</div>
    <div className="sr" style={{flexDirection:'column',alignItems:'stretch',gap:4}}>
      <div style={{fontSize:12.5,color:'var(--t1)'}}>Privacy PIN {pin?"(set ✓)":"(not set)"}</div>
      <div style={{fontSize:10.5,color:'var(--t3)'}}>4+ characters — letters or numbers</div>
      <div style={{display:'flex',gap:5,marginTop:3}}><input className="fi" type="password" maxLength={8} placeholder={pin?"Change...":"Set PIN..."} value={np} onChange={e=>setNp(e.target.value)} style={{flex:1,padding:'6px 8px',letterSpacing:2}}/><button className="mb" onClick={()=>{if(np.length<4){setMsg("Min 4 chars");return}setPin(np);setNp("");setMsg("Saved ✓");setTimeout(()=>setMsg(""),2000)}} style={{color:'var(--pb)'}}>Save</button>{pin&&<button className="mb" onClick={()=>{setPin("");setMsg("Removed")}} style={{color:'var(--er)'}}>Remove</button>}</div>
      {msg&&<div style={{fontSize:10,color:msg.includes("✓")||msg.includes("Removed")?'var(--ok)':'var(--er)',marginTop:2}}>{msg}</div>}
    </div>
    <div className="stit">AI</div>
    <div className="sr"><div><div style={{fontSize:12.5,color:'var(--t1)'}}>AI Photo Analysis</div><div style={{fontSize:10.5,color:'var(--t3)'}}>Auto-detect foods from photos</div></div><div className={`tt ${aiOn?'on':''}`} onClick={()=>setAiOn(!aiOn)}><div className="tth"/></div></div>

    {/* Custom Symptoms */}
    <div className="stit">Custom Symptoms</div>
    {(customSymptoms||[]).length===0?<div className="sr"><span style={{fontSize:11.5,color:'var(--t3)'}}>No custom symptoms added. Use "+ Custom" in the symptom form to add.</span></div>
     :<>{(customSymptoms||[]).map((s,i)=><div key={i} className="sr">
      <span style={{fontSize:12.5,color:'var(--t1)'}}>⭐ {s}</span>
      <button className="mb" onClick={()=>setCustomSymptoms(p=>p.filter((_,j)=>j!==i))} style={{color:'var(--er)'}}>Remove</button>
    </div>)}
    <div style={{fontSize:9.5,color:'var(--t3)',padding:'4px 0'}}>Removing a custom symptom won't delete previously logged entries that used it.</div></>}
    <div className="stit">Data</div>
    <div style={{display:'flex',gap:6,marginBottom:8}}>
      <button className="mb" onClick={xp} style={{flex:1,textAlign:'center',padding:'12px 8px',color:'var(--pb)'}}>
        <div style={{fontSize:18,marginBottom:2}}>📤</div>
        <div style={{fontSize:13,fontWeight:600}}>Export All Data</div>
        <div style={{fontSize:11,color:'var(--t3)',marginTop:2}}>Full backup as JSON</div>
      </button>
      <button className="mb" onClick={()=>impRef.current?.click()} style={{flex:1,textAlign:'center',padding:'12px 8px',color:'var(--ok)'}}>
        <div style={{fontSize:18,marginBottom:2}}>📥</div>
        <div style={{fontSize:13,fontWeight:600}}>Import Data</div>
        <div style={{fontSize:11,color:'var(--t3)',marginTop:2}}>Restore from backup</div>
      </button>
      <input ref={impRef} type="file" accept=".json" style={{display:'none'}} onChange={handleImport}/>
    </div>
    {impMsg&&<div style={{padding:8,borderRadius:8,marginBottom:8,fontSize:13,textAlign:'center',background:impMsg.includes("✅")?'var(--ok-t1)':'var(--er-t1)',color:impMsg.includes("✅")?'var(--ok)':'var(--er)',border:`1px solid ${impMsg.includes("✅")?'var(--ok-t2)':'var(--er-t2)'}`}}>{impMsg}</div>}
    <div style={{fontSize:12,color:'var(--t3)',marginBottom:12,lineHeight:1.5}}>💡 Export before updating the app code. Import after to restore your data.</div>

    {/* Data Reset */}
    <div className="stit">Reset Data</div>
    {!resetMode ? <div style={{display:'flex',gap:4}}>
      <button className="mb" onClick={()=>setResetMode("with-medical")} style={{color:'var(--wn)',flex:1,padding:'8px 6px',textAlign:'center'}}>
        <div style={{fontSize:11,fontWeight:600}}>🔄 Reset + Keep Medical</div>
        <div style={{fontSize:9,color:'var(--t3)',marginTop:2}}>Clears logs, keeps medical data</div>
      </button>
      <button className="mb" onClick={()=>setResetMode("empty")} style={{color:'var(--er)',flex:1,padding:'8px 6px',textAlign:'center'}}>
        <div style={{fontSize:11,fontWeight:600}}>🗑️ Full Reset</div>
        <div style={{fontSize:9,color:'var(--t3)',marginTop:2}}>Clears everything</div>
      </button>
    </div>
    : <div style={{padding:10,background:'var(--er-t1)',border:'1px solid var(--er-t2)',borderRadius:8}}>
      <div style={{fontSize:12,fontWeight:600,color:'var(--er)',marginBottom:6}}>
        {resetMode === "with-medical" ? "🔄 Reset with Medical Data" : "🗑️ Full Reset"}
      </div>
      <div style={{fontSize:11,color:'var(--t2)',marginBottom:4}}>
        {resetMode === "with-medical"
          ? "This will clear all meal logs, symptom logs, water, notes, and settings. Your medical history will be preserved."
          : "This will clear ALL data. The app will be completely empty."}
      </div>
      <div style={{fontSize:10.5,color:'var(--ok)',marginBottom:8}}>💾 A backup will be saved automatically before reset.</div>
      <div style={{fontSize:10.5,color:'var(--t3)',marginBottom:4}}>Type <strong style={{color:'var(--er)'}}>RESET</strong> to confirm:</div>
      <div style={{display:'flex',gap:5}}>
        <input className="fi" value={resetConfirm} onChange={e=>setResetConfirm(e.target.value.toUpperCase())} placeholder="Type RESET..." style={{flex:1,padding:'6px 8px',letterSpacing:2,textAlign:'center',borderColor:resetConfirm==="RESET"?'var(--er)':'',fontWeight:600}}/>
        <button className="mb" onClick={handleReset} disabled={resetConfirm!=="RESET"||resetting} style={{color:resetConfirm==="RESET"?'var(--er)':'var(--t3)',padding:'6px 12px',opacity:resetConfirm==="RESET"?1:0.4}}>
          {resetting ? "..." : "Confirm"}
        </button>
        <button className="mb" onClick={()=>{setResetMode(null);setResetConfirm("")}}>Cancel</button>
      </div>
    </div>}

    <div className="stit">Stats</div>
    <div className="sr"><span style={{fontSize:12.5}}>Total meals</span><span style={{color:'var(--pb)',fontWeight:600}}>{meals.length}</span></div>
    <div className="sr"><span style={{fontSize:12.5}}>Total symptoms</span><span style={{color:'var(--er)',fontWeight:600}}>{syms.length}</span></div>
    {(()=>{
      const d=getAllData();const s=JSON.stringify(d).length;const kb=Math.round(s/1024);const mb=(s/1048576).toFixed(1);
      const photoCount=(d.syms||[]).filter(x=>x.photo).length+(d.meals||[]).filter(x=>x.photo).length;
      const pct=Math.min(100,Math.round(s/5242880*100));
      const color=pct>80?'var(--er)':pct>50?'var(--wn)':'var(--ok)';
      return <>
        <div className="sr"><span style={{fontSize:12.5}}>Data size</span><span style={{fontSize:11,fontWeight:600,color}}>{kb>1024?`${mb} MB`:`${kb} KB`}</span></div>
        <div style={{display:'flex',gap:1.5,height:6,marginTop:-4,marginBottom:8}}>
          <div style={{flex:pct,background:color,borderRadius:'3px 0 0 3px',transition:'all .3s'}}/><div style={{flex:100-pct,background:'var(--c3)',borderRadius:'0 3px 3px 0'}}/>
        </div>
        {pct>60&&<div style={{padding:'5px 10px',background:pct>80?'var(--er-t1)':'var(--wn-t1)',borderRadius:8,marginBottom:8,fontSize:10.5,color:pct>80?'var(--er)':'var(--wn)'}}>
          {pct>80?'⚠️ Storage nearly full! Export your data and consider removing old photos.':'💡 Storage filling up — export a backup soon.'}
          {photoCount>0&&<span> ({photoCount} photo{photoCount!==1?'s':''} stored)</span>}
        </div>}
        <div className="sr"><span style={{fontSize:12.5}}>Photos stored</span><span style={{fontSize:11,color:'var(--t3)'}}>{photoCount}</span></div>
      </>;
    })()}
    <div className="sr"><span style={{fontSize:12.5}}>Storage</span><span style={{fontSize:10,color:'var(--t3)'}}>IndexedDB (schema v{SCHEMA_VERSION})</span></div>
  </div>);
}

/* ═══ SYMPTOM FORM (Progressive Disclosure — Piece 2) ═══
   Flow: pick symptoms first → form appears with smart fields based on categories.
   - Consistency replaces Bristol in the full form (Bristol saved for backward compat)
   - Searchable symptom picker with common + custom chips
   - Collapsible advanced sections (Stool Details, Photo)
*/
function SymForm({onClose,onSave,edit,meals,customSymptoms,setCustomSymptoms}){
  const fr=useRef(null);
  const [types,setTypes]=useState(edit?.types||[]);
  const [date,setDate]=useState(edit?.date||td());
  const [time,setTime]=useState(edit?.time||nt());
  const [sev,setSev]=useState(edit?.severity||"");
  const [notes,setNotes]=useState(edit?.notes||"");
  const [photo,setPhoto]=useState(edit?.photo||null);
  // Initialise consistency from either existing consistency OR map old bristol → consistency
  const [consistency,setConsistency]=useState(edit?.consistency||bristolToConsistency(edit?.bristol)||null);
  const [duration,setDuration]=useState(edit?.duration||"");
  const [customDur,setCustomDur]=useState("");
  const [urgency,setUrgency]=useState(edit?.urgency||"");
  const [stoolFlags,setStoolFlags]=useState(edit?.stoolFlags||[]);
  const [showAddSym,setShowAddSym]=useState(false);
  const [newSym,setNewSym]=useState("");
  const [symSearch,setSymSearch]=useState("");
  const [showAllSyms,setShowAllSyms]=useState(false);
  const [showStoolDetails,setShowStoolDetails]=useState((edit?.stoolFlags?.length||0)>0);
  const [showPhoto,setShowPhoto]=useState(!!edit?.photo);

  const COMMON_SYMS=["Nausea","Vomiting","Diarrhea","Bowel Movement (normal)","Stomach Pain","Difficulty Swallowing"];
  const OTHER_SYMS=SYM_LIST.filter(s=>!COMMON_SYMS.includes(s));
  const allCustom=(customSymptoms||[]);

  const tog=v=>setTypes(p=>p.includes(v)?p.filter(x=>x!==v):[...p,v]);
  const hP=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>setPhoto(ev.target.result);r.readAsDataURL(f)};
  const addCustom=()=>{const s=newSym.trim();if(!s||[...SYM_LIST,...allCustom].includes(s))return;setCustomSymptoms(p=>[...p,s]);setTypes(p=>[...p,s]);setNewSym("");setShowAddSym(false)};

  // Progressive disclosure: compute which categories are selected
  const cats=getSymCats(types);
  const hasBM=cats.has('bm');
  const hasPicked=types.length>0;

  // Filter search results (searches across all SYM_LIST + custom)
  const searchQ=symSearch.trim().toLowerCase();
  const allSymsForSearch=[...SYM_LIST,...allCustom];
  const searchResults=searchQ
    ? allSymsForSearch.filter(s=>s.toLowerCase().includes(searchQ)).slice(0,8)
    : [];

  const recentMeals=(meals||[]).filter(m=>{
    const mt2=new Date(`${m.date}T${m.time||"12:00"}`).getTime();
    const st=new Date(`${date}T${time||"12:00"}`).getTime();
    const hrs=(st-mt2)/36e5;
    return hrs>0&&hrs<=24;
  }).sort((a,b)=>{
    const at=new Date(`${a.date}T${a.time||"12:00"}`).getTime();
    const bt=new Date(`${b.date}T${b.time||"12:00"}`).getTime();
    return bt-at;
  }).slice(0,4).map(m=>{
    const mt2=new Date(`${m.date}T${m.time||"12:00"}`).getTime();
    const st=new Date(`${date}T${time||"12:00"}`).getTime();
    const hrs=Math.round((st-mt2)/36e5*10)/10;
    return{...m,_hrsAgo:hrs};
  });

  // Save handler — builds sym object, including both consistency AND derived bristol for backward compat
  const buildSym=()=>{
    const symTime=new Date(`${date}T${time||"12:00"}`).getTime();
    const lastMeal=(meals||[]).filter(m=>{const mt2=new Date(`${m.date}T${m.time||"12:00"}`).getTime();return mt2<symTime}).sort((a,b)=>new Date(`${b.date}T${b.time||"12:00"}`).getTime()-new Date(`${a.date}T${a.time||"12:00"}`).getTime())[0];
    let autoDelay="";
    if(lastMeal){const hrs=(symTime-new Date(`${lastMeal.date}T${lastMeal.time||"12:00"}`).getTime())/36e5;autoDelay=hrs<0.5?"<30min":hrs<1?"30min":hrs<2?`${Math.round(hrs*10)/10}hr`:hrs<6?`${Math.round(hrs)}hrs`:hrs<12?"6-12hrs":hrs<24?"12-24hrs":"24hrs+"}
    return {
      types,date,time,
      severity:sev,
      delay:autoDelay,
      duration:duration||"",
      notes:notes.trim(),
      photo,
      // Save BOTH consistency and derived bristol so old views/PDF still work
      consistency:hasBM?consistency:null,
      bristol:hasBM&&consistency?consistencyToBristol(consistency):(hasBM?edit?.bristol||null:null),
      urgency:hasBM?urgency:"",
      stoolFlags:hasBM?stoolFlags:[],
      ts:Date.now(),
    };
  };

  const doSave=(keepOpen)=>{
    if(!types.length)return;
    onSave(buildSym(),keepOpen);
    if(keepOpen){
      // Reset for next entry but keep date/time fresh
      setTypes([]);setSev("");setNotes("");setPhoto(null);setConsistency(null);setDuration("");setCustomDur("");setUrgency("");setStoolFlags([]);setShowStoolDetails(false);setShowPhoto(false);setSymSearch("");setTime(nt());
    }
  };

  return (
  <div className="mov" onClick={onClose}><div className="mo" onClick={e=>e.stopPropagation()}>
    <div className="moh"><div className="mot">{edit?"Edit Symptom":"Log Symptom"}</div><button className="mox" onClick={onClose}>✕</button></div>
    <div className="mob">

      {/* ─── STEP 1: Symptom picker (always visible) ─── */}
      <div className="fs"><label className="fl">What are you feeling?</label>
        {/* Search bar */}
        <input className="fi" value={symSearch} onChange={e=>setSymSearch(e.target.value)} placeholder="🔍 Search symptoms..." style={{marginBottom:6}}/>
        {searchQ&&searchResults.length>0&&<div className="cg" style={{marginBottom:6}}>
          {searchResults.map(s=><button key={s} className={`ch chs ${types.includes(s)?'on':''}`} onClick={()=>{tog(s);setSymSearch("")}}>{allCustom.includes(s)?'⭐ ':''}{s}</button>)}
        </div>}
        {searchQ&&searchResults.length===0&&<div style={{fontSize:11,color:'var(--t3)',padding:'4px 0 6px'}}>No matches. Try the common list below or add a custom one.</div>}

        {/* Common symptoms */}
        <div className="cg">
          {COMMON_SYMS.map(s=><button key={s} className={`ch chs ${types.includes(s)?'on':''}`} onClick={()=>tog(s)}>{s}</button>)}
          {allCustom.map(s=><button key={s} className={`ch chs ${types.includes(s)?'on':''}`} onClick={()=>tog(s)}>⭐ {s}</button>)}
          <button className="ch" style={{borderStyle:'dashed',color:'var(--pb)'}} onClick={()=>setShowAddSym(true)}>+ Custom</button>
        </div>
        <button className="mb" onClick={()=>setShowAllSyms(!showAllSyms)} style={{color:'var(--pb)',fontSize:10.5,marginTop:6,width:'100%',textAlign:'center'}}>{showAllSyms?'▲ Hide other symptoms':`▼ Show all symptoms (${OTHER_SYMS.length} more)`}</button>
        {showAllSyms&&<div className="cg" style={{marginTop:6}}>
          {OTHER_SYMS.map(s=><button key={s} className={`ch chs ${types.includes(s)?'on':''}`} onClick={()=>tog(s)}>{s}</button>)}
        </div>}
        {showAddSym&&<div style={{display:'flex',gap:4,marginTop:6}}>
          <input className="fi" value={newSym} onChange={e=>setNewSym(e.target.value)} placeholder="New symptom name..." onKeyDown={e=>e.key==="Enter"&&addCustom()} autoFocus style={{flex:1}}/>
          <button className="mb" onClick={addCustom} style={{color:'var(--ok)'}}>Add</button>
          <button className="mb" onClick={()=>{setShowAddSym(false);setNewSym("")}}>✕</button>
        </div>}
      </div>

      {/* ─── Empty state before picking ─── */}
      {!hasPicked&&<div className="emp" style={{padding:'16px 10px'}}>
        <div className="emp-i">🩺</div>
        <div className="emp-t">Pick a symptom to continue</div>
        <div className="emp-s">Tap one or more symptoms above. The form fields will adjust based on what you pick — e.g. bowel-movement fields only appear if you pick a BM symptom.</div>
      </div>}

      {/* ─── STEP 2: Smart fields — only show when symptom is picked ─── */}
      {hasPicked&&<>
        {/* Time + Date */}
        <div className="fs"><div className="fr">
          <div><label className="fl">Time</label><input type="time" className="fi" value={time} onChange={e=>setTime(e.target.value)}/></div>
          <div><label className="fl">Date</label><input type="date" className="fi" value={date} onChange={e=>setDate(e.target.value)}/></div>
        </div></div>

        {/* Severity — always shown */}
        <div className="fs"><label className="fl">Severity</label>
          <div className="svr">{SEV.map(s=><button key={s} className={`svb sv-${s} ${sev===s?'on':''}`} onClick={()=>setSev(s)}>{s}</button>)}</div>
        </div>

        {/* Duration — always shown, optional */}
        <div className="fs"><label className="fl">⏱️ Duration (optional)</label>
          <div className="cg">{["15min","30min","1hr","2hrs","4hrs","6hrs+","All day"].map(d=><button key={d} className={`ch ${duration===d?'on':''}`} onClick={()=>{setDuration(duration===d?"":d);setCustomDur("")}} style={{fontSize:10.5}}>{d}</button>)}
            <button className={`ch ${customDur?'on':''}`} onClick={()=>{if(!customDur){setDuration("");setCustomDur("_")}else{setCustomDur("");setDuration("")}}} style={{borderStyle:'dashed',color:'var(--pb)',fontSize:10.5}}>Custom</button>
          </div>
          {customDur!==""&&<div style={{display:'flex',gap:4,marginTop:5}}><input className="fi" value={customDur==="_"?"":customDur} onChange={e=>{setCustomDur(e.target.value);setDuration(e.target.value)}} placeholder="e.g. 45 min, 90 min..." autoFocus style={{flex:1}}/></div>}
        </div>

        {/* BM-specific fields — only when a bowel category is picked */}
        {hasBM&&<>
          <div className="fs"><label className="fl">🚽 Consistency</label>
            <div className="cg">{CONSISTENCY.map(c=><button key={c.id} className={`ch ${consistency===c.id?'on':''}`} onClick={()=>setConsistency(consistency===c.id?null:c.id)} style={{fontSize:10.5}}>{c.i} {c.l}</button>)}</div>
            <div style={{fontSize:9,color:'var(--t3)',marginTop:3}}>Bristol {consistency?`Type ${consistencyToBristol(consistency)}`:'auto-derived from consistency'} — saved for clinical compatibility</div>
          </div>

          <div className="fs"><label className="fl">⚡ Urgency</label>
            <div className="cg">{["None","Mild","Moderate","Urgent","Emergency"].map(u=><button key={u} className={`ch ${urgency===u?'on':''}`} onClick={()=>setUrgency(urgency===u?"":u)} style={{fontSize:10.5}}>{u}</button>)}</div>
          </div>

          {/* Stool details — collapsed by default, expandable */}
          <div className="fs">
            <button className="mb" onClick={()=>setShowStoolDetails(!showStoolDetails)} style={{color:'var(--pb)',fontSize:11,width:'100%',textAlign:'left',padding:'6px 0'}}>
              {showStoolDetails?'▲':'▼'} Stool details {stoolFlags.length>0?`(${stoolFlags.length} selected)`:'(optional)'}
            </button>
            {showStoolDetails&&<div className="cg" style={{marginTop:4}}>
              {["Mucus","Blood","Undigested food","Greasy/oily","Foul smell","Pale/clay","Dark/tarry"].map(d=><button key={d} className={`ch chs ${stoolFlags.includes(d)?'on':''}`} onClick={()=>setStoolFlags(p=>p.includes(d)?p.filter(x=>x!==d):[...p,d])} style={{fontSize:10.5}}>{d}</button>)}
            </div>}
          </div>
        </>}

        {/* Recent Meals context */}
        {recentMeals.length>0&&<div className="fs"><label className="fl">🍽️ Recent Meals</label>
          <div style={{background:'var(--c1)',borderRadius:8,border:'1px solid var(--pb-t1)',padding:'4px 0'}}>
            {recentMeals.map((m,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderBottom:i<recentMeals.length-1?'1px solid var(--pb-t1)':'none'}}>
              <span style={{fontSize:9,color:'var(--t3)',minWidth:38}}>{m._hrsAgo<1?`${Math.round(m._hrsAgo*60)}min`:m._hrsAgo<2?`${m._hrsAgo.toFixed(1)}hr`:`${Math.round(m._hrsAgo)}hrs`} ago</span>
              <span className={`bd b-${m.mt}`} style={{fontSize:8}}>{m.mt}</span>
              <span style={{flex:1,fontSize:10.5,color:'var(--t2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{(m.desc||"").slice(0,40)}</span>
            </div>)}
          </div>
          <div style={{fontSize:9,color:'var(--t3)',marginTop:2}}>Auto-detected from your meal log — for context only</div>
        </div>}

        {/* Notes */}
        <div className="fs"><label className="fl">Notes</label>
          <textarea className="fta" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="What happened?" style={{minHeight:48}}/>
        </div>

        {/* Photo — collapsed by default */}
        <div className="fs">
          <button className="mb" onClick={()=>setShowPhoto(!showPhoto)} style={{color:'var(--pb)',fontSize:11,width:'100%',textAlign:'left',padding:'6px 0'}}>
            {showPhoto?'▲':'▼'} 📸 Photo {photo?'(attached)':'(PIN-locked, optional)'}
          </button>
          {showPhoto&&<>
            {photo?<div className="ppc"><img src={photo} className="pp" alt=""/><button className="prm" onClick={()=>setPhoto(null)}>✕</button></div>
             :<div className="pua" onClick={()=>fr.current?.click()}><div style={{fontSize:24}}>📸</div><div style={{fontSize:11,color:'var(--t3)'}}>Tap to take photo</div></div>}
            <input ref={fr} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={hP}/>
          </>}
        </div>

        {/* Save buttons */}
        <div style={{display:'flex',gap:6}}>
          <button className="bp" style={{flex:1}} onClick={()=>doSave(false)}>{edit?"Update":"Log Symptom"}</button>
          {!edit&&<button className="mb" style={{color:'var(--pb)',padding:'10px 14px',fontSize:12,fontWeight:600}} onClick={()=>doSave(true)}>+ Log Another</button>}
        </div>
      </>}
    </div>
  </div></div>);
}


/* ═══ MEAL FORM (Progressive Disclosure) ═══ */
function MealForm({onClose,onSave,edit,aiOn,setAiOn,pf,phase,checkElim,myFoods,setMyFoods,restaurants,customFoods,setCustomFoods}){
  const REST=restaurants||DEFAULT_REST;const RN=Object.keys(REST);
  const fr=useRef(null);const init=edit||pf||{};
  const DSZ=["8oz","12oz","16oz","20oz","24oz","32oz"];

  // Core meal state
  const [desc,setDesc]=useState(init.desc||"");
  const [mt,setMt]=useState(init.mt||"Lunch");
  const [time,setTime]=useState(edit?.time||nt());
  const [date,setDate]=useState(edit?.date||td());
  const [tags,setTags]=useState(init.tags||[]);
  const [notes,setNotes]=useState(edit?.notes||"");
  const [photo,setPhoto]=useState(edit?.photo||null);
  const [ings,setIngs]=useState(init.ings||[]);
  const [inst,setInst]=useState(init.inst||"");
  const [portion,setPortion]=useState(edit?.portion||"");
  const [completion,setCompletion]=useState(edit?.completion||"");
  const [customPortionText,setCustomPortionText]=useState("");
  const [portionMode,setPortionMode]=useState("simple");
  const [ingPortions,setIngPortions]=useState([]);
  const [showMore,setShowMore]=useState(false);
  const [saveToFoods,setSaveToFoods]=useState(!edit);
  const [showScanner,setShowScanner]=useState(false);
  const [az,setAz]=useState(false);

  // Drink state
  const [includeDrink,setIncludeDrink]=useState(!!edit?.drink);
  const [mealDrink,setMealDrink]=useState(edit?.drink||null);
  const [mealDrinkSize,setMealDrinkSize]=useState(edit?.drink?.size||"");
  const [mealDrinkCustomSize,setMealDrinkCustomSize]=useState("");
  const [mealDrinkCustomName,setMealDrinkCustomName]=useState("");
  const [mealDrinkHydrating,setMealDrinkHydrating]=useState(edit?.drink?.hydrating!==false);
  const drinkItems=(myFoods||[]).filter(f=>f.source==='drink');
  const [saveDrinkToLibrary,setSaveDrinkToLibrary]=useState(false);

  // ═══ SOURCE FLOW ═══
  // null = Step 1 (pick source). After picking: "restaurant"|"myrecipes"|"barcode"|"ingredients"|"describe"
  // "edit" = editing existing meal (skip source picker, show full form)
  const [source,setSource]=useState(edit?'edit':null);

  // Restaurant source
  const [menuRest,setMenuRest]=useState(null);
  const [menuSearch,setMenuSearch]=useState("");
  const [addingRest,setAddingRest]=useState(false);
  const [newRestName,setNewRestName]=useState("");
  const [newRestIcon,setNewRestIcon]=useState("🍽️");
  const [addingMenuItem,setAddingMenuItem]=useState(false);
  const [newMenuItemName,setNewMenuItemName]=useState("");
  const [newMenuItemAl,setNewMenuItemAl]=useState([]);
  const ICONS=["🍽️","🍔","🍕","🌮","🌯","🥖","🍗","🍜","🥡","🍣","☕","🧁","🥗","🍱","🫔","📍"];

  // My Recipes source
  const [recipeSearch,setRecipeSearch]=useState("");
  const [selectedRecipe,setSelectedRecipe]=useState(null);
  const [recipeModified,setRecipeModified]=useState(false);
  const [showRecipeSavePrompt,setShowRecipeSavePrompt]=useState(false);

  // Ingredient picker
  const [pickerQ,setPickerQ]=useState("");
  const [pickerCat,setPickerCat]=useState(null);
  const [picked,setPicked]=useState([]);
  const [customIng,setCustomIng]=useState("");
  const [customIngAl,setCustomIngAl]=useState([]);
  const [showCustomAlPrompt,setShowCustomAlPrompt]=useState(false);
  const [editPickAl,setEditPickAl]=useState(null);
  const [ingScannerOpen,setIngScannerOpen]=useState(false);

  // Barcode manual ID
  const [manualBarcode,setManualBarcode]=useState("");

  // ═══ ALLERGEN AUTO-DETECTION ═══
  const [manualAllergens,setManualAllergens]=useState({added:edit?.al||[],removed:[]});
  const autoAllergens=useMemo(()=>{
    const allIngs2=[...ings,...picked.map(p=>p.n)];
    const detected=detectAllergens(allIngs2);
    const pickAl=picked.flatMap(p=>p.al||[]);
    // Include drink allergens
    const drinkAl=includeDrink&&mealDrink?.al?.length?mealDrink.al:[];
    return [...new Set([...detected,...pickAl,...drinkAl])];
  },[ings,picked,includeDrink,mealDrink]);
  const al=useMemo(()=>{
    const base=new Set([...autoAllergens,...manualAllergens.added]);
    manualAllergens.removed.forEach(r=>{if(!autoAllergens.includes(r))base.delete(r)});
    return [...base];
  },[autoAllergens,manualAllergens]);
  const isManualAllergen=(id)=>!autoAllergens.includes(id)&&manualAllergens.added.includes(id);
  const toggleManualAllergen=(id)=>{
    if(autoAllergens.includes(id)){
      setManualAllergens(p=>p.removed.includes(id)?{...p,removed:p.removed.filter(x=>x!==id)}:{...p,removed:[...p.removed,id]});
    } else if(manualAllergens.added.includes(id)){
      setManualAllergens(p=>({...p,added:p.added.filter(x=>x!==id)}));
    } else {
      setManualAllergens(p=>({...p,added:[...p.added,id]}));
    }
  };
  useEffect(()=>{if(edit?.al?.length&&ings.length===0&&picked.length===0){setManualAllergens({added:edit.al,removed:[]})}},[]);// eslint-disable-line

  const tog=(a,s,v)=>s(p=>p.includes(v)?p.filter(x=>x!==v):[...p,v]);

  // Ingredient picker helpers
  const allPickerFoods=[...COMMON_FOODS,...(customFoods||[]).filter(cf=>!COMMON_FOODS.find(f=>f.n.toLowerCase()===cf.n.toLowerCase()))];
  const allCats=[...FOOD_CATS,...((customFoods||[]).length>0?["⭐ Custom"]:[])];
  const pickerFiltered=allPickerFoods.filter(f=>{if(pickerCat&&f.cat!==pickerCat)return false;if(pickerQ){const q=pickerQ.toLowerCase();return f.n.toLowerCase().includes(q)}return true}).sort((a,b)=>{const aCustom=a.cat==="⭐ Custom"?0:1;const bCustom=b.cat==="⭐ Custom"?0:1;return aCustom-bCustom});
  const addPick=(item)=>{if(!picked.find(p=>p.n===item.n)){setPicked(p=>[...p,item]);setPickerQ("")}};
  const rmPick=(name)=>{setPicked(p=>p.filter(x=>x.n!==name))};
  const updatePickAl=(idx,newAl2)=>{setPicked(p=>p.map((x,i)=>i===idx?{...x,al:newAl2}:x))};
  const startCustomIng=()=>{const v=customIng.trim();if(!v)return;const autoAl2=detectAllergens([v]);if(autoAl2.length===0){const item={n:v,cat:"⭐ Custom",al:[]};addPick(item);if(setCustomFoods&&!COMMON_FOODS.find(f=>f.n.toLowerCase()===v.toLowerCase())&&!(customFoods||[]).find(f=>f.n.toLowerCase()===v.toLowerCase())){setCustomFoods(p=>[...p,item])}setCustomIng("")}else{setCustomIngAl(autoAl2);setShowCustomAlPrompt(true)}};
  const confirmCustomIng=()=>{const v=customIng.trim();if(!v)return;const item={n:v,cat:"⭐ Custom",al:[...customIngAl]};addPick(item);if(setCustomFoods&&!COMMON_FOODS.find(f=>f.n.toLowerCase()===v.toLowerCase())&&!(customFoods||[]).find(f=>f.n.toLowerCase()===v.toLowerCase())){setCustomFoods(p=>[...p,item])}setCustomIng("");setCustomIngAl([]);setShowCustomAlPrompt(false)};
  const applyPicked=()=>{if(!picked.length)return;const names=picked.map(p=>p.n);setIngs(p=>[...p,...names]);setPicked([])};
  // Photo handler
  const hPh=async e=>{const f=e.target.files?.[0];if(!f)return;const rd=new FileReader();rd.onload=async ev=>{setPhoto(ev.target.result);if(aiOn){setAz(true);const r=await aiPhoto(ev.target.result.split(",")[1],f.type||"image/jpeg");setAz(false);if(r){if(r.name)setDesc(r.name+(r.description?' — '+r.description:''));if(r.allergens?.length)setManualAllergens(p=>({...p,added:[...new Set([...p.added,...r.allergens])]}));if(r.tags?.length)setTags(p=>[...new Set([...p,...r.tags])]);if(r.mealType&&MT.includes(r.mealType))setMt(r.mealType);if(r.ingredients?.length)setIngs(r.ingredients)}}};rd.readAsDataURL(f)};

  // Auto-suggest meal type from time
  useEffect(()=>{if(edit)return;const hr=parseInt(time?.split(":")[0]||"12");if(hr<10)setMt("Breakfast");else if(hr<14)setMt("Lunch");else if(hr<17)setMt("Snack");else setMt("Dinner")},[time]);// eslint-disable-line

  const violations=checkElim(al);
  const showForm=source!==null; // Show rest of form only after source is picked
  const allIngs=[...ings,...picked.map(p=>p.n)];

  // ═══ SAVE LOGIC ═══
  const buildSaveData=()=>{
    const mealName=desc.trim()||allIngs.slice(0,3).join(", ")||"Unnamed meal";
    const dn=mealDrinkCustomName.trim()||mealDrink?.name;
    const drk=includeDrink&&dn?{name:dn,desc:mealDrinkCustomName.trim()||mealDrink?.desc||dn,al:mealDrink?.al||[],portion:mealDrinkCustomSize.trim()||mealDrinkSize,size:mealDrinkCustomSize.trim()||mealDrinkSize,hydrating:mealDrinkHydrating}:undefined;
    const portionVal=portionMode==="custom"?customPortionText.trim():portion;
    const srcTag=source==="restaurant"?"restaurant":source==="ingredients"||source==="myrecipes"?"homemade":source==="describe"?"described":"other";
    return {desc:mealName,mt,time,date,tags,al:[...new Set([...al,...(drk?.al||[])])],notes:notes.trim(),photo,ings:allIngs,inst,src:srcTag,portion:portionVal,completion,drink:drk,_withMeal:!!drk,_source:source,ingPortions:ingPortions.length?ingPortions:undefined,ts:Date.now()};
  };

  const [saveError,setSaveError]=useState("");

  const doSave=(keepOpen)=>{
    // If editing a recipe and modified, show prompt
    if(selectedRecipe&&recipeModified&&!showRecipeSavePrompt){setShowRecipeSavePrompt(true);return}
    // Require a name if saving to My Foods
    if(saveToFoods&&!desc.trim()){setSaveError("Name your meal to save it to My Recipes, or turn off the save toggle.");return}
    setSaveError("");
    const data=buildSaveData();if(!data)return;
    onSave(data,keepOpen);
    if(saveToFoods&&setMyFoods&&desc.trim()){
      const srcType=source==="describe"?"described":"homemade";
      const newName=desc.trim().split(",").slice(0,3).join(", ").slice(0,50);
      // Check for duplicate name
      const existing=(myFoods||[]).find(f=>(f.name||'').toLowerCase()===newName.toLowerCase()&&f.source!=='drink');
      if(!existing){
        setMyFoods(p=>[...p,{id:Date.now()+99,name:newName,desc:desc.trim(),source:srcType,mt:mt||"Dinner",ings:[...allIngs],al:[...al],tg:[...new Set([...tags,srcType==="homemade"?"Homemade":""])].filter(Boolean),instructions:"",safeStatus:"unknown",favorite:false,ts:Date.now()}]);
      }
    }
    // Save custom drink to library if toggled
    if(saveDrinkToLibrary&&mealDrinkCustomName.trim()&&setMyFoods){
      const dName=mealDrinkCustomName.trim();
      const existingDrink=(myFoods||[]).find(f=>f.source==='drink'&&(f.name||'').toLowerCase()===dName.toLowerCase());
      if(!existingDrink){
        setMyFoods(p=>[...p,{id:Date.now()+200,name:dName,desc:dName,source:'drink',mt:'Drink',al:[],tg:[],safeStatus:'unknown',favorite:false,hydrating:mealDrinkHydrating,defaultSize:mealDrinkCustomSize.trim()||mealDrinkSize||undefined,ts:Date.now()}]);
      }
    }
    if(keepOpen){setDesc("");setPhoto(null);setIngs([]);setInst("");setNotes("");setManualAllergens({added:[],removed:[]});setTags([]);setPortion("");setCustomPortionText("");setCompletion("");setTime(nt());setPicked([]);setSource(null);setIncludeDrink(false);setMealDrink(null);setMealDrinkSize("");setMealDrinkCustomSize("");setMealDrinkCustomName("");setMealDrinkHydrating(true);setSaveToFoods(true);setSaveDrinkToLibrary(false);setIngPortions([]);setSelectedRecipe(null);setRecipeModified(false)}
  };

  const handleRecipeSaveChoice=(choice)=>{
    // choice: "update"|"new"|"onetime"
    const data=buildSaveData();if(!data)return;
    if(choice==="update"&&selectedRecipe&&setMyFoods){
      setMyFoods(p=>p.map(f=>f.id===selectedRecipe.id?{...f,desc:desc.trim(),ings:[...allIngs],al:[...al],tg:[...tags],ts:Date.now()}:f));
    } else if(choice==="new"&&setMyFoods){
      const newName=desc.trim().split(",").slice(0,3).join(", ").slice(0,50);
      const existing=(myFoods||[]).find(f=>(f.name||'').toLowerCase()===newName.toLowerCase());
      const finalName=existing?newName+` (${new Date().toLocaleDateString()})`:newName;
      setMyFoods(p=>[...p,{id:Date.now()+99,name:finalName,desc:desc.trim(),source:"homemade",mt:mt||"Dinner",ings:[...allIngs],al:[...al],tg:[...new Set([...tags,"Homemade"])],instructions:"",safeStatus:"unknown",favorite:false,ts:Date.now()}]);
    }
    // "onetime" = just log, don't save
    onSave(data);
    setShowRecipeSavePrompt(false);
  };

  // Homemade recipes for My Recipes source
  const recipes=(myFoods||[]).filter(f=>f.source==='homemade'||f.source==='described');
  const filteredRecipes=recipes.filter(f=>{if(!recipeSearch)return true;const q=recipeSearch.toLowerCase();return (f.name||'').toLowerCase().includes(q)||(f.desc||'').toLowerCase().includes(q)}).sort((a,b)=>(b.ts||0)-(a.ts||0));

  return (
  <div className="mov" onClick={onClose}><div className="mo" onClick={e=>e.stopPropagation()}>
    <div className="moh"><div className="mot">{edit?"Edit Meal":"Log Meal"}</div><button className="mox" onClick={onClose}>✕</button></div>
    <div className="mob">

      {/* ═══ STEP 1: Always visible — Time, Date, Meal Type, Source ═══ */}
      <div className="fs"><div className="fr"><div><label className="fl">Time</label><input type="time" className="fi" value={time} onChange={e=>setTime(e.target.value)}/></div><div><label className="fl">Date</label><input type="date" className="fi" value={date} onChange={e=>setDate(e.target.value)}/></div></div></div>
      <div className="fs"><label className="fl">Meal Type</label><div className="cg">{MT.filter(t=>t!=="Drink").map(t=><button key={t} className={`ch ${mt===t?'on':''}`} onClick={()=>setMt(t)}>{t}</button>)}</div></div>

      {/* SOURCE PICKER */}
      {!edit&&<div className="fs"><label className="fl">How are you logging this?</label>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
          {[["restaurant","🍔","Restaurant","Pick from a menu"],["myrecipes","🏠","My Recipes","Saved homemade meals"],["barcode","📱","Barcode","Scan packaged food"],["ingredients","🥘","Build It","Add ingredients"]].map(([id,ic,l,sub2])=>
            <button key={id} className={`ch ${source===id?'on':''}`} onClick={()=>setSource(source===id?null:id)} style={{padding:'12px 8px',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:3,minHeight:60}}>
              <span style={{fontSize:22}}>{ic}</span>
              <span style={{fontSize:11,fontWeight:600}}>{l}</span>
              <span style={{fontSize:9,color:'var(--t3)',fontWeight:400}}>{sub2}</span>
            </button>)}
        </div>
        <button className={`mb ${source==='describe'?'':''}` } onClick={()=>setSource(source==="describe"?null:"describe")} style={{width:'100%',textAlign:'center',marginTop:6,color:source==='describe'?'var(--pb)':'var(--t3)',fontSize:11,borderColor:source==='describe'?'var(--accent-border)':'var(--card-border)'}}>{source==='describe'?'✓ Just describing it':'Just describe it (skip source)'}</button>
      </div>}

      {/* ═══ STEP 2: Source-specific UI ═══ */}

      {/* ── RESTAURANT SOURCE ── */}
      {source==="restaurant"&&<div className="fs" style={{background:'var(--c1)',border:'1px solid var(--accent-border)',borderRadius:10,padding:10}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
          <div style={{fontSize:11,fontWeight:600,color:'var(--t1)'}}>🍔 Pick from restaurant</div>
          <button className="mb" onClick={()=>setAddingRest(!addingRest)} style={{fontSize:10,color:'var(--pb)',padding:'4px 8px'}}>{addingRest?'✕ Cancel':'+ New Restaurant'}</button>
        </div>
        {/* Add new restaurant inline */}
        {addingRest&&<div style={{padding:8,background:'var(--pb-t1)',borderRadius:8,marginBottom:8,border:'1px solid var(--pb-t2)'}}>
          <input className="fi" value={newRestName} onChange={e=>setNewRestName(e.target.value)} placeholder="Restaurant name..." style={{marginBottom:4,padding:'6px 8px'}}/>
          <div style={{display:'flex',gap:2,flexWrap:'wrap',marginBottom:4}}>{ICONS.map(ic=><button key={ic} onClick={()=>setNewRestIcon(ic)} style={{width:30,height:30,borderRadius:8,border:`1px solid ${newRestIcon===ic?'var(--accent-border)':'var(--card-border)'}`,background:newRestIcon===ic?'var(--accent-soft)':'var(--c2)',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>{ic}</button>)}</div>
          <button className="bp" onClick={()=>{const nm=newRestName.trim();if(!nm)return;if(!REST[nm]){const upd={...REST,[nm]:{ic:newRestIcon,it:[]}};if(restaurants){}/* setRestaurants handled below */}setMyFoods&&setMyFoods(p=>p);/* trigger save */;const newRest={...REST,[nm]:{ic:newRestIcon,it:[]}};/* We need setRestaurants */;setAddingRest(false);setMenuRest(nm);setNewRestName("");setNewRestIcon("🍽️")}} style={{padding:'8px',fontSize:12}}>Create Restaurant</button>
        </div>}
        <input className="fi" value={menuSearch} onChange={e=>setMenuSearch(e.target.value)} placeholder="Search restaurants or items..." style={{padding:'8px 10px',marginBottom:6}}/>
        <div className="rtb" style={{marginBottom:6}}>{RN.filter(r=>!menuSearch||r.toLowerCase().includes(menuSearch.toLowerCase())||REST[r].it.some(it=>it.n.toLowerCase().includes(menuSearch.toLowerCase()))).map(r=><button key={r} className={`rt ${menuRest===r?'on':''}`} onClick={()=>setMenuRest(menuRest===r?null:r)}>{REST[r].ic} {r}</button>)}</div>
        {menuRest&&<>
          <div className="rm">{(REST[menuRest]?.it||[]).filter(it=>!menuSearch||it.n.toLowerCase().includes(menuSearch.toLowerCase())).map((it,i)=><div key={i} className="ri" onClick={()=>{setDesc(p=>p?`${p}, ${it.n} (${menuRest})`:it.n+` (${menuRest})`);setTags(p=>[...new Set([...p,"Restaurant"])]);if(it.a?.length)setManualAllergens(p=>({...p,added:[...new Set([...p.added,...it.a])]}))}}><span style={{flex:1,fontSize:11.5,color:'var(--t1)'}}>{it.n}</span>{it.a?.length>0&&<div style={{display:'flex',gap:1}}>{it.a.slice(0,4).map((a,j)=>{const al2=AL.find(x=>x.id===a);return <span key={j} className="tg ta" style={{fontSize:8,padding:'0 3px'}}>{al2?.i}</span>})}</div>}</div>)}</div>
          {/* Add menu item inline */}
          <div style={{marginTop:6}}>
            {!addingMenuItem?<button className="mb" onClick={()=>setAddingMenuItem(true)} style={{width:'100%',textAlign:'center',color:'var(--pb)',fontSize:10}}>+ Add menu item to {menuRest}</button>
            :<div style={{padding:8,background:'var(--pb-t1)',borderRadius:8,border:'1px solid var(--pb-t2)'}}>
              <input className="fi" value={newMenuItemName} onChange={e=>setNewMenuItemName(e.target.value)} placeholder="Item name..." style={{marginBottom:4,padding:'6px 8px'}}/>
              <div style={{fontSize:10,color:'var(--t3)',marginBottom:3}}>Allergens:</div>
              <div className="cg" style={{marginBottom:4}}>{AL.map(a=><button key={a.id} className={`ch cha ${newMenuItemAl.includes(a.id)?'on':''}`} onClick={()=>setNewMenuItemAl(p=>p.includes(a.id)?p.filter(x=>x!==a.id):[...p,a.id])} style={{fontSize:9,padding:'3px 7px'}}>{a.i} {a.l}</button>)}</div>
              <div style={{display:'flex',gap:4}}>
                <button className="mb" onClick={()=>{const nm2=newMenuItemName.trim();if(!nm2)return;/* Add to restaurant - need setRestaurants passed through */setNewMenuItemName("");setNewMenuItemAl([]);setAddingMenuItem(false);setDesc(p=>p?`${p}, ${nm2} (${menuRest})`:nm2+` (${menuRest})`);setTags(p=>[...new Set([...p,"Restaurant"])]);if(newMenuItemAl.length)setManualAllergens(p=>({...p,added:[...new Set([...p.added,...newMenuItemAl])]}))}} style={{color:'var(--ok)',flex:1,textAlign:'center'}}>✓ Add & Use</button>
                <button className="mb" onClick={()=>{setAddingMenuItem(false);setNewMenuItemName("");setNewMenuItemAl([])}}>Cancel</button>
              </div>
            </div>}
          </div>
        </>}
      </div>}

      {/* ── MY RECIPES SOURCE ── */}
      {source==="myrecipes"&&<div className="fs" style={{background:'var(--c1)',border:'1px solid var(--ok-t2)',borderRadius:10,padding:10}}>
        <div style={{fontSize:11,fontWeight:600,color:'var(--t1)',marginBottom:6}}>🏠 Pick a saved recipe</div>
        <div className="sb" style={{marginBottom:8,padding:'6px 8px'}}><span style={{fontSize:11}}>🔍</span><input placeholder="Search recipes..." value={recipeSearch} onChange={e=>setRecipeSearch(e.target.value)} style={{fontSize:14}}/></div>
        {selectedRecipe?<div style={{padding:8,background:'var(--ok-t1)',borderRadius:8,border:'1px solid var(--ok-t2)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
            <span style={{fontSize:12,fontWeight:600,color:'var(--ok)'}}>✓ {selectedRecipe.name}</span>
            <button className="mb" onClick={()=>{setSelectedRecipe(null);setDesc("");setIngs([]);setManualAllergens({added:[],removed:[]});setTags([]);setRecipeModified(false)}} style={{fontSize:10,color:'var(--t3)',padding:'3px 8px'}}>Change</button>
          </div>
          <div style={{fontSize:10,color:'var(--t2)'}}>Pre-filled below. Edit any field to customize this time.</div>
        </div>
        :<div style={{maxHeight:250,overflowY:'auto'}}>
          {filteredRecipes.length===0?<div style={{textAlign:'center',padding:16,color:'var(--t3)',fontSize:11}}>No recipes saved yet. Build meals with ingredients and they'll appear here next time.</div>
          :filteredRecipes.map(f=><div key={f.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'var(--c2)',borderRadius:8,marginBottom:4,cursor:'pointer',border:'1px solid var(--pb-t1)'}} onClick={()=>{setSelectedRecipe(f);setDesc(f.desc||f.name||'');setIngs(f.ings||[]);if(f.al?.length)setManualAllergens({added:f.al,removed:[]});setTags(f.tg||[]);setMt(f.mt||mt);setRecipeModified(false)}}>
            <span style={{fontSize:14}}>{f.source==='described'?'📝':'🏠'}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,color:'var(--t1)',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</div>
              {f.ings?.length>0&&<div style={{fontSize:9,color:'var(--t3)'}}>🥘 {f.ings.slice(0,4).join(", ")}{f.ings.length>4?'...':''}</div>}
            </div>
            {f.al?.length>0&&<div style={{display:'flex',gap:1}}>{f.al.slice(0,3).map(a=>{const al3=AL.find(x=>x.id===a);return al3?<span key={a} style={{fontSize:9}}>{al3.i}</span>:null})}</div>}
          </div>)}
        </div>}
      </div>}

      {/* ── BARCODE SOURCE ── */}
      {source==="barcode"&&<div className="fs" style={{background:'var(--c1)',border:'1px solid var(--in-t2)',borderRadius:10,padding:10}}>
        <div style={{fontSize:11,fontWeight:600,color:'var(--t1)',marginBottom:6}}>📱 Scan packaged food</div>
        <button className="mb" onClick={()=>setShowScanner(true)} style={{color:'var(--in)',width:'100%',textAlign:'center',padding:'10px 0',background:'var(--in-t1)',border:'1px solid var(--in-t2)',fontSize:12,marginBottom:6}}>📷 Open Camera Scanner</button>
        <div style={{display:'flex',gap:4,alignItems:'center'}}>
          <input className="fi" value={manualBarcode} onChange={e=>setManualBarcode(e.target.value)} placeholder="Or type barcode number..." style={{flex:1,padding:'6px 8px'}}/>
          <button className="mb" onClick={()=>{/* TODO: lookup barcode via Open Food Facts API */if(manualBarcode.trim())alert('Manual barcode lookup: '+manualBarcode)}} style={{color:'var(--pb)',padding:'6px 10px'}}>Look up</button>
        </div>
        <div style={{fontSize:9,color:'var(--t3)',marginTop:3,textAlign:'center'}}>Camera not working? Type the barcode number from the package</div>
      </div>}

      {/* ── BUILD FROM INGREDIENTS SOURCE ── */}
      {source==="ingredients"&&<div className="fs" style={{background:'var(--c1)',border:'1px solid var(--ok-t2)',borderRadius:10,padding:10}}>
        <div style={{fontSize:11,fontWeight:600,color:'var(--t1)',marginBottom:6}}>🥘 Build from ingredients</div>
        {/* Barcode scanner inside ingredients */}
        <button className="mb" onClick={()=>setIngScannerOpen(true)} style={{color:'var(--in)',width:'100%',textAlign:'center',padding:'6px 0',marginBottom:8,background:'var(--in-t1)',border:'1px solid var(--in-t2)',fontSize:11}}>📷 Scan a packaged ingredient</button>
        {/* Selected */}
        {picked.length>0&&<div style={{marginBottom:8}}>
          <div style={{fontSize:10,fontWeight:600,color:'var(--ok)',marginBottom:4}}>Selected ({picked.length}):</div>
          <div style={{display:'flex',flexDirection:'column',gap:3}}>
            {picked.map((p,i)=>editPickAl===i
              ?<div key={i} style={{padding:6,background:'var(--pb-t1)',border:'1px solid var(--pb-t2)',borderRadius:8}}>
                <div style={{fontSize:10,fontWeight:600,color:'var(--t1)',marginBottom:3}}>Allergens for: {p.n}</div>
                <div className="cg" style={{marginBottom:4}}>{AL.map(a=><button key={a.id} className={`ch cha ${(p.al||[]).includes(a.id)?'on':''}`} onClick={()=>{const cur=p.al||[];const nw=cur.includes(a.id)?cur.filter(x=>x!==a.id):[...cur,a.id];updatePickAl(i,nw)}} style={{fontSize:8,padding:'2px 6px'}}>{a.i} {a.l}</button>)}</div>
                <button className="mb" onClick={()=>setEditPickAl(null)} style={{color:'var(--ok)',fontSize:10}}>✓ Done</button>
              </div>
              :<div key={i} style={{display:'flex',alignItems:'center',gap:3,padding:'3px 8px',background:p.cat==='⭐ Custom'?'var(--ok-t2)':'var(--pb-t1)',border:`1px solid ${p.cat==='⭐ Custom'?'var(--ok-t3)':'var(--pb-t2)'}`,borderRadius:10}}>
                <span style={{fontSize:10,color:p.cat==='⭐ Custom'?'var(--ok)':'var(--t2)',flex:1}}>{p.cat==='⭐ Custom'?'⭐ ':''}{p.n}{p.al?.length>0&&<span style={{fontSize:8,color:'var(--wn)',marginLeft:3}}>({p.al.map(a=>AL.find(x=>x.id===a)?.i||'').join(' ')})</span>}</span>
                <button onClick={()=>setEditPickAl(i)} style={{background:'none',border:'none',color:'var(--pb)',cursor:'pointer',fontSize:9,padding:'0 3px'}}>✏️</button>
                <button onClick={()=>rmPick(p.n)} style={{background:'none',border:'none',color:'var(--er)',cursor:'pointer',fontSize:10,padding:0}}>✕</button>
              </div>
            )}
          </div>
          <button className="mb" onClick={()=>{applyPicked()}} style={{color:'var(--ok)',width:'100%',textAlign:'center',fontWeight:600,marginTop:6}}>✓ Add to Meal</button>
        </div>}
        {/* Search + browse */}
        <div style={{display:'flex',gap:4,marginBottom:6}}>
          <div className="sb" style={{flex:1,marginBottom:0,padding:'6px 8px'}}><span style={{fontSize:11}}>🔍</span><input placeholder="Search ingredients..." value={pickerQ} onChange={e=>setPickerQ(e.target.value)} style={{fontSize:14}}/></div>
        </div>
        <div style={{display:'flex',gap:2,marginBottom:6,overflowX:'auto',paddingBottom:2}}>
          <button className={`ch ${!pickerCat?'on':''}`} onClick={()=>setPickerCat(null)} style={{fontSize:9,padding:'3px 8px',whiteSpace:'nowrap'}}>All</button>
          {allCats.map(c=><button key={c} className={`ch ${pickerCat===c?'on':''}`} onClick={()=>setPickerCat(pickerCat===c?null:c)} style={{fontSize:9,padding:'3px 8px',whiteSpace:'nowrap'}}>{c}</button>)}
        </div>
        <div style={{maxHeight:180,overflowY:'auto',display:'flex',flexWrap:'wrap',gap:3}}>
          {pickerFiltered.slice(0,40).map((f,i)=>{const isPicked=picked.some(p2=>p2.n===f.n);const isCustom=f.cat==='⭐ Custom';return <button key={i} onClick={()=>isPicked?rmPick(f.n):addPick(f)} style={{padding:'5px 9px',borderRadius:10,border:`1px solid ${isPicked?'var(--ok-t3)':isCustom?'var(--ok-t2)':'var(--pb-t2)'}`,background:isPicked?'var(--ok-t2)':isCustom?'var(--ok-t1)':'var(--c2)',color:isPicked?'var(--ok)':isCustom?'var(--ok)':'var(--t2)',fontSize:10.5,cursor:'pointer',fontFamily:'DM Sans',minHeight:32}}>{isPicked?"✓ ":isCustom?"⭐ ":""}{f.n}{f.al?.length>0&&<span style={{fontSize:8,color:'var(--wn)',marginLeft:2}}>⚠️</span>}</button>})}
          {pickerFiltered.length===0&&pickerQ&&<div style={{padding:8,fontSize:11,color:'var(--t3)',textAlign:'center',width:'100%'}}>No matches — add it as custom below</div>}
        </div>
        {/* Custom ingredient */}
        {!showCustomAlPrompt?<div style={{display:'flex',gap:4,marginTop:6}}>
          <input className="fi" value={customIng} onChange={e=>setCustomIng(e.target.value)} placeholder="Custom ingredient..." onKeyDown={e=>e.key==="Enter"&&startCustomIng()} style={{flex:1,padding:'6px 8px'}}/>
          <button className="mb" onClick={startCustomIng} style={{color:'var(--ok)',padding:'4px 10px'}}>+ Add</button>
        </div>
        :<div style={{marginTop:6,padding:8,background:'var(--ok-t1)',border:'1px solid var(--ok-t2)',borderRadius:8}}>
          <div style={{fontSize:11,fontWeight:600,color:'var(--ok)',marginBottom:4}}>Adding: {customIng}</div>
          <div style={{fontSize:10,color:'var(--t3)',marginBottom:4}}>Tap any allergens this contains:</div>
          <div className="cg" style={{marginBottom:6}}>{AL.map(a=><button key={a.id} className={`ch cha ${customIngAl.includes(a.id)?'on':''}`} onClick={()=>setCustomIngAl(p=>p.includes(a.id)?p.filter(x=>x!==a.id):[...p,a.id])} style={{fontSize:9,padding:'3px 7px'}}>{a.i} {a.l}</button>)}</div>
          <div style={{display:'flex',gap:4}}>
            <button className="mb" onClick={confirmCustomIng} style={{color:'var(--ok)',flex:1,textAlign:'center'}}>✓ Add{customIngAl.length>0?` (${customIngAl.length})`:""}</button>
            <button className="mb" onClick={()=>{setShowCustomAlPrompt(false);setCustomIngAl([])}}>Cancel</button>
          </div>
        </div>}
      </div>}

      {/* ── DESCRIBE SOURCE ── */}
      {source==="describe"&&<div className="fs" style={{background:'var(--c1)',border:'1px solid var(--wn-t2)',borderRadius:10,padding:10}}>
        <div style={{fontSize:11,color:'var(--wn)',marginBottom:4}}>📝 Quick log — allergens won't auto-detect from ingredients</div>
      </div>}

      {/* ═══ STEP 3: Rest of form (only after source picked) ═══ */}
      {showForm&&<>
        {/* WHAT DID YOU EAT */}
        <div className="fs"><label className="fl">Meal / Recipe Name</label>
          <textarea className="fta" value={desc} onChange={e=>{setDesc(e.target.value);if(selectedRecipe)setRecipeModified(true)}} placeholder={source==="restaurant"?"e.g. Wendy's lunch, Chipotle bowl...":source==="describe"?"e.g. Leftovers, Quick snack...":"e.g. Chicken stir fry, Tuesday dinner..."} style={{minHeight:50}}/>
        </div>

        {/* DRINK TOGGLE */}
        <div className="fs">
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div className={`tt ${includeDrink?'on':''}`} onClick={()=>{setIncludeDrink(!includeDrink);if(!includeDrink){setMealDrink(null);setMealDrinkCustomName("");setMealDrinkHydrating(true)}}}><div className="tth"/></div>
            <div style={{fontSize:12,color:'var(--t1)'}}>🥤 Includes a drink?</div>
          </div>
          {includeDrink&&<div style={{marginTop:8,padding:8,background:'var(--in-t1)',borderRadius:8,border:'1px solid var(--in-t2)'}}>
            <div style={{display:'flex',gap:3,flexWrap:'wrap',marginBottom:4}}>
              {drinkItems.filter(d=>d.favorite).map((d,i)=><button key={i} className={`ch ${mealDrink?.name===d.name&&!mealDrinkCustomName?'on':''}`} onClick={()=>{setMealDrink(d);setMealDrinkSize(d.defaultSize||'');setMealDrinkHydrating(d.hydrating!==false);setMealDrinkCustomName("")}} style={{fontSize:10,padding:'5px 10px'}}>{d.name}{d.hydrating?' 💧':''}</button>)}
              {drinkItems.filter(d=>!d.favorite).map((d,i)=><button key={`o${i}`} className={`ch ${mealDrink?.name===d.name&&!mealDrinkCustomName?'on':''}`} onClick={()=>{setMealDrink(d);setMealDrinkSize(d.defaultSize||'');setMealDrinkHydrating(d.hydrating!==false);setMealDrinkCustomName("")}} style={{fontSize:9,padding:'4px 8px',opacity:0.7}}>{d.name}</button>)}
            </div>
            <input className="fi" value={mealDrinkCustomName} onChange={e=>{setMealDrinkCustomName(e.target.value);if(e.target.value)setMealDrink(null)}} placeholder="Or type a custom drink..." style={{padding:'5px 8px',marginBottom:6}}/>
            {(mealDrink||mealDrinkCustomName)&&<>
              <div style={{display:'flex',gap:3,flexWrap:'wrap',marginBottom:4}}>{DSZ.map(s=><button key={s} className={`ch ${mealDrinkSize===s&&!mealDrinkCustomSize?'on':''}`} onClick={()=>{setMealDrinkSize(s);setMealDrinkCustomSize("")}} style={{fontSize:9,padding:'4px 8px'}}>{s}</button>)}</div>
              <input className="fi" value={mealDrinkCustomSize} onChange={e=>{setMealDrinkCustomSize(e.target.value);setMealDrinkSize("")}} placeholder="Custom size..." style={{padding:'5px 8px',marginBottom:6}}/>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div className={`tt ${mealDrinkHydrating?'on':''}`} onClick={()=>setMealDrinkHydrating(!mealDrinkHydrating)}><div className="tth"/></div>
                <div style={{fontSize:11,color:'var(--t1)'}}>💧 Counts toward hydration</div>
              </div>
              {/* Drink allergens */}
              {mealDrink?.al?.length>0&&<div style={{marginTop:6,fontSize:10,color:'var(--wn)'}}>⚠️ Contains: {mealDrink.al.map(a=>{const al2=AL.find(x=>x.id===a);return al2?al2.l:a}).join(", ")}</div>}
              {/* Save custom drink to library */}
              {mealDrinkCustomName.trim()&&<div style={{display:'flex',alignItems:'center',gap:8,marginTop:6}}>
                <div className={`tt ${saveDrinkToLibrary?'on':''}`} onClick={()=>setSaveDrinkToLibrary(!saveDrinkToLibrary)}><div className="tth"/></div>
                <div style={{fontSize:10,color:'var(--t3)'}}>Save to My Drinks</div>
              </div>}
            </>}
          </div>}
        </div>

        {/* RESULT BOX */}
        {(allIngs.length>0||al.length>0||(includeDrink&&(mealDrink||mealDrinkCustomName)))&&<div className="fs" style={{background:'var(--c1)',border:'1px solid var(--card-border)',borderRadius:10,padding:10}}>
          <div style={{fontSize:11,fontWeight:600,color:'var(--t1)',marginBottom:6}}>📋 Meal Summary</div>
          {allIngs.length>0&&<div style={{marginBottom:6}}>
            <div style={{fontSize:10,color:'var(--t3)',marginBottom:3}}>Ingredients:</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:3}}>{allIngs.map((ing,i)=><span key={i} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 7px',background:'var(--c2)',borderRadius:10,fontSize:10,color:'var(--t2)',border:'1px solid var(--pb-t1)'}}>{ing}<button style={{background:'none',border:'none',color:'var(--er)',cursor:'pointer',fontSize:10,padding:0}} onClick={()=>{if(i<ings.length){setIngs(p=>p.filter((_,j)=>j!==i));if(selectedRecipe)setRecipeModified(true)}else{rmPick(ing)}}}>✕</button></span>)}</div>
          </div>}
          {al.length>0&&<div style={{marginBottom:6}}>
            <div style={{fontSize:10,color:'var(--t3)',marginBottom:3}}>Allergens:</div>
            <div className="cg">{al.map(a=>{const al2=AL.find(x=>x.id===a);const manual=isManualAllergen(a);return al2?<span key={a} className="tg ta" style={manual?{borderStyle:'dashed'}:{}}>{al2.i} {al2.l}{manual&&<span style={{marginLeft:3,fontSize:8}}>⚠️</span>}</span>:null})}</div>
          </div>}
          {includeDrink&&(mealDrink||mealDrinkCustomName)&&<div><span style={{fontSize:9.5,padding:'2px 6px',borderRadius:6,background:'var(--in-t1)',color:'var(--in)'}}>🥤 {mealDrinkCustomName||mealDrink?.name}{(mealDrinkCustomSize||mealDrinkSize)?' ('+(mealDrinkCustomSize||mealDrinkSize)+')':''}</span></div>}
          {violations.length>0&&<div style={{padding:'4px 8px',background:'var(--er-t1)',borderRadius:6,marginTop:5,fontSize:10.5,color:'var(--er)'}}>⚠️ Contains eliminated: {violations.map(v=>AL.find(a=>a.id===v)?.l).join(", ")}</div>}
        </div>}

        {/* ALLERGEN OVERRIDES */}
        <div className="fs"><label className="fl">⚠️ Allergens</label>
          <div className="cg">{AL.map(a=>{const isOn=al.includes(a.id);const manual=isManualAllergen(a.id);return <button key={a.id} className={`ch cha ${isOn?'on':''}`} onClick={()=>toggleManualAllergen(a.id)} style={manual?{borderStyle:'dashed'}:{}}>{a.i} {a.l}{manual&&<span style={{marginLeft:2,fontSize:8}}>⚠️</span>}</button>})}</div>
          {manualAllergens.added.filter(a=>!autoAllergens.includes(a)).length>0&&<div style={{fontSize:9,color:'var(--wn)',marginTop:3}}>⚠️ Dashed = manually added, may not match ingredients</div>}
        </div>

        {/* PORTION SIZE */}
        <div className="fs"><label className="fl">🍽️ Portion Size</label>
          <div style={{display:'flex',gap:4,marginBottom:4}}>
            {["Full Meal","Half"].map(p=><button key={p} className={`ch ${portion===p&&portionMode==="simple"?'on':''}`} onClick={()=>{setPortion(portion===p?"":p);setPortionMode("simple");setCustomPortionText("")}} style={{fontSize:10,flex:1,textAlign:'center'}}>{p}</button>)}
            <button className={`ch ${portionMode==="custom"?'on':''}`} onClick={()=>setPortionMode(portionMode==="custom"?"simple":"custom")} style={{fontSize:10,flex:1,textAlign:'center'}}>Custom</button>
          </div>
          {portionMode==="custom"&&<div style={{marginTop:4}}>
            <input className="fi" value={customPortionText} onChange={e=>setCustomPortionText(e.target.value)} placeholder={'e.g. 1 slice of 12" pizza, 1 cup rice...'} style={{padding:'6px 8px',marginBottom:4}}/>
            {allIngs.length>0&&<div>
              <div style={{fontSize:10,color:'var(--t3)',marginBottom:3}}>Or per ingredient:</div>
              {allIngs.map((ing,i)=>{const existing=ingPortions.find(ip=>ip.ing===ing);return <div key={i} style={{display:'flex',gap:4,alignItems:'center',marginBottom:3}}>
                <span style={{fontSize:10,color:'var(--t2)',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ing}</span>
                <input className="fi" value={existing?.amount||""} onChange={e=>{const v=e.target.value;setIngPortions(p=>{const idx=p.findIndex(ip=>ip.ing===ing);if(idx>=0)return p.map((ip,j)=>j===idx?{...ip,amount:v}:ip);return[...p,{ing,amount:v,unit:""}]})}} placeholder="Amt" style={{width:50,padding:'4px 6px',fontSize:12}}/>
                <input className="fi" value={existing?.unit||""} onChange={e=>{const v=e.target.value;setIngPortions(p=>{const idx=p.findIndex(ip=>ip.ing===ing);if(idx>=0)return p.map((ip,j)=>j===idx?{...ip,unit:v}:ip);return[...p,{ing,amount:"",unit:v}]})}} placeholder="Unit" style={{width:50,padding:'4px 6px',fontSize:12}}/>
              </div>})}
            </div>}
          </div>}
        </div>

        {/* HOW MUCH DID YOU FINISH */}
        <div className="fs"><label className="fl">✅ How much did you finish?</label>
          <div style={{display:'flex',gap:4}}>
            {[["Finished","var(--ok)"],["Over Half","var(--in)"],["Partial","var(--wn)"],["A few bites","var(--er)"]].map(([c,col])=><button key={c} className={`ch ${completion===c?'on':''}`} onClick={()=>setCompletion(completion===c?"":c)} style={completion===c?{fontSize:10,flex:1,textAlign:'center',background:`${col}18`,color:col,borderColor:col}:{fontSize:10,flex:1,textAlign:'center'}}>{c}</button>)}
          </div>
        </div>

        {/* MORE OPTIONS */}
        <div className="fs">
          <button className="mb" onClick={()=>setShowMore(!showMore)} style={{width:'100%',textAlign:'center',color:'var(--t3)',fontSize:11}}>{showMore?"▲ Hide More Options":"▼ More Options (Tags, Photo, Notes)"}</button>
          {showMore&&<div style={{marginTop:8}}>
            <div className="fs"><label className="fl">Tags</label><div className="cg">{FTAGS.map(t=><button key={t} className={`ch ${tags.includes(t)?'on':''}`} onClick={()=>tog(tags,setTags,t)}>{t}</button>)}</div></div>
            <div className="fs"><label className="fl">Photo</label>{photo?<div className="ppc"><img src={photo} className="pp" alt=""/><button className="prm" onClick={()=>setPhoto(null)}>✕</button></div>:<div className="pua" onClick={()=>fr.current?.click()}><div style={{fontSize:24}}>📸</div><div style={{fontSize:10.5,color:'var(--t3)'}}>Add meal photo</div></div>}<input ref={fr} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={hPh}/>{az&&<div className="aiz"><div className="spn"/>Analyzing...</div>}</div>
            <div className="fs"><label className="fl">Notes</label><textarea className="fta" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Extra details..." style={{minHeight:44}}/></div>
          </div>}
        </div>

        {/* SAVE TO MY FOODS + LOG */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
          <div className={`tt ${saveToFoods?'on':''}`} onClick={()=>{setSaveToFoods(!saveToFoods);setSaveError("")}}><div className="tth"/></div>
          <div style={{fontSize:11,color:'var(--t1)'}}>📦 Save to My Recipes for next time</div>
        </div>

        {saveError&&<div style={{padding:'6px 10px',background:'var(--er-t1)',border:'1px solid var(--er-t2)',borderRadius:8,marginBottom:8,fontSize:11,color:'var(--er)'}}>{saveError}</div>}

        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <button className="bp" style={{flex:1,minWidth:120}} onClick={()=>doSave()}>{edit?"Update":"Log Meal"}</button>
          {!edit&&<button className="mb" style={{color:'var(--pb)',padding:'10px 14px',fontSize:12,fontWeight:600}} onClick={()=>doSave(true)}>+ Another</button>}
        </div>

        {/* RECIPE SAVE PROMPT */}
        {showRecipeSavePrompt&&<div style={{marginTop:10,padding:12,background:'var(--c1)',border:'1px solid var(--accent-border)',borderRadius:10}}>
          <div style={{fontSize:12,fontWeight:600,color:'var(--t1)',marginBottom:6}}>You modified "{selectedRecipe?.name}"</div>
          <div style={{fontSize:11,color:'var(--t2)',marginBottom:8}}>What would you like to do with the changes?</div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            <button className="mb" onClick={()=>handleRecipeSaveChoice("update")} style={{color:'var(--ok)',textAlign:'center',padding:'10px'}}>✓ Update existing recipe</button>
            <button className="mb" onClick={()=>handleRecipeSaveChoice("new")} style={{color:'var(--pb)',textAlign:'center',padding:'10px'}}>📝 Save as new recipe</button>
            <button className="mb" onClick={()=>handleRecipeSaveChoice("onetime")} style={{color:'var(--t3)',textAlign:'center',padding:'10px'}}>Just log this time</button>
          </div>
        </div>}
      </>}
    </div>

    {/* BARCODE SCANNERS */}
    {showScanner&&<BarcodeScanner onClose={()=>setShowScanner(false)} onSelect={(prod)=>{
      setDesc(p=>p?`${p}, ${prod.desc}`:prod.desc);
      if(prod.al?.length)setManualAllergens(p=>({...p,added:[...new Set([...p.added,...prod.al])]}));
      if(prod.ings?.length)setIngs(p=>[...p,...prod.ings]);
      if(prod.tags?.length)setTags(p=>[...new Set([...p,...prod.tags])]);
      setShowScanner(false);
    }} />}
    {ingScannerOpen&&<BarcodeScanner onClose={()=>setIngScannerOpen(false)} onSelect={(prod)=>{
      if(prod.ings?.length){prod.ings.forEach(ing=>addPick({n:ing,cat:"Scanned",al:[]}))}
      else if(prod.desc){addPick({n:prod.desc,cat:"Scanned",al:prod.al||[]})}
      if(prod.al?.length)setManualAllergens(p=>({...p,added:[...new Set([...p.added,...prod.al])]}));
      setIngScannerOpen(false);
    }} />}
  </div></div>);
}

/* ═══ AUTH MODAL ═══ */
function AuthModal({user,onClose}){
  const [mode,setMode]=useState('signin'); // signin, signup
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);

  const handleGoogle=async()=>{
    setLoading(true);setErr("");
    try{await signInWithGoogle();onClose()}
    catch(e){setErr(e.message)}
    setLoading(false);
  };
  const handleEmail=async()=>{
    if(!email||!pass){setErr("Enter email and password");return}
    if(pass.length<6){setErr("Password must be at least 6 characters");return}
    setLoading(true);setErr("");
    try{
      if(mode==='signup')await signUpEmail(email,pass);
      else await signInEmail(email,pass);
      onClose();
    }catch(e){
      const msg=e.code==='auth/user-not-found'?'No account found — try Sign Up'
        :e.code==='auth/wrong-password'?'Wrong password'
        :e.code==='auth/email-already-in-use'?'Email already registered — try Sign In'
        :e.code==='auth/invalid-email'?'Invalid email address'
        :e.message;
      setErr(msg);
    }
    setLoading(false);
  };

  if(user) return (
  <div className="mov" onClick={onClose}><div className="mo" onClick={e=>e.stopPropagation()}>
    <div className="moh"><div className="mot">Account</div><button className="mox" onClick={onClose}>✕</button></div>
    <div className="mob" style={{textAlign:'center'}}>
      <div style={{width:56,height:56,borderRadius:'50%',background:'var(--ok-t2)',border:'2px solid var(--ok-t3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,margin:'0 auto 12px',color:'var(--ok)'}}>{user.displayName?user.displayName[0].toUpperCase():'✓'}</div>
      <div style={{fontSize:16,fontWeight:600,color:'var(--t1)',marginBottom:4}}>{user.displayName||'Signed In'}</div>
      <div style={{fontSize:12,color:'var(--t3)',marginBottom:16}}>{user.email}</div>
      <div style={{fontSize:11,color:'var(--t2)',marginBottom:16,padding:'8px 12px',background:'var(--c1)',borderRadius:8,border:'1px solid var(--card-border)'}}>Sync your data in More → Settings → Cloud Sync</div>
      <button className="mb" onClick={async()=>{await logOut();onClose()}} style={{color:'var(--er)',width:'100%',textAlign:'center'}}>Sign Out</button>
    </div>
  </div></div>);

  return (
  <div className="mov" onClick={onClose}><div className="mo" onClick={e=>e.stopPropagation()}>
    <div className="moh"><div className="mot">{mode==='signup'?'Create Account':'Sign In'}</div><button className="mox" onClick={onClose}>✕</button></div>
    <div className="mob">
      <div style={{fontSize:12,color:'var(--t2)',marginBottom:16,lineHeight:1.5}}>Sign in to sync your GutCheck data between devices. Your data stays on this device — an account just adds cloud backup.</div>
      <button className="mb" onClick={handleGoogle} disabled={loading} style={{width:'100%',textAlign:'center',padding:'12px',marginBottom:12,color:'var(--t1)',fontSize:13,fontWeight:600}}>
        {loading?'Signing in...':'Sign in with Google'}
      </button>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
        <div style={{flex:1,height:1,background:'var(--card-border)'}}/>
        <span style={{fontSize:10,color:'var(--t3)'}}>or</span>
        <div style={{flex:1,height:1,background:'var(--card-border)'}}/>
      </div>
      <div className="fs"><label className="fl">Email</label><input className="fi" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@email.com"/></div>
      <div className="fs"><label className="fl">Password</label><input className="fi" type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder={mode==='signup'?'Min 6 characters':'Password'} onKeyDown={e=>e.key==="Enter"&&handleEmail()}/></div>
      {err&&<div style={{fontSize:11,color:'var(--er)',marginBottom:10,padding:'6px 8px',background:'var(--er-t1)',borderRadius:6,border:'1px solid var(--er-t2)'}}>{err}</div>}
      <button className="bp" onClick={handleEmail} disabled={loading}>{loading?'...':(mode==='signup'?'Create Account':'Sign In')}</button>
      <button className="mb" onClick={()=>{setMode(mode==='signup'?'signin':'signup');setErr("")}} style={{width:'100%',textAlign:'center',marginTop:8,color:'var(--pb)',fontSize:12}}>
        {mode==='signup'?'Already have an account? Sign In':'Need an account? Sign Up'}
      </button>
    </div>
  </div></div>);
}
