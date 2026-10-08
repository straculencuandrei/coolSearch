import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { List } from "react-window";
import {
  Search,
  File as FileIcon,
  Folder,
  Terminal,
  Info,
  ExternalLink,
  Music,
  Image as ImageIcon,
  ArrowLeft,
  Copy,
  FolderOpen,
  Check,
  Type,
  Wrench,
  Sparkles,
  Download,
  X,
  Clock,
  HardDrive,
  Zap
} from "lucide-react";
import { check } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FileRecord, UIMode, AppSettings } from "../types";
import iconNeco from "../icon-neco.png";

const CURRENT_VERSION = "0.4.1";

const getFileExtension = (name: string, is_dir: boolean): string => {
  if (is_dir) return '[FOLDER]';
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === name.length - 1) return '[NO EXT]';
  return name.slice(dotIndex + 1).toLowerCase();
};

type FileRowProps = {
  items: FileRecord[];
  onFileClick: (file: FileRecord) => void;
  onFileDoubleClick?: (file: FileRecord) => void;
  onContextMenu?: (e: React.MouseEvent, file: FileRecord) => void;
  currentTheme: string;
  query: string;
  highlightMatches: boolean;
  showFileExtensions: boolean;
  zoom: number;
};

type ListRowProps = {
  index: number;
  style: React.CSSProperties;
  ariaAttributes?: any;
} & FileRowProps;

const FileRow = (props: ListRowProps): React.ReactElement | null => {
  const { index, style, items, onFileClick, onFileDoubleClick, onContextMenu, currentTheme, query, highlightMatches, showFileExtensions, zoom } = props;
  const file = items[index];
  if (!file) return null;

  const ext = getFileExtension(file.name, file.is_dir);
  let iconColor = "text-gray-400";
  let IconComponent = FileIcon;

  if (file.is_dir) {
    iconColor = "text-yellow-400 drop-shadow-[0_0_5px_rgba(250,204,21,0.5)]";
    IconComponent = Folder;
  } else if (ext === 'mp3' || ext === 'wav' || ext === 'flac') {
    iconColor = "text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]";
    IconComponent = Music;
  } else if (['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) {
    iconColor = "text-green-500 drop-shadow-[0_0_5px_rgba(34,197,94,0.5)]";
    IconComponent = ImageIcon;
  }

  const iconSize = Math.max(14, Math.round(16 * Math.min(zoom, 1.4)));
  const nameFontSize = Math.round(11.5 * zoom);
  const pathFontSize = Math.round(9.5 * zoom);
  const extFontSize = Math.round(9.5 * zoom);

  const renderName = () => {
    if (!highlightMatches || !query.trim()) return file.name;
    const q = query.trim().toLowerCase();
    const idx = file.name.toLowerCase().indexOf(q);
    if (idx === -1) return file.name;
    return (
      <>
        {file.name.slice(0, idx)}
        <span className="text-blue-400 font-bold bg-blue-500/20 px-0.5 rounded">
          {file.name.slice(idx, idx + q.length)}
        </span>
        {file.name.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div
      data-custom-context-menu="true"
      style={style}
      onClick={() => onFileClick(file)}
      onDoubleClick={() => onFileDoubleClick && onFileDoubleClick(file)}
      onContextMenu={(e) => onContextMenu && onContextMenu(e, file)}
      className="flex items-center px-4 border-b border-gray-800/40 hover:bg-dark-surface/80 transition-colors duration-75 cursor-pointer group select-none"
    >
      <div className={`mr-3 transition-transform group-hover:scale-110 flex-shrink-0 ${iconColor} ${currentTheme.startsWith('neon') ? 'neon-text' : ''}`}>
        <IconComponent size={iconSize} />
      </div>
      <div className="flex-1 truncate flex flex-col justify-center py-1.5 min-w-0">
        <div style={{ fontSize: `${nameFontSize}px` }} className="text-gray-100 font-medium truncate leading-none mb-1">
          {renderName()}
        </div>
        <div style={{ fontSize: `${pathFontSize}px` }} className="text-gray-500 truncate leading-none font-mono">
          {file.path}
        </div>
      </div>
      {showFileExtensions && (
        <span style={{ fontSize: `${extFontSize}px` }} className="ml-2 px-1.5 py-0.5 rounded font-mono bg-dark-surface/90 border border-gray-700/50 text-gray-400 flex-shrink-0">
          {ext}
        </span>
      )}
    </div>
  );
};

interface ModernUIProps {
  settings: AppSettings;
  onSwitchUI: (target: UIMode) => void;
  onOpenSettingsModal: () => void;
  availableDrives: string[];
}

export const ModernUI: React.FC<ModernUIProps> = ({
  settings,
  onSwitchUI,
  onOpenSettingsModal,
  availableDrives: propDrives,
}) => {
  const appWindow = getCurrentWindow();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileRecord[]>([]);
  const [status, setStatus] = useState("Initializing...");
  const [isFocused, setIsFocused] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  const [details, setDetails] = useState<{ size: number; created: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const currentFont = settings.fontFamily || 'ubuntu';
  const currentTheme = settings.theme || 'matte-dark';
  const [updateAvailable, setUpdateAvailable] = useState<any>(null);
  const [releaseNotes, setReleaseNotes] = useState<string>("");
  const [showNotes, setShowNotes] = useState(false);
  const [appVersion, setAppVersion] = useState(CURRENT_VERSION);
  const [sortByExtension, setSortByExtension] = useState(true);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [exactMatch, setExactMatch] = useState(false);
  const [selectedExtension, setSelectedExtension] = useState<string>("All");
  const [selectedDrive, setSelectedDrive] = useState<string>("All");
  const [availableDrives, setAvailableDrives] = useState<string[]>(propDrives || []);
  const [fileHistory, setFileHistory] = useState<FileRecord[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileRecord } | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState<number>(450);

  useEffect(() => {
    if (!listContainerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 20) {
          setListHeight(Math.round(entry.contentRect.height));
        }
      }
    });
    ro.observe(listContainerRef.current);
    return () => ro.disconnect();
  }, [results, query]);

  const handleContextMenu = useCallback((e: React.MouseEvent, file: FileRecord) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  }, []);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleTitleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    e.currentTarget.style.setProperty('--mouse-x', `${x}%`);
    e.currentTarget.style.setProperty('--mouse-y', `${y}%`);
  };

  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (update) setUpdateAvailable(update);
      } catch (e) {}
    };
    checkForUpdates();
  }, []);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const version = await getVersion();
        setAppVersion(version);
      } catch (e) {}
    };
    fetchVersion();
  }, []);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const savedHistory = await invoke<FileRecord[]>("load_recent_files");
        if (savedHistory && Array.isArray(savedHistory)) {
          setFileHistory(savedHistory);
        }
      } catch (e) {
        console.error("Failed to load history:", e);
      }
    };
    loadHistory();
  }, []);

  const fetchReleaseNotes = () => {
    const releaseNotesText = `🚀 coolSearch v0.4.1 — Dual UI & Multi-Drive Update

✨ New: Ultra-Slim Mode (Near-zero CPU & RAM)
• Switch anytime between Modern UI and Classic Slim UI.
• The Slim UI runs with near-zero CPU and RAM footprint, native Windows table columns, keyboard shortcuts, and zero animations.
• Choose your default on startup with "Do not ask me again", or change it anytime in Settings.

⚡ Universal Multi-Drive Search
• Automatically detects and indexes all drives (C:, D:, E:, etc.), secondary SSDs, external disks, and non-NTFS volumes.
• Filter directly by drive or search drive prefixes (e.g. 'd:', 'd:\\games').
• 120 FPS virtualized performance overhaul with zero input lag.`;

    setReleaseNotes(releaseNotesText);
    setShowNotes(true);
  };

  useEffect(() => {
    let rAF = 0;
    const handleResize = () => {
      cancelAnimationFrame(rAF);
      rAF = requestAnimationFrame(() => {
        setWindowWidth(window.innerWidth);
      });
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(rAF);
    };
  }, []);

  useEffect(() => {
    const handleGlobalContextMenu = (e: MouseEvent) => {
      // Prevent browser default Inspect context menu everywhere
      e.preventDefault();
    };
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "F12" || (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key.toUpperCase())) || (e.ctrlKey && e.key.toUpperCase() === "U")) {
        e.preventDefault();
      } else if (e.key === "Escape") {
        setContextMenu(null);
        if (selectedFile) setSelectedFile(null);
      } else if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        onOpenSettingsModal();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        onSwitchUI('classic');
      }
    };
    document.addEventListener("contextmenu", handleGlobalContextMenu);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("contextmenu", handleGlobalContextMenu);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [selectedFile]);

  useEffect(() => {
    let interval: any = null;
    let isSubscribed = true;

    const poll = async () => {
      try {
        const currentStatus = await invoke<string>("get_index_status");
        if (!isSubscribed) return;
        setStatus(currentStatus);

        const isIndexing = currentStatus.includes("Indexing") || currentStatus === "Initializing...";
        if (!isIndexing && interval) {
          clearInterval(interval);
          interval = setInterval(async () => {
            if (!isSubscribed) return;
            const s = await invoke<string>("get_index_status");
            setStatus(s);
          }, 8000);
        }
      } catch (e) {
        console.error(e);
      }
    };

    interval = setInterval(poll, 400);
    poll();

    return () => {
      isSubscribed = false;
      if (interval) clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const fetchDrives = async () => {
      try {
        const drives = await invoke<string[]>("get_available_drives");
        if (drives && Array.isArray(drives) && drives.length > 0) {
          setAvailableDrives(drives);
        }
      } catch (e) {
        console.error("Failed to get available drives:", e);
      }
    };
    fetchDrives();
  }, [status]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    const fetchResults = async () => {
      try {
        const limit = settings.maxResults || 500;
        const res = await invoke<FileRecord[]>("search_files", { query: trimmed, limit });
        setResults(res || []);
      } catch (e) {
        console.error("Search failed:", e);
      }
    };

    const debounceTime = settings.debounceMs ?? (trimmed.length < 3 ? 60 : 30);
    const timeout = setTimeout(fetchResults, debounceTime);
    return () => clearTimeout(timeout);
  }, [query, settings.debounceMs, settings.maxResults]);

  const handleFileClick = useCallback(async (file: FileRecord) => {
    setSelectedFile(file);
    try {
      const res = await invoke<{ size: number; created: string }>("get_file_details", { path: file.path });
      setDetails(res);
    } catch (e) {
      setDetails(null);
    }

    setFileHistory(prev => {
      const updated = [file, ...prev.filter(f => f.path !== file.path)].slice(0, 30);
      invoke("save_recent_files", { files: updated }).catch(console.error);
      return updated;
    });
  }, []);

  const handleFileLaunch = useCallback(async (file: FileRecord) => {
    try {
      if (settings.primaryAction === 'explorer') {
        await invoke("open_folder", { path: file.path });
      } else {
        if (file.is_dir) {
          await invoke("open_folder", { path: file.path });
        } else {
          await invoke("open_file", { path: file.path });
        }
      }
      if (settings.closeOnLaunch) {
        appWindow.minimize().catch(() => {});
      }
    } catch (e) {
      console.error(e);
    }
  }, [settings.primaryAction, settings.closeOnLaunch, appWindow]);

  const openFileDirectly = useCallback(async () => {
    if (selectedFile) {
      await handleFileLaunch(selectedFile);
    }
  }, [selectedFile, handleFileLaunch]);

  const copyPath = useCallback(() => {
    if (selectedFile) {
      navigator.clipboard.writeText(selectedFile.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [selectedFile]);

  const openExplorer = useCallback(async () => {
    if (selectedFile) {
      await invoke("open_in_explorer", { path: selectedFile.path });
    }
  }, [selectedFile]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const availableExtensions = useMemo(() => {
    let baseResults = results;
    if (selectedDrive && selectedDrive !== "All") {
      baseResults = baseResults.filter(f => f.path.startsWith(selectedDrive));
    }
    if (exactMatch && query) {
      const lowerQuery = query.toLowerCase();
      baseResults = baseResults.filter(file => {
        const dot = file.name.lastIndexOf('.');
        const nameWithoutExt = dot > 0 ? file.name.slice(0, dot) : file.name;
        return file.name.toLowerCase() === lowerQuery || nameWithoutExt.toLowerCase() === lowerQuery;
      });
    }

    const extCounts: Record<string, number> = {};
    for (let i = 0; i < baseResults.length; i++) {
      const ext = getFileExtension(baseResults[i].name, baseResults[i].is_dir);
      extCounts[ext] = (extCounts[ext] || 0) + 1;
    }
    return extCounts;
  }, [results, exactMatch, query, selectedDrive]);

  const sortedResults = useMemo(() => {
    let filtered = results;

    if (selectedDrive && selectedDrive !== "All") {
      filtered = filtered.filter(f => f.path.startsWith(selectedDrive));
    }

    if (exactMatch && query) {
      const lowerQuery = query.toLowerCase();
      filtered = filtered.filter(file => {
        const dot = file.name.lastIndexOf('.');
        const nameWithoutExt = dot > 0 ? file.name.slice(0, dot) : file.name;
        return file.name.toLowerCase() === lowerQuery || nameWithoutExt.toLowerCase() === lowerQuery;
      });
    }

    if (!settings.searchInPath && query.trim()) {
      const q = query.trim().toLowerCase();
      filtered = filtered.filter(f => f.name.toLowerCase().includes(q));
    }

    if (settings.excludedPaths && settings.excludedPaths.length > 0) {
      filtered = filtered.filter(f => {
        const lowerPath = f.path.toLowerCase();
        return !settings.excludedPaths.some(p => lowerPath.includes(p.toLowerCase()));
      });
    }

    if (selectedExtension && selectedExtension !== "All") {
      filtered = filtered.filter(file => getFileExtension(file.name, file.is_dir) === selectedExtension);
    }

    if (!sortByExtension) return filtered;

    const grouped = new Map<string, FileRecord[]>();
    for (let i = 0; i < filtered.length; i++) {
      const ext = getFileExtension(filtered[i].name, filtered[i].is_dir);
      let list = grouped.get(ext);
      if (!list) {
        list = [];
        grouped.set(ext, list);
      }
      list.push(filtered[i]);
    }

    const sortedExtensions = Array.from(grouped.keys()).sort((a, b) =>
      sortOrder === 'asc' ? a.localeCompare(b) : b.localeCompare(a)
    );

    const sorted: FileRecord[] = [];
    for (const ext of sortedExtensions) {
      const list = grouped.get(ext);
      if (list) sorted.push(...list);
    }
    return sorted;
  }, [
    results,
    query,
    exactMatch,
    selectedDrive,
    selectedExtension,
    sortByExtension,
    sortOrder
  ]);

  const isMobile = windowWidth < 768;
  const isSmall = windowWidth < 1024;

  const zoom = settings.zoomLevel || 1.0;
  const baseRowHeight = settings.rowDensity === 'compact' ? 30 : settings.rowDensity === 'spacious' ? 46 : 38;
  const rowHeight = Math.round(baseRowHeight * zoom);

  const fontClass = currentFont === 'ubuntu' ? 'font-ubuntu' : currentFont === 'sfpro' ? 'font-sfpro' : currentFont === 'jetbrains' ? 'font-jetbrains' : '';
  const titleTextClass = currentTheme === 'light' ? 'text-gray-800 font-semibold' : 'font-semibold text-gray-200';

  return (
    <div className={`h-screen bg-dark-bg text-gray-100 flex flex-col relative overflow-hidden theme-${currentTheme} ${fontClass}`}>
      {/* Title Bar */}
      <div
        data-tauri-drag-region
        className={`h-10 bg-dark-surface/50 border-b ${currentTheme === 'light' ? 'border-gray-300' : 'border-gray-800/30'} flex items-center justify-between px-4 select-none z-[130] flex-shrink-0 relative ${currentTheme.startsWith('neon') ? 'neon-border border-b' : ''}`}
      >
        <div data-tauri-drag-region className="flex items-center gap-2 text-xs font-mono text-gray-400 select-none z-10">
          <img src={iconNeco} alt="Neco Logo" className="w-4 h-4 object-contain select-none pointer-events-none" />
          <span data-tauri-drag-region className={titleTextClass}>coolSearch</span>

          {availableDrives.length > 0 && (
            <div className="hidden sm:flex items-center gap-1 ml-2">
              {availableDrives.map(d => (
                <span
                  key={d}
                  className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-dark-surface border border-gray-700/60 text-gray-300"
                  title={`Drive ${d} active`}
                >
                  {d}
                </span>
              ))}
            </div>
          )}

          {/* Quick toggle to Slim Mode */}
          <button
            onClick={() => onSwitchUI('classic')}
            className={`ml-3 px-2 py-0.5 rounded text-[10px] flex items-center gap-1 transition-all border ${
              currentTheme === 'light'
                ? 'bg-gray-100 hover:bg-emerald-50 border-gray-300 hover:border-emerald-400 text-gray-700 hover:text-emerald-700'
                : 'bg-gray-800/60 hover:bg-emerald-600/30 border-gray-700/50 hover:border-emerald-500/50 text-gray-300 hover:text-emerald-300'
            }`}
            title="Switch to Ultra-Slim Mode"
          >
            <Zap size={11} className={currentTheme === 'light' ? 'text-emerald-600' : 'text-emerald-400'} />
            <span>Slim Mode</span>
          </button>
        </div>

        <div data-tauri-drag-region className="flex-1 h-full" />

        <div className="flex items-center gap-2.5 z-10">
          <button
            onClick={() => appWindow.minimize()}
            className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] border border-[#dfa224] active:bg-[#c08a1c] transition-colors relative group flex items-center justify-center cursor-default"
            title="Minimize"
          >
            <span className="opacity-0 group-hover:opacity-100 text-[8px] text-[#5c3e00] font-black select-none pointer-events-none transition-opacity absolute leading-none">─</span>
          </button>
          <button
            onClick={() => appWindow.toggleMaximize()}
            className="w-3.5 h-3.5 rounded-full bg-[#27c93f] border border-[#1a9c31] active:bg-[#127d24] transition-colors relative group flex items-center justify-center cursor-default"
            title="Maximize"
          >
            <span className="opacity-0 group-hover:opacity-100 text-[8px] text-[#004d02] font-black select-none pointer-events-none transition-opacity absolute leading-none">＋</span>
          </button>
          <button
            onClick={() => appWindow.close()}
            className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] border border-[#e0443e] active:bg-[#bf3b36] transition-colors relative group flex items-center justify-center cursor-default"
            title="Close"
          >
            <span className="opacity-0 group-hover:opacity-100 text-[8px] text-[#4c0002] font-black select-none pointer-events-none transition-opacity absolute leading-none">✕</span>
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 flex flex-row relative overflow-hidden">
        <div className="absolute inset-0 bg-dark-bg pointer-events-none" />

        {/* History Sidebar */}
        <AnimatePresence>
          {showSidebar && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 256, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="bg-dark-surface/30 border-r border-gray-800/50 flex flex-col overflow-hidden flex-shrink-0 z-30"
            >
              <div className="w-64 flex flex-col h-full flex-shrink-0">
                <div className="p-4 border-b border-gray-800/50 flex-shrink-0 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest flex items-center gap-2 flex-1">
                    <Clock size={16} className="text-gray-500" />
                    Recent Files
                  </h2>
                  <button
                    onClick={() => setShowSidebar(false)}
                    className="p-1 text-gray-500 hover:text-white transition-colors active:scale-90"
                    title="Close sidebar"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {fileHistory.length > 0 ? (
                    <div className="p-2 space-y-1.5 custom-scrollbar overflow-y-auto">
                      {fileHistory.map((file, index) => (
                        <button
                          key={`${file.path}-${index}`}
                          onClick={() => handleFileClick(file)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl border border-gray-800/30 bg-dark-bg/10 hover:bg-dark-surface/40 hover:border-gray-800/80 transition-all duration-150 group flex items-center gap-3 min-w-0 ${currentTheme.startsWith('neon') ? 'hover:neon-border' : ''}`}
                        >
                          <div className={`flex-shrink-0 ${
                            file.is_dir ? "text-yellow-400" :
                            ['mp3', 'wav', 'flac'].includes(getFileExtension(file.name, false)) ? "text-red-500" :
                            ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'].includes(getFileExtension(file.name, false)) ? "text-green-500" :
                            "text-gray-400"
                          } ${currentTheme.startsWith('neon') ? 'neon-text' : ''}`}>
                            {file.is_dir ? <Folder size={16} /> :
                              ['mp3', 'wav', 'flac'].includes(getFileExtension(file.name, false)) ? <Music size={16} /> :
                              ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'].includes(getFileExtension(file.name, false)) ? <ImageIcon size={16} /> :
                              <FileIcon size={16} />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-gray-200 truncate font-medium">{file.name}</div>
                            <div className="text-[10px] text-gray-500 truncate font-mono">{file.path}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4">
                      <Clock size={24} className="mb-2 opacity-50" />
                      <p className="text-xs text-center">No files viewed yet</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!showSidebar && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.1 }}
              onClick={() => setShowSidebar(true)}
              className="fixed left-4 top-14 sm:left-6 sm:top-16 p-2 text-gray-500 hover:text-white transition-colors hover:bg-dark-surface/50 rounded-lg z-40"
              title="Show file history"
            >
              <Clock size={20} />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex flex-col items-end p-4 sm:p-6 px-4 sm:px-10 z-10 gap-2 flex-shrink-0">
            <div className={`text-xs font-mono text-gray-400 bg-dark-surface px-4 py-1.5 rounded-full border border-gray-800 flex items-center gap-2 -translate-x-4 ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}>
              {status.includes("Indexing") || status.includes("Scanning") ? (
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${currentTheme.startsWith('neon') ? 'bg-[var(--theme-accent)]' : 'bg-yellow-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${currentTheme.startsWith('neon') ? 'bg-[var(--theme-accent)]' : 'bg-yellow-400'}`}></span>
                </span>
              ) : (
                <span className="h-2 w-2 rounded-full bg-green-500"></span>
              )}
              {status}
            </div>
            <button
              onClick={fetchReleaseNotes}
              className="text-[10px] uppercase tracking-[0.1em] text-gray-500 hover:text-white transition-colors flex items-center gap-1.5 mr-6"
            >
              <Sparkles size={12} />
              What's New in {appVersion}?
            </button>
          </div>

          <div className={`flex flex-col items-center justify-start flex-1 w-full max-w-6xl mx-auto px-4 sm:px-8 md:px-12 z-10 min-h-0 ${query || selectedFile ? 'overflow-hidden pb-3' : 'overflow-y-auto pb-16'}`}>
            {!selectedFile && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{
                  opacity: query || isFocused ? 0 : 1,
                  y: query || isFocused ? 10 : 30,
                  scale: query || isFocused ? 0.95 : 1.15
                }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                onMouseMove={handleTitleMouseMove}
                className="flex items-center gap-3 mb-6 sm:mb-8 relative"
              >
                <Wrench size={isMobile ? 20 : 24} className={`text-gray-400 absolute -left-8 sm:-left-10 ${currentTheme.startsWith('neon') ? 'neon-text' : ''}`} />
                <h1
                  data-text="coolSearch"
                  className={`chrome-title font-bold text-xl sm:text-2xl md:text-3xl tracking-[0.1em] uppercase select-none cursor-default ${currentTheme.startsWith('neon') ? 'neon-text' : ''}`}
                >
                  coolSearch
                </h1>
              </motion.div>
            )}

            <AnimatePresence>
              {!selectedFile ? (
                <motion.div
                  key="search-bar"
                  animate={{
                    y: query || isFocused ? 0 : 30,
                    scale: query || isFocused ? 1 : 1.03
                  }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="w-full max-w-2xl relative flex-shrink-0"
                >
                  <div className={`
                    relative group flex items-center bg-dark-surface/90 rounded-xl matte-border
                    ${isFocused ? 'matte-border-focus' : 'border-gray-800'} 
                    ${currentTheme.startsWith('neon') ? 'neon-border' : ''}
                    transition-all duration-200 overflow-hidden
                  `}>
                    <div className="pl-3 text-gray-400 group-hover:text-white transition-colors flex-shrink-0">
                      <Search size={18} />
                    </div>
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setIsFocused(false)}
                      placeholder="Search files or drives (e.g. 'notes', 'd:', 'd:\games')..."
                      className="w-full bg-transparent border-none text-gray-100 placeholder-gray-500 px-3 py-2.5 text-sm focus:outline-none focus:ring-0 min-w-0"
                      spellCheck={false}
                      autoFocus
                    />
                    {query && (
                      <button
                        onClick={() => setQuery('')}
                        className="pr-6 text-gray-500 hover:text-white transition-colors flex-shrink-0 text-xs"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="back-header"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.12 }}
                  className="w-full max-w-2xl relative z-10 flex-shrink-0 flex items-center justify-center"
                >
                  <button
                    onClick={() => setSelectedFile(null)}
                    className={`flex items-center gap-2 text-gray-400 hover:text-white transition-all bg-dark-surface/70 hover:bg-dark-surface px-5 py-2.5 rounded-xl border border-gray-800 hover:border-white/20 group shadow-lg ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
                  >
                    <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform flex-shrink-0" />
                    <span className="text-sm font-medium">Back to results</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Results / Details Container */}
            <AnimatePresence>
              {selectedFile ? (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className={`w-full mt-3 max-w-4xl mx-auto bg-dark-surface/90 border border-gray-800 rounded-2xl p-4 sm:p-5 md:p-8 shadow-2xl flex flex-col md:flex-row gap-4 md:gap-0 flex-1 mb-6 overflow-hidden ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
                >
                  <div className="flex-[0.8] flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-gray-800/50 pb-4 md:pb-0 md:pr-8">
                    <div className={`mb-4 md:mb-6 p-4 md:p-6 rounded-3xl bg-dark-bg/50 border border-gray-800/50 flex-shrink-0 ${
                      selectedFile.is_dir ? "text-yellow-400" :
                      ['mp3', 'wav', 'flac'].includes(getFileExtension(selectedFile.name, false)) ? "text-red-500" :
                      ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'].includes(getFileExtension(selectedFile.name, false)) ? "text-green-500 p-0 overflow-hidden" :
                      "text-gray-400"
                    } ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}>
                      {selectedFile.is_dir ? <Folder size={isMobile ? 48 : 64} /> :
                        ['mp3', 'wav', 'flac'].includes(getFileExtension(selectedFile.name, false)) ? <Music size={isMobile ? 48 : 64} /> :
                        ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'].includes(getFileExtension(selectedFile.name, false)) ? (
                          <img
                            src={convertFileSrc(selectedFile.path)}
                            alt={selectedFile.name}
                            className="w-32 md:w-48 h-32 md:h-48 object-contain rounded-xl shadow-2xl bg-black/20"
                          />
                        ) :
                        <FileIcon size={isMobile ? 48 : 64} />
                      }
                    </div>
                    <h2 className="text-lg md:text-xl font-light text-center break-all px-2">{selectedFile.name}</h2>
                    <p className="text-gray-500 text-xs mt-2 uppercase tracking-widest">{selectedFile.is_dir ? 'Directory' : 'File'}</p>
                  </div>

                  <div className="flex-1 md:pl-8 flex flex-col justify-center gap-4 md:gap-6 px-0 md:px-4">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Absolute Path</span>
                      <p className="text-xs md:text-sm text-gray-300 break-all font-mono bg-dark-bg/40 p-2 md:p-3 rounded-lg border border-gray-800/40">
                        {selectedFile.path}
                      </p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <button
                          onClick={openFileDirectly}
                          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-semibold transition-colors whitespace-nowrap shadow-sm"
                        >
                          <ExternalLink size={14} />
                          Open
                        </button>
                        <button
                          onClick={copyPath}
                          className="flex items-center gap-2 px-3 py-1.5 bg-dark-bg border border-gray-800 rounded-md text-xs hover:border-white/30 transition-colors whitespace-nowrap"
                        >
                          {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                          {copied ? 'Copied!' : 'Copy Path'}
                        </button>
                        <button
                          onClick={openExplorer}
                          className="flex items-center gap-2 px-3 py-1.5 bg-dark-bg border border-gray-800 rounded-md text-xs hover:border-white/30 transition-colors whitespace-nowrap"
                        >
                          <FolderOpen size={14} />
                          Open in Explorer
                        </button>
                        <button
                          onClick={() => {
                            if (selectedFile) {
                              invoke("show_file_properties", { path: selectedFile.path }).catch(console.error);
                            }
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-dark-bg border border-gray-800 rounded-md text-xs hover:border-white/30 transition-colors whitespace-nowrap"
                          title="Show Windows Properties"
                        >
                          <Wrench size={14} />
                          Properties
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 md:gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Size</span>
                        <p className="text-base md:text-lg font-medium text-gray-200">
                          {details ? formatSize(details.size) : 'Loading...'}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Created</span>
                        <p className="text-xs md:text-sm font-medium text-gray-300">
                          {details ? details.created : 'Loading...'}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : query && (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.12 }}
                  className={`w-full mt-3 bg-dark-surface/90 border border-gray-800 rounded-2xl overflow-hidden flex-1 min-h-0 mb-3 shadow-2xl flex flex-col sm:flex-row ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
                >
                  {!isMobile && (
                    <div className={`${isSmall ? 'w-40' : 'w-52'} bg-dark-bg/50 border-r border-gray-800/50 flex flex-col p-3 sm:p-4 gap-3 flex-shrink-0 overflow-y-auto`}>
                      <div>
                        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold block mb-2">Filters</span>

                        {availableDrives.length > 0 && (
                          <div className="flex flex-col gap-1 mb-3">
                            <span className="text-[10px] text-gray-500 font-bold px-1 flex items-center gap-1">
                              <HardDrive size={10} /> DRIVE
                            </span>
                            <select
                              value={selectedDrive}
                              onChange={(e) => setSelectedDrive(e.target.value)}
                              className="w-full bg-dark-surface/60 border border-gray-700 text-gray-200 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-gray-500 custom-scrollbar font-mono"
                            >
                              <option value="All">All Drives ({availableDrives.join(', ')})</option>
                              {availableDrives.map(d => (
                                <option key={d} value={d}>
                                  Drive {d}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <button
                          onClick={() => setExactMatch(!exactMatch)}
                          className={`w-full flex items-center justify-between px-3 py-2 mb-3 rounded-lg border text-xs font-medium transition-all ${
                            exactMatch
                              ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
                              : 'bg-dark-surface/40 border-gray-700 text-gray-400 hover:border-gray-600'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Type size={14} />
                            <span>Exact Match</span>
                          </div>
                          {exactMatch && <Check size={14} />}
                        </button>

                        <div className="flex flex-col gap-1 mb-3">
                          <span className="text-[10px] text-gray-500 font-bold px-1">EXTENSION</span>
                          <select
                            value={selectedExtension}
                            onChange={(e) => setSelectedExtension(e.target.value)}
                            className="w-full bg-dark-surface/60 border border-gray-700 text-gray-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-gray-500 custom-scrollbar"
                          >
                            <option value="All">All Extensions</option>
                            {Object.entries(availableExtensions)
                              .sort((a, b) => b[1] - a[1])
                              .map(([ext, count]) => (
                                <option key={ext} value={ext}>
                                  {ext} ({count})
                                </option>
                              ))}
                          </select>
                        </div>

                        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold block mb-2 pt-2 border-t border-gray-800/50">Sort Options</span>
                      </div>

                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => setSortByExtension(!sortByExtension)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                            sortByExtension
                              ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                              : 'bg-dark-surface/40 border-gray-700 text-gray-400 hover:border-gray-600'
                          }`}
                        >
                          <Type size={14} />
                          <span>Group by Ext</span>
                        </button>
                      </div>

                      {sortByExtension && (
                        <div className="flex flex-col gap-2 pt-2 border-t border-gray-800/50">
                          <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Sort Order</span>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              onClick={() => setSortOrder('asc')}
                              className={`flex items-center justify-center py-1.5 rounded-lg border text-xs font-medium transition-all ${
                                sortOrder === 'asc'
                                  ? 'bg-green-500/20 border-green-500/50 text-green-300'
                                  : 'bg-dark-surface/40 border-gray-700 text-gray-400 hover:border-gray-600'
                              }`}
                            >
                              ↑ Asc
                            </button>
                            <button
                              onClick={() => setSortOrder('desc')}
                              className={`flex items-center justify-center py-1.5 rounded-lg border text-xs font-medium transition-all ${
                                sortOrder === 'desc'
                                  ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                                  : 'bg-dark-surface/40 border-gray-700 text-gray-400 hover:border-gray-600'
                              }`}
                            >
                              ↓ Desc
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="pt-2 border-t border-gray-800/50 flex flex-col gap-1">
                        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Total Results</span>
                        <div className="bg-dark-surface/60 px-3 py-1.5 rounded-lg text-xs font-mono text-gray-300 text-center">
                          {sortedResults.length}
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={listContainerRef} className="flex-1 min-h-0 overflow-hidden flex flex-col min-w-0 relative">
                    {sortedResults.length > 0 ? (
                      <List
                        className="custom-scrollbar w-full"
                        style={{ height: listHeight }}
                        rowCount={sortedResults.length}
                        rowHeight={rowHeight}
                        rowComponent={FileRow as any}
                        rowProps={{
                          items: sortedResults,
                          onFileClick: handleFileClick,
                          currentTheme,
                          query,
                          highlightMatches: settings.highlightMatches,
                          showFileExtensions: settings.showFileExtensions,
                          onFileDoubleClick: handleFileLaunch,
                          onContextMenu: handleContextMenu,
                          zoom,
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center flex-1 text-gray-500 py-8">
                        <Terminal size={32} className="mb-2 opacity-50" />
                        <p className="text-sm px-2">No results found for "{query}"</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="fixed bottom-4 right-4 flex gap-2 z-40 pointer-events-auto">
          <button
            onClick={onOpenSettingsModal}
            className="p-2 text-gray-500 hover:text-white transition-colors hover:bg-dark-surface/70 rounded-lg"
            title="Settings (Ctrl+,)"
          >
            <Wrench size={18} />
          </button>
          <button
            onClick={() => setShowInfo(true)}
            className="p-2 text-gray-500 hover:text-white transition-colors hover:bg-dark-surface/70 rounded-lg"
            title="Info"
          >
            <Info size={18} />
          </button>
        </div>

        {/* Update Button */}
        <AnimatePresence>
          {updateAvailable && updateAvailable.version !== appVersion && (
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30"
            >
              <button
                onClick={async () => {
                  await updateAvailable.downloadAndInstall();
                }}
                className={`flex items-center gap-2 bg-gray-200 text-dark-bg font-bold px-4 sm:px-6 py-2.5 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all text-xs sm:text-sm uppercase tracking-wider ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
              >
                <Download size={18} />
                <span className="hidden sm:inline">Update to {updateAvailable.version}</span>
                <span className="sm:hidden">Update</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Release Notes Modal */}
        <AnimatePresence>
          {showNotes && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4"
              onClick={() => setShowNotes(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={`bg-dark-surface border border-gray-800 p-6 sm:p-8 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Sparkles className="text-gray-400 flex-shrink-0" size={24} />
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight truncate">Latest Release Changes</h2>
                  </div>
                  <button onClick={() => setShowNotes(false)} className="text-gray-500 hover:text-white transition-colors flex-shrink-0">
                    <X size={20} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap font-sans">
                  {releaseNotes}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>



        {/* Info Modal */}
        <AnimatePresence>
          {showInfo && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
              onClick={() => setShowInfo(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={`bg-dark-surface border border-gray-800 p-6 sm:p-10 rounded-3xl shadow-2xl max-w-xl w-full flex flex-col sm:flex-row items-center gap-6 sm:gap-0 ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex-1 text-center sm:border-r border-gray-800/50 sm:pr-10">
                  <h2
                    data-text="coolSearch"
                    onMouseMove={handleTitleMouseMove}
                    className="chrome-title text-3xl sm:text-4xl font-bold tracking-tighter select-none cursor-default"
                  >
                    coolSearch
                  </h2>
                </div>
                <div className="flex-1 sm:pl-10 flex flex-col gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 block mb-0.5 text-[11px] uppercase tracking-widest">Credits</span>
                    <span className="text-gray-200 font-medium text-base">straculencuandrei</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block mb-0.5 text-[11px] uppercase tracking-widest">Version</span>
                    <span className="text-gray-200 font-medium text-base">{appVersion}</span>
                  </div>
                  <button
                    onClick={() => {
                      invoke("open_url", { url: "https://github.com/straculencuandrei/coolSearch" });
                    }}
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mt-2 font-medium bg-transparent border-none p-0 justify-center sm:justify-start"
                  >
                    <ExternalLink size={18} />
                    GitHub Repository
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modern Context Menu */}
        {contextMenu && (
          <div
            data-custom-context-menu="true"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="fixed z-[200] bg-[#1e1e24] border border-gray-700/80 shadow-2xl py-1.5 rounded-xl text-xs text-gray-200 min-w-[180px] font-sans backdrop-blur-md select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              onClick={() => {
                handleFileLaunch(contextMenu.file);
                setContextMenu(null);
              }}
              className="px-3 py-1.5 hover:bg-blue-600 hover:text-white cursor-pointer flex items-center gap-2.5 transition-colors"
            >
              <ExternalLink size={14} />
              <span>Open</span>
            </div>
            <div
              onClick={() => {
                handleFileClick(contextMenu.file);
                setContextMenu(null);
              }}
              className="px-3 py-1.5 hover:bg-blue-600 hover:text-white cursor-pointer flex items-center gap-2.5 transition-colors"
            >
              <Info size={14} />
              <span>Preview & Details</span>
            </div>
            <div
              onClick={() => {
                invoke("open_folder", { path: contextMenu.file.path });
                setContextMenu(null);
              }}
              className="px-3 py-1.5 hover:bg-blue-600 hover:text-white cursor-pointer flex items-center gap-2.5 transition-colors"
            >
              <FolderOpen size={14} />
              <span>Open in Explorer</span>
            </div>
            <div className="border-t border-gray-700/60 my-1" />
            <div
              onClick={() => {
                navigator.clipboard.writeText(contextMenu.file.path);
                setContextMenu(null);
              }}
              className="px-3 py-1.5 hover:bg-blue-600 hover:text-white cursor-pointer flex items-center gap-2.5 transition-colors"
            >
              <Copy size={14} />
              <span>Copy Full Path</span>
            </div>
            <div
              onClick={() => {
                navigator.clipboard.writeText(contextMenu.file.name);
                setContextMenu(null);
              }}
              className="px-3 py-1.5 hover:bg-blue-600 hover:text-white cursor-pointer flex items-center gap-2.5 transition-colors"
            >
              <Copy size={14} />
              <span>Copy File Name</span>
            </div>
            <div className="border-t border-gray-700/60 my-1" />
            <div
              onClick={() => {
                invoke("show_file_properties", { path: contextMenu.file.path }).catch(console.error);
                setContextMenu(null);
              }}
              className="px-3 py-1.5 hover:bg-blue-600 hover:text-white cursor-pointer flex items-center gap-2.5 transition-colors"
            >
              <Wrench size={14} />
              <span>Properties</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
