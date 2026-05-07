/**
 * firebase.js — Firebase Authentication & Firestore Sync for GutCheck
 *
 * Provides:
 *   - Email + password auth (sign in / sign up / sign out)
 *   - Firestore single-doc sync (legacy — Slice 2 will replace with /users/{uid}/{collection}/...)
 *   - Auth state listener
 *
 * Config comes from Vite env vars (VITE_FIREBASE_*). See .env.example for the
 * required keys. .env.local holds the real values for local dev; CI injects
 * the same vars from GitHub Actions secrets at build time.
 *
 * The app works fully offline without Firebase. If env vars are missing,
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
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
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
  db = getFirestore(app);
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

// ═══ FIRESTORE SYNC (legacy single-doc — Slice 2 will replace) ═══

export const syncUpload = async (data) => {
  if (!isConfigured || !auth?.currentUser) return false;
  try {
    const uid = auth.currentUser.uid;
    const cleanData = {
      ...data,
      meals: (data.meals || []).map(m => ({ ...m, photo: undefined })),
      syms: (data.syms || []).map(s => ({ ...s, photo: undefined })),
      _syncedAt: serverTimestamp(),
      _syncVersion: 'gc-sync-v1',
    };
    await setDoc(doc(db, 'users', uid), cleanData, { merge: false });
    return true;
  } catch (e) {
    console.error('Sync upload failed:', e);
    return false;
  }
};

export const syncDownload = async () => {
  if (!isConfigured || !auth?.currentUser) return null;
  try {
    const uid = auth.currentUser.uid;
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const data = snap.data();
      delete data._syncedAt;
      delete data._syncVersion;
      return data;
    }
    return null;
  } catch (e) {
    console.error('Sync download failed:', e);
    return null;
  }
};

export const isFirebaseReady = () => isConfigured;

export { auth, db };
