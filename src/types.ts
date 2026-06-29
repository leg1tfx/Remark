export type ViewMode = "view" | "edit" | "split";

export interface AppState {
  currentFile: string | null;
  content: string;
  originalContent: string;
  modified: boolean;
  viewMode: ViewMode;
  darkMode: boolean;
}

export interface Settings {
  ollamaEnabled: boolean;
  ollamaEndpoint: string;
  ollamaModel: string;
  autoSaveInterval: number;
  recentFiles: string[];
}
