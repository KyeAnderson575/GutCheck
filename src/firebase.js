/**
 * firebase.js — Firebase Authentication & Firestore Sync for GutCheck
 *
 * Provides:
 *   - Google sign-in / email-password auth
 *   - Firestore sync (upload/download user data)
 *   - Auth state listener
 *
 * Setup required:
 *   1. Create a Firebase project at https://console.firebase.google.com
 *   2. Enable Authentication → Google & Email/Password
 *   3. Create a Firestore database
 *   4. Replace the firebaseConfig below with your project's config
 *   5. npm install firebase
 *
 * The app works fully offline without Firebase. Auth is optional —
 * signing in enables cloud sync between devices.
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
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

// ═══ FIREBASE CONFIG ═══
// REPLACE THIS with your Firebase project config from:
// Firebase Console → Project Settings → Your apps → Config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Check if Firebase is configured (not placeholder values)
const isConfigured = !firebaseConfig.apiKey.startsWith('YOUR_');

let app, auth, db;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

// ═══ AUTH FUNCTIONS ═══

/** Sign in with Google popup */
export const signInWithGoogle = async () => {
  if (!isConfigured) throw new Error('Firebase not configured');
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
};

/** Sign in with email + password */
export const signInEmail = async (email, password) => {
  if (!isConfigured) throw new Error('Firebase not configured');
  return signInWithEmailAndPassword(auth, email, password);
};

/** Create account with email + password */
export const signUpEmail = async (email, password) => {
  if (!isConfigured) throw new Error('Firebase not configured');
  return createUserWithEmailAndPassword(auth, email, password);
};

/** Sign out */
export const logOut = async () => {
  if (!isConfigured) return;
  return signOut(auth);
};

/** Listen for auth state changes */
export const onAuthChange = (callback) => {
  if (!isConfigured) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
};

/** Get current user */
export const getCurrentUser = () => {
  if (!isConfigured) return null;
  return auth?.currentUser || null;
};

// ═══ FIRESTORE SYNC ═══

/**
 * Upload all user data to Firestore.
 * Stored as a single document per user for simplicity.
 * Photos (base64) are excluded to stay under Firestore's 1MB doc limit.
 */
export const syncUpload = async (data) => {
  if (!isConfigured || !auth?.currentUser) return false;
  try {
    const uid = auth.currentUser.uid;

    // Strip photos to stay under Firestore doc size limit
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

/**
 * Download user data from Firestore.
 * Returns null if no data exists.
 */
export const syncDownload = async () => {
  if (!isConfigured || !auth?.currentUser) return null;
  try {
    const uid = auth.currentUser.uid;
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const data = snap.data();
      // Remove Firestore metadata fields
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

/** Check if Firebase is configured and ready */
export const isFirebaseReady = () => isConfigured;

export { auth, db };
