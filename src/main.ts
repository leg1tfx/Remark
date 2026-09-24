import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save, ask } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { animate as _animate, easeInOut } from "motion";
import { createEditor, setEditorContent, setEditorLanguage, getEditorScrollElement, getEditorScrollTop, setEditorScrollTop, openDocument, stashDocument, forgetDocument, insertAtCursor, wrapSelection, wrapLines, setHeading, wrapLink, getSelection, replaceSelection, replaceLine, goToLine } from "./editor";
import { renderPreviewContent, buildToc, type RenderOptions } from "./preview";
import { buildHtmlDocument, renderToHtml, printMarkdown } from "./export";
import { registerOverlay, showOverlay, hideOverlay, isOverlayOpen, dismissTopOverlay } from "./overlay";
import { lintMarkdown } from "./lint";
import { findTaskLines, setTaskChecked } from "./tasks";
import { escHtml, baseName, dirName, resolvePath, isAbsolutePath, samePath } from "./utils";
import type { AppState, ViewMode, Settings, Tab, FileEntry, LintIssue } from "./types";
import "./styles/main.css";
import "highlight.js/styles/github.css";

const animate = _animate as (...args: any[]) => any;

function invokeWithTimeout<T>(cmd: string, args: Record<string, unknown>, timeoutMs = 30000): Promise<T> {
  return Promise.race([
    invoke<T>(cmd, args),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${cmd} timed out`)), timeoutMs)),
  ]);
}

// === State ===
const state: AppState = {
  tabs: [],
  activeTabId: null,
  viewMode: "view",
  darkMode: false,
  sidebarOpen: false,
  sidebarPanel: "files",
  typewriterMode: false,
};

let tabCounter = 0;
function nextTabId(): string { return `tab-${++tabCounter}`; }

function getActiveTab(): Tab | null {
  if (!state.activeTabId) return null;
  return state.tabs.find((t) => t.id === state.activeTabId) ?? null;
}

function setActiveTab(t: Tab | null): void {
  state.activeTabId = t?.id ?? null;
}

const defaultSettings: Settings = {
  ollamaEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.2:3b",
  autoSaveInterval: 2000,
  recentFiles: [],
  splitRatio: 0.5,
  ollamaSetupComplete: false,
  language: "en",
  lineBreaks: false,
};

let settings: Settings = { ...defaultSettings };
let autoSaveTimer: ReturnType<typeof setInterval> | null = null;
let ollamaCheckTimer: ReturnType<typeof setTimeout> | null = null;

// === DOM refs ===
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
const statusLanguage = document.getElementById("status-language")! as HTMLSelectElement;
const wordCountEl = document.getElementById("word-count")!;
const resizeHandle = document.getElementById("resize-handle")!;
const btnLint = document.getElementById("btn-lint")!;
const lintCount = document.getElementById("lint-count")!;
const lintPanel = document.getElementById("lint-panel")!;
const btnUpdate = document.getElementById("btn-update")!;

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
const contextMenu = document.getElementById("context-menu")!;

const ollamaDialog = document.getElementById("ollama-dialog")!;
const ollamaDialogText = document.getElementById("ollama-dialog-text")!;
const ollamaDialogSub = document.getElementById("ollama-dialog-sub")!;
const ollamaSpinnerEl = document.getElementById("ollama-spinner")!;
const ollamaCancelBtn = document.getElementById("ollama-cancel")!;
const successOverlay = document.getElementById("success-overlay")!;
const successToast = document.getElementById("success-toast")!;

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
const setupPullBar = document.getElementById("setup-pull-bar")!;
const setupPullStatus = document.getElementById("setup-pull-status")!;
const setupErrorText = document.getElementById("setup-error-text")!;
const setupSpinner1 = document.getElementById("setup-spinner-1")!;
const setupSpinner2 = document.getElementById("setup-spinner-2")!;
const setupSpinner3 = document.getElementById("setup-spinner-3")!;
const successCircle = document.getElementById("success-circle")!;
const successCheck = document.getElementById("success-check")!;
const successMsgEl = document.getElementById("success-text")!;

const btnOpen = document.getElementById("btn-open")!;
const btnSave = document.getElementById("btn-save")!;
const btnTheme = document.getElementById("btn-theme")!;
const btnViewMode = document.getElementById("btn-view-mode")!;
const iconViewMode = document.getElementById("icon-view-mode")!;
const btnMore = document.getElementById("btn-more")!;
const moreMenu = document.getElementById("more-menu")!;
const menuFocus = document.getElementById("menu-focus")!;
const menuOllama = document.getElementById("menu-ollama")!;
const menuExportHtml = document.getElementById("menu-export-html")!;
const menuExportPdf = document.getElementById("menu-export-pdf")!;

const btnSidebar = document.getElementById("btn-sidebar")!;
const btnNewTab = document.getElementById("btn-new-tab")!;
const tabList = document.getElementById("tab-list")!;
const tabBar = document.getElementById("tab-bar")!;
const sidebar = document.getElementById("sidebar")!;
const sidebarFiles = document.getElementById("sidebar-files")!;
const sidebarToc = document.getElementById("sidebar-toc")!;
const sidebarPanelFiles = document.getElementById("sidebar-panel-files")!;
const sidebarPanelToc = document.getElementById("sidebar-panel-toc")!;

const themeIcon = document.getElementById("theme-icon")!;

// === Overlays ===
// All show/hide logic lives in overlay.ts; here we only declare what each overlay is.
const settingsPanel = settingsModal.querySelector(".settings-panel") as HTMLElement;
const ollamaPanel = ollamaDialog.querySelector(".settings-panel") as HTMLElement;
const setupPanel = ollamaSetup.querySelector(".settings-panel") as HTMLElement;

registerOverlay(settingsModal, { kind: "modal", inner: settingsPanel });
registerOverlay(ollamaDialog, { kind: "modal", inner: ollamaPanel, onDismiss: () => cancelOllama() });
registerOverlay(ollamaSetup, { kind: "modal", inner: setupPanel, onDismiss: () => hideOllamaSetup() });
registerOverlay(successOverlay, { kind: "toast", inner: successToast });
registerOverlay(moreMenu, { kind: "menu" });
registerOverlay(contextMenu, { kind: "menu" });
registerOverlay(lintPanel, { kind: "menu" });
registerOverlay(findBar, { kind: "bar", onDismiss: () => hideFindBar() });
registerOverlay(dropOverlay, { kind: "fade", inner: dropContent });

function animateSpinner(el: Element): void {
  // CSS animation instead of an infinite motion animation (those never stopped → CPU leak).
  el.classList.add("spinner-rotating");
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Non-blocking confirmation toast; a newer call simply restarts it. */
function showSuccessOverlay(msg: string): void {
  successMsgEl.textContent = msg;
  successCircle.setAttribute("stroke-dasharray", "176");
  successCircle.setAttribute("stroke-dashoffset", "176");
  successCheck.setAttribute("stroke-dasharray", "36");
  successCheck.setAttribute("stroke-dashoffset", "36");
  showOverlay(successOverlay);
  animate(successCircle, { strokeDashoffset: [176, 0] }, { duration: 0.35, delay: 0.2, ease: easeInOut });
  animate(successCheck, { strokeDashoffset: [36, 0] }, { duration: 0.25, delay: 0.55, ease: easeInOut });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hideOverlay(successOverlay), 1600);
}

// === Tabs ===
function tabName(tab: Tab): string {
  return tab.file ? baseName(tab.file) : "untitled";
}

function editorReady(): boolean {
  return !!editorContainer.querySelector(".cm-editor");
}

function renderTabBar(): void {
  tabList.innerHTML = "";
  state.tabs.forEach((tab) => {
    const div = document.createElement("div");
    div.className = `tab-item${tab.id === state.activeTabId ? " active" : ""}`;
    div.dataset.tabId = tab.id;
    div.title = tab.file ?? "untitled";
    div.innerHTML = `
      ${tab.modified ? '<span class="tab-modified"></span>' : ""}
      <span class="tab-name">${escHtml(tabName(tab))}</span>
      <span class="tab-close" data-tab-close="${tab.id}">✕</span>
    `;
    div.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".tab-close")) return;
      switchTab(tab.id);
    });
    div.querySelector(".tab-close")!.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    tabList.appendChild(div);
  });
  tabBar.classList.toggle("hidden", state.tabs.length === 0);
}

function addTab(file: string | null, content: string = ""): Tab {
  const tab: Tab = {
    id: nextTabId(),
    file,
    content,
    originalContent: content,
    modified: false,
    scrollTop: 0,
  };
  state.tabs.push(tab);
  switchTab(tab.id);
  saveSession();
  return tab;
}

async function closeTab(id: string): Promise<void> {
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab) return;
  if (tab.modified) {
    const ok = await ask(`"${tabName(tab)}" has unsaved changes. Close anyway?`, {
      title: "Remark",
      kind: "warning",
      okLabel: "Close",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
  }
  const idx = state.tabs.indexOf(tab);
  if (idx < 0) return;
  state.tabs.splice(idx, 1);
  forgetDocument(tab.id);
  if (state.activeTabId === id) {
    const next = state.tabs[Math.min(idx, state.tabs.length - 1)] ?? null;
    setActiveTab(next);
    if (next) {
      loadTab(next);
    } else {
      // Reset UI
      updateTitle();
      statusText.textContent = "Ready";
      wordCountEl.classList.add("hidden");
      emptyState.classList.remove("hidden");
      previewContainer.classList.add("hidden");
      editorPanel.classList.add("hidden");
      previewPanel.classList.remove("hidden");
      openDocument("", "");
      runLint();
    }
  }
  saveSession();
  renderTabBar();
}

function switchTab(id: string): void {
  const old = getActiveTab();
  if (old && editorReady()) {
    old.scrollTop = getEditorScrollTop();
    stashDocument(old.id);
  }
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab) return;
  setActiveTab(tab);
  loadTab(tab);
  renderTabBar();
}

function loadTab(tab: Tab): void {
  openDocument(tab.id, tab.content);
  setTimeout(() => setEditorScrollTop(tab.scrollTop), 0);
  updateTitle();
  emptyState.classList.add("hidden");
  previewContainer.classList.remove("hidden");
  updatePreview();
  updateWordCount();
  runLint();
}

// === Settings ===
function openSettings(): void {
  showOverlay(settingsModal);
  refreshModelSuggestions();
}

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

// Writes are chained so an older snapshot can never land after a newer one.
let settingsWrite: Promise<void> = Promise.resolve();

function saveSettingsFn(): Promise<void> {
  const content = JSON.stringify(settings);
  settingsWrite = settingsWrite
    .then(() => invoke<void>("save_settings", { content }))
    .catch(() => {});
  return settingsWrite;
}

function applySettingsUI(): void {
  (document.getElementById("setting-ollama-enabled") as HTMLInputElement).checked = settings.ollamaEnabled;
  (document.getElementById("setting-ollama-endpoint") as HTMLInputElement).value = settings.ollamaEndpoint;
  (document.getElementById("setting-ollama-model") as HTMLSelectElement).value = settings.ollamaModel;
  (document.getElementById("setting-autosave") as HTMLInputElement).value = String(settings.autoSaveInterval);
  (document.getElementById("setting-line-breaks") as HTMLInputElement).checked = !!settings.lineBreaks;
  statusLanguage.value = settings.language || "en";
  updateOllamaStatusBar();
  restartAutoSave();
}

function bindSettingsUI(): void {
  document.getElementById("setting-ollama-enabled")!.addEventListener("input", async (e) => {
    settings.ollamaEnabled = (e.target as HTMLInputElement).checked;
    saveSettingsFn();
    updateOllamaStatusBar();
    if (settings.ollamaEnabled && !settings.ollamaSetupComplete) {
      const running = await checkOllamaStatus();
      if (!running) {
        await hideOverlay(settingsModal);
        showOllamaSetup();
      }
    }
  });
  document.getElementById("setting-ollama-endpoint")!.addEventListener("input", (e) => {
    settings.ollamaEndpoint = (e.target as HTMLInputElement).value.trim() || defaultSettings.ollamaEndpoint;
    saveSettingsFn();
  });
  document.getElementById("setting-ollama-model")!.addEventListener("input", (e) => {
    const val = (e.target as HTMLSelectElement).value;
    if (val) {
      settings.ollamaModel = val;
      saveSettingsFn();
    }
  });
  document.getElementById("setting-autosave")!.addEventListener("input", (e) => {
    settings.autoSaveInterval = Math.max(500, parseInt((e.target as HTMLInputElement).value) || 2000);
    saveSettingsFn();
    restartAutoSave();
  });
  document.getElementById("setting-line-breaks")!.addEventListener("input", (e) => {
    settings.lineBreaks = (e.target as HTMLInputElement).checked;
    saveSettingsFn();
    updatePreview();
  });
  document.getElementById("clear-recent")!.addEventListener("click", () => {
    settings.recentFiles = [];
    saveSettingsFn();
    setStatus("Recent files cleared");
  });
}

async function checkOllamaStatus(): Promise<boolean> {
  if (!settings.ollamaEnabled) return false;
  try {
    return await invokeWithTimeout<boolean>("check_ollama", { endpoint: settings.ollamaEndpoint }, 8000);
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
    dot.title = running ? "AI connected" : "AI not available";
  }
}

// === Ollama Formatting ===
// Every request gets a number; cancelling bumps it, so a result that arrives later is ignored.
let ollamaRequest = 0;
let ollamaBusy = false;

function cancelOllama(): void {
  if (ollamaBusy) {
    ollamaRequest++;
    ollamaBusy = false;
    invoke("cancel_ollama").catch(() => {});
    setStatus("AI request cancelled");
  }
  hideOverlay(ollamaDialog);
}

listen<{ chars: number }>("ollama-progress", (event) => {
  if (ollamaBusy) ollamaDialogSub.textContent = `Writing… ${event.payload.chars} characters`;
});

/** Run a format/correct request with the progress dialog. Resolves to null if it failed or was cancelled. */
async function runOllama(task: "format" | "correct", text: string, title: string): Promise<string | null> {
  if (!settings.ollamaEnabled) {
    setStatus("Enable AI formatting in settings");
    return null;
  }
  if (!text.trim()) {
    setStatus("No text to format");
    return null;
  }
  if (!(await checkOllamaStatus())) {
    setStatus("Ollama is not running – check settings");
    return null;
  }

  const myRequest = ++ollamaRequest;
  ollamaBusy = true;
  ollamaDialogText.textContent = title;
  ollamaDialogSub.textContent = "Waiting for the model…";
  ollamaDialogSub.classList.remove("hidden");
  animateSpinner(ollamaSpinnerEl);
  showOverlay(ollamaDialog);
  try {
    const result = await invoke<string>(task === "format" ? "format_with_ollama" : "correct_with_ollama", {
      endpoint: settings.ollamaEndpoint,
      model: settings.ollamaModel,
      text,
    });
    return myRequest === ollamaRequest ? result : null;
  } catch (err) {
    if (myRequest === ollamaRequest) setStatus(`Error: ${err}`);
    return null;
  } finally {
    if (myRequest === ollamaRequest) {
      ollamaBusy = false;
      hideOverlay(ollamaDialog);
    }
  }
}

/** Replace a tab's whole content as one undoable edit. */
function replaceTabContent(tab: Tab, content: string): void {
  if (tab === getActiveTab() && editorReady()) {
    setEditorContent(content); // fires editor-change → onContentChange
    return;
  }
  tab.content = content;
  tab.modified = content !== tab.originalContent;
  if (tab === getActiveTab()) {
    updatePreview();
    updateTitle();
    updateWordCount();
    runLint();
  }
  renderTabBar();
}

async function formatWithOllama(): Promise<void> {
  const tab = getActiveTab();
  if (!tab) return;
  const result = await runOllama("format", tab.content, "Formatting text...");
  if (result === null) return;
  replaceTabContent(tab, result);
  showSuccessOverlay("Text formatted");
}

async function transformSelectionWithOllama(task: "format" | "correct", sel: string): Promise<void> {
  const tab = getActiveTab();
  const result = await runOllama(task, sel, task === "format" ? "Formatting selection..." : "Correcting selection...");
  if (result === null) return;
  if (getActiveTab() !== tab || getSelection() !== sel) {
    setStatus("Selection changed – AI result discarded");
    return;
  }
  replaceSelection(result);
  showSuccessOverlay(task === "format" ? "Selection formatted" : "Selection corrected");
}

// === Ollama Setup Flow ===
let setupRunning = false;

function goToSetupStep(step: number): void {
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`setup-page-${i}`)!.classList.add("hidden");
    document.getElementById(`setup-step-${i}`)!.classList.remove("active");
  }
  document.getElementById("setup-page-done")!.classList.add("hidden");
  document.getElementById("setup-page-error")!.classList.add("hidden");
  if (step >= 5) {
    document.getElementById("setup-page-done")!.classList.remove("hidden");
    return;
  }
  if (step >= 1 && step <= 4) {
    document.getElementById(`setup-page-${step}`)!.classList.remove("hidden");
    document.getElementById(`setup-step-${step}`)!.classList.add("active");
  }
}

function showOllamaSetup(): void {
  // While a setup is running, reopening shows its current progress instead of step 1.
  if (!setupRunning) goToSetupStep(1);
  showOverlay(ollamaSetup);
}

function hideOllamaSetup(): void {
  hideOverlay(ollamaSetup);
  if (setupRunning) setStatus("AI setup continues in the background…");
}

async function waitForOllamaReady(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (await checkOllamaStatus()) return;
    // The installer may not start Ollama in silent mode; start it ourselves once.
    if (i === 4) await invoke("start_ollama").catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Ollama did not start in time");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

async function startOllamaSetup(): Promise<void> {
  if (setupRunning) return;
  setupRunning = true;
  const model = setupModelSelect.value;
  settings.ollamaModel = model;
  settings.ollamaEnabled = true;
  saveSettingsFn();

  try {
    goToSetupStep(2);
    setupProgressBar.style.width = "0%";
    setupDownloadText.textContent = "Downloading Ollama…";
    setupProgressText.textContent = "Starting download…";
    animateSpinner(setupSpinner1);
    await invoke("download_ollama");
    setupProgressBar.style.width = "100%";
    setupProgressText.textContent = "Download complete";

    goToSetupStep(3);
    animateSpinner(setupSpinner2);
    await invoke("install_ollama");

    await waitForOllamaReady();

    goToSetupStep(4);
    setupPullText.textContent = `Loading ${model}…`;
    setupPullBar.style.width = "0%";
    setupPullStatus.textContent = "This may take a few minutes.";
    animateSpinner(setupSpinner3);
    await invoke("pull_ollama_model", { endpoint: settings.ollamaEndpoint, model });

    settings.ollamaSetupComplete = true;
    saveSettingsFn();
    goToSetupStep(5);
    updateOllamaStatusBar();
    setStatus("AI formatting ready");
  } catch (err) {
    showSetupError(`${err}`);
  } finally {
    setupRunning = false;
  }
}

listen<{ status?: string; completed?: number; total?: number }>("ollama-pull-progress", (event) => {
  const { status, completed, total } = event.payload;
  if (total && completed !== undefined && completed !== null) {
    const pct = Math.round((completed / total) * 100);
    setupPullBar.style.width = `${pct}%`;
    setupPullStatus.textContent = `${formatBytes(completed)} / ${formatBytes(total)} (${pct}%)`;
  } else if (status) {
    setupPullStatus.textContent = status;
  }
});

function showSetupError(msg: string): void {
  setupErrorText.textContent = msg;
  goToSetupStep(0);
  document.getElementById("setup-page-error")!.classList.remove("hidden");
  if (!isOverlayOpen(ollamaSetup)) setStatus(`AI setup failed: ${msg}`);
}

async function refreshModelSuggestions(): Promise<void> {
  const select = document.getElementById("setting-ollama-model") as HTMLSelectElement;
  const currentVal = settings.ollamaModel;
  select.innerHTML = `<option value="llama3.2:3b">llama3.2:3b (recommended)</option>`;
  if (!settings.ollamaEnabled) return;
  try {
    const models = await invoke<string[]>("get_ollama_models", { endpoint: settings.ollamaEndpoint });
    if (models.length > 0) {
      select.innerHTML = `<option value="">— Select a model —</option>`;
      models.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        if (m === currentVal) opt.selected = true;
        select.appendChild(opt);
      });
      // Add recommended at top if not in list
      if (!models.includes("llama3.2:3b")) {
        const rec = document.createElement("option");
        rec.value = "llama3.2:3b";
        rec.textContent = "llama3.2:3b (recommended)";
        rec.selected = currentVal === "llama3.2:3b";
        select.prepend(rec);
      }
    }
    select.value = currentVal;
  } catch {
    // Keep default options
  }
}

async function checkFirstRunOllama(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const running = await checkOllamaStatus();
    if (running) return;
    if (i < 2) await new Promise((r) => setTimeout(r, 2000));
  }
  if (settings.ollamaEnabled && !settings.ollamaSetupComplete && !settings.ollamaSetupDismissed) {
    showOllamaSetup();
  }
}

// === Auto-Save ===
// Saves every modified tab that has a file, not only the active one.
function restartAutoSave(): void {
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  autoSaveTimer = setInterval(() => {
    for (const tab of state.tabs) {
      if (tab.modified && tab.file) saveTab(tab);
    }
  }, settings.autoSaveInterval);
}

// === File Operations ===
function updateTitle(): void {
  const tab = getActiveTab();
  if (!tab) {
    filenameEl.textContent = "No file open";
    modifiedDot.classList.add("hidden");
    statusFilenameBottom.textContent = "";
    document.title = "Remark";
    return;
  }
  const name = tabName(tab);
  filenameEl.textContent = name;
  modifiedDot.classList.toggle("hidden", !tab.modified);
  statusFilenameBottom.textContent = tab.file ?? "";
  document.title = tab.modified ? `* ${name} - Remark` : `${name} - Remark`;
}

function setStatus(msg: string): void {
  statusText.textContent = msg;
  animate(statusText, { opacity: [0, 1] }, { duration: 0.15, ease: easeInOut });
}

function renderOptions(tab: Tab | null): RenderOptions {
  const docDir = tab?.file ? dirName(tab.file) : null;
  return {
    breaks: !!settings.lineBreaks,
    dark: state.darkMode,
    resolveImage: (src) => {
      // Local images (e.g. pasted into ./assets) are loaded through Tauri's asset protocol.
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src) && !/^[a-zA-Z]:[\\/]/.test(src)) return null;
      let path: string;
      try { path = decodeURI(src); } catch { path = src; }
      if (!isAbsolutePath(path)) {
        if (!docDir) return null;
        path = resolvePath(docDir, path);
      }
      return convertFileSrc(path);
    },
  };
}

function updatePreview(): void {
  const tab = getActiveTab();
  if (!tab) return;
  if (tab.content.trim()) {
    emptyState.classList.add("hidden");
    previewContainer.classList.remove("hidden");
    renderPreviewContent(previewContainer, tab.content, { ...renderOptions(tab), interactive: true });
  } else {
    emptyState.classList.remove("hidden");
    previewContainer.classList.add("hidden");
    previewContainer.innerHTML = "";
  }
  updateToc();
}

function updateWordCount(): void {
  const tab = getActiveTab();
  if (!tab || !tab.content.trim()) {
    wordCountEl.classList.add("hidden");
    return;
  }
  const content = tab.content;
  const words = content.match(/\S+/g)?.length ?? 0;
  const chars = content.length;
  const lines = content.split("\n").length;
  const readingTime = Math.max(1, Math.round(words / 200));
  wordCountEl.textContent = `${words}w · ${chars}c · ${lines}l · ${readingTime} min`;
  wordCountEl.classList.remove("hidden");
}

// Debounce preview re-render: marked + hljs + mermaid is expensive on every keystroke.
let previewDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePreview(delay = 160): void {
  if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(() => {
    previewDebounceTimer = null;
    updatePreview();
  }, delay);
}

function onContentChange(content: string): void {
  const tab = getActiveTab();
  if (!tab) return;
  const wasModified = tab.modified;
  tab.content = content;
  tab.modified = content !== tab.originalContent;
  updateTitle();
  if (wasModified !== tab.modified) renderTabBar();
  if (state.viewMode === "split" || state.viewMode === "view") {
    schedulePreview();
  }
  updateWordCount();
  scheduleLint();
  // Untitled tabs only live in the session file, so keep it current.
  if (!tab.file) scheduleSessionSave();
}

function updateViewModeIcon(): void {
  const mode = state.viewMode;
  if (mode === "view") {
    iconViewMode.innerHTML = `<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>`;
    btnViewMode.title = "Preview (click: Edit, Ctrl+click: Split)";
  } else if (mode === "edit") {
    iconViewMode.innerHTML = `<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>`;
    btnViewMode.title = "Editor (click: Preview, Ctrl+click: Split)";
  } else {
    iconViewMode.innerHTML = `<rect x="3" y="3" width="7" height="14" rx="1"/><rect x="14" y="3" width="7" height="14" rx="1"/><line x1="1" y1="21" x2="23" y2="21"/>`;
    btnViewMode.title = "Split (click: Preview, Ctrl+click: Edit)";
  }
}

function setViewMode(mode: ViewMode): void {
  state.viewMode = mode;
  updateViewModeIcon();

  const edWasHidden = editorPanel.classList.contains("hidden");
  const pvWasHidden = previewPanel.classList.contains("hidden");
  editorPanel.classList.toggle("hidden", mode === "view");
  previewPanel.classList.toggle("hidden", mode === "edit");

  // Split resizer
  resizeHandle.classList.toggle("hidden", mode !== "split");
  if (mode === "split") {
    const ratio = settings.splitRatio ?? 0.5;
    editorPanel.style.flex = `0 0 ${ratio * 100}%`;
    previewPanel.style.flex = `1 1 0%`;
    editorPanel.style.minWidth = "0";
    previewPanel.style.minWidth = "0";
  } else {
    editorPanel.style.flex = "";
    previewPanel.style.flex = "";
  }

  if (mode === "edit" || mode === "split") {
    if (!editorContainer.querySelector(".cm-editor")) {
      createEditor(editorContainer, settings.language);
      const tab = getActiveTab();
      if (tab) {
        openDocument(tab.id, tab.content);
        setTimeout(() => setEditorScrollTop(tab.scrollTop), 0);
      }
      setupScrollListeners();
    }
    if (edWasHidden) animate(editorPanel, { opacity: [0, 1] }, { duration: 0.2, ease: easeInOut });
  }
  if (mode === "view" || mode === "split") {
    if (pvWasHidden) animate(previewPanel, { opacity: [0, 1] }, { duration: 0.2, ease: easeInOut });
    updatePreview();
  }
}

function rememberRecent(path: string): void {
  settings.recentFiles = settings.recentFiles.filter((f) => !samePath(f, path));
  settings.recentFiles.unshift(path);
  if (settings.recentFiles.length > 10) settings.recentFiles.length = 10;
  saveSettingsFn();
}

async function openFile(path?: string, opts: { quiet?: boolean } = {}): Promise<void> {
  let filePath = path;
  if (!filePath) {
    const result = await open({
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
    });
    if (!result) return;
    filePath = result as string;
  }

  // Already open → just switch to it.
  const existing = state.tabs.find((t) => t.file && samePath(t.file, filePath!));
  if (existing) {
    switchTab(existing.id);
    return;
  }

  setStatus("Opening file...");
  try {
    const content = await invoke<string>("read_file", { path: filePath });
    addTab(filePath, content);
    if (!opts.quiet) showSuccessOverlay("File opened");
    setStatus("Ready");
    rememberRecent(filePath);
    loadSidebarDir(filePath);
  } catch (err) {
    setStatus(`Error opening: ${err}`);
  }
}

/**
 * Write a tab to disk. Content typed while the write is in flight stays marked as modified,
 * and overlapping saves of the same tab are serialized.
 */
const tabSaves = new Map<string, Promise<boolean>>();

function saveTab(tab: Tab): Promise<boolean> {
  const previous = tabSaves.get(tab.id) ?? Promise.resolve(true);
  const next = previous.then(async () => {
    if (!tab.file) return false;
    const snapshot = tab.content;
    if (snapshot === tab.originalContent && !tab.modified) return true;
    try {
      await invoke("write_file", { path: tab.file, content: snapshot });
    } catch (err) {
      setStatus(`Error saving ${tabName(tab)}: ${err}`);
      return false;
    }
    tab.originalContent = snapshot;
    tab.modified = tab.content !== snapshot;
    if (tab === getActiveTab()) updateTitle();
    renderTabBar();
    return true;
  });
  tabSaves.set(tab.id, next);
  next.finally(() => { if (tabSaves.get(tab.id) === next) tabSaves.delete(tab.id); });
  return next;
}

async function saveFile(): Promise<void> {
  const tab = getActiveTab();
  if (!tab) return;

  if (!tab.file) {
    const result = await save({
      filters: [{ name: "Markdown", extensions: ["md"] }],
      defaultPath: "document.md",
    });
    if (!result) return;
    tab.file = result;
    rememberRecent(result);
    updateTitle();
    renderTabBar();
  }
  tab.modified = true; // force a write even if nothing changed (explicit Ctrl+S)
  if (await saveTab(tab)) {
    saveSession();
    showSuccessOverlay("Saved");
  }
}

/** Save every modified tab that has a file. Returns the tabs that could not be saved. */
async function saveAllTabs(): Promise<Tab[]> {
  const failed: Tab[] = [];
  for (const tab of state.tabs) {
    if (tab.modified && tab.file && !(await saveTab(tab))) failed.push(tab);
  }
  return failed;
}

function toggleTheme(): void {
  state.darkMode = !state.darkMode;
  document.documentElement.classList.toggle("dark", state.darkMode);
  themeIcon.innerHTML = state.darkMode
    ? `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`
    : `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
  animate(themeIcon, { rotate: [0, 180] }, { type: "spring", bounce: 0.35, duration: 0.4 });
  if (settings.darkMode !== state.darkMode) {
    settings.darkMode = state.darkMode;
    saveSettingsFn();
  }
  // Mermaid diagrams pick their theme at render time.
  if (previewContainer.querySelector(".mermaid")) updatePreview();
}

// === Find / Search ===
function showFindBar(): void {
  showOverlay(findBar);
  findInput.focus();
  findInput.select();
  findInEditor(findInput.value);
  updateFindCount();
}

function hideFindBar(): void {
  hideOverlay(findBar);
  findInEditor("");
}

function findInEditor(query: string, direction: "next" | "prev" | "init" = "init"): void {
  if (state.viewMode !== "edit" && state.viewMode !== "split") return;
  dispatchEvent(new CustomEvent("editor-find", { detail: { query, direction } }));
}

function findNext(): void { findInEditor(findInput.value, "next"); }
function findPrev(): void { findInEditor(findInput.value, "prev"); }

function updateFindCount(): void {
  const q = findInput.value;
  if (!q) { findCount.textContent = ""; return; }
  const content = getActiveTab()?.content ?? "";
  const matches = content.toLowerCase().split(q.toLowerCase()).length - 1;
  findCount.textContent = `${matches} hits`;
}

// === Scroll Sync ===
let scrollSyncLock = false;

function syncScroll(source: HTMLElement, target: HTMLElement): void {
  if (scrollSyncLock) return;
  const denom = source.scrollHeight - source.clientHeight;
  if (denom <= 0) return;
  scrollSyncLock = true;
  target.scrollTop = (source.scrollTop / denom) * (target.scrollHeight - target.clientHeight);
  requestAnimationFrame(() => { scrollSyncLock = false; });
}

// === Sidebar ===
let expandedDirs = new Set<string>();
let sidebarRoot: string | null = null;

async function loadSidebarDir(filePath: string): Promise<void> {
  const dir = dirName(filePath);
  if (!dir) return;
  sidebarRoot = dir;
  await refreshSidebarTree();
  if (!state.sidebarOpen) {
    state.sidebarOpen = true;
    updateSidebarVisibility();
  }
}

async function refreshSidebarTree(): Promise<void> {
  if (!sidebarRoot) return;
  try {
    const entries = await invoke<FileEntry[]>("list_directory", { path: sidebarRoot });
    sidebarFiles.innerHTML = renderTree(entries, 0);
  } catch {}
}

function renderTree(entries: FileEntry[], depth: number): string {
  let html = "";
  const filtered = entries.filter((e) => e.is_dir || /\.(md|markdown|txt)$/i.test(e.name));
  for (const entry of filtered) {
    const isExpanded = expandedDirs.has(entry.path);
    const indent = depth * 16;
    const name = escHtml(entry.name);
    const path = escHtml(entry.path);
    if (entry.is_dir) {
      html += `<div class="file-item ${isExpanded ? "dir-open" : ""}" data-path="${path}" data-dir="1" data-depth="${depth}" style="padding-left:${6 + indent}px">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span>${name}</span>
      </div>`;
    } else {
      html += `<div class="file-item" data-path="${path}" style="padding-left:${6 + indent}px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
        <span>${name}</span>
      </div>`;
    }
  }
  return html;
}

async function toggleDir(el: HTMLElement): Promise<void> {
  const path = el.dataset.path!;
  // The children container sits right after its folder row (no selector lookup: Windows
  // paths contain backslashes, which break attribute selectors).
  const next = el.nextElementSibling as HTMLElement | null;
  const childContainer = next?.classList.contains("file-children") ? next : null;
  if (!childContainer || childContainer.classList.contains("hidden")) {
    expandedDirs.add(path);
    el.classList.add("dir-open");
    if (!childContainer) {
      const div = document.createElement("div");
      div.className = "file-children";
      el.after(div);
      try {
        const entries = await invoke<FileEntry[]>("list_directory", { path });
        div.innerHTML = renderTree(entries, Number(el.dataset.depth ?? 0) + 1);
      } catch {
        div.textContent = "error";
      }
    } else {
      childContainer.classList.remove("hidden");
    }
  } else {
    expandedDirs.delete(path);
    el.classList.remove("dir-open");
    childContainer.classList.add("hidden");
  }
}

// One delegated listener instead of re-binding on every render.
sidebarFiles.addEventListener("click", (e) => {
  const item = (e.target as HTMLElement).closest<HTMLElement>(".file-item");
  if (!item) return;
  if (item.dataset.dir) toggleDir(item);
  else openFile(item.dataset.path!);
});

function updateSidebarVisibility(): void {
  sidebar.classList.toggle("hidden", !state.sidebarOpen);
  // Resize editor/preview
  window.dispatchEvent(new Event("resize"));
}

function switchSidebarPanel(panel: "files" | "toc"): void {
  state.sidebarPanel = panel;
  sidebarPanelFiles.classList.toggle("active", panel === "files");
  sidebarPanelToc.classList.toggle("active", panel === "toc");
  sidebarFiles.classList.toggle("hidden", panel !== "files");
  sidebarToc.classList.toggle("hidden", panel !== "toc");
}

// === TOC ===
function updateToc(): void {
  const toc = buildToc(previewContainer);
  if (toc) {
    sidebarToc.replaceChildren(toc);
  } else {
    sidebarToc.innerHTML = '<p class="text-xs text-muted p-2">No headings found</p>';
  }
}

function scrollPreviewToHeading(id: string): void {
  const target = document.getElementById(id);
  if (target && previewContainer.contains(target)) target.scrollIntoView({ behavior: "smooth" });
}

sidebarToc.addEventListener("click", (e) => {
  const link = (e.target as HTMLElement).closest<HTMLElement>(".toc-link");
  if (!link) return;
  e.preventDefault();
  if (state.viewMode === "edit") setViewMode("split");
  scrollPreviewToHeading(link.dataset.target!);
});

// === Links in the preview ===
// External links open in the browser; the app window itself must never navigate away.
previewContainer.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
  if (!a) return;
  e.preventDefault();
  const href = a.getAttribute("href")!;
  if (href.startsWith("#")) {
    let id = href.slice(1);
    try { id = decodeURIComponent(id); } catch { /* keep raw */ }
    scrollPreviewToHeading(id);
  } else if (/^(https?:|mailto:)/i.test(href)) {
    openUrl(href).catch((err) => setStatus(`Could not open link: ${err}`));
  } else if (/\.(md|markdown|txt)(#.*)?$/i.test(href)) {
    const tab = getActiveTab();
    const file = href.replace(/#.*$/, "");
    let path: string;
    try { path = decodeURI(file); } catch { path = file; }
    if (!isAbsolutePath(path)) {
      if (!tab?.file) { setStatus("Save the file first to follow relative links"); return; }
      path = resolvePath(dirName(tab.file), path);
    }
    openFile(path);
  }
});

// Task list checkboxes: toggle the matching line in the source.
previewContainer.addEventListener("change", (e) => {
  const cb = e.target as HTMLInputElement;
  if (cb.type !== "checkbox" || cb.dataset.taskIndex === undefined) return;
  const tab = getActiveTab();
  if (!tab) return;
  const lineIdx = findTaskLines(tab.content)[Number(cb.dataset.taskIndex)];
  if (lineIdx === undefined) return;
  const lines = tab.content.split("\n");
  const updated = setTaskChecked(lines[lineIdx], cb.checked);
  if (editorReady()) {
    replaceLine(lineIdx, updated); // fires editor-change → onContentChange
  } else {
    lines[lineIdx] = updated;
    replaceTabContent(tab, lines.join("\n"));
  }
});

// === Focus / Typewriter Mode ===
function toggleTypewriter(): void {
  state.typewriterMode = !state.typewriterMode;
  editorContainer.classList.toggle("typewriter-mode", state.typewriterMode);
  menuFocus.classList.toggle("active", state.typewriterMode);
  setStatus(state.typewriterMode ? "Focus mode on" : "Focus mode off");
}

// === Export ===
async function exportHTML(): Promise<void> {
  const tab = getActiveTab();
  if (!tab) { setStatus("No file to export"); return; }
  const stem = tab.file ? baseName(tab.file).replace(/\.[^.]+$/, "") : "document";
  const result = await save({
    filters: [{ name: "HTML", extensions: ["html"] }],
    defaultPath: `${stem}.html`,
  });
  if (!result) return;
  try {
    // Exported files cannot use the app's asset protocol, so keep image paths as written.
    const body = await renderToHtml(tab.content, { ...renderOptions(tab), resolveImage: undefined });
    const html = buildHtmlDocument(tabName(tab), body, state.darkMode);
    await invoke("write_file", { path: result, content: html });
    showSuccessOverlay("HTML exported");
  } catch (err) {
    setStatus(`Export error: ${err}`);
  }
}

async function exportPDF(): Promise<void> {
  const tab = getActiveTab();
  if (!tab || !tab.content.trim()) { setStatus("No file to export"); return; }
  try {
    await printMarkdown(tab.content, renderOptions(tab));
  } catch (err) {
    setStatus(`Print error: ${err}`);
  }
}

// === Image Paste ===
const IMAGE_EXTS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

async function handleImagePaste(e: ClipboardEvent): Promise<void> {
  const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
  if (!item) return; // normal text paste
  const tab = getActiveTab();
  if (!tab) { setStatus("Open a file first to paste images"); return; }
  e.preventDefault();
  if (!tab.file) { setStatus("Save the file first to paste images"); return; }
  const file = item.getAsFile();
  if (!file) return;
  const data = new Uint8Array(await file.arrayBuffer());
  const ext = IMAGE_EXTS[item.type] ?? "png";
  const name = `pasted-${Date.now()}.${ext}`;
  const savePath = `${dirName(tab.file)}/assets/${name}`;
  try {
    await invoke("save_image", { path: savePath, data: Array.from(data) });
    insertAtCursor(`![Pasted image](assets/${name})`);
    setStatus("Image pasted");
  } catch (err) {
    setStatus(`Image paste error: ${err}`);
  }
}

// === Events ===
addEventListener("editor-change", ((e: CustomEvent) => {
  onContentChange(e.detail.content);
}) as EventListener);

btnOpen.addEventListener("click", () => openFile());
btnSave.addEventListener("click", () => saveFile());
btnTheme.addEventListener("click", toggleTheme);
btnSidebar.addEventListener("click", () => {
  state.sidebarOpen = !state.sidebarOpen;
  updateSidebarVisibility();
});
btnNewTab.addEventListener("click", () => {
  addTab(null, "");
  setViewMode("edit");
  setStatus("New tab");
});

// View mode cycling: view → edit → split → view ...
btnViewMode.addEventListener("click", (e) => {
  if (e.ctrlKey || e.metaKey) {
    // Ctrl+click goes to split
    setViewMode("split");
  } else {
    // Normal click cycles: view→edit→split→view
    const modes: ViewMode[] = ["view", "edit", "split"];
    const idx = modes.indexOf(state.viewMode);
    setViewMode(modes[(idx + 1) % 3]);
  }
});

/** Place a fixed-position popup at (x, y), kept inside the window. */
function placePopup(el: HTMLElement, x: number, y: number): void {
  el.style.left = "0px";
  el.style.top = "0px";
  el.classList.remove("hidden"); // measure
  const { width, height } = el.getBoundingClientRect();
  const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
  const top = y + height > window.innerHeight - 8 ? Math.max(8, y - height) : y;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

btnMore.addEventListener("click", (e) => {
  e.stopPropagation();
  if (isOverlayOpen(moreMenu)) { hideOverlay(moreMenu); return; }
  const rect = btnMore.getBoundingClientRect();
  placePopup(moreMenu, rect.left, rect.bottom + 4);
  showOverlay(moreMenu);
});

function runMenuAction(fn: () => void) {
  return (e: Event) => {
    e.stopPropagation();
    hideOverlay(moreMenu);
    fn();
  };
}
menuFocus.addEventListener("click", runMenuAction(toggleTypewriter));
menuOllama.addEventListener("click", runMenuAction(formatWithOllama));
menuExportHtml.addEventListener("click", runMenuAction(exportHTML));
menuExportPdf.addEventListener("click", runMenuAction(exportPDF));

// Click outside closes popups.
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (!moreMenu.contains(target) && !target.closest("#btn-more")) hideOverlay(moreMenu);
  if (!contextMenu.contains(target)) hideOverlay(contextMenu);
  if (!lintPanel.contains(target) && !target.closest("#btn-lint")) hideOverlay(lintPanel);
});

findCloseBtn.addEventListener("click", hideFindBar);
findNextBtn.addEventListener("click", findNext);
findPrevBtn.addEventListener("click", findPrev);
findInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.shiftKey ? findPrev() : findNext(); }
});
findInput.addEventListener("input", () => { findInEditor(findInput.value); updateFindCount(); });

settingsBackdrop.addEventListener("click", () => hideOverlay(settingsModal));
settingsClose.addEventListener("click", () => hideOverlay(settingsModal));

document.getElementById("ollama-backdrop")!.addEventListener("click", cancelOllama);
document.getElementById("ollama-close")!.addEventListener("click", cancelOllama);
ollamaCancelBtn.addEventListener("click", cancelOllama);

ollamaSetupBackdrop.addEventListener("click", hideOllamaSetup);
ollamaSetupClose.addEventListener("click", hideOllamaSetup);
setupSkip.addEventListener("click", () => {
  // "Later" = do not open the dialog automatically on the next start.
  settings.ollamaSetupDismissed = true;
  saveSettingsFn();
  hideOllamaSetup();
});
setupErrorClose.addEventListener("click", hideOllamaSetup);
setupStart.addEventListener("click", startOllamaSetup);
setupFinish.addEventListener("click", hideOllamaSetup);

// Download progress
listen<{ downloaded: number; total: number }>("ollama-download-progress", (event) => {
  const { downloaded, total } = event.payload;
  const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
  setupProgressBar.style.width = `${pct}%`;
  setupDownloadText.textContent = total > 0
    ? `Downloading Ollama installer… (${formatBytes(downloaded)} / ${formatBytes(total)})`
    : `Downloading Ollama installer… (${formatBytes(downloaded)})`;
  setupProgressText.textContent = total > 0 ? `${pct}%` : "";
});

document.getElementById("btn-settings")!.addEventListener("click", openSettings);

document.getElementById("setting-install-ollama")!.addEventListener("click", async () => {
  await hideOverlay(settingsModal);
  showOllamaSetup();
});

// Sidebar panel switching
sidebarPanelFiles.addEventListener("click", () => switchSidebarPanel("files"));
sidebarPanelToc.addEventListener("click", () => switchSidebarPanel("toc"));

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  // Escape closes only the topmost overlay (dialog, menu, find bar …).
  if (e.key === "Escape") {
    if (dismissTopOverlay()) e.preventDefault();
    return;
  }
  // While a dialog is open, app shortcuts must not act on the document behind it.
  if (isOverlayOpen(settingsModal) || isOverlayOpen(ollamaDialog) || isOverlayOpen(ollamaSetup)) return;

  if (ctrl && !e.shiftKey && key === "o") { e.preventDefault(); openFile(); }
  if (ctrl && !e.shiftKey && key === "s") { e.preventDefault(); saveFile(); }
  if (ctrl && e.shiftKey && key === "v") { e.preventDefault(); setViewMode("view"); }
  if (ctrl && !e.shiftKey && key === "e") { e.preventDefault(); setViewMode("edit"); }
  if (ctrl && e.shiftKey && key === "e") { e.preventDefault(); setViewMode("split"); }
  if (ctrl && !e.shiftKey && key === "f") { e.preventDefault(); showFindBar(); }
  if (ctrl && !e.shiftKey && key === "n") { e.preventDefault(); btnNewTab.click(); }
  if (ctrl && !e.shiftKey && key === "w") { e.preventDefault(); if (state.activeTabId) closeTab(state.activeTabId); }
  if (ctrl && e.shiftKey && key === "b") { e.preventDefault(); btnSidebar.click(); }
  if (e.key === "F3") { e.preventDefault(); e.shiftKey ? findPrev() : findNext(); }

  // Tab switching with Ctrl+Tab / Ctrl+Shift+Tab
  if (ctrl && e.key === "Tab") {
    e.preventDefault();
    if (state.tabs.length < 2) return;
    const idx = state.tabs.findIndex((t) => t.id === state.activeTabId);
    const next = e.shiftKey
      ? (idx - 1 + state.tabs.length) % state.tabs.length
      : (idx + 1) % state.tabs.length;
    switchTab(state.tabs[next].id);
  }
});

// Drag & Drop
getCurrentWindow().onDragDropEvent(async (event) => {
  if (event.payload.type === "enter" || event.payload.type === "over") {
    if (!isOverlayOpen(dropOverlay)) showOverlay(dropOverlay);
  } else if (event.payload.type === "leave") {
    hideOverlay(dropOverlay);
  } else if (event.payload.type === "drop") {
    hideOverlay(dropOverlay);
    const paths = event.payload.paths.filter((p) => /\.(md|markdown|txt)$/i.test(p));
    if (!paths.length) {
      setStatus("Only .md, .markdown or .txt files");
      return;
    }
    for (const path of paths) await openFile(path);
  }
});

// Image paste on editor
document.addEventListener("paste", handleImagePaste);

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

// === Split-Pane-Resizer ===
let isDragging = false;

function initResizer(): void {
  resizeHandle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    isDragging = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });
}

document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const main = document.getElementById("main")!;
  const rect = main.getBoundingClientRect();
  const ratio = Math.min(0.85, Math.max(0.15, (e.clientX - rect.left) / rect.width));
  settings.splitRatio = ratio;
  if (state.viewMode === "split") {
    editorPanel.style.flex = `0 0 ${ratio * 100}%`;
    previewPanel.style.flex = `1 1 0%`;
  }
});

document.addEventListener("mouseup", () => {
  if (isDragging) {
    isDragging = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    saveSettingsFn();
  }
});

// === Context Menu ===
document.addEventListener("contextmenu", (e) => {
  if (state.viewMode === "view") return;
  e.preventDefault();
  placePopup(contextMenu, e.clientX, e.clientY);
  showOverlay(contextMenu);
});

contextMenu.addEventListener("click", async (e) => {
  const item = (e.target as HTMLElement).closest(".context-menu-item") as HTMLElement | null;
  if (!item) return;
  const action = item.dataset.action;
  hideOverlay(contextMenu);

  if (!action) return;

  if (action === "bold") {
    wrapSelection("**", "**");
  } else if (action === "italic") {
    wrapSelection("*", "*");
  } else if (action === "h1") {
    setHeading(1);
  } else if (action === "h2") {
    setHeading(2);
  } else if (action === "h3") {
    setHeading(3);
  } else if (action === "link") {
    wrapLink();
  } else if (action === "code") {
    const sel = getSelection();
    if (sel && sel.includes("\n")) {
      wrapSelection("```\n", "\n```");
    } else {
      wrapSelection("`", "`");
    }
  } else if (action === "blockquote") {
    wrapLines("> ");
  } else if (action === "ul") {
    wrapLines("- ");
  } else if (action === "ol") {
    wrapLines("1. ");
  } else if (action === "format") {
    const sel = getSelection();
    if (!sel) { setStatus("Select text first"); return; }
    transformSelectionWithOllama("format", sel);
  } else if (action === "correct") {
    const sel = getSelection();
    if (!sel) { setStatus("Select text first"); return; }
    transformSelectionWithOllama("correct", sel);
  }
});

// === Session Restore ===
let restoringSession = false;
let sessionSaveTimer: ReturnType<typeof setTimeout> | undefined;

function saveSession(): void {
  if (restoringSession) return;
  clearTimeout(sessionSaveTimer);
  const active = getActiveTab();
  if (active && editorReady()) active.scrollTop = getEditorScrollTop();
  settings.sessionTabs = state.tabs.map((t) => t.file
    ? { file: t.file, scrollTop: t.scrollTop }
    // Untitled tabs have no file, so their text is kept in the session itself.
    : { file: null, scrollTop: t.scrollTop, content: t.content });
  settings.sessionActiveTab = Math.max(0, state.tabs.findIndex((t) => t.id === state.activeTabId));
  saveSettingsFn();
}

function scheduleSessionSave(): void {
  clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(saveSession, 1000);
}

async function restoreSession(): Promise<void> {
  const saved = settings.sessionTabs;
  if (!saved || saved.length === 0) return;
  restoringSession = true;
  const restored: (Tab | null)[] = [];
  try {
    for (const s of saved) {
      let tab: Tab | null = null;
      if (!s.file) {
        if (s.content) {
          tab = addTab(null, s.content);
          tab.originalContent = "";
          tab.modified = true;
        }
      } else {
        try {
          if (await invoke<boolean>("file_exists", { path: s.file })) {
            const content = await invoke<string>("read_file", { path: s.file });
            tab = addTab(s.file, content);
          }
        } catch { /* skip unreadable files */ }
      }
      restored.push(tab);
    }
  } finally {
    restoringSession = false;
  }
  restored.forEach((tab, i) => { if (tab) tab.scrollTop = saved[i].scrollTop ?? 0; });
  const active = restored[settings.sessionActiveTab ?? 0] ?? restored.find(Boolean);
  if (active) switchTab(active.id);
  renderTabBar();
  const count = restored.filter(Boolean).length;
  if (count) setStatus(`Restored ${count} tab(s)`);
}

// === Close protection ===
let closeConfirmed = false;

getCurrentWindow().onCloseRequested(async (event) => {
  if (closeConfirmed) return;
  const failed = await saveAllTabs();
  saveSession(); // also persists the text of untitled tabs
  await settingsWrite;
  if (failed.length) {
    const names = failed.map(tabName).join(", ");
    const ok = await ask(`Could not save ${names}. Close anyway and lose these changes?`, {
      title: "Remark",
      kind: "warning",
      okLabel: "Close",
      cancelLabel: "Cancel",
    });
    if (!ok) {
      event.preventDefault();
      return;
    }
  }
  closeConfirmed = true;
});

// === Auto-Updater ===
async function checkForUpdate(): Promise<void> {
  try {
    const latest = await invoke<string | null>("check_update");
    if (latest) {
      btnUpdate.classList.remove("hidden");
      btnUpdate.title = `Remark ${latest} is available`;
    }
  } catch {}
}

btnUpdate.addEventListener("click", () => {
  openUrl("https://github.com/leg1tfx/Remark/releases/latest").catch((err) => setStatus(`Could not open link: ${err}`));
});

// === Markdown Lint ===
let lintTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleLint(): void {
  clearTimeout(lintTimer);
  lintTimer = setTimeout(runLint, 300);
}

function runLint(): void {
  const tab = getActiveTab();
  const issues: LintIssue[] = tab ? lintMarkdown(tab.content) : [];
  if (!issues.length) {
    btnLint.classList.add("hidden");
    hideOverlay(lintPanel);
    return;
  }
  lintCount.textContent = String(issues.length);
  btnLint.classList.remove("hidden");
  lintPanel.innerHTML = issues.map((iss) =>
    `<div class="lint-item" data-line="${iss.line}">
      <span class="lint-line">${iss.line}:${iss.column}</span>
      <span class="lint-msg">${escHtml(iss.message)}</span>
    </div>`
  ).join("");
}

lintPanel.addEventListener("click", (e) => {
  const item = (e.target as HTMLElement).closest<HTMLElement>(".lint-item");
  if (!item) return;
  if (state.viewMode === "view") setViewMode("split");
  goToLine(Number(item.dataset.line));
  hideOverlay(lintPanel);
});

btnLint.addEventListener("click", () => {
  if (isOverlayOpen(lintPanel)) { hideOverlay(lintPanel); return; }
  const rect = btnLint.getBoundingClientRect();
  lintPanel.style.bottom = "28px";
  lintPanel.style.left = `${Math.max(4, rect.left)}px`;
  showOverlay(lintPanel);
});

// === Language ===
statusLanguage.addEventListener("change", () => {
  settings.language = statusLanguage.value;
  saveSettingsFn();
  setEditorLanguage(settings.language);
});

// === Init ===
async function init(): Promise<void> {
  await loadSettings();
  bindSettingsUI();
  if (settings.darkMode) toggleTheme();

  setViewMode("view");
  updateTitle();
  setStatus("Ready");

  // Restore the last session first, then open the file the app was launched with
  // (openFile switches to it if the session already contains it).
  await restoreSession();
  try {
    const initialFile = await invoke<string | null>("get_initial_file");
    if (initialFile) await openFile(initialFile, { quiet: true });
  } catch {}

  if (state.tabs.length === 0) addTab(null, "");
  saveSession();

  await checkFirstRunOllama();

  async function pollOllama(): Promise<void> {
    await updateOllamaStatusBar();
    ollamaCheckTimer = setTimeout(pollOllama, 30000);
  }
  pollOllama();

  initResizer();
  checkForUpdate();
  runLint();
}

init();
