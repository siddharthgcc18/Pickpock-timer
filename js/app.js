import { firebaseReady, db } from "./firebase.js";
import { createAccount, login, logout, observeAuth } from "./auth.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const today = () => new Date().toLocaleDateString("en-CA");
const localKey = "pickpock-v1";
let tasks = [];
let profile = { name: "Guest Learner", goal: "" };
let currentUser = null;
let taskFilter = "all";
let authMode = "login";
let timerInterval = null;
let timerRemaining = 25 * 60;
let timerTotal = 25 * 60;
let activeTaskId = null;
let focusSecondsToday = 0;
let lastTickDate = today();
let toastTimeout;
let reminderInterval = null;
const reminderKey = "pickpock-reminder-date-v1";

const esc = (value = "") => String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const makeId = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const toast = (message) => { const el = $("#toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove("show"), 2600); };
const formatMinutes = (seconds) => { const m = Math.floor(seconds / 60); return `${m}m`; };
const doneCount = () => tasks.filter(t => t.done && t.date === today()).length;
const todayTasks = () => tasks.filter(t => t.date === today()).sort((a,b) => Number(a.done)-Number(b.done) || (a.createdAt||0)-(b.createdAt||0));

function loadLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(localKey) || "{}");
    tasks = Array.isArray(saved.tasks) ? saved.tasks : [];
    profile = { ...profile, ...(saved.profile || {}) };
    focusSecondsToday = saved.focusDate === today() ? Number(saved.focusSecondsToday || 0) : 0;
  } catch { tasks = []; }
}
function saveLocal() {
  try { localStorage.setItem(localKey, JSON.stringify({ tasks, profile, focusDate: today(), focusSecondsToday })); }
  catch { toast("Could not save locally. Check browser storage settings."); }
}
async function saveCloud() {
  if (!firebaseReady || !currentUser) { saveLocal(); return; }
  try {
    const { doc, setDoc } = window.__ppFirestoreSdk;
    await setDoc(doc(db, "users", currentUser.uid), { profile, tasks, focusDate: today(), focusSecondsToday, updatedAt: Date.now() }, { merge: true });
    saveLocal();
  } catch (error) { console.error(error); toast("Cloud save failed. Check Firestore rules and connection."); saveLocal(); }
}
async function loadCloud(user) {
  if (!firebaseReady || !user) return;
  try {
    const { doc, getDoc } = window.__ppFirestoreSdk;
    const snapshot = await getDoc(doc(db, "users", user.uid));
    if (snapshot.exists()) {
      const data = snapshot.data();
      profile = { ...profile, ...(data.profile || {}) };
      tasks = Array.isArray(data.tasks) ? data.tasks : [];
      focusSecondsToday = data.focusDate === today() ? Number(data.focusSecondsToday || 0) : 0;
    } else {
      profile.name = user.displayName || user.email?.split("@")[0] || "Learner";
    }
    saveLocal(); renderAll();
  } catch (error) { console.error(error); toast("Could not load cloud data. Check Firestore rules."); }
}
function updateConnection() {
  $("#connectionDot").style.background = currentUser ? "var(--green)" : (firebaseReady ? "var(--cyan)" : "var(--pink)");
  $("#connectionText").textContent = currentUser ? "Account connected · cloud sync" : firebaseReady ? "Firebase ready · login to sync" : "Local mode · Firebase not configured";
  $("#accountMessage").textContent = currentUser ? "Signed in. Tasks and profile are synced to your Firebase account when online." : "Your tasks are saved in this browser. Set up Firebase to enable secure login and cloud sync.";
  $("#authOpenButton").classList.toggle("hidden", Boolean(currentUser));
  $("#logoutButton").classList.toggle("hidden", !currentUser);
  $("#profileEmail").textContent = currentUser?.email || "Local profile · no account connected";
}
function setView(view) {
  $$(".view").forEach(el => el.classList.toggle("active", el.id === `view-${view}`));
  $$(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === view));
  $("#sidebar").classList.remove("open");
  if (view === "profile") renderProfile();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function taskItem(t, compact = false) {
  return `<article class="task-item ${t.done ? "done" : ""}"><input class="task-check" type="checkbox" aria-label="Mark ${esc(t.title)} done" data-action="toggle" data-id="${esc(t.id)}" ${t.done ? "checked" : ""}><div class="task-info"><h3>${esc(t.title)}</h3><p>${esc(t.subject)} · ${Number(t.duration)||25} min${t.notes ? ` · ${esc(t.notes)}` : ""}</p></div><span class="task-badge">${t.done ? "Done ✓" : `${esc(t.priority || "Normal")}`}</span>${compact ? "" : `<div class="task-actions"><button class="mini-button" data-action="start" data-id="${esc(t.id)}">▶</button><button class="mini-button" data-action="edit" data-id="${esc(t.id)}">Edit</button></div>`}</article>`;
}
function renderHome() {
  const list = todayTasks();
  $("#todayTasks").innerHTML = list.slice(0, 6).map(t => taskItem(t, true)).join("");
  $("#todayEmpty").classList.toggle("show", list.length === 0);
  $("#todayTasks").style.display = list.length ? "grid" : "none";
  const completed = doneCount(), total = list.length, pct = total ? Math.round(completed / total * 100) : 0;
  $("#progressPercent").textContent = `${pct}%`;
  $("#progressFill").style.width = `${pct}%`;
  $("#progressSummary").textContent = `${completed} of ${total} tasks completed`;
  $("#completedStat").textContent = completed;
  $("#remainingStat").textContent = Math.max(0, total - completed);
  $("#focusStat").textContent = formatMinutes(focusSecondsToday);
}
function renderTasks() {
  const filtered = tasks.filter(t => taskFilter === "all" || (taskFilter === "done" ? t.done : !t.done)).sort((a,b) => (a.date||"").localeCompare(b.date||"") || (a.createdAt||0)-(b.createdAt||0));
  $("#allTasks").innerHTML = filtered.map(t => `<article class="task-card ${t.done ? "done" : ""}"><div class="task-card-head"><div><h3>${esc(t.title)}</h3><span class="muted">${esc(t.subject)}</span></div><span class="task-badge">${t.done ? "Done ✓" : esc(t.date || "No date")}</span></div><p class="task-notes">${esc(t.notes || "No extra notes added.")}</p><p>◷ ${Number(t.duration)||25} min · <span class="priority">${esc(t.priority || "Normal")} priority</span></p><div class="task-card-actions"><button class="primary-button small" data-action="start" data-id="${esc(t.id)}">▶ Focus</button><button class="soft-button" data-action="toggle" data-id="${esc(t.id)}">${t.done ? "Undo" : "Mark done"}</button><button class="soft-button" data-action="edit" data-id="${esc(t.id)}">Edit</button><button class="soft-button" data-action="delete" data-id="${esc(t.id)}">Delete</button></div></article>`).join("");
  $("#allEmpty").classList.toggle("show", filtered.length === 0);
  $("#allTasks").style.display = filtered.length ? "grid" : "none";
}
function renderFlow() {
  const list = todayTasks();
  $("#flowList").innerHTML = list.length ? list.map((t,i) => `<div class="flow-node ${t.done ? "done" : ""}"><span class="flow-number">${t.done ? "✓" : i+1}</span><div><strong>${esc(t.title)}</strong><p>${esc(t.subject)} · ${Number(t.duration)||25} min${t.notes ? ` — ${esc(t.notes)}` : ""}</p></div><span class="task-badge">${t.done ? "Completed" : "Next up"}</span></div>${i < list.length-1 ? '<div class="flow-connector"></div>' : ""}`).join("") : `<div class="empty-state show"><h3>No flow planned yet</h3><p>Create tasks to build your daily flow.</p><button class="text-button" data-open-form>＋ Add a task</button></div>`;
}
function renderProfile() {
  const name = profile.name || currentUser?.displayName || currentUser?.email?.split("@")[0] || "Guest Learner";
  const initial = name.trim().charAt(0).toUpperCase() || "S";
  $("#profileName").textContent = name;
  $("#profileAvatar").textContent = initial;
  $("#topAvatar").textContent = initial;
  $("#displayNameInput").value = name;
  $("#goalInput").value = profile.goal || "";
  $("#profileTaskCount").textContent = doneCount();
  $("#profileFocus").textContent = formatMinutes(focusSecondsToday);
  updateConnection();
}
function renderAll() { renderHome(); renderTasks(); renderFlow(); renderProfile(); updateConnection(); }
function openTaskForm(task = null) {
  $("#taskForm").reset();
  $("#taskId").value = task?.id || "";
  $("#taskDialogTitle").textContent = task ? "Edit Task" : "Add New Task";
  $("#taskName").value = task?.title || "";
  $("#taskSubject").value = task?.subject || "";
  $("#taskNotes").value = task?.notes || "";
  $("#taskDuration").value = String(task?.duration || 25);
  $("#taskPriority").value = task?.priority || "Normal";
  $("#taskDate").value = task?.date || today();
  $("#taskDialog").showModal();
}
function setTimerDisplay() {
  const mins = Math.floor(timerRemaining / 60).toString().padStart(2,"0");
  const secs = Math.max(0,timerRemaining % 60).toString().padStart(2,"0");
  $("#timerDisplay").textContent = `${mins}:${secs}`;
  const fraction = timerTotal ? timerRemaining / timerTotal : 0;
  $("#ringProgress").style.strokeDashoffset = String(603.19 * (1 - fraction));
  document.title = `${mins}:${secs} · PickPock Timer`;
}
function stopTimer() { clearInterval(timerInterval); timerInterval = null; $("#startPauseButton").textContent = "▶ Start"; }
function resetTimer() { stopTimer(); timerTotal = Number($("#durationSelect").value) * 60; timerRemaining = timerTotal; $("#timerStatus").textContent = "Ready to focus"; setTimerDisplay(); }
function startTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  activeTaskId = id;
  $("#timerTaskTitle").textContent = task.title;
  $("#durationSelect").value = String(task.duration || 25);
  resetTimer();
  setView("home");
  $("#timerStatus").textContent = "Task selected · ready to focus";
  toast(`Timer ready for: ${task.title}`);
}
async function toggleTask(id, checked) {
  const task = tasks.find(t => t.id === id); if (!task) return;
  task.done = typeof checked === "boolean" ? checked : !task.done;
  task.completedAt = task.done ? Date.now() : null;
  await saveCloud(); renderAll(); toast(task.done ? "Task marked as done! Nice work." : "Task moved back to To do.");
}
function handleTaskAction(event) {
  const target = event.target.closest("[data-action]"); if (!target) return;
  const { action, id } = target.dataset; const task = tasks.find(t => t.id === id); if (!task) return;
  if (action === "toggle") toggleTask(id, target.type === "checkbox" ? target.checked : undefined);
  if (action === "start") startTask(id);
  if (action === "edit") openTaskForm(task);
  if (action === "delete" && confirm(`Delete “${task.title}”?`)) { tasks = tasks.filter(t => t.id !== id); if (activeTaskId === id) { activeTaskId = null; $("#timerTaskTitle").textContent = "Ready when you are"; resetTimer(); } saveCloud().then(renderAll); toast("Task deleted."); }
}
function showAuth(mode = "login") {
  authMode = mode;
  $$("[data-auth-mode]").forEach(b => b.classList.toggle("active", b.dataset.authMode === mode));
  $("#authTitle").textContent = mode === "login" ? "Login" : "Create account";
  $("#authSubmit").textContent = mode === "login" ? "Login" : "Create account";
  $("#authMessage").textContent = firebaseReady ? "" : "Firebase isn't configured yet. See README.md to enable real accounts.";
  $("#authDialog").showModal();
}

// Browser notifications: reminders work while this page is open.
function updateNotificationStatus() {
  const supported = "Notification" in window;
  const enabled = supported && Notification.permission === "granted";
  $("#notificationButton").textContent = enabled ? "🔔 Task reminders enabled" : "🔔 Enable task reminders";
  $("#notificationStatus").textContent = !supported
    ? "This browser does not support notifications."
    : enabled
      ? "Reminders are enabled while PickPock Timer is open."
      : Notification.permission === "denied"
        ? "Notifications are blocked. Allow them in browser site settings."
        : "Allow notifications to receive incomplete-task reminders.";
}

async function enableTaskNotifications() {
  if (!("Notification" in window)) {
    toast("This browser does not support notifications.");
    updateNotificationStatus();
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    updateNotificationStatus();
    if (permission === "granted") {
      toast("Task reminders enabled.");
      sendIncompleteTaskReminder(true);
    } else {
      toast("Notification permission was not granted.");
    }
  } catch (error) {
    console.error(error);
    toast("Could not enable notifications in this browser.");
  }
}

function sendIncompleteTaskReminder(force = false) {
  if (!("Notification" in window) || Notification.permission !== "granted" || document.visibilityState === "hidden") return;
  const pending = tasks.filter(task => !task.done && task.date && task.date <= today());
  if (!pending.length) return;
  const dateKey = `${reminderKey}-${today()}`;
  let alreadyReminded = [];
  try { alreadyReminded = JSON.parse(localStorage.getItem(dateKey) || "[]"); } catch {}
  const newPending = pending.filter(task => !alreadyReminded.includes(task.id));
  if (!force && !newPending.length) return;
  const selected = newPending.length ? newPending : (force ? pending : []);
  if (!selected.length) return;
  const first = selected[0];
  try {
    new Notification("PickPock Timer · Task incomplete", {
      body: selected.length === 1
        ? `“${first.title}” is still incomplete. Start a focus session when you're ready.`
        : `You have ${selected.length} incomplete tasks. Next: “${first.title}”.`,
      tag: `pickpock-incomplete-${today()}`
    });
    const updated = [...new Set([...alreadyReminded, ...selected.map(task => task.id)])];
    localStorage.setItem(dateKey, JSON.stringify(updated));
  } catch (error) { console.error("Notification failed", error); }
}

// Navigation, dialogs and forms
$$("[data-view]").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
const menuToggle = $("#menuToggle");
const sidebar = $("#sidebar");
const sidebarOverlay = $("#sidebarOverlay");

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("active");
}

menuToggle.addEventListener("click", () => {
  sidebar.classList.toggle("open");
  sidebarOverlay.classList.toggle("active");
});

sidebarOverlay.addEventListener("click", closeSidebar);

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeSidebar();
  }
});
$$("[data-open-form]").forEach(button => button.addEventListener("click", () => openTaskForm()));
$("#addTaskTop").addEventListener("click", () => openTaskForm());
$$("[data-close-dialog]").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
$("#taskForm").addEventListener("submit", async event => {
  event.preventDefault();
  const id = $("#taskId").value;
  const existing = tasks.find(t => t.id === id);
  const task = { id: id || makeId(), title: $("#taskName").value.trim(), subject: $("#taskSubject").value.trim(), notes: $("#taskNotes").value.trim(), duration: Number($("#taskDuration").value), priority: $("#taskPriority").value, date: $("#taskDate").value, done: existing?.done || false, completedAt: existing?.completedAt || null, createdAt: existing?.createdAt || Date.now() };
  if (!task.title || !task.subject || !task.date) return;
  if (existing) tasks = tasks.map(t => t.id === id ? task : t); else tasks.push(task);
  await saveCloud(); $("#taskDialog").close(); renderAll(); toast(existing ? "Task updated." : "New task created!");
});
$$("[data-filter]").forEach(button => button.addEventListener("click", () => { taskFilter = button.dataset.filter; $$("[data-filter]").forEach(b => b.classList.toggle("active", b === button)); renderTasks(); }));
$("#allTasks").addEventListener("click", handleTaskAction);
$("#todayTasks").addEventListener("click", handleTaskAction);
$("#flowList").addEventListener("click", event => { const btn = event.target.closest("[data-open-form]"); if (btn) openTaskForm(); });
$("#profileForm").addEventListener("submit", async event => { event.preventDefault(); profile.name = $("#displayNameInput").value.trim() || "Learner"; profile.goal = $("#goalInput").value.trim(); await saveCloud(); if (currentUser && firebaseReady) { try { await window.__ppAuthSdk.updateProfile(currentUser, { displayName: profile.name }); } catch {} } renderAll(); toast("Profile saved."); });
$("#authOpenButton").addEventListener("click", () => showAuth("login"));
$("#notificationButton").addEventListener("click", enableTaskNotifications);
$$("[data-auth-mode]").forEach(button => button.addEventListener("click", () => showAuth(button.dataset.authMode)));
$("#authForm").addEventListener("submit", async event => {
  event.preventDefault(); $("#authMessage").textContent = "";
  const email = $("#authEmail").value.trim(); const password = $("#authPassword").value;
  try {
    if (authMode === "signup") await createAccount(email, password, profile.name);
    else await login(email, password);
    $("#authDialog").close(); toast(authMode === "signup" ? "Account created." : "Welcome back!");
  } catch (error) {
    console.error(error);
    const messages = { "auth/email-already-in-use": "This email already has an account. Try logging in.", "auth/invalid-email": "Please enter a valid email address.", "auth/weak-password": "Choose a stronger password (at least 6 characters).", "auth/invalid-credential": "Email or password is incorrect.", "auth/network-request-failed": "Network error. Check your internet connection." };
    $("#authMessage").textContent = messages[error.code] || error.message || "Could not sign in. Check Firebase setup.";
  }
});
$("#logoutButton").addEventListener("click", async () => { try { await logout(); currentUser = null; loadLocal(); renderAll(); toast("Logged out. Local browser data remains on this device."); } catch { toast("Could not log out. Try again."); } });
$("#durationSelect").addEventListener("change", resetTimer);
$("#resetTimerButton").addEventListener("click", () => { resetTimer(); toast("Timer reset."); });
$("#timerModeButton").addEventListener("click", () => toast("Focus sessions use the duration selected below."));
$("#startPauseButton").addEventListener("click", () => {
  if (timerInterval) { stopTimer(); $("#timerStatus").textContent = "Paused"; return; }
  if (timerRemaining <= 0) resetTimer();
  $("#startPauseButton").textContent = "Ⅱ Pause"; $("#timerStatus").textContent = "Focus in progress";
  timerInterval = setInterval(async () => {
    if (lastTickDate !== today()) { lastTickDate = today(); focusSecondsToday = 0; }
    timerRemaining--; focusSecondsToday++; setTimerDisplay();
    if (focusSecondsToday % 10 === 0) { saveLocal(); $("#focusStat").textContent = formatMinutes(focusSecondsToday); $("#profileFocus").textContent = formatMinutes(focusSecondsToday); }
    if (timerRemaining <= 0) {
      stopTimer(); $("#timerStatus").textContent = "Session complete! Take a short break.";
      if ($("#autoCompleteCheck").checked && activeTaskId) await toggleTask(activeTaskId, true);
      await saveCloud(); renderAll(); toast("Pomodoro session complete! Great focus.");
      try { if ("Notification" in window && Notification.permission === "granted") new Notification("PickPock Timer", { body: "Your focus session is complete!" }); } catch {}
    }
  }, 1000);
});

// Boot
const now = new Date();
$("#todayDate").textContent = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
$("#todayLabel").textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
$("#footerYear").textContent = now.getFullYear();
loadLocal();
if (!firebaseReady) $("#authOpenButton").title = "Configure Firebase to enable real login";
renderAll(); resetTimer();
updateNotificationStatus();
reminderInterval = setInterval(() => sendIncompleteTaskReminder(false), 60 * 1000);
observeAuth(async user => {
  currentUser = user || null;
  if (user) await loadCloud(user);
  updateConnection(); renderAll();
});


// ===== Theme customizer =====
const themeToggle = document.querySelector("#themeToggle");
const themePanel = document.querySelector("#themePanel");
const closeThemes = document.querySelector("#closeThemes");
const themeButtons = [...document.querySelectorAll(".theme-option")];
const themeNames = ["normal", "summer", "winter", "forest", "sunset", "ocean", "jjk", "naruto", "demon", "ninja"];
function applyTheme(theme) {
  if (!themeNames.includes(theme)) theme = "normal";
  document.body.dataset.theme = theme;
  try { localStorage.setItem("pickpock-theme", theme); } catch (error) { console.warn("Theme preference could not be saved.", error); }
  themeButtons.forEach(button => {
    const selected = button.dataset.theme === theme;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  const colors = {normal:"#0d1022",summer:"#fff7e8",winter:"#edf6ff",forest:"#0b2019",sunset:"#2b1029",ocean:"#071b2b",jjk:"#120b25",naruto:"#241108",demon:"#190d15",ninja:"#081326"};
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", colors[theme]);
}
themeToggle?.addEventListener("click", () => {
  if (!themePanel) return;
  themePanel.hidden = !themePanel.hidden;
  themeToggle.setAttribute("aria-expanded", String(!themePanel.hidden));
});
closeThemes?.addEventListener("click", () => {
  themePanel.hidden = true;
  themeToggle?.setAttribute("aria-expanded", "false");
});
themeButtons.forEach(button => button.addEventListener("click", () => applyTheme(button.dataset.theme)));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && themePanel && !themePanel.hidden) {
    themePanel.hidden = true;
    themeToggle?.setAttribute("aria-expanded", "false");
  }
});
let initialTheme = "normal";
try { initialTheme = localStorage.getItem("pickpock-theme") || "normal"; } catch {}
applyTheme(initialTheme);
document.addEventListener("DOMContentLoaded", function () {
    const menuToggle = document.getElementById("menuToggle");
    const sidebar = document.getElementById("sidebar");

    if (!menuToggle || !sidebar) {
        console.error("Menu button ya sidebar nahi mila!");
        return;
    }

    menuToggle.addEventListener("click", function () {
        sidebar.classList.toggle("open");
    });

    // Menu ke kisi option par click karne se close
    sidebar.querySelectorAll("[data-view]").forEach(function (item) {
        item.addEventListener("click", function () {
            sidebar.classList.remove("open");
        });
    });

    // Escape press karne par close
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            sidebar.classList.remove("open");
        }
    });
});