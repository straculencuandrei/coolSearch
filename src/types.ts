export interface FileRecord {
  id: number;
  parent_id: number;
  name: string;
  path: string;
  is_dir: boolean;
}

export interface FileDetails {
  size: number;
  created: string;
}

export type UIMode = 'modern' | 'classic';

export interface AppSettings {
  // Appearance & UI
  uiMode: UIMode;
  theme: 'matte-dark' | 'light' | 'neon-blue' | 'neon-red' | 'neon-green';
  fontFamily: 'ubuntu' | 'sfpro' | 'jetbrains' | 'system';
  rowDensity: 'compact' | 'standard' | 'spacious';
  highlightMatches: boolean;
  showFileExtensions: boolean;

  // Search & Query Behavior
  searchInPath: boolean;
  caseSensitiveDefault: boolean;
  exactMatchDefault: boolean;
  maxResults: number;
  debounceMs: number;
  enableRegex: boolean;

  // Indexing & Drives
  monitoredDrives: string[];
  excludedPaths: string[];
  indexHiddenFiles: boolean;
  indexSystemFiles: boolean;
  autoReindexStartup: boolean;
  autoReindexIntervalMinutes: number;

  // File Actions
  primaryAction: 'open' | 'explorer';
  copyPathFormat: 'windows' | 'quoted' | 'unix';
  closeOnLaunch: boolean;

  // System
  startWithWindows: boolean;
  startMinimized: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  uiMode: 'modern',
  theme: 'matte-dark',
  fontFamily: 'ubuntu',
  rowDensity: 'standard',
  highlightMatches: true,
  showFileExtensions: true,

  searchInPath: true,
  caseSensitiveDefault: false,
  exactMatchDefault: false,
  maxResults: 500,
  debounceMs: 25,
  enableRegex: false,

  monitoredDrives: ['All'],
  excludedPaths: ['$Recycle.Bin', 'node_modules', '.git', 'AppData\\Local\\Temp'],
  indexHiddenFiles: false,
  indexSystemFiles: false,
  autoReindexStartup: true,
  autoReindexIntervalMinutes: 0,

  primaryAction: 'open',
  copyPathFormat: 'windows',
  closeOnLaunch: false,

  startWithWindows: false,
  startMinimized: false,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem('coolsearch_settings');
    const savedUIMode = localStorage.getItem('coolsearch_ui_mode') as UIMode | null;
    const base = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    if (savedUIMode === 'modern' || savedUIMode === 'classic') {
      base.uiMode = savedUIMode;
    }
    return base;
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem('coolsearch_settings', JSON.stringify(settings));
    localStorage.setItem('coolsearch_ui_mode', settings.uiMode);
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}
