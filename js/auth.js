import { auth, firebaseReady } from "./firebase.js";

export async function createAccount(email, password, displayName) {
  if (!firebaseReady) throw new Error("Firebase is not configured yet. Follow the setup steps in README.md.");
  const { createUserWithEmailAndPassword, updateProfile } = window.__ppAuthSdk;
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName?.trim()) await updateProfile(credential.user, { displayName: displayName.trim() });
  return credential.user;
}

export async function login(email, password) {
  if (!firebaseReady) throw new Error("Firebase is not configured yet. Follow the setup steps in README.md.");
  const { signInWithEmailAndPassword } = window.__ppAuthSdk;
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logout() {
  if (!firebaseReady) return;
  await window.__ppAuthSdk.signOut(auth);
}

export function observeAuth(callback) {
  if (!firebaseReady) {
    callback(null);
    return () => {};
  }
  return window.__ppAuthSdk.onAuthStateChanged(auth, callback);
}
