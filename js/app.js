// Study Scanner — app controller. Vanilla JS, no build step, no framework.

const SWATCHES = ["#E3B23C", "#C97A6D", "#6FA98C", "#7FA8C9", "#B58FD1", "#D9915A"];

const transcribeOverlay = document.getElementById("loading-overlay");
const transcribeTitle = document.getElementById("loading-title")
const transcribeStatusText = document.getElementById("loading-status-text");

let statusInterval;

const state = {
  classes: [],
  currentClass: null,
  currentNote: null, // Track selected note
  currentNotes: [],
  captureBlobs: [],
  captureCombinedBlob: null,
  view: "classes",
  askMessages: [],
}

// ---------------- View routing ----------------
const views = {
  classes: document.getElementById("view-classes"),
  class: document.getElementById("view-class"),
  "note-detail": document.getElementById("view-note-detail"),
  capture: document.getElementById("view-capture"),
  "guide-setup": document.getElementById("view-guide-setup"),
  "guide-result": document.getElementById("view-guide-result"),
  ask: document.getElementById("view-ask"),
  settings: document.getElementById("view-settings"),
};

const titles = {
  classes: "Study Scanner",
  class: () => state.currentClass?.name || "Class",
  "note-detail": () => state.currentNote?.date || "Note Details",
  capture: "Scan notes",
  "guide-setup": "Study guide",
  "guide-result": () => state.guideTitle || "Study guide",
  ask: () => (state.currentClass ? `Ask · ${state.currentClass.name}` : "Ask"),
  settings: "Settings",
};

const backTargets = {
  class: "classes",
  "note-detail": "class",
  capture: "class",
  "guide-setup": "class",
  "guide-result": "guide-setup",
  ask: "class",
  settings: "classes",
};

function showLoadingOverlay(header, message, transcribe) {
  const messages = transcribe ? [
    "Analyzing handwriting with Gemini AI...",
    "Cleaning up scanned layout...",
    "Extracting mathematical notation & key points...",
    "Formatting transcription..."
  ] : [message];
  let idx = 0;
  transcribeStatusText.textContent = messages[0];

  if (transcribe) {
    transcribeOverlay.classList.add("transcribe")
  } else {
    transcribeOverlay.classList.remove("transcribe")
  }
  transcribeTitle.textContent = header
  
  // Cycle status message every 2.5 seconds
  statusInterval = setInterval(() => {
    idx = (idx + 1) % messages.length;
    transcribeStatusText.textContent = messages[idx];
  }, 2500);

  transcribeOverlay.hidden = false;
  transcribeOverlay.setAttribute("aria-hidden", "false");
}

function hideLoadingOverlay() {
  clearInterval(statusInterval);
  transcribeOverlay.hidden = true;
  transcribeOverlay.setAttribute("aria-hidden", "true");
  transcribeOverlay.classList.remove("transcribe")
}

function showView(name) {
  Object.values(views).forEach((v) => (v.hidden = true));
  views[name].hidden = false;
  state.view = name;
  const t = titles[name];
  document.getElementById("topbar-title").textContent = typeof t === "function" ? t() : t;
  
  // Hide back button on the main 'classes' view; show it on sub-views
  const btnBack = document.getElementById("btn-back");
  if (btnBack) {
    btnBack.hidden = name === "classes" || !backTargets[name];
  }

  window.scrollTo(0, 0);
}

document.getElementById("btn-back").addEventListener("click", () => {
  const target = backTargets[state.view];
  if (target) navigateTo(target);
});

document.getElementById("btn-settings").addEventListener("click", () => {
  document.getElementById("settings-key").value = localStorage.getItem("ss_api_key") || "";
  document.getElementById("settings-model").value = localStorage.getItem("ss_model") || "gemini-3.6-flash";
  showView("settings");
});

function navigateTo(name) {
  if (name === "classes") renderClassList();
  if (name === "class") renderNoteList();
  showView(name);
}

// ---------------- Classes ----------------
// ---------------- Classes ----------------
async function renderClassList() {
  state.classes = await DB.listClasses();
  const grid = document.getElementById("classes-grid");
  const empty = document.getElementById("classes-empty");
  grid.innerHTML = "";
  empty.hidden = state.classes.length > 0;

  for (const cls of state.classes) {
    const notes = await DB.listNotes(cls.id);
    const btn = document.createElement("button");
    btn.className = "class-card";
    btn.style.setProperty("--tape", cls.color);
    btn.innerHTML = `
      <div class="class-card-name">${escapeText(cls.name)}</div>
      <div class="class-card-meta">${notes.length} note${notes.length === 1 ? "" : "s"}</div>
    `;

    // Long press and click state management
    let pressTimer = null;
    let isLongPress = false;

    const startPress = (e) => {
      // Ignore right-clicks or non-primary touches
      if (e.type === "mousedown" && e.button !== 0) return;
      
      isLongPress = false;
      pressTimer = setTimeout(() => {
        isLongPress = true;
        // Suppress default context menus on mobile devices
        if (e.cancelable) e.preventDefault(); 
        showClassContextMenu(e, cls);
      }, 500); // 500ms threshold for long press
    };

    const cancelPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    // Event listeners for press detection
    btn.addEventListener("touchstart", startPress, { passive: false });
    btn.addEventListener("touchend", cancelPress);
    btn.addEventListener("touchmove", cancelPress);
    
    btn.addEventListener("mousedown", startPress);
    btn.addEventListener("mouseup", cancelPress);
    btn.addEventListener("mouseleave", cancelPress);

    // Primary click handler
    btn.addEventListener("click", (e) => {
      if (isLongPress) {
        e.stopImmediatePropagation();
        e.preventDefault();
        isLongPress = false;
        return;
      }
      openClass(cls);
    });

    grid.appendChild(btn);
  }
}

// Function to handle the custom long-press context menu
function showClassContextMenu(event, cls) {
  // Remove any existing active context menus
  const existingMenu = document.getElementById("class-context-menu");
  if (existingMenu) existingMenu.remove();

  // Create backdrop overlay
  const backdrop = document.createElement("div");
  backdrop.id = "class-context-menu";
  backdrop.style.position = "fixed";
  backdrop.style.top = "0";
  backdrop.style.left = "0";
  backdrop.style.width = "100vw";
  backdrop.style.height = "100vh";
  backdrop.style.zIndex = "1000";
  backdrop.style.backgroundColor = "rgba(0, 0, 0, 0.3)";
  backdrop.style.display = "flex";
  backdrop.style.alignItems = "center";
  backdrop.style.justifyContent = "center";

  // Create popup card
  const menuCard = document.createElement("div");
  menuCard.className = "card";
  menuCard.style.minWidth = "240px";
  menuCard.style.padding = "16px";
  menuCard.style.boxShadow = "0 8px 24px rgba(0,0,0,0.2)";
  menuCard.style.animation = "fadeIn 0.15s ease-out";

  menuCard.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 12px; word-break: break-word;">${escapeText(cls.name)}</div>
    <button id="btn-ctx-delete" class="pill-btn" style="width: 100%; text-align: left;">
      Delete Class
    </button>
  `;

  backdrop.appendChild(menuCard);
  document.body.appendChild(backdrop);

  // Close popup when clicking outside the menu card
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      backdrop.remove();
    }
  });

  // Handle class deletion
  document.getElementById("btn-ctx-delete").addEventListener("click", async () => {
    backdrop.remove();
    if (confirm(`Are you sure you want to delete "${cls.name}" and all of its notes?`)) {
      if (DB.deleteClass) {
        await DB.deleteClass(cls.id);
      } else {
        // Fallback if DB module uses a custom delete signature
        const notes = await DB.listNotes(cls.id);
        for (const note of notes) {
          await DB.deleteNote(note.id);
        }
        if (DB.deleteClassById) await DB.deleteClassById(cls.id);
      }
      renderClassList();
    }
  });
}

function escapeText(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function openClass(cls) {
  state.currentClass = cls;
  navigateTo("class");
}

// New class modal
const modal = document.getElementById("modal-new-class");
let selectedColor = SWATCHES[0];

function buildSwatches() {
  const wrap = document.getElementById("new-class-swatches");
  wrap.innerHTML = "";
  SWATCHES.forEach((c, i) => {
    const s = document.createElement("button");
    s.type = "button";
    s.className = "swatch" + (i === 0 ? " selected" : "");
    s.style.background = c;
    s.addEventListener("click", () => {
      selectedColor = c;
      wrap.querySelectorAll(".swatch").forEach((el) => el.classList.remove("selected"));
      s.classList.add("selected");
    });
    wrap.appendChild(s);
  });
}
buildSwatches();
selectedColor = SWATCHES[0];

document.getElementById("btn-add-class").addEventListener("click", () => {
  document.getElementById("new-class-name").value = "";
  selectedColor = SWATCHES[0];
  buildSwatches();
  modal.showModal();
});
document.getElementById("btn-cancel-class").addEventListener("click", () => modal.close());
document.getElementById("form-new-class").addEventListener("submit", async (e) => {
  const name = document.getElementById("new-class-name").value.trim();
  if (!name) return;
  await DB.addClass(name, selectedColor);
  modal.close();
  renderClassList();
});

// ---------------- Notes list ----------------
// Update renderNoteList inside js/app.js
async function renderNoteList() {
  const notes = await DB.listNotes(state.currentClass.id);
  state.currentNotes = notes;
  const list = document.getElementById("notes-list");
  const empty = document.getElementById("notes-empty");
  list.innerHTML = "";
  empty.hidden = notes.length > 0;

  // newest first
  [...notes].reverse().forEach((note) => {
    const row = document.createElement("div");
    row.className = "note-row";
    row.style.cursor = "pointer"; // Indicate clickability

    const img = document.createElement("img");
    img.className = "note-thumb";
    img.src = URL.createObjectURL(note.imageBlob);
    row.appendChild(img);

    const body = document.createElement("div");
    body.className = "note-body";
    body.innerHTML = `
      <div class="note-date">${note.date}</div>
      <div class="note-excerpt">${escapeText((note.ocrText || "").slice(0, 160))}</div>
    `;
    row.appendChild(body);

    const del = document.createElement("button");
    del.className = "note-delete";
    del.setAttribute("aria-label", "Delete note");
    del.textContent = "✕";
    del.addEventListener("click", async (ev) => {
      ev.stopPropagation(); // Prevent opening the note on delete
      if (confirm("Delete this scanned note?")) {
        await DB.deleteNote(note.id);
        renderNoteList();
      }
    });
    row.appendChild(del);

    // Open note detail when tapping anywhere on the note row
    row.addEventListener("click", () => openNoteDetail(note));

    list.appendChild(row);
  });
}

// Render Note Detail Page
function openNoteDetail(note) {
  state.currentNote = note;

  document.getElementById("note-detail-date").textContent = `Scanned on ${note.date}`;

  // Render Gallery Image
  const gallery = document.getElementById("note-detail-gallery");
  gallery.innerHTML = "";

  // If captureBlobs array exists on note, render each; otherwise render the single imageBlob
  const imageSources = note.captureBlobs && note.captureBlobs.length > 0
    ? note.captureBlobs
    : [note.imageBlob];

  imageSources.forEach((blob) => {
    const img = document.createElement("img");
    img.className = "gallery-image";
    img.src = URL.createObjectURL(blob);
    gallery.appendChild(img);
  });

  // Render Transcript (using markdown renderer)
  const transcriptEl = document.getElementById("note-detail-transcript");
  transcriptEl.innerHTML = renderMarkdown(note.ocrText || "*No transcript available.*");

  navigateTo("note-detail");
}

document.getElementById("btn-scan-note").addEventListener("click", () => {
  resetCaptureView();
  navigateTo("capture");
});
document.getElementById("btn-make-guide").addEventListener("click", () => {
  openGuideSetup();
});
document.getElementById("btn-ask").addEventListener("click", () => {
  openAsk();
});

// ---------------- Multi-Image Capture Flow ----------------
const captureInput = document.getElementById("capture-input");
const captureDrop = document.getElementById("capture-drop");
const captureLabel = document.getElementById("capture-drop-label");
const capturePreview = document.getElementById("capture-preview");
const captureDate = document.getElementById("capture-date");
const captureStatus = document.getElementById("capture-status");
const captureTextField = document.getElementById("capture-text-field");
const captureText = document.getElementById("capture-text");
const btnRunOcr = document.getElementById("btn-run-ocr");
const btnSaveNote = document.getElementById("btn-save-note");

// Ensure input supports multiple files
captureInput.setAttribute("multiple", "true");

function resetCaptureView() {
  state.captureBlobs = [];
  state.captureCombinedBlob = null;
  captureInput.value = "";
  capturePreview.hidden = true;
  capturePreview.src = "";
  captureLabel.hidden = false;
  captureLabel.innerHTML = 'Tap to photograph page<br/><span class="muted small">Take photos one by one or select multiple</span>';
  captureDate.value = new Date().toISOString().slice(0, 10);
  captureStatus.hidden = true;
  captureTextField.hidden = true;
  captureText.value = "";
  btnRunOcr.disabled = true;
  btnRunOcr.textContent = "Transcribe with AI";
  btnSaveNote.hidden = true;
}

captureInput.addEventListener("change", async () => {
  const newFiles = Array.from(captureInput.files || []);
  if (!newFiles.length) return;

  setStatus(captureStatus, `Processing photo(s)...`, "");

  try {
    // Compress newly selected/captured images
    const newBlobs = await Promise.all(
      newFiles.map((file) => compressImage(file, 1500, 0.72))
    );

    // Append new images to existing capture array
    state.captureBlobs = [...(state.captureBlobs || []), ...newBlobs];

    // Combine all accumulated images vertically
    state.captureCombinedBlob = await combineImages(state.captureBlobs);

    // Update preview & UI text
    capturePreview.src = URL.createObjectURL(state.captureCombinedBlob);
    capturePreview.hidden = false;
    
    // Update label to indicate photo count and allow adding more
    captureLabel.hidden = false;
    captureLabel.innerHTML = `<strong>${state.captureBlobs.length} page(s) captured</strong><br/><span class="muted small">Tap here to add another page</span>`;
    
    captureStatus.hidden = true;
    btnRunOcr.disabled = false;
  } catch (err) {
    setStatus(captureStatus, "Failed to process images: " + err.message, "error");
  } finally {
    // Reset file input value so re-triggering opens the camera again clean
    captureInput.value = "";
  }
});

function compressImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else if (height > maxDim) {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          resolve(blob);
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

// Stitches multiple blobs into a single vertical image canvas
function combineImages(blobs) {
  if (blobs.length === 1) return Promise.resolve(blobs[0]);

  return new Promise((resolve, reject) => {
    const loadedImages = [];
    let loadedCount = 0;

    blobs.forEach((blob, index) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        loadedImages[index] = img;
        loadedCount++;
        URL.revokeObjectURL(url);
        if (loadedCount === blobs.length) {
          renderCombinedCanvas();
        }
      };
      img.onerror = reject;
      img.src = url;
    });

    function renderCombinedCanvas() {
      // Find maximum width among all pages
      const maxWidth = Math.max(...loadedImages.map((i) => i.width));
      // Calculate total height needed for stacked pages
      const totalHeight = loadedImages.reduce((sum, i) => sum + Math.round((i.height * maxWidth) / i.width), 0);

      const canvas = document.createElement("canvas");
      canvas.width = maxWidth;
      canvas.height = totalHeight;
      const ctx = canvas.getContext("2d");

      let currentY = 0;
      loadedImages.forEach((img) => {
        const scaledHeight = Math.round((img.height * maxWidth) / img.width);
        ctx.drawImage(img, 0, currentY, maxWidth, scaledHeight);
        currentY += scaledHeight;
      });

      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
    }
  });
}

function setStatus(el, msg, kind) {
  el.hidden = false;
  el.textContent = msg;
  el.className = "status-line" + (kind ? " " + kind : "");
}

btnRunOcr.addEventListener("click", async () => {
  if (!state.captureCombinedBlob) return;

  btnRunOcr.disabled = true;
  btnRunOcr.textContent = "Transcribing...";
  
  showLoadingOverlay("Transcribing Notes", null, true);

  try {
    const text = await Gemini.ocrImage(state.captureCombinedBlob);
    captureText.value = text;
    captureTextField.hidden = false;
    btnSaveNote.hidden = false;
  } catch (err) {
    setStatus(captureStatus, err.message, "error");
  } finally {
    hideLoadingOverlay();
    btnRunOcr.disabled = false;
    btnRunOcr.textContent = "Re-transcribe";
  }
});

btnSaveNote.addEventListener("click", async () => {
  if (!state.captureCombinedBlob || !state.currentClass) return;
  await DB.addNote({
    classId: state.currentClass.id,
    date: captureDate.value || new Date().toISOString().slice(0, 10),
    imageBlob: state.captureCombinedBlob,
    ocrText: captureText.value,
  });
  navigateTo("class");
});

// ---------------- Study guide setup ----------------
let guideMode = "guide";

async function openGuideSetup() {
  const notes = await DB.listNotes(state.currentClass.id);
  state.currentNotes = notes;
  if (notes.length === 0) {
    alert("Scan at least one note in this class first.");
    return;
  }
  const dates = notes.map((n) => n.date).sort();
  document.getElementById("guide-from").value = dates[0];
  document.getElementById("guide-to").value = dates[dates.length - 1];
  document.getElementById("guide-from").min = dates[0];
  document.getElementById("guide-from").max = dates[dates.length - 1];
  document.getElementById("guide-to").min = dates[0];
  document.getElementById("guide-to").max = dates[dates.length - 1];
  guideMode = "guide";
  document.querySelectorAll("#guide-mode .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === "guide"));
  updateGuideCount();
  navigateTo("guide-setup");
}

document.querySelectorAll("#guide-mode .seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    guideMode = btn.dataset.mode;
    document.querySelectorAll("#guide-mode .seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
  });
});

function notesInRange() {
  const from = document.getElementById("guide-from").value;
  const to = document.getElementById("guide-to").value;
  return state.currentNotes.filter((n) => n.date >= from && n.date <= to);
}

function updateGuideCount() {
  const n = notesInRange().length;
  document.getElementById("guide-note-count").textContent = `${n} note${n === 1 ? "" : "s"} in this range`;
}
document.getElementById("guide-from").addEventListener("change", updateGuideCount);
document.getElementById("guide-to").addEventListener("change", updateGuideCount);

document.getElementById("btn-generate-guide").addEventListener("click", async () => {
  const selected = notesInRange();
  if (selected.length === 0) {
    alert("No notes fall in that date range.");
    return;
  }
  const btn = document.getElementById("btn-generate-guide");
  btn.disabled = true;
  btn.textContent = "Generating...";

  showLoadingOverlay("Creating "+ (guideMode ==="quiz" ? "Practice quiz" : "Study guide"), "Reading notes...")

  try {
    const from = document.getElementById("guide-from").value;
    const to = document.getElementById("guide-to").value;
    const dateLabel = from === to ? from : `${from} to ${to}`;
    const text = await Gemini.generateStudyMaterial({
      className: state.currentClass.name,
      notes: selected,
      mode: guideMode,
      dateLabel,
    });
    state.guideTitle = guideMode === "quiz" ? "Practice quiz" : "Study guide";
    state.guideRawText = text;
    document.getElementById("guide-content").innerHTML = renderMarkdown(text);
    navigateTo("guide-result");
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate";
    hideLoadingOverlay()
  }
});

document.getElementById("btn-copy-guide").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.guideRawText || "");
    const b = document.getElementById("btn-copy-guide");
    const old = b.textContent;
    b.textContent = "Copied!";
    setTimeout(() => (b.textContent = old), 1200);
  } catch (_) {
    alert("Couldn't copy — select and copy the text manually.");
  }
});

// ---------------- Ask (with follow-ups) ----------------
const askMessagesEl = document.getElementById("ask-messages");
const askEmptyEl = document.getElementById("ask-empty");
const askStatusEl = document.getElementById("ask-status");
const askForm = document.getElementById("ask-form");
const askInput = document.getElementById("ask-input");
const btnAskSend = document.getElementById("btn-ask-send");

askInput.addEventListener('input', () => {
  askInput.style.height = 'auto';
  askInput.style.height = Math.min(askInput.scrollHeight, 120) + 'px';
});

askInput.addEventListener('focus', () => {
  setTimeout(() => {
    askInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 300);
});

async function openAsk() {
  const notes = await DB.listNotes(state.currentClass.id);
  state.currentNotes = notes;
  if (notes.length === 0) {
    alert("Scan at least one note in this class first.");
    return;
  }
  state.askMessages = [];
  askInput.value = "";
  renderAskMessages();
  navigateTo("ask");
  setTimeout(() => askInput.focus(), 0);
}

function renderAskMessages() {
  askEmptyEl.hidden = state.askMessages.length > 0;
  askMessagesEl.innerHTML = "";
  state.askMessages.forEach((msg) => {
    const bubble = document.createElement("div");
    bubble.className = "ask-msg " + (msg.role === "user" ? "ask-msg-user" : "ask-msg-model");
    if (msg.role === "user") {
      bubble.textContent = msg.text;
    } else {
      bubble.innerHTML = renderMarkdown(msg.text);
    }
    askMessagesEl.appendChild(bubble);
  });
  askMessagesEl.scrollTop = askMessagesEl.scrollHeight;
}

function autosizeAskInput() {
  askInput.style.height = "auto";
  askInput.style.height = Math.min(askInput.scrollHeight, 160) + "px";
}

askInput.addEventListener("input", autosizeAskInput);
askInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    askForm.requestSubmit();
  }
});

askForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const question = askInput.value.trim();
  if (!question || !state.currentClass) return;

  state.askMessages.push({ role: "user", text: question });
  askInput.value = "";
  autosizeAskInput();
  renderAskMessages();

  btnAskSend.disabled = true;
  askInput.disabled = true;
  setStatus(askStatusEl, "Thinking...", "");

  try {
    const answer = await Gemini.askQuestion({
      className: state.currentClass.name,
      notes: state.currentNotes,
      messages: state.askMessages,
    });
    state.askMessages.push({ role: "model", text: answer });
    askStatusEl.hidden = true;
    renderAskMessages();
  } catch (err) {
    state.askMessages.pop();
    askInput.value = question;
    autosizeAskInput();
    renderAskMessages();
    setStatus(askStatusEl, err.message, "error");
  } finally {
    btnAskSend.disabled = false;
    askInput.disabled = false;
    askInput.focus();
  }
});

// ---------------- Settings ----------------
document.getElementById("btn-test-key").addEventListener("click", async () => {
  const status = document.getElementById("settings-status");
  const key = document.getElementById("settings-key").value.trim();
  const model = document.getElementById("settings-model").value.trim() || "gemini-3.6-flash";
  if (!key) {
    setStatus(status, "Paste an API key first.", "error");
    return;
  }
  localStorage.setItem("ss_api_key", key);
  localStorage.setItem("ss_model", model);
  setStatus(status, "Testing...", "");
  try {
    await Gemini.testKey();
    setStatus(status, "Key works! Settings saved.", "ok");
  } catch (err) {
    setStatus(status, err.message, "error");
  }
});

document.getElementById("btn-save-settings").addEventListener("click", () => {
  const key = document.getElementById("settings-key").value.trim();
  const model = document.getElementById("settings-model").value.trim() || "gemini-3.6-flash";
  localStorage.setItem("ss_api_key", key);
  localStorage.setItem("ss_model", model);
  navigateTo("classes");
});

// ---------------- Boot ----------------
renderClassList();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => { });
  });
}