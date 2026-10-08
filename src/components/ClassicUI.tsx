import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { List } from "react-window";
import {
  Folder,
  File as FileIcon,
  HardDrive,
  Settings,
  RefreshCw,
  Copy,
  FolderOpen,
  Check,
  Clock,
  Laptop
} from "lucide-react";
import { FileRecord, FileDetails, UIMode, AppSettings } from "../types";
import iconNeco from "../icon-neco.png";

interface ClassicUIProps {
  settings: AppSettings;
  onSwitchUI: (target: UIMode) => void;
  onOpenSettingsModal: () => void;
  availableDrives: string[];
}

interface ColumnWidths {
  name: number;
  path: number;
  type: number;
}

const DEFAULT_WIDTHS: ColumnWidths = {
  name: 300,
  path: 520,
  type: 110,
};

const getFileExtension = (name: string, is_dir: boolean): string => {
  if (is_dir) return '[Folder]';
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '[File]';
  return name.slice(dot + 1).toUpperCase();
};

interface ClassicRowProps {
  index: number;
  style: React.CSSProperties;
  items: FileRecord[];
  selectedIndex: number;
  columnWidths: ColumnWidths;
  onSelect: (index: number) => void;
  onOpen: (file: FileRecord) => void;
  onContextMenu: (e: React.MouseEvent, index: number, file: FileRecord) => void;
  query: string;
  highlightMatches: boolean;
  showFileExtensions: boolean;
  zoom: number;
}

// Memoized Row component outside ClassicUI to prevent remounting rows on resize
const ClassicRow = React.memo<ClassicRowProps>(({
  index,
  style,
  items,
  selectedIndex,
  columnWidths,
  onSelect,
  onOpen,
  onContextMenu,
  query,
  highlightMatches,
  showFileExtensions,
  zoom,
}) => {
  const file = items[index];
  if (!file) return null;
  const isSelected = index === selectedIndex;
  const ext = getFileExtension(file.name, file.is_dir);
  const totalWidth = columnWidths.name + columnWidths.path + (showFileExtensions ? columnWidths.type : 0);
  const iconSize = Math.max(12, Math.round(14 * Math.min(zoom, 1.4)));
  const nameFontSize = Math.round(12 * zoom);
  const subFontSize = Math.round(11 * zoom);

  const renderName = () => {
    if (!highlightMatches || !query.trim()) return file.name;
    const q = query.trim().toLowerCase();
    const idx = file.name.toLowerCase().indexOf(q);
    if (idx === -1) return file.name;
    return (
      <>
        {file.name.slice(0, idx)}
        <span className="text-blue-400 font-bold bg-blue-500/25 px-0.5 rounded">
          {file.name.slice(idx, idx + q.length)}
        </span>
        {file.name.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div
      style={{
        ...style,
        width: totalWidth,
        minWidth: '100%',
        fontSize: `${nameFontSize}px`,
      }}
      onClick={() => onSelect(index)}
      onDoubleClick={() => onOpen(file)}
      onContextMenu={(e) => onContextMenu(e, index, file)}
      className={`flex items-center px-2 border-b border-[#29292d] cursor-default select-none ${
        isSelected
          ? 'bg-[#0078d7] text-white'
          : 'text-gray-200 hover:bg-[#25252b]'
      }`}
    >
      {/* Name Column */}
      <div
        style={{ width: columnWidths.name }}
        className="flex items-center gap-2 truncate pr-3 flex-shrink-0"
      >
        {file.is_dir ? (
          <Folder size={iconSize} className={isSelected ? 'text-white' : 'text-amber-400 flex-shrink-0'} />
        ) : (
          <FileIcon size={iconSize} className={isSelected ? 'text-white' : 'text-gray-400 flex-shrink-0'} />
        )}
        <span className="truncate">{renderName()}</span>
      </div>

      {/* Path Column */}
      <div
        style={{ width: columnWidths.path, fontSize: `${subFontSize}px` }}
        className={`truncate px-2 font-mono flex-shrink-0 ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}
      >
        {file.path}
      </div>

      {/* Type Column */}
      {showFileExtensions && (
        <div
          style={{ width: columnWidths.type, fontSize: `${subFontSize}px` }}
          className={`truncate px-2 text-right font-mono flex-shrink-0 ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}
        >
          {ext}
        </div>
      )}
    </div>
  );
});

ClassicRow.displayName = 'ClassicRow';

export const ClassicUI: React.FC<ClassicUIProps> = ({
  settings,
  onSwitchUI,
  onOpenSettingsModal,
  availableDrives,
}) => {
  const appWindow = getCurrentWindow();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileRecord[]>([]);
  const [status, setStatus] = useState("Initializing...");
  const [selectedDrive, setSelectedDrive] = useState<string>("All");
  const [exactMatch, setExactMatch] = useState<boolean>(false);
  const [foldersOnly, setFoldersOnly] = useState<boolean>(false);
  const [filesOnly, setFilesOnly] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [sortColumn, setSortColumn] = useState<'name' | 'path' | 'type'>('name');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [showProperties, setShowProperties] = useState<boolean>(false);
  const [selectedDetails, setSelectedDetails] = useState<FileDetails | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileRecord } | null>(null);
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  // Menu dropdown state
  const [activeMenu, setActiveMenu] = useState<'file' | 'edit' | null>(null);

  // Recent files state & drawer
  const [recentFiles, setRecentFiles] = useState<FileRecord[]>([]);
  const [showRecentDrawer, setShowRecentDrawer] = useState<boolean>(false);

  // Column widths with persistence
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(() => {
    try {
      const saved = localStorage.getItem("coolsearch_classic_col_widths");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_WIDTHS;
  });

  const [activeResizingColumn, setActiveResizingColumn] = useState<'name' | 'path' | 'type' | null>(null);
  const isResizingRef = useRef<{
    column: 'name' | 'path' | 'type';
    startX: number;
    startWidth: number;
  } | null>(null);
  const didDragRef = useRef<boolean>(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleCloseMenu = () => setActiveMenu(null);
    if (activeMenu) {
      window.addEventListener('click', handleCloseMenu);
      return () => window.removeEventListener('click', handleCloseMenu);
    }
  }, [activeMenu]);

  // Load recent files on mount
  useEffect(() => {
    invoke<FileRecord[]>("load_recent_files")
      .then((res) => {
        if (res && Array.isArray(res)) {
          setRecentFiles(res);
        }
      })
      .catch(() => {});
  }, []);

  // Format path according to user settings
  const formatPath = useCallback((p: string) => {
    if (settings.copyPathFormat === 'quoted') return `"${p}"`;
    if (settings.copyPathFormat === 'unix') return p.replace(/\\/g, '/');
    return p;
  }, [settings.copyPathFormat]);

  // Start resizing a column
  const handleStartResize = (column: 'name' | 'path' | 'type', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = columnWidths[column];
    isResizingRef.current = { column, startX, startWidth };
    didDragRef.current = false;
    setActiveResizingColumn(column);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const { column: col, startX: sX, startWidth: sW } = isResizingRef.current;
      const delta = moveEvent.clientX - sX;

      if (Math.abs(delta) > 2) {
        didDragRef.current = true;
      }

      let minWidth = 80;
      if (col === 'type') minWidth = 50;
      if (col === 'path') minWidth = 100;

      const newWidth = Math.max(minWidth, sW + delta);

      setColumnWidths(prev => {
        if (prev[col] === newWidth) return prev;
        return {
          ...prev,
          [col]: newWidth,
        };
      });
    };

    const handleMouseUp = () => {
      isResizingRef.current = null;
      setActiveResizingColumn(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      setColumnWidths(latest => {
        try {
          localStorage.setItem("coolsearch_classic_col_widths", JSON.stringify(latest));
        } catch (err) {}
        return latest;
      });

      setTimeout(() => {
        didDragRef.current = false;
      }, 60);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Double click reset width
  const handleResetWidth = (column: 'name' | 'path' | 'type', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setColumnWidths(prev => {
      const updated = { ...prev, [column]: DEFAULT_WIDTHS[column] };
      try {
        localStorage.setItem("coolsearch_classic_col_widths", JSON.stringify(updated));
      } catch (err) {}
      return updated;
    });
  };

  // Column header click for sorting
  const handleHeaderClick = (col: 'name' | 'path' | 'type') => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    if (sortColumn === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortColumn(col);
      setSortAsc(true);
    }
  };

  // Status polling
  useEffect(() => {
    let interval: any = null;
    const fetchStatus = async () => {
      try {
        const s = await invoke<string>("get_index_status");
        setStatus(s);
      } catch (e) {
        console.error(e);
      }
    };

    fetchStatus();
    interval = setInterval(fetchStatus, 1500);
    return () => clearInterval(interval);
  }, []);

  // Search logic
  useEffect(() => {
    let active = true;
    const doSearch = async () => {
      try {
        const limit = settings.maxResults || 500;
        if (!query.trim()) {
          const res = await invoke<FileRecord[]>("search_files", { query: "", limit: Math.min(limit, 200) });
          if (active) setResults(res || []);
          return;
        }

        const res = await invoke<FileRecord[]>("search_files", { query: query.trim(), limit });
        if (active) {
          setResults(res || []);
          setSelectedIndex(-1);
        }
      } catch (e) {
        console.error("Search error:", e);
      }
    };

    const debounceTime = settings.debounceMs ?? 25;
    const debounce = setTimeout(doSearch, debounceTime);
    return () => {
      active = false;
      clearTimeout(debounce);
    };
  }, [query, settings.maxResults, settings.debounceMs]);

  // Filtering & sorting results
  const filteredResults = useMemo(() => {
    let res = results;

    if (selectedDrive !== "All") {
      const drivePrefix = selectedDrive.toLowerCase();
      res = res.filter(f => f.path.toLowerCase().startsWith(drivePrefix));
    }

    if (foldersOnly) {
      res = res.filter(f => f.is_dir);
    } else if (filesOnly) {
      res = res.filter(f => !f.is_dir);
    }

    if (!settings.searchInPath && query.trim()) {
      const q = query.trim().toLowerCase();
      res = res.filter(f => f.name.toLowerCase().includes(q));
    }

    if (exactMatch && query.trim()) {
      const q = query.trim().toLowerCase();
      res = res.filter(f => f.name.toLowerCase() === q);
    }

    // Filter excluded paths
    if (settings.excludedPaths && settings.excludedPaths.length > 0) {
      res = res.filter(f => {
        const lowerPath = f.path.toLowerCase();
        return !settings.excludedPaths.some(p => lowerPath.includes(p.toLowerCase()));
      });
    }

    return [...res].sort((a, b) => {
      let valA = '';
      let valB = '';

      if (sortColumn === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortColumn === 'path') {
        valA = a.path.toLowerCase();
        valB = b.path.toLowerCase();
      } else if (sortColumn === 'type') {
        valA = getFileExtension(a.name, a.is_dir);
        valB = getFileExtension(b.name, b.is_dir);
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [results, selectedDrive, foldersOnly, filesOnly, exactMatch, query, sortColumn, sortAsc, settings.excludedPaths]);

  // Actions
  const handleOpenFile = useCallback(async (file: FileRecord) => {
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

      // Add to recent files and persist
      setRecentFiles((prev) => {
        const updated = [file, ...prev.filter((f) => f.path !== file.path)].slice(0, 30);
        invoke("save_recent_files", { files: updated }).catch(console.error);
        return updated;
      });

      if (settings.closeOnLaunch) {
        appWindow.minimize().catch(() => {});
      }
    } catch (e) {
      console.error("Failed to open:", e);
    }
  }, [settings.primaryAction, settings.closeOnLaunch, appWindow]);

  const handleCopyPath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(formatPath(path));
      setCopiedNotification("Path copied");
    } catch (e) {
      setCopiedNotification("Failed to copy");
    }
    setTimeout(() => setCopiedNotification(null), 1500);
  }, [formatPath]);

  const handleCopyName = useCallback(async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      setCopiedNotification("Name copied");
    } catch (e) {
      setCopiedNotification("Failed to copy");
    }
    setTimeout(() => setCopiedNotification(null), 1500);
  }, []);

  const handleViewProperties = useCallback(async (file: FileRecord) => {
    try {
      const details = await invoke<FileDetails>("get_file_details", { path: file.path });
      setSelectedDetails(details);
      setShowProperties(true);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleSelectFile = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const handleContextMenuOpen = useCallback((e: React.MouseEvent, index: number, file: FileRecord) => {
    e.preventDefault();
    setSelectedIndex(index);
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  }, []);

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        if (document.activeElement === searchInputRef.current) {
          e.preventDefault();
          if (filteredResults.length > 0) {
            setSelectedIndex(0);
          }
        } else {
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, filteredResults.length - 1));
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        if (selectedIndex >= 0 && filteredResults[selectedIndex]) {
          e.preventDefault();
          if (e.ctrlKey) {
            invoke("open_folder", { path: filteredResults[selectedIndex].path });
          } else {
            handleOpenFile(filteredResults[selectedIndex]);
          }
        }
      } else if (e.key === 'Escape') {
        setQuery("");
        setContextMenu(null);
        setShowProperties(false);
        setActiveMenu(null);
        setShowRecentDrawer(false);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        onSwitchUI('modern');
      } else if (e.ctrlKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setShowRecentDrawer(prev => !prev);
      } else if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        onOpenSettingsModal();
      } else if (e.altKey && e.key === 'Enter') {
        if (selectedIndex >= 0 && filteredResults[selectedIndex]) {
          e.preventDefault();
          handleViewProperties(filteredResults[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, filteredResults, handleOpenFile, onSwitchUI, onOpenSettingsModal, handleViewProperties]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const zoom = settings.zoomLevel || 1.0;

  const scaledColumnWidths = useMemo(() => ({
    name: Math.round(columnWidths.name * zoom),
    path: Math.round(columnWidths.path * zoom),
    type: Math.round(columnWidths.type * zoom),
  }), [columnWidths, zoom]);

  const totalColumnsWidth = scaledColumnWidths.name + scaledColumnWidths.path + (settings.showFileExtensions ? scaledColumnWidths.type : 0);

  // Row & Header height scaled with zoom
  const baseRowHeight = settings.rowDensity === 'compact' ? 20 : settings.rowDensity === 'spacious' ? 30 : 24;
  const rowHeight = Math.round(baseRowHeight * zoom);
  const headerHeight = Math.max(22, Math.round(24 * Math.min(zoom, 1.35)));
  const headerFontSize = Math.round(11 * zoom);

  return (
    <div className="h-screen w-screen bg-[#18181b] text-[#e0e0e0] flex flex-col select-none overflow-hidden border border-[#2d2d33]">
      {/* Title Bar */}
      <div 
        data-tauri-drag-region 
        className="h-7 bg-[#1f1f23] border-b border-[#2d2d33] flex items-center justify-between px-2 text-xs flex-shrink-0 select-none relative z-[130]"
      >
        <div data-tauri-drag-region className="flex items-center gap-1.5 text-gray-300 font-medium">
          <img src={iconNeco} alt="Logo" className="w-3.5 h-3.5 pointer-events-none" />
          <span>coolSearch — Slim</span>
          {availableDrives.length > 0 && (
            <span className="text-[10px] text-gray-400 font-ubuntu-mono">[{availableDrives.join(", ")}]</span>
          )}
        </div>

        {/* Window controls */}
        <div className="flex items-center">
          <button 
            onClick={() => appWindow.minimize()}
            className="w-8 h-6 flex items-center justify-center hover:bg-[#333] text-gray-400 hover:text-white transition-colors"
            title="Minimize"
          >
            ─
          </button>
          <button 
            onClick={() => appWindow.toggleMaximize()}
            className="w-8 h-6 flex items-center justify-center hover:bg-[#333] text-gray-400 hover:text-white transition-colors"
            title="Maximize"
          >
            □
          </button>
          <button 
            onClick={() => appWindow.close()}
            className="w-8 h-6 flex items-center justify-center hover:bg-[#c42b1c] text-gray-400 hover:text-white transition-colors"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Menu Bar with Working Dropdown Menus */}
      <div className="h-6 bg-[#232328] border-b border-[#2d2d33] flex items-center px-2 text-xs text-gray-300 gap-1 flex-shrink-0 font-ubuntu relative">
        {/* File Menu */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveMenu(activeMenu === 'file' ? null : 'file');
            }}
            className={`px-2 py-0.5 rounded transition-colors ${
              activeMenu === 'file' ? 'bg-[#383842] text-white' : 'hover:bg-[#333] hover:text-white text-gray-300'
            }`}
          >
            File
          </button>

          {activeMenu === 'file' && (
            <div 
              className="absolute left-0 top-full mt-0.5 z-50 bg-[#25252b] border border-[#3b3b44] shadow-2xl py-1 rounded-md text-xs text-gray-200 min-w-[200px] font-ubuntu flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                disabled={selectedIndex < 0 || !filteredResults[selectedIndex]}
                onClick={() => {
                  if (selectedIndex >= 0 && filteredResults[selectedIndex]) {
                    handleOpenFile(filteredResults[selectedIndex]);
                  }
                  setActiveMenu(null);
                }}
                className="px-3 py-1.5 hover:bg-[#0078d7] hover:text-white flex items-center justify-between text-left disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
              >
                <span>Open</span>
                <span className="text-[10px] text-gray-400 font-mono">Enter</span>
              </button>
              <button
                disabled={selectedIndex < 0 || !filteredResults[selectedIndex]}
                onClick={() => {
                  if (selectedIndex >= 0 && filteredResults[selectedIndex]) {
                    invoke("open_folder", { path: filteredResults[selectedIndex].path });
                  }
                  setActiveMenu(null);
                }}
                className="px-3 py-1.5 hover:bg-[#0078d7] hover:text-white flex items-center justify-between text-left disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
              >
                <span>Open in Explorer</span>
                <span className="text-[10px] text-gray-400 font-mono">Ctrl+Enter</span>
              </button>
              <div className="border-t border-[#3b3b44] my-1" />
              <button
                disabled={selectedIndex < 0 || !filteredResults[selectedIndex]}
                onClick={() => {
                  if (selectedIndex >= 0 && filteredResults[selectedIndex]) {
                    handleCopyPath(filteredResults[selectedIndex].path);
                  }
                  setActiveMenu(null);
                }}
                className="px-3 py-1.5 hover:bg-[#0078d7] hover:text-white flex items-center justify-between text-left disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
              >
                <span>Copy Full Path</span>
                <span className="text-[10px] text-gray-400 font-mono">Ctrl+C</span>
              </button>
              <button
                disabled={selectedIndex < 0 || !filteredResults[selectedIndex]}
                onClick={() => {
                  if (selectedIndex >= 0 && filteredResults[selectedIndex]) {
                    handleCopyName(filteredResults[selectedIndex].name);
                  }
                  setActiveMenu(null);
                }}
                className="px-3 py-1.5 hover:bg-[#0078d7] hover:text-white flex items-center justify-between text-left disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
              >
                <span>Copy File Name</span>
                <span className="text-[10px] text-gray-400 font-mono">Ctrl+Shift+C</span>
              </button>
              <div className="border-t border-[#3b3b44] my-1" />
              <button
                disabled={selectedIndex < 0 || !filteredResults[selectedIndex]}
                onClick={() => {
                  if (selectedIndex >= 0 && filteredResults[selectedIndex]) {
                    handleViewProperties(filteredResults[selectedIndex]);
                  }
                  setActiveMenu(null);
                }}
                className="px-3 py-1.5 hover:bg-[#0078d7] hover:text-white flex items-center justify-between text-left disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-400"
              >
                <span>Properties</span>
                <span className="text-[10px] text-gray-400 font-mono">Alt+Enter</span>
              </button>
              <div className="border-t border-[#3b3b44] my-1" />
              <button
                onClick={() => {
                  setActiveMenu(null);
                  appWindow.close();
                }}
                className="px-3 py-1.5 hover:bg-[#c42b1c] hover:text-white flex items-center justify-between text-left"
              >
                <span>Exit</span>
                <span className="text-[10px] text-gray-400 font-mono">Alt+F4</span>
              </button>
            </div>
          )}
        </div>

        {/* Edit Menu */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveMenu(activeMenu === 'edit' ? null : 'edit');
            }}
            className={`px-2 py-0.5 rounded transition-colors ${
              activeMenu === 'edit' ? 'bg-[#383842] text-white' : 'hover:bg-[#333] hover:text-white text-gray-300'
            }`}
          >
            Edit
          </button>

          {activeMenu === 'edit' && (
            <div 
              className="absolute left-0 top-full mt-0.5 z-50 bg-[#25252b] border border-[#3b3b44] shadow-2xl py-1 rounded-md text-xs text-gray-200 min-w-[180px] font-ubuntu flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  if (filteredResults.length > 0) setSelectedIndex(0);
                  setActiveMenu(null);
                }}
                className="px-3 py-1.5 hover:bg-[#0078d7] hover:text-white flex items-center justify-between text-left"
              >
                <span>Select First</span>
                <span className="text-[10px] text-gray-400 font-mono">Home</span>
              </button>
              <button
                onClick={() => {
                  setQuery("");
                  setActiveMenu(null);
                }}
                className="px-3 py-1.5 hover:bg-[#0078d7] hover:text-white flex items-center justify-between text-left"
              >
                <span>Clear Query</span>
                <span className="text-[10px] text-gray-400 font-mono">Esc</span>
              </button>
              <div className="border-t border-[#3b3b44] my-1" />
              <button
                disabled={selectedIndex < 0 || !filteredResults[selectedIndex]}
                onClick={() => {
                  if (selectedIndex >= 0 && filteredResults[selectedIndex]) {
                    handleCopyPath(filteredResults[selectedIndex].path);
                  }
                  setActiveMenu(null);
                }}
                className="px-3 py-1.5 hover:bg-[#0078d7] hover:text-white flex items-center justify-between text-left disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span>Copy Path</span>
                <span className="text-[10px] text-gray-400 font-mono">Ctrl+C</span>
              </button>
            </div>
          )}
        </div>

        {/* Recent Files Button */}
        <button
          onClick={() => setShowRecentDrawer(prev => !prev)}
          className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1.5 ${
            showRecentDrawer 
              ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40' 
              : 'hover:bg-[#333] hover:text-white text-gray-300'
          }`}
          title="Toggle Recent Files Drawer (Ctrl+H)"
        >
          <Clock size={12} className={showRecentDrawer ? "text-blue-300" : "text-gray-400"} />
          <span>Recent Files {recentFiles.length > 0 && `(${recentFiles.length})`}</span>
        </button>

        {/* Re-Index Action */}
        <button
          onClick={() => invoke("refresh_index")}
          className="px-2 py-0.5 rounded hover:bg-[#333] hover:text-white transition-colors flex items-center gap-1 text-gray-300"
          title="Rescan NTFS Master File Table"
        >
          <RefreshCw size={11} />
          <span>Re-Index</span>
        </button>

        {/* Settings Action */}
        <button
          onClick={onOpenSettingsModal}
          className="px-2 py-0.5 rounded hover:bg-[#333] hover:text-white transition-colors flex items-center gap-1 text-gray-300"
          title="Settings (Ctrl+,)"
        >
          <Settings size={11} />
          <span>Settings</span>
        </button>
      </div>

      {/* Search Input & Quick Filters Bar */}
      <div className="p-2 bg-[#1d1d21] border-b border-[#2d2d33] flex flex-col gap-1.5 flex-shrink-0 font-ubuntu">
        <div className="flex items-center gap-2">
          {/* Drive selector */}
          <div className="flex items-center bg-[#25252b] border border-[#3b3b44] rounded px-2 py-0.5 text-xs text-gray-300">
            <HardDrive size={12} className="mr-1 text-gray-400" />
            <select
              value={selectedDrive}
              onChange={(e) => setSelectedDrive(e.target.value)}
              className="bg-transparent border-none text-xs text-gray-200 focus:outline-none font-ubuntu-mono cursor-pointer"
            >
              <option value="All">All Drives</option>
              {availableDrives.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Search box */}
          <div className="flex-1 relative flex items-center">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search filename or path (e.g. *.png, notes, c:\windows)..."
              autoFocus
              style={{
                fontSize: `${Math.round(12 * zoom)}px`,
                paddingTop: `${Math.round(4 * Math.min(zoom, 1.4))}px`,
                paddingBottom: `${Math.round(4 * Math.min(zoom, 1.4))}px`,
              }}
              className="w-full bg-[#161618] border border-[#3b3b44] rounded px-2.5 text-white focus:outline-none focus:border-blue-500"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 text-xs text-gray-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Quick filter checkboxes */}
        <div style={{ fontSize: `${Math.round(11 * zoom)}px` }} className="flex items-center gap-4 text-gray-400 px-0.5">
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-gray-200">
            <input
              type="checkbox"
              checked={exactMatch}
              onChange={(e) => setExactMatch(e.target.checked)}
              className="accent-[#0078d7]"
            />
            <span>Exact Match</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-gray-200">
            <input
              type="checkbox"
              checked={foldersOnly}
              onChange={(e) => {
                setFoldersOnly(e.target.checked);
                if (e.target.checked) setFilesOnly(false);
              }}
              className="accent-[#0078d7]"
            />
            <span>Folders Only</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-gray-200">
            <input
              type="checkbox"
              checked={filesOnly}
              onChange={(e) => {
                setFilesOnly(e.target.checked);
                if (e.target.checked) setFoldersOnly(false);
              }}
              className="accent-[#0078d7]"
            />
            <span>Files Only</span>
          </label>
        </div>
      </div>

      {/* Main Area (Unified Table + Recent Files Drawer) */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Unified Table Container: Header & Virtualized Rows scroll horizontally together */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden bg-[#161618] flex flex-col relative custom-scrollbar">
          <div style={{ width: totalColumnsWidth, minWidth: '100%' }} className="flex flex-col h-full">
            {/* Draggable Table Header */}
            <div 
              style={{
                width: totalColumnsWidth,
                minWidth: '100%',
                height: `${headerHeight}px`,
                fontSize: `${headerFontSize}px`,
              }}
              className="bg-[#232328] border-b border-[#2d2d33] flex items-center px-2 font-semibold text-gray-300 flex-shrink-0 select-none sticky top-0 z-20"
            >
              {/* Name Column Header */}
              <div
                style={{ width: scaledColumnWidths.name }}
                className="relative flex-shrink-0 flex items-center justify-between pr-3 cursor-pointer hover:text-white select-none"
                onClick={() => handleHeaderClick('name')}
              >
                <span className="truncate">Name</span>
                {sortColumn === 'name' && <span className="ml-1 text-[9px]">{sortAsc ? '▲' : '▼'}</span>}
                
                {/* Centered Draggable Resizer Handle */}
                <div
                  onMouseDown={(e) => handleStartResize('name', e)}
                  onDoubleClick={(e) => handleResetWidth('name', e)}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute -right-2.5 top-0 bottom-0 w-5 cursor-col-resize z-30 flex items-center justify-center group/handle select-none"
                  title="Drag left/right to resize Name (Double-click to reset)"
                >
                  <div className={`w-[2px] h-full transition-colors ${
                    activeResizingColumn === 'name' 
                      ? 'bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.8)]' 
                      : 'bg-[#3d3d44] group-hover/handle:bg-blue-400'
                  }`} />
                </div>
              </div>

              {/* Path Column Header */}
              <div
                style={{ width: scaledColumnWidths.path }}
                className="relative flex-shrink-0 flex items-center justify-between px-2 cursor-pointer hover:text-white select-none"
                onClick={() => handleHeaderClick('path')}
              >
                <span className="truncate">Path</span>
                {sortColumn === 'path' && <span className="ml-1 text-[9px]">{sortAsc ? '▲' : '▼'}</span>}
                
                {/* Centered Draggable Resizer Handle */}
                <div
                  onMouseDown={(e) => handleStartResize('path', e)}
                  onDoubleClick={(e) => handleResetWidth('path', e)}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute -right-2.5 top-0 bottom-0 w-5 cursor-col-resize z-30 flex items-center justify-center group/handle select-none"
                  title="Drag left/right to resize Path (Double-click to reset)"
                >
                  <div className={`w-[2px] h-full transition-colors ${
                    activeResizingColumn === 'path' 
                      ? 'bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.8)]' 
                      : 'bg-[#3d3d44] group-hover/handle:bg-blue-400'
                  }`} />
                </div>
              </div>

              {/* Type Column Header */}
              {settings.showFileExtensions && (
                <div
                  style={{ width: scaledColumnWidths.type }}
                  className="relative flex-shrink-0 flex items-center justify-between px-2 cursor-pointer hover:text-white select-none"
                  onClick={() => handleHeaderClick('type')}
                >
                  <span className="truncate">Type</span>
                  {sortColumn === 'type' && <span className="ml-1 text-[9px]">{sortAsc ? '▲' : '▼'}</span>}
                  
                  {/* Centered Draggable Resizer Handle */}
                  <div
                    onMouseDown={(e) => handleStartResize('type', e)}
                    onDoubleClick={(e) => handleResetWidth('type', e)}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute -right-2.5 top-0 bottom-0 w-5 cursor-col-resize z-30 flex items-center justify-center group/handle select-none"
                    title="Drag left/right to resize Type (Double-click to reset)"
                  >
                    <div className={`w-[2px] h-full transition-colors ${
                      activeResizingColumn === 'type' 
                        ? 'bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.8)]' 
                        : 'bg-[#3d3d44] group-hover/handle:bg-blue-400'
                    }`} />
                  </div>
                </div>
              )}
            </div>

            {/* Virtualized Table Body */}
            <div className="flex-1 relative">
              {filteredResults.length > 0 ? (
                <List
                  className="custom-scrollbar w-full h-full"
                  rowCount={filteredResults.length}
                  rowHeight={rowHeight}
                  rowComponent={ClassicRow as any}
                  rowProps={{
                    items: filteredResults,
                    selectedIndex,
                    columnWidths: scaledColumnWidths,
                    onSelect: handleSelectFile,
                    onOpen: handleOpenFile,
                    onContextMenu: handleContextMenuOpen,
                    query,
                    highlightMatches: settings.highlightMatches,
                    showFileExtensions: settings.showFileExtensions,
                    zoom,
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 text-xs font-ubuntu">
                  {query ? `No objects found matching "${query}"` : "Type a query above to start searching (e.g. 'notes', 'd:', 'exe')"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Files Side Drawer */}
        {showRecentDrawer && (
          <div
            className="w-80 bg-[#1a1a1e] border-l border-[#2e2e38] shadow-2xl z-40 flex flex-col font-ubuntu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-8 border-b border-[#2e2e38] px-3 flex items-center justify-between bg-[#202026]">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Clock size={13} className="text-blue-400" />
                <span>Recent Files</span>
                <span className="text-[10px] text-gray-400 font-mono">({recentFiles.length})</span>
              </div>
              <button
                onClick={() => setShowRecentDrawer(false)}
                className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/5"
                title="Close drawer (Esc)"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5 space-y-1">
              {recentFiles.length > 0 ? (
                recentFiles.map((file, idx) => (
                  <div
                    key={`${file.path}-${idx}`}
                    onClick={() => handleOpenFile(file)}
                    className="group flex items-start gap-2 p-1.5 rounded-lg hover:bg-[#25252f] cursor-pointer transition-colors"
                  >
                    {file.is_dir ? (
                      <Folder size={14} className="text-amber-400 shrink-0 mt-0.5" />
                    ) : (
                      <FileIcon size={14} className="text-gray-400 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-200 group-hover:text-white truncate">
                        {file.name}
                      </div>
                      <div className="text-[10px] text-gray-500 font-ubuntu-mono truncate">
                        {file.path}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyPath(file.path);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-white rounded hover:bg-white/10 shrink-0"
                      title="Copy Path"
                    >
                      <Copy size={11} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="h-32 flex flex-col items-center justify-center text-xs text-gray-500 text-center px-4">
                  <Clock size={20} className="mb-2 opacity-40" />
                  <span>No recently opened files yet. Open any file to track it here.</span>
                </div>
              )}
            </div>

            {recentFiles.length > 0 && (
              <div className="p-2 border-t border-[#2e2e38] bg-[#18181c]">
                <button
                  onClick={() => {
                    setRecentFiles([]);
                    invoke("save_recent_files", { files: [] }).catch(console.error);
                  }}
                  className="w-full py-1 text-center text-xs text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                >
                  Clear Recent Files
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="h-6 bg-[#1f1f23] border-t border-[#2d2d33] flex items-center justify-between px-2 text-[11px] text-gray-400 flex-shrink-0 font-ubuntu">
        <div className="flex items-center gap-3">
          <span>{filteredResults.length.toLocaleString()} objects</span>
          <span className="text-gray-600">|</span>
          <span className="truncate max-w-sm">{status}</span>
        </div>

        <div className="flex items-center gap-3">
          {copiedNotification && (
            <span className="text-emerald-400 flex items-center gap-1 font-medium">
              <Check size={12} />
              {copiedNotification}
            </span>
          )}
          <span className="text-gray-500 font-ubuntu-mono text-[10px]">Slim Mode</span>
          {/* SINGLE SWITCH BUTTON TO MODERN UI */}
          <button
            onClick={() => onSwitchUI('modern')}
            className="text-cyan-400 hover:underline flex items-center gap-1 font-medium"
            title="Switch to Modern UI (Ctrl+M)"
          >
            <Laptop size={12} />
            <span>Switch to Modern UI</span>
          </button>
        </div>
      </div>

      {/* Classic Context Menu */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 bg-[#25252b] border border-[#3b3b44] shadow-xl py-1 rounded text-xs text-gray-200 min-w-[160px] font-ubuntu"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            onClick={() => {
              handleOpenFile(contextMenu.file);
              setContextMenu(null);
            }}
            className="px-3 py-1 hover:bg-[#0078d7] hover:text-white cursor-pointer flex items-center gap-2"
          >
            <FolderOpen size={14} />
            <span>Open</span>
          </div>
          <div
            onClick={() => {
              invoke("open_folder", { path: contextMenu.file.path });
              setContextMenu(null);
            }}
            className="px-3 py-1 hover:bg-[#0078d7] hover:text-white cursor-pointer flex items-center gap-2"
          >
            <FolderOpen size={14} />
            <span>Open in Explorer</span>
          </div>
          <div
            onClick={() => {
              handleCopyPath(contextMenu.file.path);
              setContextMenu(null);
            }}
            className="px-3 py-1 hover:bg-[#0078d7] hover:text-white cursor-pointer flex items-center gap-2"
          >
            <Copy size={14} />
            <span>Copy Full Path</span>
          </div>
          <div
            onClick={() => {
              handleCopyName(contextMenu.file.name);
              setContextMenu(null);
            }}
            className="px-3 py-1 hover:bg-[#0078d7] hover:text-white cursor-pointer flex items-center gap-2"
          >
            <Copy size={14} />
            <span>Copy Name</span>
          </div>
          <div className="border-t border-[#3b3b44] my-1" />
          <div
            onClick={() => {
              handleViewProperties(contextMenu.file);
              setContextMenu(null);
            }}
            className="px-3 py-1 hover:bg-[#0078d7] hover:text-white cursor-pointer"
          >
            Properties
          </div>
        </div>
      )}

      {/* Classic Properties Dialog */}
      {showProperties && selectedDetails && selectedIndex >= 0 && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 font-ubuntu">
          <div className="bg-[#242429] border border-[#3d3d46] rounded-xl shadow-2xl p-5 w-96 text-xs text-gray-200 flex flex-col gap-3 glow-modal-outer">
            <div className="flex items-center justify-between border-b border-[#3d3d46] pb-2 font-semibold text-white">
              <span className="truncate max-w-[280px]">Properties: {filteredResults[selectedIndex]?.name}</span>
              <button onClick={() => setShowProperties(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="space-y-2 font-ubuntu-mono text-[11px]">
              <div><span className="text-gray-400 font-ubuntu">Name:</span> {filteredResults[selectedIndex]?.name}</div>
              <div><span className="text-gray-400 font-ubuntu">Path:</span> <div className="break-all text-gray-300 mt-0.5">{filteredResults[selectedIndex]?.path}</div></div>
              <div><span className="text-gray-400 font-ubuntu">Size:</span> {selectedDetails.size.toLocaleString()} bytes</div>
              <div><span className="text-gray-400 font-ubuntu">Created:</span> {selectedDetails.created}</div>
              <div><span className="text-gray-400 font-ubuntu">Type:</span> {filteredResults[selectedIndex]?.is_dir ? "Directory" : "File"}</div>
            </div>
            <div className="flex justify-end pt-2 border-t border-[#3d3d46]">
              <button
                onClick={() => setShowProperties(false)}
                className="px-4 py-1.5 bg-[#33333b] hover:bg-[#44444f] rounded-lg text-white font-medium font-ubuntu"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
