import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { animate as _animate, spring, easeInOut } from "motion";
const animate = _animate as any;
import { createEditor, setEditorContent, getEditorContent, setEditorDarkMode, getEditorScrollElement } from "./editor";
import { renderPreviewContent } from "./preview";
import type { AppState, ViewMode, Settings } from "./types";
import "./styles/main.css";
import "highlight.js/styles/github.css";

const state: AppState = {
  currentFile: null,
  content: "",
  originalContent: "",
  modified: false,
  viewMode: "view",
  darkMode: false,
};

const defaultSettings: Settings = {
  ollamaEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.2:3b",
  autoSaveInterval: 2000,
  recentFiles: [],
};

let settings: Settings = { ...defaultSettings };
let autoSaveTimer: ReturnType<typeof setInterval> | null = null;
let ollamaCheckTimer: ReturnType<typeof setInterval> | null = null;

const editorPanel = document.getElementById("editor-panel")!;
const previewPanel = document.getElementById("preview-panel")!;
const previewContainer = document.getElementById("preview-container")!;
const editorContainer = document.getElementById("editor-container")!;
const emptyState = document.getElementById("empty-state")!;
const filenameEl = document.getElementById("filename")!;
const modifiedDot = document.getElementById("modified-dot")!;
const statusText = document.getElementById("status-text")!;
const statusOllama = document.getElementById("status-ollama")!;
const statusFilenameBottom = document.getElementById("status-filename-bottom")!;

const dropOverlay = document.getElementById("drop-overlay")!;
const dropContent = dropOverlay.querySelector(".drop-content") as HTMLElement;
const findBar = document.getElementById("find-bar")!;
const findInput = document.getElementById("find-input")! as HTMLInputElement;
const findCount = document.getElementById("find-count")!;
const findPrevBtn = document.getElementById("find-prev")!;
const findNextBtn = document.getElementById("find-next")!;
const findCloseBtn = document.getElementById("find-close")!;

const settingsModal = document.getElementById("settings-modal")!;
const settingsBackdrop = document.getElementById("settings-backdrop")!;
const settingsClose = document.getElementById("settings-close")!;
const ollamaStatus = document.getElementById("ollama-status")!;

const ollamaDialog = document.getElementById("ollama-dialog")!;
const ollamaSpinnerArc = document.getElementById("ollama-spinner-arc")!;
const ollamaDialogText = document.getElementById("ollama-dialog-text")!;
const ollamaDialogSub = document.getElementById("ollama-dialog-sub")!;
const ollamaCancel = document.getElementById("ollama-cancel")!;

const successOverlay = document.getElementById("success-overlay")!;

// Ollama Setup Dialog
const ollamaSetup = document.getElementById("ollama-setup")!;
const ollamaSetupBackdrop = document.getElementById("ollama-setup-backdrop")!;
const ollamaSetupClose = document.getElementById("ollama-setup-close")!;
const setupSkip = document.getElementById("setup-skip")!;
const setupStart = document.getElementById("setup-start")!;
const setupFinish = document.getElementById("setup-finish")!;
const setupErrorClose = document.getElementById("setup-error-close")!;
const setupModelSelect = document.getElementById("setup-model-select")! as HTMLSelectElement;
const setupProgressBar = document.getElementById("setup-progress-bar")!;
const setupDownloadText = document.getElementById("setup-download-text")!;
const setupProgressText = document.getElementById("setup-progress-text")!;
const setupPullText = document.getElementById("setup-pull-text")!;
const setupErrorText = document.getElementById("setup-error-text")!;
const setupSpinnerArc = document.getElementById("setup-spinner-arc")!;
const setupSpinnerArc2 = document.getElementById("setup-spinner-arc2")!;
const setupSpinnerArc3 = document.getElementById("setup-spinner-arc3")!;
const successCircle = document.getElementById("success-circle")!;
const successCheck = document.getElementById("success-check")!;
const successText = document.getElementById("success-text")!;

const btnView = document.getElementById("btn-view")!;
const btnEdit = document.getElementById("btn-edit")!;
const btnSplit = document.getElementById("btn-split")!;
const btnOpen = document.getElementById("btn-open")!;
const btnSave = document.getElementById("btn-save")!;
const btnTheme = document.getElementById("btn-theme")!;
const btnFind = document.getElementById("btn-find")!;
const btnOllama = document.getElementById("btn-ollama")!;
const btnSettings = document.getElementById("btn-settings")!;

// === Animations ===
function showWithFade(el: HTMLElement, duration = 0.2): void {
  el.classList.remove("hidden");
  animate(el, { opacity: [0, 1] }, { duration, ease: easeInOut });
}

function hideWithFade(el: HTMLElement, duration = 0.15): void {
  animate(el, { opacity: [1, 0] }, { duration, ease: easeInOut, onFinish: () => el.classList.add("hidden") });
}

function showModal(el: HTMLElement, inner: HTMLElement): void {
  el.classList.remove("hidden");
  animate(el, { opacity: [0, 1] }, { duration: 0.15, ease: easeInOut });
  animate(inner, { opacity: [0, 1], scale: [0.92, 1] }, { duration: 0.2, ease: spring() });
}

function hideModal(el: HTMLElement, inner: HTMLElement): void {
  animate(
    inner,
    { opacity: [1, 0], scale: [1, 0.95] },
    { duration: 0.15, ease: easeInOut, onFinish: () => el.classList.add("hidden") }
  );
  animate(el, { opacity: [1, 0] }, { duration: 0.15, ease: easeInOut });
}

function animateSpinner(el: SVGElement, loop = true): void {
  animate(el, { rotate: [0, 360] }, { duration: 1, ease: "linear", repeat: loop ? Infinity : 0 });
}

async function showSuccessOverlay(msg: string): Promise<void> {
  successText.textContent = msg;
  successOverlay.classList.remove("hidden");

  // Reset
  successCircle.setAttribute("stroke-dasharray", "176");
  successCircle.setAttribute("stroke-dashoffset", "176");
  successCheck.setAttribute("stroke-dasharray", "36");
  successCheck.setAttribute("stroke-dashoffset", "36");

  animate(successOverlay, { opacity: [0, 1] }, { duration: 0.15, ease: easeInOut });
  await animate(successCircle, { strokeDashoffset: [176, 0] }, { duration: 0.3, ease: easeInOut }).finished;
  await animate(successCheck, { strokeDashoffset: [36, 0] }, { duration: 0.2, ease: easeInOut }).finished;

  await new Promise((r) => setTimeout(r, 800));
  animate(successOverlay, { opacity: [1, 0], scale: [1, 0.95] }, { duration: 0.2, ease: easeInOut, onFinish: () => successOverlay.classList.add("hidden") });
}

// === Settings ===
async function loadSettings(): Promise<void> {
  try {
    const raw = await invoke<string>("read_settings");
    if (raw && raw !== "{}") {
      const parsed = JSON.parse(raw);
      settings = { ...defaultSettings, ...parsed };
    }
  } catch {}
  applySettingsUI();
}

async function saveSettings(): Promise<void> {
  try {
    await invoke("save_settings", { content: JSON.stringify(settings) });
  } catch {}
}

function applySettingsUI(): void {
  (document.getElementById("setting-ollama-enabled") as HTMLInputElement).checked = settings.ollamaEnabled;
  (document.getElementById("setting-ollama-endpoint") as HTMLInputElement).value = settings.ollamaEndpoint;
  (document.getElementById("setting-ollama-model") as HTMLInputElement).value = settings.ollamaModel;
  (document.getElementById("setting-autosave") as HTMLInputElement).value = String(settings.autoSaveInterval);
  updateOllamaStatusBar();
  restartAutoSave();
}

function bindSettingsUI(): void {
  document.getElementById("setting-ollama-enabled")!.addEventListener("change", (e) => {
    settings.ollamaEnabled = (e.target as HTMLInputElement).checked;
    saveSettings();
    updateOllamaStatusBar();
  });
  document.getElementById("setting-ollama-endpoint")!.addEventListener("change", (e) => {
    settings.ollamaEndpoint = (e.target as HTMLInputElement).value.trim() || defaultSettings.ollamaEndpoint;
    saveSettings();
  });
  document.getElementById("setting-ollama-model")!.addEventListener("change", (e) => {
    settings.ollamaModel = (e.target as HTMLInputElement).value.trim() || defaultSettings.ollamaModel;
    saveSettings();
  });
  document.getElementById("setting-autosave")!.addEventListener("change", (e) => {
    settings.autoSaveInterval = Math.max(500, parseInt((e.target as HTMLInputElement).value) || 2000);
    saveSettings();
    restartAutoSave();
  });
  document.getElementById("clear-recent")!.addEventListener("click", () => {
    settings.recentFiles = [];
    saveSettings();
    setStatus("Recent Files gelöscht");
  });
}

async function checkOllamaStatus(): Promise<boolean> {
  if (!settings.ollamaEnabled) return false;
  try {
    return await invoke<boolean>("check_ollama", { endpoint: settings.ollamaEndpoint });
  } catch {
    return false;
  }
}

async function updateOllamaStatusBar(): Promise<void> {
  const running = await checkOllamaStatus();
  const dot = statusOllama.querySelector("span")!;
  statusOllama.classList.toggle("hidden", !settings.ollamaEnabled);
  if (settings.ollamaEnabled) {
    dot.style.background = running ? "var(--accent)" : "var(--text-tertiary)";
    dot.title = running ? "KI verbunden" : "KI nicht verfügbar";
  }
}

// === Ollama ===
async function formatWithOllama(): Promise<void> {
  if (!settings.ollamaEnabled) {
    setStatus("KI-Formatierung in Einstellungen aktivieren");
    return;
  }

  const content = state.viewMode === "edit" ? getEditorContent() : state.content;
  if (!content.trim()) {
    setStatus("Kein Text zum Formatieren");
    return;
  }

  // Show loading dialog
  const inner = ollamaDialog.querySelector(".settings-panel") as HTMLElement;
  showModal(ollamaDialog, inner);
  ollamaDialogSub.classList.add("hidden");
  ollamaCancel.classList.add("hidden");
  ollamaDialogText.textContent = "Verbinde mit KI...";
  ollamaDialogSub.textContent = "";
  animateSpinner(ollamaSpinnerArc as unknown as SVGSVGElement);

  const running = await checkOllamaStatus();
  if (!running) {
    hideModal(ollamaDialog, inner);
    setStatus("Ollama läuft nicht – prüfe Einstellungen");
    return;
  }

  ollamaDialogText.textContent = "Formatiere Text...";
  ollamaDialogSub.classList.remove("hidden");
  ollamaDialogSub.textContent = "Wird an Ollama gesendet…";
  try {
    const result = await invoke<string>("format_with_ollama", {
      endpoint: settings.ollamaEndpoint,
      model: settings.ollamaModel,
      text: content,
    });
    hideModal(ollamaDialog, inner);
    state.content = result;
    state.modified = result !== state.originalContent;
    setEditorContent(result);
    updatePreview();
    updateTitle();
    showSuccessOverlay("Text formatiert");
  } catch (err) {
    hideModal(ollamaDialog, inner);
    setStatus(`Fehler: ${err}`);
  }
}

// === Ollama Setup Flow ===
function goToSetupStep(step: number): void {
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`setup-page-${i}`)!.classList.add("hidden");
    document.getElementById(`setup-step-${i}`)!.classList.remove("active");
  }
  document.getElementById("setup-page-done")!.classList.add("hidden");
  document.getElementById("setup-page-error")!.classList.add("hidden");

  if (step <= 4) {
    document.getElementById(`setup-page-${step}`)!.classList.remove("hidden");
    document.getElementById(`setup-step-${step}`)!.classList.add("active");
  }
}

function showOllamaSetup(): void {
  const panel = ollamaSetup.querySelector(".settings-panel") as HTMLElement;
  showModal(ollamaSetup, panel);
  goToSetupStep(1);
}

function hideOllamaSetup(): void {
  const panel = ollamaSetup.querySelector(".settings-panel") as HTMLElement;
  hideModal(ollamaSetup, panel);
}

async function waitForOllamaReady(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const ok = await checkOllamaStatus();
    if (ok) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Ollama wurde nicht rechtzeitig gestartet");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

async function startOllamaSetup(): Promise<void> {
  const model = setupModelSelect.value;
  settings.ollamaModel = model;
  settings.ollamaEnabled = true;
  saveSettings();

  try {
    // Step 2 – Download
    goToSetupStep(2);
    setupProgressBar.style.width = "0%";
    setupDownloadText.textContent = "Lade Ollama herunter…";
    setupProgressText.textContent = "Starte Download…";
    animateSpinner(setupSpinnerArc as unknown as SVGSVGElement);

    const path = await invoke<string>("download_ollama");

    setupProgressBar.style.width = "100%";
    setupProgressText.textContent = "Download abgeschlossen";

    // Step 3 – Install
    goToSetupStep(3);
    animateSpinner(setupSpinnerArc2 as unknown as SVGSVGElement);
    await invoke("install_ollama", { path });

    // Wait for Ollama to start
    await waitForOllamaReady();

    // Step 4 – Pull model
    goToSetupStep(4);
    setupPullText.textContent = `Lade ${model}…`;
    animateSpinner(setupSpinnerArc3 as unknown as SVGSVGElement);
    await invoke("pull_ollama_model", { model });

    // Done
    goToSetupStep(5);
    updateOllamaStatusBar();
    setStatus("KI-Formatierung einsatzbereit");
  } catch (err) {
    showSetupError(`${err}`);
  }
}

function showSetupError(msg: string): void {
  setupErrorText.textContent = msg;
  goToSetupStep(0);
  document.getElementById("setup-page-error")!.classList.remove("hidden");
}

async function refreshModelSuggestions(): Promise<void> {
  if (!settings.ollamaEnabled) return;
  try {
    const models = await invoke<string[]>("get_ollama_models", {
      endpoint: settings.ollamaEndpoint,
    });
    const datalist = document.getElementById("model-suggestions")!;
    datalist.innerHTML = models.map((m) => `<option value="${m}">`).join("");
  } catch {}
}

// Überprüft beim Start ob Ollama fehlt und zeigt Setup an
async function checkFirstRunOllama(): Promise<void> {
  const running = await checkOllamaStatus();
  if (!running && settings.ollamaEnabled) {
    showOllamaSetup();
  }
}

// === Auto-Save ===
function restartAutoSave(): void {
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  autoSaveTimer = setInterval(() => {
    if (state.modified && state.currentFile) {
      saveFile(true);
    }
  }, settings.autoSaveInterval);
}

// === File Operations ===
function updateTitle(): void {
  const name = state.currentFile
    ? state.currentFile.split("\\").pop()?.split("/").pop()
    : "Keine Datei geöffnet";
  filenameEl.textContent = name ?? "Keine Datei geöffnet";
  modifiedDot.classList.toggle("hidden", !state.modified);
  statusFilenameBottom.textContent = state.currentFile ?? "";
  document.title = state.modified ? `* ${name} - Remark` : `${name} - Remark`;
}

function setStatus(msg: string): void {
  statusText.textContent = msg;
  animate(statusText, { opacity: [0, 1] }, { duration: 0.15, ease: easeInOut });
}

function updatePreview(): void {
  const content = state.viewMode === "edit" ? getEditorContent() : state.content;
  if (content.trim()) {
    emptyState.classList.add("hidden");
    previewContainer.classList.remove("hidden");
    renderPreviewContent(previewContainer, content);
  } else {
    emptyState.classList.remove("hidden");
    previewContainer.classList.add("hidden");
  }
}

function onContentChange(content: string): void {
  state.content = content;
  state.modified = content !== state.originalContent;
  updateTitle();
  if (state.viewMode === "split" || state.viewMode === "view") {
    updatePreview();
  }
}

function setViewMode(mode: ViewMode): void {
  state.viewMode = mode;
  btnView.classList.toggle("active", mode === "view");
  btnEdit.classList.toggle("active", mode === "edit");
  btnSplit.classList.toggle("active", mode === "split");

  const edWasHidden = editorPanel.classList.contains("hidden");
  const pvWasHidden = previewPanel.classList.contains("hidden");
  editorPanel.classList.toggle("hidden", mode === "view");
  previewPanel.classList.toggle("hidden", mode === "edit");

  if (mode === "edit" || mode === "split") {
    if (!editorContainer.querySelector(".cm-editor")) {
      createEditor(editorContainer, state.darkMode);
      setEditorContent(state.content);
      setupScrollListeners();
    }
    if (edWasHidden) animate(editorPanel, { opacity: [0, 1] }, { duration: 0.2, ease: easeInOut });
  }
  if (mode === "view" || mode === "split") {
    if (pvWasHidden) animate(previewPanel, { opacity: [0, 1] }, { duration: 0.2, ease: easeInOut });
    updatePreview();
  }
}

async function openFile(path?: string): Promise<void> {
  let filePath = path;
  if (!filePath) {
    const result = await open({
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
    });
    if (!result) return;
    filePath = result as string;
  }

  try {
    const content = await invoke<string>("read_file", { path: filePath });
    state.currentFile = filePath;
    state.content = content;
    state.originalContent = content;
    state.modified = false;
    updateTitle();
    updatePreview();
    setEditorContent(content);
    await showSuccessOverlay("Datei geöffnet");

    settings.recentFiles = settings.recentFiles.filter((f) => f !== filePath);
    settings.recentFiles.unshift(filePath);
    if (settings.recentFiles.length > 10) settings.recentFiles.length = 10;
    saveSettings();
  } catch (err) {
    setStatus(`Fehler beim Öffnen: ${err}`);
  }
}

async function saveFile(silent = false): Promise<void> {
  if (!state.currentFile) {
    const result = await save({
      filters: [{ name: "Markdown", extensions: ["md"] }],
      defaultPath: "dokument.md",
    });
    if (!result) return;
    state.currentFile = result as string;
    settings.recentFiles = settings.recentFiles.filter((f) => f !== result);
    settings.recentFiles.unshift(result as string);
    if (settings.recentFiles.length > 10) settings.recentFiles.length = 10;
    saveSettings();
  }
  const content = getEditorContent();
  try {
    await invoke("write_file", { path: state.currentFile, content });
    state.content = content;
    state.originalContent = content;
    state.modified = false;
    updateTitle();
    if (!silent) await showSuccessOverlay("Gespeichert");
  } catch (err) {
    if (!silent) setStatus(`Fehler beim Speichern: ${err}`);
  }
}

function toggleTheme(): void {
  state.darkMode = !state.darkMode;
  document.documentElement.classList.toggle("dark", state.darkMode);
  const icon = document.getElementById("theme-icon")!;
  icon.innerHTML = state.darkMode
    ? `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`
    : `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
  animate(icon, { rotate: [0, 180] }, { duration: 0.3, ease: spring() });
  setEditorDarkMode(state.darkMode);
}

// === Find / Search ===
function showFindBar(): void {
  findBar.classList.remove("hidden");
  animate(findBar, { height: ["0px", "36px"], opacity: [0, 1] }, { duration: 0.15, ease: easeInOut });
  findInput.focus();
  findInput.select();
  findInEditor(findInput.value);
}

function hideFindBar(): void {
  animate(findBar, { opacity: [1, 0] }, { duration: 0.1, ease: easeInOut, onFinish: () => findBar.classList.add("hidden") });
  findInEditor("");
}

function findInEditor(query: string, direction: "next" | "prev" | "init" = "init"): void {
  if (state.viewMode !== "edit" && state.viewMode !== "split") return;
  dispatchEvent(new CustomEvent("editor-find", { detail: { query, direction } }));
}

function findNext(): void {
  findInEditor(findInput.value, "next");
}

function findPrev(): void {
  findInEditor(findInput.value, "prev");
}

function updateFindCount(): void {
  const q = findInput.value;
  if (!q) {
    findCount.textContent = "";
    return;
  }
  const content = state.viewMode === "edit" ? getEditorContent() : state.content;
  const matches = content.toLowerCase().split(q.toLowerCase()).length - 1;
  findCount.textContent = `${matches} Treffer`;
}

// === Scroll Sync ===
function syncScroll(source: HTMLElement, target: HTMLElement): void {
  const pct = source.scrollTop / (source.scrollHeight - source.clientHeight);
  target.scrollTop = pct * (target.scrollHeight - target.clientHeight);
}

// === Events ===
addEventListener("editor-change", ((e: CustomEvent) => {
  onContentChange(e.detail.content);
}) as EventListener);

btnOpen.addEventListener("click", () => openFile());
btnSave.addEventListener("click", () => saveFile());
btnView.addEventListener("click", () => setViewMode("view"));
btnEdit.addEventListener("click", () => setViewMode("edit"));
btnSplit.addEventListener("click", () => setViewMode("split"));
btnTheme.addEventListener("click", toggleTheme);
btnFind.addEventListener("click", showFindBar);
btnOllama.addEventListener("click", formatWithOllama);
btnSettings.addEventListener("click", () => {
  const inner = settingsModal.querySelector(".settings-panel") as HTMLElement;
  showModal(settingsModal, inner);
});

findCloseBtn.addEventListener("click", hideFindBar);
findNextBtn.addEventListener("click", findNext);
findPrevBtn.addEventListener("click", findPrev);
findInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.shiftKey ? findPrev() : findNext();
  }
  if (e.key === "Escape") hideFindBar();
});
findInput.addEventListener("input", () => {
  findInEditor(findInput.value);
  updateFindCount();
});

function closeSettings(e: MouseEvent): void {
  const inner = settingsModal.querySelector(".settings-panel") as HTMLElement;
  if (e.target === settingsBackdrop || e.target === settingsClose || (e.target as HTMLElement).closest("#settings-close")) {
    hideModal(settingsModal, inner);
  }
}
settingsBackdrop.addEventListener("click", closeSettings);
settingsClose.addEventListener("click", () => {
  const inner = settingsModal.querySelector(".settings-panel") as HTMLElement;
  hideModal(settingsModal, inner);
});

ollamaDialog.addEventListener("click", (e) => {
  if (e.target === ollamaDialog || (e.target as HTMLElement).id === "ollama-backdrop") {
    const inner = ollamaDialog.querySelector(".settings-panel") as HTMLElement;
    hideModal(ollamaDialog, inner);
  }
});

// === Setup dialog events ===
ollamaSetupBackdrop.addEventListener("click", () => hideOllamaSetup());
ollamaSetupClose.addEventListener("click", hideOllamaSetup);
setupSkip.addEventListener("click", hideOllamaSetup);
setupErrorClose.addEventListener("click", hideOllamaSetup);
setupStart.addEventListener("click", startOllamaSetup);
setupFinish.addEventListener("click", hideOllamaSetup);

// Download progress from Rust
import { listen } from "@tauri-apps/api/event";
listen<{ downloaded: number; total: number }>("ollama-download-progress", (event) => {
  const { downloaded, total } = event.payload;
  const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
  setupProgressBar.style.width = `${pct}%`;
  setupDownloadText.textContent = `Lade Ollama herunter… (${formatBytes(downloaded)} / ${formatBytes(total)})`;
  setupProgressText.textContent = `${pct}%`;
});

// Refresh model suggestions when settings is opened
document.getElementById("btn-settings")!.addEventListener("click", () => {
  refreshModelSuggestions();
});

// Setup button in settings
document.getElementById("setting-install-ollama")?.addEventListener("click", () => {
  const inner = settingsModal.querySelector(".settings-panel") as HTMLElement;
  hideModal(settingsModal, inner);
  setTimeout(() => showOllamaSetup(), 300);
});

document.addEventListener("keydown", (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === "o") { e.preventDefault(); openFile(); }
  if (ctrl && e.key === "s") { e.preventDefault(); saveFile(); }
  if (ctrl && e.shiftKey && e.key === "V") { e.preventDefault(); setViewMode("view"); }
  if (ctrl && e.key === "e") { e.preventDefault(); setViewMode("edit"); }
  if (ctrl && e.shiftKey && e.key === "E") { e.preventDefault(); setViewMode("split"); }
  if (ctrl && e.key === "f") { e.preventDefault(); showFindBar(); }
  if (e.key === "F3") { e.preventDefault(); findNext(); }
  if (e.key === "Escape" && !findBar.classList.contains("hidden")) hideFindBar();
  if (e.key === "Escape" && !settingsModal.classList.contains("hidden")) {
    const inner = settingsModal.querySelector(".settings-panel") as HTMLElement;
    hideModal(settingsModal, inner);
  }
  if (e.key === "Escape" && !ollamaDialog.classList.contains("hidden")) {
    const inner = ollamaDialog.querySelector(".settings-panel") as HTMLElement;
    hideModal(ollamaDialog, inner);
  }
});

// Drag & Drop (Tauri-native)
getCurrentWindow().onDragDropEvent(async (event) => {
  if (event.payload.type === "over") {
    dropOverlay.classList.remove("hidden");
    animate(dropOverlay, { opacity: [0, 1] }, { duration: 0.15, ease: easeInOut });
    animate(dropContent, { scale: [0.92, 1] }, { duration: 0.2, ease: spring() });
  } else if (event.payload.type === "leave") {
    animate(dropOverlay, { opacity: [1, 0] }, { duration: 0.15, ease: easeInOut, onFinish: () => dropOverlay.classList.add("hidden") });
  } else if (event.payload.type === "drop") {
    animate(dropOverlay, { opacity: [1, 0] }, { duration: 0.1, ease: easeInOut, onFinish: () => dropOverlay.classList.add("hidden") });
    const path = event.payload.paths[0];
    if (!path) return;
    if (!path.endsWith(".md") && !path.endsWith(".markdown") && !path.endsWith(".txt")) {
      setStatus("Nur .md, .markdown oder .txt Dateien");
      return;
    }
    await openFile(path);
  }
});

// Scroll sync
const previewScrollEl = document.getElementById("preview-panel")!;
let editorScrollEl: HTMLElement | null = null;

function setupScrollListeners(): void {
  editorScrollEl = getEditorScrollElement();
  if (!editorScrollEl) {
    setTimeout(setupScrollListeners, 200);
    return;
  }
  editorScrollEl.addEventListener("scroll", () => {
    if (state.viewMode === "split") syncScroll(editorScrollEl!, previewScrollEl);
  }, { passive: true });
  previewScrollEl.addEventListener("scroll", () => {
    if (state.viewMode === "split") syncScroll(previewScrollEl, editorScrollEl!);
  }, { passive: true });
}

// === Init ===
async function init(): Promise<void> {
  await loadSettings();
  bindSettingsUI();

  try {
    const initialFile = await invoke<string | null>("get_initial_file");
    if (initialFile) {
      await openFile(initialFile);
    }
  } catch {}

  document.documentElement.classList.toggle("dark", state.darkMode);
  setViewMode("view");
  updateTitle();
      setStatus("Bereit");

  // First-run check – if Ollama fehlt, Setup vorschlagen
  await checkFirstRunOllama();

  ollamaCheckTimer = setInterval(updateOllamaStatusBar, 30000);
}

init();
