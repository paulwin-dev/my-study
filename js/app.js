// Study Scanner — app controller. Vanilla JS, no build step, no framework.

const SWATCHES = ["#E3B23C", "#C97A6D", "#6FA98C", "#7FA8C9", "#B58FD1", "#D9915A"];

const state = {
  classes: [],
  currentClass: null,
  currentNotes: [],
  captureBlob: null,
  captureDataUrl: null,
  view: "classes",
};

// ---------------- View routing ----------------
const views = {
  classes: document.getElementById("view-classes"),
  class: document.getElementById("view-class"),
  capture: document.getElementById("view-capture"),
  "guide-setup": document.getElementById("view-guide-setup"),
  "guide-result": document.getElementById("view-guide-result"),
  settings: document.getElementById("view-settings"),
};
const titles = {
  classes: "Study Scanner",
  class: () => state.currentClass?.name || "Class",
  capture: "Scan a note",
  "guide-setup": "Study guide",
  "guide-result": () => state.guideTitle || "Study guide",
  settings: "Settings",
};
const backTargets = {
  class: "classes",
  capture: "class",
  "guide-setup": "class",
  "guide-result": "guide-setup",
  settings: "classes",
};

function showView(name) {
  Object.values(views).forEach((v) => (v.hidden = true));
  views[name].hidden = false;
  state.view = name;
  const t = titles[name];
  document.getElementById("topbar-title").textContent = typeof t === "function" ? t() : t;
  document.getElementById("btn-back").hidden = !backTargets[name];
  window.scrollTo(0, 0);
}

document.getElementById("btn-back").addEventListener("click", () => {
  const target = backTargets[state.view];
  if (target) navigateTo(target);
});
document.getElementById("btn-settings").addEventListener("click", () => {
  document.getElementById("settings-key").value = localStorage.getItem("ss_api_key") || "";
  document.getElementById("settings-model").value = localStorage.getItem("ss_model") || "gemini-2.5-flash";
  showView("settings");
});

function navigateTo(name) {
  if (name === "classes") renderClassList();
  if (name === "class") renderNoteList();
  showView(name);
}

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
    btn.addEventListener("click", () => openClass(cls));
    grid.appendChild(btn);
  }
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
      ev.stopPropagation();
      if (confirm("Delete this scanned note?")) {
        await DB.deleteNote(note.id);
        renderNoteList();
      }
    });
    row.appendChild(del);
    list.appendChild(row);
  });
}

document.getElementById("btn-scan-note").addEventListener("click", () => {
  resetCaptureView();
  navigateTo("capture");
});
document.getElementById("btn-make-guide").addEventListener("click", () => {
  openGuideSetup();
});

// ---------------- Capture flow ----------------
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

function resetCaptureView() {
  state.captureBlob = null;
  captureInput.value = "";
  capturePreview.hidden = true;
  captureLabel.hidden = false;
  captureDate.value = new Date().toISOString().slice(0, 10);
  captureStatus.hidden = true;
  captureTextField.hidden = true;
  captureText.value = "";
  btnRunOcr.disabled = true;
  btnRunOcr.textContent = "Transcribe with AI";
  btnSaveNote.hidden = true;
}

captureInput.addEventListener("change", async () => {
  const file = captureInput.files[0];
  if (!file) return;
  setStatus(captureStatus, "Compressing image...", "");
  const compressed = await compressImage(file, 1500, 0.72);
  state.captureBlob = compressed;
  capturePreview.src = URL.createObjectURL(compressed);
  capturePreview.hidden = false;
  captureLabel.hidden = true;
  captureStatus.hidden = true;
  btnRunOcr.disabled = false;
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

function setStatus(el, msg, kind) {
  el.hidden = false;
  el.textContent = msg;
  el.className = "status-line" + (kind ? " " + kind : "");
}

btnRunOcr.addEventListener("click", async () => {
  if (!state.captureBlob) return;
  btnRunOcr.disabled = true;
  btnRunOcr.textContent = "Transcribing...";
  setStatus(captureStatus, "Sending to Gemini for transcription...", "");
  try {
    const text = await Gemini.ocrImage(state.captureBlob);
    captureText.value = text;
    captureTextField.hidden = false;
    btnSaveNote.hidden = false;
    setStatus(captureStatus, "Done — review the text below, then save.", "ok");
  } catch (err) {
    setStatus(captureStatus, err.message, "error");
  } finally {
    btnRunOcr.disabled = false;
    btnRunOcr.textContent = "Re-transcribe";
  }
});

btnSaveNote.addEventListener("click", async () => {
  if (!state.captureBlob || !state.currentClass) return;
  await DB.addNote({
    classId: state.currentClass.id,
    date: captureDate.value || new Date().toISOString().slice(0, 10),
    imageBlob: state.captureBlob,
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

// ---------------- Settings ----------------
document.getElementById("btn-test-key").addEventListener("click", async () => {
  const status = document.getElementById("settings-status");
  const key = document.getElementById("settings-key").value.trim();
  const model = document.getElementById("settings-model").value.trim() || "gemini-2.5-flash";
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
  const model = document.getElementById("settings-model").value.trim() || "gemini-2.5-flash";
  localStorage.setItem("ss_api_key", key);
  localStorage.setItem("ss_model", model);
  navigateTo("classes");
});

// ---------------- Boot ----------------
renderClassList();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      /* offline shell just won't be available — app still works online */
    });
  });
}
