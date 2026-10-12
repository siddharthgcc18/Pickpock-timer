/*
  1. Open https://console.firebase.google.com/ and create a project.
  2. Add a Web App and copy its Firebase config into the object below.
  3. Enable Authentication > Sign-in method > Email/Password.
  4. Create Firestore Database and publish the security rules in README.md.
  Leave the placeholder values unchanged to use local-only mode.
*/
export const firebaseConfig = {
  apiKey: "PASTE_YOUR_FIREBASE_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "PASTE_YOUR_MESSAGING_SENDER_ID",
  appId: "PASTE_YOUR_FIREBASE_APP_ID"
};

export const firebaseConfigured =
  firebaseConfig.apiKey !== "PASTE_YOUR_FIREBASE_API_KEY" &&
  firebaseConfig.projectId !== "PASTE_YOUR_PROJECT_ID" &&
  firebaseConfig.appId !== "PASTE_YOUR_FIREBASE_APP_ID";
