export interface Tab {
  id: string;
  file: string | null;
  content: string;
  originalContent: string;
  modified: boolean;
  scrollTop: number;
}

export type ViewMode = "view" | "edit" | "split";

export interface AppState {
  tabs: Tab[];
  activeTabId: string | null;
  viewMode: ViewMode;
  darkMode: boolean;
  sidebarOpen: boolean;
  sidebarPanel: "files" | "toc";
  typewriterMode: boolean;
}

export interface Settings {
  ollamaEnabled: boolean;
  ollamaEndpoint: string;
  ollamaModel: string;
  autoSaveInterval: number;
  recentFiles: string[];
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}
