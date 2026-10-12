# PickPock Timer

A responsive Pomodoro + daily task planner built with HTML, CSS, and JavaScript modules.

## Files (7 total)

1. `index.html` — page structure and dialogs
2. `css/style.css` — responsive styling for phone, tablet, and desktop
3. `js/firebase-config.js` — your Firebase web app config (you fill this in)
4. `js/firebase.js` — initializes Firebase SDK
5. `js/auth.js` — sign-up, login, logout helpers
6. `js/app.js` — tasks, timer, profile, daily flow, progress, and sync
7. `README.md` — this guide

## Run locally

Because this project uses JavaScript modules, open it through a local web server instead of double-clicking `index.html`.

**VS Code option:**
1. Open the `PickPockTimer` folder in VS Code.
2. Install the **Live Server** extension if you don't already have it.
3. Right-click `index.html` → **Open with Live Server**.

Or, if Python is installed, open a terminal in this folder and run:

```bash
python -m http.server 5500
```

Then open `http://localhost:5500` in your browser.

## Local mode

Before Firebase is configured, tasks and profile save in the current browser using `localStorage`. This is not secure authentication and does not sync to another device. Avoid using shared/public devices for private data.

## Enable real login and cloud sync with Firebase

1. Open https://console.firebase.google.com/ and create a Firebase project.
2. Add a **Web App** in Project settings and copy its web configuration.
3. Open `js/firebase-config.js` and replace all `PASTE_YOUR_...` values with the values Firebase provides. Do not publish private server credentials; the web config is designed to be used by client apps, but secure data access with rules is essential.
4. In Firebase Console → **Authentication** → **Sign-in method**, enable **Email/Password**.
5. In Firebase Console → **Firestore Database**, create a database.
6. In Firestore Rules, use rules that allow each signed-in user to read/write only their own `users/{uid}` document. For this app's current data model, an example is:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;
    }
  }
}
```

7. Publish the rules and reload the app through Live Server. Create an account from **My Profile → Login / Create account**.

**Important:** this is a learning project. The current app stores a user's task list in one Firestore document, which is suitable for a small personal planner but not an unlimited large task history. Cloud sync needs an internet connection. Never place admin/service-account credentials in frontend code.

## Incomplete-task browser notifications

The Profile page includes **Enable task reminders**. Click it and allow notifications in the browser. While PickPock Timer is open, the app can show a browser notification for tasks scheduled for today or an earlier date that are still incomplete. It avoids repeating the same task reminder more than once per day in that browser.

Browser notifications usually require HTTPS or `localhost`, and the user must grant permission. This basic feature does **not** send notifications while the site/browser is fully closed and does not send SMS. True background push notifications to a phone require additional Firebase Cloud Messaging setup (including a service worker and Web Push/VAPID configuration) and a trusted server-side scheduler such as Firebase Cloud Functions to check unfinished tasks and send pushes. Do not store server credentials in frontend JavaScript.
