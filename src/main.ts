import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { animate as _animate, spring, easeInOut } from "motion";
const animate = _animate as any;
import { createEditor, setEditorContent, getEditorContent, setEditorDarkMode, getEditorScrollElement, getEditorScrollTop, setEditorScrollTop, suppressChangeEvents, insertAtCursor } from "./editor";
import { renderPreviewContent, extractTOC, renderMarkdown } from "./preview";
import type { AppState, ViewMode, Settings, Tab, FileEntry, LintIssue } from "./types";
import "./styles/main.css";
import "highlight.js/styles/github.css";

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
};

let settings: Settings = { ...defaultSettings };
let autoSaveTimer: ReturnType<typeof setInterval> | null = null;
let ollamaCheckTimer: ReturnType<typeof setInterval> | null = null;

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

const ollamaDialog = document.getElementById("ollama-dialog")!;
const ollamaDialogText = document.getElementById("ollama-dialog-text")!;
const ollamaDialogSub = document.getElementById("ollama-dialog-sub")!;
const ollamaSpinnerEl = document.getElementById("ollama-spinner")!;
const successOverlay = document.getElementById("success-overlay")!;
const successToast = document.getElementById("success-toast")!;
const successBackdrop = document.getElementById("success-backdrop")!;

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

// === Animations ===
function showWithFade(el: HTMLElement, duration = 0.2): void {
  el.classList.remove("hidden");
  animate(el, { opacity: [0, 1] }, { duration, ease: easeInOut });
}

function hideWithFade(el: HTMLElement, duration = 0.15): void {
  try {
    animate(el, { opacity: [1, 0] }, { duration, ease: easeInOut });
    setTimeout(() => el.classList.add("hidden"), (duration * 1000) + 50);
  } catch {
    el.classList.add("hidden");
  }
}

function showModal(el: HTMLElement, inner: HTMLElement): void {
  el.style.opacity = "0";
  inner.style.opacity = "0";
  inner.style.transform = "scale(0.88) translateY(30px)";
  el.classList.remove("hidden");
  void el.offsetHeight;
  animate(el, { opacity: [0, 1] }, { duration: 0.25, ease: easeInOut });
  animate(inner, { opacity: [0, 1], scale: [0.88, 1.02, 1], y: [30, -4, 0] }, { duration: 0.45, ease: spring() });
}

function hideModal(el: HTMLElement, inner: HTMLElement): void {
  try {
    animate(inner, { opacity: [1, 0], scale: [1, 0.93], y: [0, -16] }, { duration: 0.15, ease: easeInOut });
    animate(el, { opacity: [1, 0] }, { duration: 0.15, ease: easeInOut });
    setTimeout(() => {
      el.classList.add("hidden");
      el.style.opacity = "";
      inner.style.opacity = "";
      inner.style.transform = "";
    }, 200);
  } catch {
    el.classList.add("hidden");
  }
}

function animateSpinner(el: SVGElement, loop = true): void {
  animate(el, { rotate: [0, 360] }, { duration: 1, ease: "linear", repeat: loop ? Infinity : 0 });
}

function hideSuccessOverlay(): void {
  try {
    animate(successToast, { opacity: [1, 0], scale: [1, 0.9], y: [0, -20] }, { duration: 0.18, ease: easeInOut });
    animate(successOverlay, { opacity: [1, 0] }, { duration: 0.18, ease: easeInOut });
    setTimeout(() => {
      successOverlay.classList.add("hidden");
      successOverlay.style.opacity = "";
      successToast.style.opacity = "";
      successToast.style.transform = "";
    }, 220);
  } catch {
    successOverlay.classList.add("hidden");
  }
}

async function showSuccessOverlay(msg: string): Promise<void> {
  try {
    successMsgEl.textContent = msg;
    successOverlay.style.opacity = "0";
    successToast.style.opacity = "0";
    successToast.style.transform = "scale(0.85) translateY(30px)";
    successOverlay.classList.remove("hidden");
    void successOverlay.offsetHeight;
    successCircle.setAttribute("stroke-dasharray", "176");
    successCircle.setAttribute("stroke-dashoffset", "176");
    successCheck.setAttribute("stroke-dasharray", "36");
    successCheck.setAttribute("stroke-dashoffset", "36");

    animate(successOverlay, { opacity: [0, 1] }, { duration: 0.25, ease: easeInOut });
    await animate(successToast, { opacity: [0, 1], scale: [0.85, 1.05, 1], y: [30, -4, 0] }, { duration: 0.55, ease: spring() }).finished;

    await animate(successCircle, { strokeDashoffset: [176, 0] }, { duration: 0.35, ease: easeInOut }).finished;
    await animate(successCheck, { strokeDashoffset: [36, 0] }, { duration: 0.25, ease: easeInOut }).finished;

    await new Promise((r) => setTimeout(r, 1000));
    hideSuccessOverlay();
  } catch {
    successOverlay.classList.add("hidden");
  }
}

successBackdrop.addEventListener("click", hideSuccessOverlay);

// === Tabs ===
function renderTabBar(): void {
  tabList.innerHTML = "";
  state.tabs.forEach((tab) => {
    const name = tab.file
      ? tab.file.split("\\").pop()?.split("/").pop() || "untitled"
      : "untitled";
    const div = document.createElement("div");
    div.className = `tab-item${tab.id === state.activeTabId ? " active" : ""}`;
    div.dataset.tabId = tab.id;
    div.innerHTML = `
      ${tab.modified ? '<span class="tab-modified"></span>' : ""}
      <span class="tab-name">${name}</span>
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

function closeTab(id: string): void {
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab) return;
  if (tab.modified) {
    const msg = tab.file
      ? `"${tab.file.split("\\").pop()?.split("/").pop()}" has unsaved changes. Close anyway?`
      : "Unsaved changes. Close anyway?";
    if (!confirm(msg)) return;
  }
  const idx = state.tabs.indexOf(tab);
  state.tabs.splice(idx, 1);
  saveSession();
  if (state.activeTabId === id) {
    const next = state.tabs[Math.min(idx, state.tabs.length - 1)] ?? null;
    setActiveTab(next);
    if (next) {
      loadTab(next);
    } else {
      setActiveTab(null);
      // Reset UI
      filenameEl.textContent = "No file open";
      modifiedDot.classList.add("hidden");
      statusFilenameBottom.textContent = "";
      document.title = "Remark";
      statusText.textContent = "Ready";
      wordCountEl.classList.add("hidden");
      emptyState.classList.remove("hidden");
      previewContainer.classList.add("hidden");
      editorPanel.classList.add("hidden");
      previewPanel.classList.remove("hidden");
      setEditorContent("");
    }
  }
  renderTabBar();
}

function switchTab(id: string): void {
  const old = getActiveTab();
  if (old) {
    old.scrollTop = getEditorScrollTop();
    if (editorContainer.querySelector(".cm-editor")) {
      old.content = getEditorContent();
    }
  }
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab) return;
  setActiveTab(tab);
  loadTab(tab);
  renderTabBar();
}

function loadTab(tab: Tab): void {
  suppressChangeEvents(true);
  setEditorContent(tab.content);
  suppressChangeEvents(false);

  setTimeout(() => setEditorScrollTop(tab.scrollTop), 0);

  const name = tab.file
    ? tab.file.split("\\").pop()?.split("/").pop()
    : "untitled";
  filenameEl.textContent = name ?? "untitled";
  modifiedDot.classList.toggle("hidden", !tab.modified);
  statusFilenameBottom.textContent = tab.file ?? "";
  document.title = tab.modified ? `* ${name} - Remark` : `${name} - Remark`;

  emptyState.classList.add("hidden");
  previewContainer.classList.remove("hidden");
  updatePreview();
  updateWordCount();
}

// === Settings ===
function openSettings(): void {
  const panel = settingsModal.querySelector(".settings-panel") as HTMLElement;
  showModal(settingsModal, panel);
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

async function saveSettingsFn(): Promise<void> {
  try {
    await invoke("save_settings", { content: JSON.stringify(settings) });
  } catch {}
}

function applySettingsUI(): void {
  (document.getElementById("setting-ollama-enabled") as HTMLInputElement).checked = settings.ollamaEnabled;
  (document.getElementById("setting-ollama-endpoint") as HTMLInputElement).value = settings.ollamaEndpoint;
  (document.getElementById("setting-ollama-model") as HTMLSelectElement).value = settings.ollamaModel;
  (document.getElementById("setting-autosave") as HTMLInputElement).value = String(settings.autoSaveInterval);
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
        const inner = settingsModal.querySelector(".settings-panel") as HTMLElement;
        hideModal(settingsModal, inner);
        setTimeout(() => showOllamaSetup(), 300);
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
  document.getElementById("clear-recent")!.addEventListener("click", () => {
    settings.recentFiles = [];
    saveSettingsFn();
    setStatus("Recent files cleared");
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
    dot.title = running ? "AI connected" : "AI not available";
  }
}

// === Ollama Formatting ===
async function formatWithOllama(): Promise<void> {
  if (!settings.ollamaEnabled) {
    setStatus("Enable AI formatting in settings");
    return;
  }

  const tab = getActiveTab();
  const content = tab ? (state.viewMode === "edit" ? getEditorContent() : tab.content) : "";
  if (!content.trim()) {
    setStatus("No text to format");
    return;
  }

  const inner = ollamaDialog.querySelector(".settings-panel") as HTMLElement;
  showModal(ollamaDialog, inner);
  ollamaDialogSub.classList.add("hidden");
  ollamaDialogText.textContent = "Connecting to AI...";
  ollamaDialogSub.textContent = "";
  ollamaSpinnerEl.style.display = "";
  animateSpinner(ollamaSpinnerEl as unknown as SVGSVGElement);

  const running = await checkOllamaStatus();
  if (!running) {
    hideModal(ollamaDialog, inner);
    setStatus("Ollama is not running – check settings");
    return;
  }

  ollamaDialogText.textContent = "Formatting text...";
  ollamaDialogSub.classList.remove("hidden");
  ollamaDialogSub.textContent = "Sending to Ollama…";
  try {
    const result = await invoke<string>("format_with_ollama", {
      endpoint: settings.ollamaEndpoint,
      model: settings.ollamaModel,
      text: content,
    });
    hideModal(ollamaDialog, inner);
    if (tab) {
      tab.content = result;
      tab.modified = result !== tab.originalContent;
      setEditorContent(result);
    }
    updatePreview();
    updateTitle();
    renderTabBar();
    showSuccessOverlay("Text formatted");
  } catch (err) {
    hideModal(ollamaDialog, inner);
    setStatus(`Error: ${err}`);
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
  throw new Error("Ollama did not start in time");
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
  saveSettingsFn();

  try {
    goToSetupStep(2);
    setupProgressBar.style.width = "0%";
    setupDownloadText.textContent = "Downloading Ollama…";
    setupProgressText.textContent = "Starting download…";
    animateSpinner(setupSpinner1 as unknown as SVGSVGElement);

    const path = await invoke<string>("download_ollama");
    setupProgressBar.style.width = "100%";
    setupProgressText.textContent = "Download complete";

    goToSetupStep(3);
    animateSpinner(setupSpinner2 as unknown as SVGSVGElement);
    await invoke("install_ollama", { path });

    await waitForOllamaReady();

    goToSetupStep(4);
    setupPullText.textContent = `Loading ${model}…`;
    animateSpinner(setupSpinner3 as unknown as SVGSVGElement);
    await invoke("pull_ollama_model", { model });

    settings.ollamaSetupComplete = true;
    saveSettingsFn();
    goToSetupStep(5);
    updateOllamaStatusBar();
    setStatus("AI formatting ready");
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
  if (settings.ollamaEnabled && !settings.ollamaSetupComplete) {
    showOllamaSetup();
  }
}

// === Auto-Save ===
function restartAutoSave(): void {
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  autoSaveTimer = setInterval(() => {
    const tab = getActiveTab();
    if (tab && tab.modified && tab.file) {
      saveFile(true);
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
  const name = tab.file
    ? tab.file.split("\\").pop()?.split("/").pop()
    : "untitled";
  filenameEl.textContent = name ?? "untitled";
  modifiedDot.classList.toggle("hidden", !tab.modified);
  statusFilenameBottom.textContent = tab.file ?? "";
  document.title = tab.modified ? `* ${name} - Remark` : `${name} - Remark`;
}

function setStatus(msg: string): void {
  statusText.textContent = msg;
  animate(statusText, { opacity: [0, 1] }, { duration: 0.15, ease: easeInOut });
}

function updatePreview(): void {
  const tab = getActiveTab();
  if (!tab) return;
  const content = state.viewMode === "edit" ? getEditorContent() : tab.content;
  if (content.trim()) {
    emptyState.classList.add("hidden");
    previewContainer.classList.remove("hidden");
    renderPreviewContent(previewContainer, content);
  } else {
    emptyState.classList.remove("hidden");
    previewContainer.classList.add("hidden");
  }
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

function onContentChange(content: string): void {
  const tab = getActiveTab();
  if (!tab) return;
  tab.content = content;
  tab.modified = content !== tab.originalContent;
  updateTitle();
  renderTabBar();
  if (state.viewMode === "split" || state.viewMode === "view") {
    updatePreview();
  }
  updateWordCount();
  runLint();
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
      createEditor(editorContainer, state.darkMode);
      const tab = getActiveTab();
      if (tab) setEditorContent(tab.content);
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
    const tab = addTab(filePath, content);
    tab.originalContent = content;
    tab.modified = false;
    updatePreview();
    setEditorContent(content);
    updateTitle();
    renderTabBar();
    await showSuccessOverlay("File opened");

    settings.recentFiles = settings.recentFiles.filter((f) => f !== filePath);
    settings.recentFiles.unshift(filePath);
    if (settings.recentFiles.length > 10) settings.recentFiles.length = 10;
    saveSettingsFn();
    saveSession();

    // Set sidebar root to file's parent dir
    loadSidebarDir(filePath);
  } catch (err) {
    setStatus(`Error opening: ${err}`);
  }
}

async function saveFile(silent = false): Promise<void> {
  const tab = getActiveTab();
  if (!tab) return;

  if (!tab.file) {
    const result = await save({
      filters: [{ name: "Markdown", extensions: ["md"] }],
      defaultPath: "document.md",
    });
    if (!result) return;
    tab.file = result as string;
    settings.recentFiles = settings.recentFiles.filter((f) => f !== result);
    settings.recentFiles.unshift(result as string);
    if (settings.recentFiles.length > 10) settings.recentFiles.length = 10;
    saveSettingsFn();
    saveSession();
  }
  const content = getEditorContent();
  try {
    await invoke("write_file", { path: tab.file, content });
    tab.content = content;
    tab.originalContent = content;
    tab.modified = false;
    updateTitle();
    renderTabBar();
    if (!silent) await showSuccessOverlay("Saved");
  } catch (err) {
    if (!silent) setStatus(`Error saving: ${err}`);
  }
}

function toggleTheme(): void {
  state.darkMode = !state.darkMode;
  document.documentElement.classList.toggle("dark", state.darkMode);
  themeIcon.innerHTML = state.darkMode
    ? `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`
    : `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
  animate(themeIcon, { rotate: [0, 180] }, { duration: 0.3, ease: spring() });
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
  try {
    animate(findBar, { opacity: [1, 0] }, { duration: 0.1, ease: easeInOut });
    setTimeout(() => findBar.classList.add("hidden"), 150);
  } catch {
    findBar.classList.add("hidden");
  }
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
  const tab = getActiveTab();
  const content = tab ? (state.viewMode === "edit" ? getEditorContent() : tab.content) : "";
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
  const parts = filePath.replace(/\\/g, "/").split("/");
  parts.pop();
  const dir = parts.join("/");
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
    sidebarFiles.innerHTML = renderTree(entries, sidebarRoot, 0);
    attachTreeListeners(sidebarFiles);
  } catch {}
}

function renderTree(entries: FileEntry[], basePath: string, depth: number): string {
  let html = "";
  const filtered = entries.filter((e) => e.is_dir || e.name.endsWith(".md") || e.name.endsWith(".markdown") || e.name.endsWith(".txt"));
  for (const entry of filtered) {
    const isExpanded = expandedDirs.has(entry.path);
    const indent = depth * 16;
    const name = escHtml(entry.name);
    const path = escHtml(entry.path);
    if (entry.is_dir) {
      html += `<div class="file-item ${isExpanded ? "dir-open" : ""}" data-path="${path}" data-dir="1" style="padding-left:${6 + indent}px">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span>${name}</span>
      </div>`;
      if (isExpanded) {
        html += `<div class="file-children" data-parent="${path}">loading…</div>`;
      }
    } else {
      html += `<div class="file-item" data-path="${path}" style="padding-left:${6 + indent}px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
        <span>${name}</span>
      </div>`;
    }
  }
  return html;
}

function attachTreeListeners(container: HTMLElement): void {
  container.querySelectorAll(".file-item[data-dir]").forEach((el) => {
    el.addEventListener("click", async () => {
      const path = (el as HTMLElement).dataset.path!;
      if (expandedDirs.has(path)) {
        expandedDirs.delete(path);
      } else {
        expandedDirs.add(path);
      }
      await refreshSidebarTree();
      // Auto-expand the children
      if (expandedDirs.has(path)) {
        const childContainer = sidebarFiles.querySelector(`.file-children[data-parent="${path}"]`);
        if (childContainer) {
          try {
            const entries = await invoke<FileEntry[]>("list_directory", { path });
            childContainer.innerHTML = renderTree(entries, path, 1);
            attachTreeListeners(childContainer as HTMLElement);
          } catch {
            childContainer.textContent = "error";
          }
        }
      }
    });
  });
  container.querySelectorAll(".file-item:not([data-dir])").forEach((el) => {
    el.addEventListener("click", () => {
      const path = (el as HTMLElement).dataset.path!;
      openFile(path);
    });
  });
}

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

// === TOC Update ===
addEventListener("toc-update", ((e: CustomEvent) => {
  const container = e.detail.container as HTMLElement;
  const tocHtml = extractTOC(container);
  sidebarToc.innerHTML = tocHtml || '<p class="text-xs text-muted p-2">No headings found</p>';
  // Click handler for TOC links
  sidebarToc.querySelectorAll(".toc-link").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const href = (a as HTMLAnchorElement).getAttribute("href");
      if (href) {
        const target = previewContainer.querySelector(href);
        if (target) target.scrollIntoView({ behavior: "smooth" });
      }
    });
  });
}) as EventListener);

// === Focus / Typewriter Mode ===
function toggleTypewriter(): void {
  state.typewriterMode = !state.typewriterMode;
  document.getElementById("editor-container")!.classList.toggle("typewriter-mode", state.typewriterMode);
  menuFocus.classList.toggle("active", state.typewriterMode);
  setStatus(state.typewriterMode ? "Focus mode on" : "Focus mode off");
}

// === Export ===
function getFullHTMLPage(): string {
  const tab = getActiveTab();
  if (!tab) return "";
  // We need to render markdown to HTML, but we need to bypass the container-based rendering
  // Import renderMarkdown directly
  const bodyHtml = renderMarkdown(tab.content);

  const isDark = state.darkMode;
  const bg = isDark ? "#1e1e1e" : "#f5f0eb";
  const text = isDark ? "#e8e4dd" : "#3d352c";
  const accent = "#c4845a";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${tab.file?.split("\\").pop()?.split("/").pop() || "document"}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github.min.css">
<style>
body { max-width: 800px; margin: 0 auto; padding: 40px 32px; background: ${bg}; color: ${text}; font-size: 15px; line-height: 1.7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
img { max-width: 100%; border-radius: 8px; }
pre { background: ${isDark ? "#2a2a2a" : "#f0ece6"}; padding: 16px; border-radius: 8px; overflow-x: auto; }
code { font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 0.9em; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.6em 1em; border: 1px solid ${isDark ? "#3a3a3a" : "#ddd"}; text-align: left; }
blockquote { border-left: 4px solid ${accent}; padding: 0.5em 1em; margin: 1em 0; background: ${isDark ? "#2a2a2a" : "#f0ece6"}; border-radius: 0 8px 8px 0; }
a { color: ${accent}; }
</style>
</head><body>${bodyHtml}</body></html>`;
}

async function exportHTML(): Promise<void> {
  const tab = getActiveTab();
  if (!tab) { setStatus("No file to export"); return; }
  const result = await save({
    filters: [{ name: "HTML", extensions: ["html"] }],
    defaultPath: "document.html",
  });
  if (!result) return;
  try {
    await invoke("write_file", { path: result, content: getFullHTMLPage() });
    await showSuccessOverlay("HTML exported");
  } catch (err) {
    setStatus(`Export error: ${err}`);
  }
}

function exportPDF(): void {
  const html = getFullHTMLPage();
  if (!html) { setStatus("No file to export"); return; }
  const win = window.open("", "_blank");
  if (!win) { setStatus("Popup blocked. Allow popups for PDF export."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}

// === Image Paste ===
async function handleImagePaste(e: ClipboardEvent): Promise<void> {
  const tab = getActiveTab();
  if (!tab) { setStatus("Open a file first to paste images"); return; }
  if (!tab.file) { setStatus("Save the file first to paste images"); return; }
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);

      const dir = tab.file.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
      const assetsDir = dir + "/assets";
      const ext = item.type === "image/png" ? "png" : item.type === "image/jpeg" ? "jpg" : "png";
      const name = `pasted-${Date.now()}.${ext}`;
      const savePath = `${assetsDir}/${name}`;

      try {
        await invoke("create_dir", { path: assetsDir });
        await invoke("save_image", { path: savePath, data: Array.from(data) });
        insertAtCursor(`![Pasted image](assets/${name})`);
        setStatus("Image pasted");
      } catch (err) {
        setStatus(`Image paste error: ${err}`);
      }
      return;
    }
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
  setEditorContent("");
  updateTitle();
  renderTabBar();
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

let moreMenuVisible = false;

function showMoreMenu(): void {
  moreMenuVisible = true;
  moreMenu.classList.remove("hidden");
  animate(moreMenu, { opacity: [0, 1], scale: [0.93, 1], y: [-10, 0] }, { duration: 0.2, ease: easeInOut });
}
function hideMoreMenu(): void {
  if (!moreMenuVisible) return;
  moreMenuVisible = false;
  animate(moreMenu, { opacity: [1, 0], scale: [1, 0.95], y: [0, -6] }, { duration: 0.12, ease: easeInOut });
  setTimeout(() => moreMenu.classList.add("hidden"), 150);
}

btnMore.addEventListener("click", (e) => {
  e.stopPropagation();
  if (moreMenuVisible) { hideMoreMenu(); return; }
  const rect = (e.target as HTMLElement).closest("button")!.getBoundingClientRect();
  const menuW = 200;
  const gap = 4;
  const vw = window.innerWidth;
  const clampedLeft = Math.max(8, Math.min(rect.left, vw - menuW - 8));
  moreMenu.style.top = `${rect.bottom + gap}px`;
  moreMenu.style.left = `${clampedLeft}px`;
  showMoreMenu();
});

menuFocus.addEventListener("click", () => { hideMoreMenu(); toggleTypewriter(); });
menuOllama.addEventListener("click", () => { hideMoreMenu(); formatWithOllama(); });
menuExportHtml.addEventListener("click", () => { hideMoreMenu(); exportHTML(); });
menuExportPdf.addEventListener("click", () => { hideMoreMenu(); exportPDF(); });

document.addEventListener("click", (e) => {
  if (!moreMenu.contains(e.target as Node) && e.target !== btnMore && !(e.target as HTMLElement).closest("#btn-more")) {
    hideMoreMenu();
  }
});

findCloseBtn.addEventListener("click", hideFindBar);
findNextBtn.addEventListener("click", findNext);
findPrevBtn.addEventListener("click", findPrev);
findInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.shiftKey ? findPrev() : findNext(); }
  if (e.key === "Escape") hideFindBar();
});
findInput.addEventListener("input", () => { findInEditor(findInput.value); updateFindCount(); });

settingsBackdrop.addEventListener("click", () => {
  const inner = settingsModal.querySelector(".settings-panel") as HTMLElement;
  hideModal(settingsModal, inner);
});
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
document.getElementById("ollama-close")!.addEventListener("click", () => {
  const inner = ollamaDialog.querySelector(".settings-panel") as HTMLElement;
  hideModal(ollamaDialog, inner);
});

ollamaSetupBackdrop.addEventListener("click", hideOllamaSetup);
ollamaSetupClose.addEventListener("click", hideOllamaSetup);
setupSkip.addEventListener("click", hideOllamaSetup);
setupErrorClose.addEventListener("click", hideOllamaSetup);
setupStart.addEventListener("click", startOllamaSetup);
setupFinish.addEventListener("click", hideOllamaSetup);

// Download progress
import { listen } from "@tauri-apps/api/event";
listen<{ downloaded: number; total: number }>("ollama-download-progress", (event) => {
  const { downloaded, total } = event.payload;
  const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
  if (!setupProgressBar.classList.contains("hidden")) {
    setupProgressBar.style.width = `${pct}%`;
    setupDownloadText.textContent = `Downloading Ollama installer… (${formatBytes(downloaded)} / ${formatBytes(total)})`;
    setupProgressText.textContent = `${pct}%`;
  }
});

document.getElementById("btn-settings")!.addEventListener("click", openSettings);

document.getElementById("setting-install-ollama")?.addEventListener("click", () => {
  const inner = settingsModal.querySelector(".settings-panel") as HTMLElement;
  hideModal(settingsModal, inner);
  setTimeout(() => showOllamaSetup(), 300);
});

// Also wire download overlay to the direct download from settings (optional future use)

// Sidebar panel switching
sidebarPanelFiles.addEventListener("click", () => switchSidebarPanel("files"));
sidebarPanelToc.addEventListener("click", () => switchSidebarPanel("toc"));

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === "o") { e.preventDefault(); openFile(); }
  if (ctrl && e.key === "s") { e.preventDefault(); saveFile(); }
  if (ctrl && e.shiftKey && e.key === "V") { e.preventDefault(); setViewMode("view"); }
  if (ctrl && e.key === "e") { e.preventDefault(); setViewMode("edit"); }
  if (ctrl && e.shiftKey && e.key === "E") { e.preventDefault(); setViewMode("split"); }
  if (e.key === "Escape" && moreMenuVisible) { hideMoreMenu(); }
  if (ctrl && e.key === "f") { e.preventDefault(); showFindBar(); }
  if (ctrl && e.key === "n") { e.preventDefault(); btnNewTab.click(); }
  if (ctrl && e.shiftKey && e.key === "b") { e.preventDefault(); btnSidebar.click(); }
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
  if (e.key === "Escape" && !successOverlay.classList.contains("hidden")) { hideSuccessOverlay(); }
  if (e.key === "Escape" && !ollamaSetup.classList.contains("hidden")) {
    hideOllamaSetup();
  }

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
function hideDropOverlay(): void {
  try {
    animate(dropOverlay, { opacity: [1, 0] }, { duration: 0.12, ease: easeInOut });
    setTimeout(() => dropOverlay.classList.add("hidden"), 160);
  } catch {
    dropOverlay.classList.add("hidden");
  }
}

getCurrentWindow().onDragDropEvent(async (event) => {
  if (event.payload.type === "over") {
    dropOverlay.classList.remove("hidden");
    animate(dropOverlay, { opacity: [0, 1] }, { duration: 0.15, ease: easeInOut });
    animate(dropContent, { scale: [0.92, 1] }, { duration: 0.2, ease: spring() });
  } else if (event.payload.type === "leave") {
    hideDropOverlay();
  } else if (event.payload.type === "drop") {
    hideDropOverlay();
    const path = event.payload.paths[0];
    if (!path) return;
    if (!path.endsWith(".md") && !path.endsWith(".markdown") && !path.endsWith(".txt")) {
      setStatus("Only .md, .markdown or .txt files");
      return;
    }
    await openFile(path);
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

// === Session Restore ===
function saveSession(): void {
  settings.sessionTabs = state.tabs.map((t) => ({
    file: t.file,
    scrollTop: t.file ? getEditorScrollTop() : 0,
  }));
  settings.sessionActiveTab = state.activeTabId
    ? state.tabs.findIndex((t) => t.id === state.activeTabId)
    : 0;
  saveSettingsFn();
}

async function restoreSession(): Promise<void> {
  const st = settings.sessionTabs;
  if (!st || st.length === 0) return;
  let restoredCount = 0;
  for (const s of st) {
    if (!s.file) {
      addTab(null, "");
      restoredCount++;
      continue;
    }
    try {
      const exists = await invoke<boolean>("file_exists", { path: s.file });
      if (exists) {
        const content = await invoke<string>("read_file", { path: s.file });
        const tab = addTab(s.file, content);
        tab.originalContent = content;
        tab.modified = false;
        restoredCount++;
      }
    } catch {}
  }
  // Restore active tab
  const idx = settings.sessionActiveTab ?? 0;
  if (state.tabs[idx]) switchTab(state.tabs[idx].id);
  setStatus(`Restored ${restoredCount} tab(s)`);
}

// === Task List Handler ===
addEventListener("task-list-rendered", ((e: CustomEvent) => {
  const container = e.detail.container as HTMLElement;
  const sourceContent = e.detail.content as string;
  container.querySelectorAll<HTMLInputElement>("li.task-list-item input[type=checkbox]").forEach((cb) => {
    cb.disabled = false;
    cb.addEventListener("change", () => {
      const items = container.querySelectorAll("li.task-list-item input[type=checkbox]");
      let idx = 0;
      for (const item of items) {
        if (item === cb) break;
        idx++;
      }
      // Find Nth task list item in source and toggle
      const tab = getActiveTab();
      if (!tab) return;
      const lines = tab.content.split("\n");
      let found = 0;
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*[-*]\s+\[[ x]\]/i.test(lines[i])) {
          if (found === idx) {
            lines[i] = cb.checked
              ? lines[i].replace(/\[ \]/, "[x]")
              : lines[i].replace(/\[x\]/i, "[ ]");
            tab.content = lines.join("\n");
            tab.modified = tab.content !== tab.originalContent;
            setEditorContent(tab.content);
            updatePreview();
            updateTitle();
            renderTabBar();
            updateWordCount();
            break;
          }
          found++;
        }
      }
    });
  });
}) as EventListener);

// === Auto-Updater ===
async function checkForUpdate(): Promise<void> {
  try {
    const latest = await invoke<string | null>("check_update", { currentVersion: "1.0.0" });
    if (latest) {
      btnUpdate.classList.remove("hidden");
      btnUpdate.addEventListener("click", () => {
        window.open("https://github.com/leg1tfx/Remark/releases/latest", "_blank");
      });
    }
  } catch {}
}

// === Markdown Lint ===
let currentIssues: LintIssue[] = [];

function runLint(): void {
  const tab = getActiveTab();
  if (!tab || !tab.content.trim()) {
    btnLint.classList.add("hidden");
    lintPanel.classList.add("hidden");
    currentIssues = [];
    return;
  }
  const issues: LintIssue[] = [];
  const lines = tab.content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Trailing whitespace
    if (/[ \t]+$/.test(line) && line.length > 0) {
      issues.push({ line: lineNum, column: line.length, message: "Trailing whitespace", rule: "trailing-space" });
    }

    // Multiple consecutive blank lines (check next line too)
    if (i > 0 && line === "" && lines[i - 1] === "") {
      issues.push({ line: lineNum, column: 1, message: "Consecutive blank lines", rule: "consecutive-blank-lines" });
    }

    // Heading without space after #
    if (/^#{1,6}[^#\s]/.test(line) && !/^#{1,6}\s/.test(line)) {
      issues.push({ line: lineNum, column: 1, message: "Missing space after heading marker", rule: "heading-space" });
    }

    // List marker without space
    if (/^(\s*)[-*+]\S/.test(line)) {
      issues.push({ line: lineNum, column: line.search(/[-*+]/) + 1, message: "Missing space after list marker", rule: "list-marker-space" });
    }

    // Long lines
    if (line.length > 120 && !/^```/.test(line)) {
      issues.push({ line: lineNum, column: 121, message: `Line too long (${line.length} chars)`, rule: "line-length" });
    }
  }

  // No trailing newline
  if (tab.content.length > 0 && !tab.content.endsWith("\n")) {
    issues.push({ line: lines.length, column: lines[lines.length - 1].length, message: "No trailing newline", rule: "final-newline" });
  }

  currentIssues = issues;
  if (issues.length > 0) {
    lintCount.textContent = String(issues.length);
    btnLint.classList.remove("hidden");
    lintPanel.innerHTML = issues.map((iss) =>
      `<div class="lint-item" data-line="${iss.line}">
        <span class="lint-line">${iss.line}:${iss.column}</span>
        <span class="lint-msg">${escHtml(iss.message)}</span>
      </div>`
    ).join("");
    lintPanel.querySelectorAll(".lint-item").forEach((el) => {
      el.addEventListener("click", () => {
        const line = parseInt((el as HTMLElement).dataset.line!);
        scrollEditorToLine(line);
        lintPanel.classList.add("hidden");
      });
    });
  } else {
    btnLint.classList.add("hidden");
    lintPanel.classList.add("hidden");
  }
}

function escHtml(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function scrollEditorToLine(line: number): void {
  // Set view to edit mode temporarily if in view mode
  if (state.viewMode === "view") setViewMode("split");
  const el = getEditorScrollElement();
  if (!el) return;
  const cm = el.querySelector(".cm-content");
  if (!cm) return;
  const lineEl = cm.querySelector(`[role="presentation"]:nth-child(${line})`) as HTMLElement | null;
  if (lineEl) {
    lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
    lineEl.style.outline = "2px solid var(--accent)";
    setTimeout(() => { lineEl.style.outline = ""; }, 2000);
  }
}

btnLint.addEventListener("click", (e) => {
  lintPanel.classList.toggle("hidden");
  const rect = btnLint.getBoundingClientRect();
  lintPanel.style.bottom = "28px";
  lintPanel.style.left = `${rect.left}px`;
});

document.addEventListener("click", (e) => {
  if (e.target !== btnLint && !lintPanel.contains(e.target as Node)) {
    lintPanel.classList.add("hidden");
  }
});

// === Language ===
statusLanguage.addEventListener("change", () => {
  settings.language = statusLanguage.value;
  saveSettingsFn();
});

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
  setStatus("Ready");

  // Restore session if available
  await restoreSession();

  // If still no tabs, add a default empty one
  if (state.tabs.length === 0) {
    addTab(null, "");
    setEditorContent("");
    updateTitle();
    renderTabBar();
  }

  await checkFirstRunOllama();

  ollamaCheckTimer = setInterval(updateOllamaStatusBar, 30000);

  // Init resizer
  initResizer();

  // Check for updates
  checkForUpdate();

  // Run initial lint
  runLint();
}

init();
