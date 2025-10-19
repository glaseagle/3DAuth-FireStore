import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
  getDatabase,
  ref,
  child,
  push,
  set,
  remove,
  onDisconnect,
  serverTimestamp,
  onValue,
  query,
  orderByChild
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB3qxWLyU792p_GvKPVYG7SywtKmJ0_Hx8",
  authDomain: "backendtest-d0dc6.firebaseapp.com",
  databaseURL: "https://backendtest-d0dc6-default-rtdb.firebaseio.com",
  projectId: "backendtest-d0dc6",
  storageBucket: "backendtest-d0dc6.firebasestorage.app",
  messagingSenderId: "701974952381",
  appId: "1:701974952381:web:ef1b6563a48f00f95a3ad4",
  measurementId: "G-9RPP665GDC"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const harvestInstance = window.harvest;

if (!harvestInstance) {
  throw new Error("Harvest instance not available. Ensure js/example.js is loaded before main.js.");
}

let currentUser = null;
let authStatusResetTimeout = null;
let inputIsOpen = false;
let pendingPlacement = null;

const clientId = (typeof crypto !== "undefined" && crypto.randomUUID)
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2);

const messagesRef = ref(db, "quickvibe_messages");
const orderedMessagesQuery = query(messagesRef, orderByChild("createdAt"));
const cursorsRef = ref(db, "quickvibe_cursors");
const cursorRef = child(cursorsRef, clientId);

onDisconnect(cursorRef).remove();
window.addEventListener("beforeunload", () => {
  remove(cursorRef).catch(() => {});
});
window.addEventListener("unload", () => {
  remove(cursorRef).catch(() => {});
});

const timeline = document.getElementById("timeline");
const floatingInput = document.getElementById("floating-input");
const authButton = document.getElementById("auth-button");
const authStatus = document.getElementById("auth-status");

const timelineEls = new Map();
const knownMessageIds = new Set();
const knownCursorIds = new Set();

let lastPresenceUpdate = 0;

updateAuthUI(currentUser);

function colorForId(id) {
  if (!id) return "#4ac6ff";
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 80%, 60%)`;
}

function friendlyUserName(user) {
  if (!user) return "";
  if (user.displayName && user.displayName.trim()) return user.displayName.trim();
  if (user.email && user.email.trim()) return user.email.trim();
  return "Anonymous";
}

function updateAuthUI(user) {
  if (authButton) {
    if (user) {
      authButton.textContent = "Sign Out";
      authButton.classList.add("sign-out");
    } else {
      authButton.textContent = "Sign In";
      authButton.classList.remove("sign-out");
    }
  }

  if (authStatus) {
    authStatus.textContent = user
      ? `Signed in as ${friendlyUserName(user)}`
      : "Signed out - Sign in to add notes.";
  }

  if (floatingInput) {
    floatingInput.placeholder = user ? "Press Enter to drop a note" : "Sign in to add a note";
  }
}

function showAuthMessage(message) {
  if (!authStatus) return;
  if (authStatusResetTimeout) {
    clearTimeout(authStatusResetTimeout);
  }
  authStatus.textContent = message;
  authStatusResetTimeout = setTimeout(() => {
    authStatusResetTimeout = null;
    updateAuthUI(currentUser);
  }, 4000);
}

function openChatInput() {
  if (!currentUser || !floatingInput || !harvestInstance) {
    showAuthMessage("Sign in to add a note.");
    return;
  }
  if (inputIsOpen) return;

  inputIsOpen = true;
  pendingPlacement = harvestInstance.computeNotePlacement(0);
  floatingInput.value = "";
  floatingInput.style.display = "block";
  floatingInput.style.left = "50%";
  floatingInput.style.top = "50%";
  floatingInput.focus();
  harvestInstance.setChatInputActive(true);
}

function closeChatInput() {
  if (!floatingInput || !inputIsOpen) return;
  inputIsOpen = false;
  pendingPlacement = null;
  floatingInput.style.display = "none";
  floatingInput.value = "";
  harvestInstance.setChatInputActive(false);
}

function handleGlobalKeydown(event) {
  if (event.repeat) return;

  if (!inputIsOpen && (event.key === "/" || event.key === "?" || event.code === "Slash")) {
    event.preventDefault();
    openChatInput();
    return;
  }

  if (event.key === "Escape" && inputIsOpen) {
    event.preventDefault();
    closeChatInput();
    return;
  }
}

async function submitMessage(text) {
  if (!currentUser) {
    showAuthMessage("Sign in to add a note.");
    return;
  }

  const trimmed = (text || "").trim();
  if (!trimmed) return;

  const placementSource = pendingPlacement || harvestInstance.computeNotePlacement(0);
  pendingPlacement = null;
  const positionSource = placementSource && placementSource.position ? placementSource.position : {};
  const placement = {
    position: {
      x: typeof positionSource.x === "number" ? positionSource.x : 0,
      y: typeof positionSource.y === "number" ? positionSource.y : 3,
      z: typeof positionSource.z === "number" ? positionSource.z : 0
    },
    rotationY: typeof placementSource.rotationY === "number" ? placementSource.rotationY : 0
  };

  try {
    await push(messagesRef, {
      text: trimmed,
      createdAt: serverTimestamp(),
      uid: currentUser.uid,
      author: friendlyUserName(currentUser),
      accent: colorForId(currentUser.uid || clientId),
      position: placement.position,
      rotationY: placement.rotationY,
      displayName: friendlyUserName(currentUser)
    });
  } catch (err) {
    console.error("Error saving message:", err);
    showAuthMessage("Failed to save message. Try again.");
  }
}

if (authButton) {
  authButton.addEventListener("click", async () => {
    if (!currentUser) {
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (err) {
        if (err && err.code === "auth/popup-closed-by-user") {
          return;
        }
        console.error("Sign-in failed:", err);
        showAuthMessage("Sign-in failed. Try again.");
      }
    } else {
      try {
        await signOut(auth);
      } catch (err) {
        console.error("Sign-out failed:", err);
        showAuthMessage("Sign-out failed. Please retry.");
      }
    }
  });
}

if (floatingInput) {
  floatingInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const text = floatingInput.value;
      closeChatInput();
      await submitMessage(text);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeChatInput();
    }
  });
}

document.addEventListener("keydown", handleGlobalKeydown);

function updateLocalPresence(force) {
  if (!currentUser || !harvestInstance) return;
  const now = Date.now();
  if (!force && now - lastPresenceUpdate < 120) return;
  lastPresenceUpdate = now;

  const position = harvestInstance.getCameraPosition();
  const direction = harvestInstance.getForwardDirection();

  set(cursorRef, {
    x: Number(position.x.toFixed(3)),
    y: Number(position.y.toFixed(3)),
    z: Number(position.z.toFixed(3)),
    dirX: Number(direction.x.toFixed(4)),
    dirY: Number(direction.y.toFixed(4)),
    dirZ: Number(direction.z.toFixed(4)),
    displayName: friendlyUserName(currentUser),
    color: colorForId(currentUser.uid || clientId),
    uid: currentUser.uid,
    updatedAt: now
  }).catch(() => {});
}

setInterval(() => updateLocalPresence(false), 200);

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  updateAuthUI(user);

  if (!user) {
    closeChatInput();
    try {
      await remove(cursorRef);
    } catch (err) {
      console.error("Failed to clear cursor on sign-out:", err);
    }
  } else {
    updateLocalPresence(true);
  }
});

function formatTimestamp(ms) {
  if (typeof ms !== "number") return "Pending...";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "Pending...";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderTimelineItem(id, data, orderIndex) {
  if (!timeline) return;
  let el = timelineEls.get(id);
  if (!el) {
    el = document.createElement("div");
    el.className = "timeline-entry";
    el.innerHTML = `
      <div class="timeline-time"></div>
      <div class="timeline-author"></div>
      <div class="timeline-text"></div>
    `;
    timeline.appendChild(el);
    timelineEls.set(id, el);
  }

  const timeEl = el.querySelector(".timeline-time");
  const authorEl = el.querySelector(".timeline-author");
  const textEl = el.querySelector(".timeline-text");

  if (timeEl) {
    timeEl.textContent = formatTimestamp(data.createdAt);
  }
  if (authorEl) {
    authorEl.textContent = data.author || "Anonymous";
  }
  if (textEl) {
    textEl.textContent = (data.text || "").slice(0, 160);
  }

  el.style.order = orderIndex;
}

function removeTimelineItem(id) {
  const el = timelineEls.get(id);
  if (el && el.parentElement) {
    el.parentElement.removeChild(el);
  }
  timelineEls.delete(id);
}

onValue(orderedMessagesQuery, (snap) => {
  const seen = new Set();
  const orderedEntries = [];

  snap.forEach((childSnap) => {
    const id = childSnap.key;
    const data = childSnap.val() || {};
    seen.add(id);
    orderedEntries.push({ id, data });
    harvestInstance.addOrUpdateMessage(id, data);
  });

  orderedEntries.forEach(({ id, data }, index) => {
    renderTimelineItem(id, data, index);
  });

  knownMessageIds.forEach((id) => {
    if (!seen.has(id)) {
      harvestInstance.removeMessage(id);
      removeTimelineItem(id);
    }
  });

  knownMessageIds.clear();
  seen.forEach((id) => knownMessageIds.add(id));
});

onValue(cursorsRef, (snap) => {
  const seen = new Set();

  snap.forEach((childSnap) => {
    const id = childSnap.key;
    const data = childSnap.val();
    if (!id || !data || id === clientId) return;
    seen.add(id);
    harvestInstance.addOrUpdateRemotePlayer(id, data);
  });

  knownCursorIds.forEach((id) => {
    if (!seen.has(id)) {
      harvestInstance.removeRemotePlayer(id);
    }
  });

  knownCursorIds.clear();
  seen.forEach((id) => knownCursorIds.add(id));
});
