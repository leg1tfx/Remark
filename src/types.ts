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
  splitRatio?: number;
  /** Open tabs; untitled tabs carry their text in `content`. */
  sessionTabs?: { file: string | null; scrollTop: number; content?: string }[];
  sessionActiveTab?: number;
  ollamaSetupComplete?: boolean;
  ollamaSetupDismissed?: boolean;
  language?: string;
  /** Render single line breaks as <br> (GFM "breaks"). */
  lineBreaks?: boolean;
  darkMode?: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface LintIssue {
  line: number;
  column: number;
  message: string;
  rule: string;
}
