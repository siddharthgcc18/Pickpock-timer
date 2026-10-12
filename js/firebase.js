import { firebaseConfig, firebaseConfigured } from "./firebase-config.js";

let auth = null;
let db = null;
let firebaseReady = false;
let firebaseError = "";

if (firebaseConfigured) {
  try {
    const appSdk = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
    const authSdk = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    const firestoreSdk = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const app = appSdk.initializeApp(firebaseConfig);
    auth = authSdk.getAuth(app);
    db = firestoreSdk.getFirestore(app);
    firebaseReady = true;
    Object.assign(window, { __ppAuthSdk: authSdk, __ppFirestoreSdk: firestoreSdk });
  } catch (error) {
    firebaseError = error?.message || "Firebase could not be initialized.";
    console.error("PickPock Firebase setup error:", error);
  }
}

export { auth, db, firebaseReady, firebaseConfigured, firebaseError };
