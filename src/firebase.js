/**
 * firebase.js — Firebase Authentication & Firestore Sync for GutCheck
 *
 * Provides:
 *   - Email + password auth (sign in / sign up / sign out)
 *   - Per-blob Firestore sync under /users/{uid}/blobs/{key} (Slice 2)
 *   - Legacy syncUpload/syncDownload shims that decompose/recompose the
 *     getAllData() flat shape over the per-blob paths
 *   - Auth state listener
 *
 * Blob keys mirror the 5 IndexedDB keys from src/db.js:
 *   config | meals | syms | medical | library
 *
 * On the wire each doc is { value, _writtenAt: serverTimestamp(), _deviceTs }
 * so we can do per-blob last-write-wins later if needed. _deviceTs is the
 * uploader's local Date.now() — useful for diagnostics.
 *
 * Photos are stripped from meals/syms before upload (Firestore doc size
 * limit is 1 MB; base64 photos blow past that fast). Photo sync would
 * require Firebase Storage — out of scope for Slice 2.
 *
 * Config comes from Vite env vars (VITE_FIREBASE_*). See .env.example.
 * The app works fully offline without Firebase: if env vars are missing,
 * isFirebaseReady() returns false and all auth/sync surfaces stay hidden.
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  initializeFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const isConfigured = !!firebaseConfig.apiKey && !!firebaseConfig.projectId;

let app, auth, db;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // ignoreUndefinedProperties: silently strip undefined fields rather than
  // throwing. Meal/symptom objects can have undefined optional fields that
  // would otherwise reject the entire blob write.
  db = initializeFirestore(app, { ignoreUndefinedProperties: true });
}

// ═══ AUTH FUNCTIONS ═══

export const signInEmail = async (email, password) => {
  if (!isConfigured) throw new Error('Firebase not configured');
  return signInWithEmailAndPassword(auth, email, password);
};

export const signUpEmail = async (email, password) => {
  if (!isConfigured) throw new Error('Firebase not configured');
  return createUserWithEmailAndPassword(auth, email, password);
};

export const logOut = async () => {
  if (!isConfigured) return;
  return signOut(auth);
};

export const onAuthChange = (callback) => {
  if (!isConfigured) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
};

export const getCurrentUser = () => {
  if (!isConfigured) return null;
  return auth?.currentUser || null;
};

export const isFirebaseReady = () => isConfigured;

// ═══ PER-BLOB SYNC (Slice 2) ═══

export const BLOB_KEYS = ['config', 'meals', 'syms', 'medical', 'library'];

/**
 * stripBlob — remove non-syncable fields from a blob before upload.
 * Currently strips photos from meals/syms (too big for Firestore).
 * Exported so callers can hash the same form for dedupe.
 */
export const stripBlob = (key, value) => {
  // Firestore rejects undefined fields, so omit `photo` rather than setting it to undefined.
  if (key === 'meals') return (value || []).map(({ photo, ...rest }) => rest);
  if (key === 'syms')  return (value || []).map(({ photo, ...rest }) => rest);
  return value;
};

const blobDoc = (uid, key) => doc(db, 'users', uid, 'blobs', key);

export const syncBlobUp = async (key, value) => {
  if (!isConfigured || !auth?.currentUser) return false;
  if (!BLOB_KEYS.includes(key)) {
    console.warn('syncBlobUp: unknown blob key', key);
    return false;
  }
  try {
    const uid = auth.currentUser.uid;
    const stripped = stripBlob(key, value);
    await setDoc(blobDoc(uid, key), {
      value: stripped ?? null,
      _writtenAt: serverTimestamp(),
      _deviceTs: Date.now(),
    });
    return true;
  } catch (e) {
    console.error('syncBlobUp failed:', key, e);
    return false;
  }
};

export const syncBlobDown = async (key) => {
  if (!isConfigured || !auth?.currentUser) return null;
  if (!BLOB_KEYS.includes(key)) return null;
  try {
    const uid = auth.currentUser.uid;
    const snap = await getDoc(blobDoc(uid, key));
    if (!snap.exists()) return null;
    const data = snap.data();
    return { value: data.value, deviceTs: data._deviceTs || 0 };
  } catch (e) {
    console.error('syncBlobDown failed:', key, e);
    return null;
  }
};

/** syncAllUp — write all 5 blobs in one batch. blobs is { config, meals, syms, medical, library }. */
export const syncAllUp = async (blobs) => {
  if (!isConfigured || !auth?.currentUser) return false;
  try {
    const uid = auth.currentUser.uid;
    const batch = writeBatch(db);
    const ts = Date.now();
    BLOB_KEYS.forEach(key => {
      const value = stripBlob(key, blobs[key]);
      batch.set(blobDoc(uid, key), {
        value: value ?? null,
        _writtenAt: serverTimestamp(),
        _deviceTs: ts,
      });
    });
    await batch.commit();
    return true;
  } catch (e) {
    console.error('syncAllUp failed:', e);
    return false;
  }
};

/** syncAllDown — read all 5 blobs. Returns { config, meals, syms, medical, library } or null if no docs exist. */
export const syncAllDown = async () => {
  if (!isConfigured || !auth?.currentUser) return null;
  try {
    const uid = auth.currentUser.uid;
    const snaps = await Promise.all(BLOB_KEYS.map(key => getDoc(blobDoc(uid, key))));
    const anyExists = snaps.some(s => s.exists());
    if (!anyExists) return null;
    const out = {};
    BLOB_KEYS.forEach((key, i) => {
      out[key] = snaps[i].exists() ? snaps[i].data().value : null;
    });
    return out;
  } catch (e) {
    console.error('syncAllDown failed:', e);
    return null;
  }
};

// ═══ LEGACY SHIMS — preserve manual Upload/Download buttons ═══
//
// getAllData() returns a flat object with all fields. We decompose it into
// the 5 blob shapes for upload, and recompose on download into that same
// flat shape so loadAllData() can apply it.

const flatToBlobs = (allData) => ({
  config: {
    pin: allData.pin,
    aiOn: allData.aiOn,
    phase: allData.phase,
    elimFoods: allData.elimFoods,
    elimStart: allData.elimStart,
    reintroFood: allData.reintroFood,
    reintroStart: allData.reintroStart,
    customSymptoms: allData.customSymptoms,
    hydrationGoal: allData.hydrationGoal,
    pinnedQuickSyms: allData.pinnedQuickSyms,
    schemaVersion: allData._schemaVersion,
    restaurantDbVersion: allData.restaurantDbVersion,
  },
  meals: allData.meals || [],
  syms: allData.syms || [],
  medical: {
    procs: allData.procs || [],
    meds: allData.meds || [],
    dxs: allData.dxs || [],
    labs: allData.labs || [],
  },
  library: {
    myFoods: allData.myFoods || [],
    dn: allData.dn || {},
    water: allData.water || {},
    medLog: allData.medLog || {},
    restaurants: allData.restaurants,
    customFoods: allData.customFoods || [],
    weightLog: allData.weightLog || [],
  },
});

const blobsToFlat = (blobs) => ({
  ...(blobs.config || {}),
  ...(blobs.medical || {}),
  ...(blobs.library || {}),
  meals: blobs.meals || [],
  syms: blobs.syms || [],
});

export const syncUpload = async (allData) => {
  return syncAllUp(flatToBlobs(allData));
};

export const syncDownload = async () => {
  const blobs = await syncAllDown();
  if (!blobs) return null;
  return blobsToFlat(blobs);
};

export { auth, db };
