import { useState, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { List } from "react-window";
import { Search, File as FileIcon, Folder, Terminal, Info, ExternalLink, Music, Image as ImageIcon, ArrowLeft, Copy, FolderOpen, Check, Type, Code, Wrench, Sparkles, Download, X, Clock } from "lucide-react";
import { check } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";
import "./App.css";

const CURRENT_VERSION = "0.1.98";

interface FileRecord {
  id: number;
  parent_id: number;
  name: string;
  path: string;
  is_dir: boolean;
}

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileRecord[]>([]);
  const [status, setStatus] = useState("Initializing...");
  const [isFocused, setIsFocused] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  const [details, setDetails] = useState<{ size: number, created: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [currentFont, setCurrentFont] = useState<'sfpro' | 'jetbrains'>('sfpro');
  const [currentTheme, setCurrentTheme] = useState<'matte-dark' | 'light' | 'neon-blue' | 'neon-red' | 'neon-green'>('matte-dark');
  const [updateAvailable, setUpdateAvailable] = useState<any>(null);
  const [releaseNotes, setReleaseNotes] = useState<string>("");
  const [showNotes, setShowNotes] = useState(false);
  const [appVersion, setAppVersion] = useState(CURRENT_VERSION);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [sortByExtension, setSortByExtension] = useState(true);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [fileHistory, setFileHistory] = useState<FileRecord[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);

  const handleTitleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y });
  };

  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (update) {
          console.log("Update available:", update.version);
          setUpdateAvailable(update);
        }
      } catch (e) {
        console.error("Update check failed:", e);
      }
    };
    checkForUpdates();
  }, []);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const version = await getVersion();
        setAppVersion(version);
      } catch (e) {
        console.error("Failed to get version:", e);
      }
    };
    fetchVersion();
  }, []);

  // Load history from backend
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

  const fetchReleaseNotes = async () => {
    // Hardcoded release notes for offline access
    const releaseNotesText = `🎉 coolSearch v0.1.98 - Premium Sidebar & Multi-Drive Scanning

✨ New Features & Redesigns
• Left Sidebar History: Redesigned the file history into a sleek, premium left sidebar resembling modern chat interfaces like ChatGPT, Claude, and Gemini.
• Sidebar Toggle: Added a dedicated toggle button to seamlessly show/hide the sidebar.
• Expanded Tracking: The history now tracks up to 30 of your most recently viewed files across app sessions.
• Multi-Drive MFT Scanning: Eliminated the hardcoded C: drive scanning limitation. coolSearch now automatically detects all logical drives on your system.
• Multi-Threaded Drive Indexing: Each drive's MFT is scanned independently and merged into a single high-performance index.
• Complete Drive Integration: Search results and paths now include the correct drive letters (e.g., C:, D:, E:).
• Robust Drive Access: Drive-specific permission errors are tracked individually, ensuring a single locked drive doesn't block indexing for others.

🎨 UI/UX & Performance Improvements
• Animation Synchronization: Highly optimized expansion and collapse transitions for the sidebar.
• Smooth Layout Reflows: Eliminated visual lag when toggling the sidebar, ensuring the search layout resizes instantly and gracefully.
• Typography & Themes: Refined spacing and typography for SF Pro and JetBrains fonts across all themes.

🔧 Backend & Update System
• Version Sync: Synchronized app version to v0.1.98 across tauri.conf.json, package.json, and the application state.
• Dynamic Version Detection: Automated checking and retrieval of the running app version via core Tauri APIs.

Installation Options:
• Download the portable coolSearch_0.1.98_x64-setup.exe for guided setup.
• Use the coolSearch_0.1.98_x64_en-US.msi installer for full system integration.

Enjoy a faster and more intuitive coolSearch! 🚀`;

    setReleaseNotes(releaseNotesText);
    setShowNotes(true);
  };
  useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    const handleKeydown = (e: KeyboardEvent) => {
      // Disable F12
      if (e.key === "F12") {
        e.preventDefault();
      }
      // Disable Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
      if (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C" || e.key === "i" || e.key === "j" || e.key === "c")) {
        e.preventDefault();
      }
      // Disable Ctrl+U (View Source)
      if (e.ctrlKey && (e.key === "U" || e.key === "u")) {
        e.preventDefault();
      }
    };
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, []);

  useEffect(() => {
    // Poll index status
    const interval = setInterval(async () => {
      const currentStatus = await invoke<string>("get_index_status");
      setStatus(currentStatus);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchResults = async () => {
      if (query.trim() === "") {
        setResults([]);
        return;
      }
      try {
        const res = await invoke<FileRecord[]>("search_files", { query });
        setResults(res);
      } catch (e) {
        console.error(e);
      }
    };

    // Add a small debounce
    const timeout = setTimeout(fetchResults, 100);
    return () => clearTimeout(timeout);
  }, [query]);

  const handleFileClick = async (file: FileRecord) => {
    setSelectedFile(file);
    try {
      const res = await invoke<{ size: number, created: string }>("get_file_details", { path: file.path });
      setDetails(res);
    } catch (e) {
      console.error(e);
      setDetails(null);
    }

    // Add to history
    const updatedHistory = [
      file,
      ...fileHistory.filter(f => f.path !== file.path)
    ].slice(0, 30); // Keep only last 30 items
    setFileHistory(updatedHistory);
    try {
      invoke("save_recent_files", { files: updatedHistory }).catch((err) => {
        console.error("Failed to save history:", err);
      });
    } catch (e) {
      console.error("Failed to save history:", e);
    }
  };

  const copyPath = () => {
    if (selectedFile) {
      navigator.clipboard.writeText(selectedFile.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openExplorer = async () => {
    if (selectedFile) {
      await invoke("open_in_explorer", { path: selectedFile.path });
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getSortedResults = (): FileRecord[] => {
    if (!sortByExtension) {
      return results;
    }

    const grouped: { [key: string]: FileRecord[] } = {};
    
    results.forEach(file => {
      const ext = file.is_dir ? '[FOLDER]' : (file.name.split('.').pop()?.toLowerCase() || '[NO EXT]');
      if (!grouped[ext]) {
        grouped[ext] = [];
      }
      grouped[ext].push(file);
    });

    const sortedExtensions = Object.keys(grouped).sort((a, b) => {
      if (sortOrder === 'asc') {
        return a.localeCompare(b);
      } else {
        return b.localeCompare(a);
      }
    });

    const sorted: FileRecord[] = [];
    sortedExtensions.forEach(ext => {
      sorted.push(...grouped[ext]);
    });

    return sorted;
  };

  // Responsive calculations
  const isMobile = windowWidth < 768;
  const isSmall = windowWidth < 1024;
  const getResponsiveContainerHeight = () => {
    // Reserve space for header (120px), search bar, and some padding
    const headerSpace = selectedFile ? 180 : 150;
    return Math.max(windowHeight - headerSpace, 300);
  };
  const sortedResults = getSortedResults();

  const getResponsiveListHeight = () => {
    const containerHeight = getResponsiveContainerHeight();
    const maxListHeight = Math.max(containerHeight - 40, 200);
    
    if (sortedResults.length > 0) {
      const neededHeight = sortedResults.length * 38;
      // On desktop, we want a minimum height of ~220px so the Sort Options sidebar fits nicely.
      // On mobile, we can let it shrink all the way down.
      const minListHeight = isMobile ? 38 : 220;
      const targetHeight = Math.max(neededHeight, minListHeight);
      return Math.min(targetHeight, maxListHeight);
    }
    return maxListHeight;
  };

  const Row = ({ index, style }: any) => {
    const file = sortedResults[index];
    if (!file) return null;

    const getIconColor = () => {
      if (file.is_dir) return "text-yellow-400 drop-shadow-[0_0_5px_rgba(250,204,21,0.5)]";
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (['mp3', 'wav', 'flac'].includes(ext || '')) {
        return "text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]";
      }
      if (['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext || '')) {
        return "text-green-500 drop-shadow-[0_0_5px_rgba(34,197,94,0.5)]";
      }
      return "text-gray-400";
    };

    const getIcon = () => {
      if (file.is_dir) return <Folder size={16} />;
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (['mp3', 'wav', 'flac'].includes(ext || '')) {
        return <Music size={16} />;
      }
      if (['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext || '')) {
        return <ImageIcon size={16} />;
      }
      return <FileIcon size={16} />;
    };

    return (
      <div
        style={style}
        onClick={() => handleFileClick(file)}
        className="flex items-center px-4 border-b border-gray-800/50 hover:bg-dark-surface/80 transition-colors cursor-pointer group"
      >
        <div className={`mr-3 transition-transform group-hover:scale-110 ${getIconColor()} ${currentTheme.startsWith('neon') ? 'neon-text' : ''}`}>
          {getIcon()}
        </div>
        <div className="flex-1 truncate flex flex-col justify-center py-1.5">
          <div className="text-gray-100 font-medium text-[11.5px] truncate leading-none mb-1">{file.name}</div>
          <div className="text-[9.5px] text-gray-500 truncate leading-none">{file.path}</div>
        </div>
      </div>
    );
  };

  return (
    <div className={`h-screen bg-dark-bg text-gray-100 flex flex-row relative overflow-hidden theme-${currentTheme} ${currentFont === 'sfpro' ? 'font-sfpro' : 'font-jetbrains'}`}>
      {/* Background with subtle matte finish */}
      <div className="absolute inset-0 bg-dark-bg pointer-events-none" />

      {/* Sidebar - File History */}
      <AnimatePresence>
        {showSidebar && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="bg-dark-surface/30 border-r border-gray-800/50 flex flex-col overflow-hidden flex-shrink-0 z-30"
          >
            <div className="w-64 flex flex-col h-full flex-shrink-0">
              {/* Sidebar Header */}
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

              {/* History List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {fileHistory.length > 0 ? (
                  <div className="p-2 space-y-1.5 custom-scrollbar overflow-y-auto">
                    {fileHistory.map((file, index) => (
                      <button
                        key={`${file.path}-${index}`}
                        onClick={() => handleFileClick(file)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border border-gray-800/30 bg-dark-bg/10 hover:bg-dark-surface/40 hover:border-gray-800/80 transition-all duration-200 group flex items-center gap-3 min-w-0 ${currentTheme.startsWith('neon') ? 'hover:neon-border' : ''}`}
                      >
                        <div className={`flex-shrink-0 ${file.is_dir ? "text-yellow-400" :
                          ['mp3', 'wav', 'flac'].includes(file.name.split('.').pop()?.toLowerCase() || '') ? "text-red-500" :
                            ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'].includes(file.name.split('.').pop()?.toLowerCase() || '') ? "text-green-500" :
                              "text-gray-400"
                          } ${currentTheme.startsWith('neon') ? 'neon-text' : ''}`}>
                          {file.is_dir ? <Folder size={16} /> :
                            ['mp3', 'wav', 'flac'].includes(file.name.split('.').pop()?.toLowerCase() || '') ? <Music size={16} /> :
                              ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'].includes(file.name.split('.').pop()?.toLowerCase() || '') ? <ImageIcon size={16} /> :
                                <FileIcon size={16} />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-200 truncate font-medium">{file.name}</div>
                          <div className="text-[10px] text-gray-500 truncate">{file.path}</div>
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

      {/* Toggle Sidebar Button */}
      <AnimatePresence>
        {!showSidebar && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={() => setShowSidebar(true)}
            className="fixed left-4 top-4 sm:left-6 sm:top-6 p-2 text-gray-500 hover:text-white transition-colors hover:bg-dark-surface/50 rounded-lg z-40"
            title="Show file history"
          >
            <Clock size={20} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">

      {/* Header & Status */}
      <div className="flex flex-col items-end p-4 sm:p-6 px-4 sm:px-10 z-10 gap-2 flex-shrink-0">
        <div className={`text-xs font-mono text-gray-400 bg-dark-surface px-4 py-1.5 rounded-full border border-gray-800 flex items-center gap-2 -translate-x-4 ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}>
          {status.includes("Indexing") ? (
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${currentTheme.startsWith('neon') ? 'bg-[var(--theme-accent)]' : 'bg-gray-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${currentTheme.startsWith('neon') ? 'bg-[var(--theme-accent)]' : 'bg-gray-400'}`}></span>
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

      {/* Search Container */}
      <div className="flex flex-col items-center justify-start flex-1 w-full max-w-6xl mx-auto px-3 sm:px-4 z-10 min-h-0 overflow-y-auto pb-16">
        {!selectedFile && (
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{
              opacity: query || isFocused ? 0 : 1,
              y: query || isFocused ? 20 : 40,
              scale: query || isFocused ? 0.95 : 1.2,
              filter: query || isFocused ? 'blur(10px)' : 'blur(0px)'
            }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            onMouseMove={handleTitleMouseMove}
            className="flex items-center gap-3 mb-6 sm:mb-8 relative"
          >
            <Wrench size={isMobile ? 20 : 24} className={`text-gray-400 absolute -left-8 sm:-left-10 ${currentTheme.startsWith('neon') ? 'neon-text' : ''}`} />
            <h1 
              data-text="coolSearch"
              className={`chrome-title font-bold text-xl sm:text-2xl md:text-3xl tracking-[0.1em] uppercase select-none cursor-default ${currentTheme.startsWith('neon') ? 'neon-text' : ''}`}
              style={{ 
                '--mouse-x': `${mousePos.x}%`, 
                '--mouse-y': `${mousePos.y}%` 
              } as any}
            >
              coolSearch
            </h1>
          </motion.div>
        )}
        <AnimatePresence mode="wait">
          {!selectedFile ? (
            <motion.div
              key="search-bar"
              animate={{
                y: query || isFocused ? 0 : 40,
                scale: query || isFocused ? 1 : 1.05
              }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="w-full max-w-2xl relative flex-shrink-0"
            >
              <div className={`
                relative group flex items-center bg-dark-surface/80 backdrop-blur-md rounded-xl matte-border
                ${isFocused ? 'matte-border-focus' : 'border-gray-800'} 
                ${currentTheme.startsWith('neon') ? 'neon-border' : ''}
                transition-all duration-300 overflow-hidden
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
                  placeholder="Search for files or folders..."
                  className="w-full bg-transparent border-none text-sm text-gray-100 placeholder-gray-600 px-3 py-2.5 focus:outline-none focus:ring-0 min-w-0"
                  spellCheck={false}
                  autoFocus
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="pr-6 text-gray-500 hover:text-white transition-colors flex-shrink-0"
                  >
                    Clear
                  </button>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="back-header"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full max-w-2xl relative z-10 flex-shrink-0 flex items-center justify-center"
            >
              <button
                onClick={() => setSelectedFile(null)}
                className={`flex items-center gap-2 text-gray-400 hover:text-white transition-all bg-dark-surface/50 hover:bg-dark-surface px-5 py-2.5 rounded-xl border border-gray-800 hover:border-white/20 group shadow-lg ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
              >
                <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform flex-shrink-0" />
                <span className="text-sm font-medium">Back to results</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results / Details Container */}
        <AnimatePresence mode="wait">
          {selectedFile ? (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={`w-full mt-3 max-w-4xl mx-auto bg-dark-surface/50 backdrop-blur-xl border border-gray-800 rounded-2xl p-4 sm:p-5 md:p-8 shadow-2xl flex flex-col md:flex-row gap-4 md:gap-0 flex-1 mb-6 overflow-hidden ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
            >
              <div className="flex-[0.8] flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-gray-800/50 pb-4 md:pb-0 md:pr-8">
                <div className={`mb-4 md:mb-6 p-4 md:p-6 rounded-3xl bg-dark-bg/50 border border-gray-800/50 flex-shrink-0 ${selectedFile.is_dir ? "text-yellow-400" :
                  ['mp3', 'wav', 'flac'].includes(selectedFile.name.split('.').pop()?.toLowerCase() || '') ? "text-red-500" :
                    ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'].includes(selectedFile.name.split('.').pop()?.toLowerCase() || '') ? "text-green-500 p-0 overflow-hidden" :
                      "text-gray-400"
                  } ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}>
                  {selectedFile.is_dir ? <Folder size={isMobile ? 48 : 64} /> :
                    ['mp3', 'wav', 'flac'].includes(selectedFile.name.split('.').pop()?.toLowerCase() || '') ? <Music size={isMobile ? 48 : 64} /> :
                      ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'].includes(selectedFile.name.split('.').pop()?.toLowerCase() || '') ? (
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
                  <p className="text-xs md:text-sm text-gray-300 break-all font-mono bg-dark-bg/30 p-2 md:p-3 rounded-lg border border-gray-800/30">
                    {selectedFile.path}
                  </p>
                  <div className="flex gap-2 mt-2 flex-wrap">
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
                      Open
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className={`w-full mt-4 bg-dark-surface/50 backdrop-blur-xl border border-gray-800 rounded-2xl overflow-hidden flex-initial h-fit mb-6 shadow-2xl flex flex-col sm:flex-row ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
            >
              {/* Sort Sidebar - Hidden on mobile, collapsed on small screens */}
              {!isMobile && (
                <div className={`${isSmall ? 'w-36' : 'w-48'} bg-dark-bg/40 border-r border-gray-800/50 flex flex-col p-3 sm:p-4 gap-4 flex-shrink-0 overflow-y-auto`}>
                  <div>
                    <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold block mb-3">Sort Options</span>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => setSortByExtension(!sortByExtension)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                        sortByExtension
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                          : 'bg-dark-surface/30 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <Type size={14} />
                      <span className="hidden md:inline">Group by Extension</span>
                      <span className="md:hidden">Group by Ext</span>
                    </button>
                  </div>

                  {sortByExtension && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-gray-800/50">
                      <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Sort Order</span>
                      <button
                        onClick={() => setSortOrder('asc')}
                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                          sortOrder === 'asc'
                            ? 'bg-green-500/20 border-green-500/50 text-green-300'
                            : 'bg-dark-surface/30 border-gray-700 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <span>↑ Ascending</span>
                      </button>
                      <button
                        onClick={() => setSortOrder('desc')}
                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                          sortOrder === 'desc'
                            ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                            : 'bg-dark-surface/30 border-gray-700 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <span>↓ Descending</span>
                      </button>
                    </div>
                  )}

                  <div className="pt-2 border-t border-gray-800/50 flex flex-col gap-2">
                    <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Total Results</span>
                    <div className="bg-dark-surface/50 px-3 py-2.5 rounded-lg text-sm font-mono text-gray-300 text-center">
                      {sortedResults.length}
                    </div>
                  </div>
                </div>
              )}

              {/* Results List */}
              <div className="flex-1 overflow-hidden flex flex-col min-w-0">
                {sortedResults.length > 0 ? (
                  <div className="overflow-hidden flex-1" style={{ position: 'relative' }}>
                    <List
                      className="custom-scrollbar w-full"
                      style={{ height: getResponsiveListHeight() }}
                      rowCount={sortedResults.length}
                      rowHeight={38}
                      rowComponent={Row}
                      rowProps={{}}
                    />
                  </div>
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

      {/* Update Button */}
      <div className="fixed bottom-4 right-4 flex gap-2 z-40 pointer-events-auto">
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 text-gray-500 hover:text-white transition-colors hover:bg-dark-surface/50 rounded-lg"
        >
          <Wrench size={18} />
        </button>
        <button
          onClick={() => setShowInfo(true)}
          className="p-2 text-gray-500 hover:text-white transition-colors hover:bg-dark-surface/50 rounded-lg"
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
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60] flex items-center justify-center p-4"
            onClick={() => setShowNotes(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={`bg-dark-surface border border-gray-800 p-6 sm:p-8 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
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

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, x: -20 }}
              animate={{ scale: 1, opacity: 1, x: 0 }}
              exit={{ scale: 0.9, opacity: 0, x: -20 }}
              className={`bg-dark-surface border border-gray-800 p-6 sm:p-8 rounded-3xl shadow-2xl max-w-md w-full flex flex-col gap-6 ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <Wrench className="text-gray-400 flex-shrink-0" size={20} />
                  <h2 className="text-lg font-bold truncate">App Settings</h2>
                </div>
                <button onClick={() => setShowSettings(false)} className="text-gray-500 hover:text-white transition-colors flex-shrink-0">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6 overflow-y-auto max-h-[70vh]">
                <div>
                  <span className="text-gray-500 block mb-3 text-[11px] uppercase tracking-widest font-bold">Theme</span>
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { id: 'matte-dark', color: '#242424', label: 'Dark' },
                      { id: 'light', color: '#f5f5f7', label: 'Light' },
                      { id: 'neon-blue', color: '#00f2ff', label: 'Blue' },
                      { id: 'neon-red', color: '#ff003c', label: 'Red' },
                      { id: 'neon-green', color: '#39ff14', label: 'Green' },
                    ].map(t => (
                      <button
                        key={t.id}
                        onClick={() => setCurrentTheme(t.id as any)}
                        className={`group flex flex-col items-center gap-1.5 transition-all ${currentTheme === t.id ? 'scale-110' : 'opacity-60 hover:opacity-100'}`}
                      >
                        <div 
                          className={`w-10 h-10 rounded-full border-2 ${currentTheme === t.id ? 'border-white shadow-lg' : 'border-transparent'}`}
                          style={{ backgroundColor: t.color }}
                        />
                        <span className="text-[10px] text-gray-400">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-gray-500 block mb-3 text-[11px] uppercase tracking-widest font-bold">Typography</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentFont('sfpro')}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${currentFont === 'sfpro' ? 'bg-white text-black border-white' : 'bg-dark-bg border-gray-800 text-gray-400 hover:border-gray-600'}`}
                    >
                      <Type size={16} />
                      <span className="text-xs font-medium">SF Pro</span>
                    </button>
                    <button
                      onClick={() => setCurrentFont('jetbrains')}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${currentFont === 'jetbrains' ? 'bg-white text-black border-white' : 'bg-dark-bg border-gray-800 text-gray-400 hover:border-gray-600'}`}
                    >
                      <Code size={16} />
                      <span className="text-xs font-medium">JetBrains</span>
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-800/50">
                  <span className="text-gray-500 block mb-3 text-[11px] uppercase tracking-widest font-bold">Maintenance</span>
                  <button
                    onClick={() => {
                      invoke("refresh_index");
                      setShowSettings(false);
                    }}
                    className="flex items-center gap-3 w-full px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl border border-red-500/20 transition-all group"
                  >
                    <Terminal size={18} className="flex-shrink-0" />
                    <div className="text-left">
                      <div className="text-xs font-bold uppercase">Force Re-index</div>
                      <div className="text-[10px] opacity-70">Deep scan MFT records immediately</div>
                    </div>
                  </button>
                </div>
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowInfo(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`bg-dark-surface border border-gray-800 p-6 sm:p-10 rounded-3xl shadow-2xl max-w-xl w-full flex flex-col sm:flex-row items-center gap-6 sm:gap-0 ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-1 text-center sm:border-r border-gray-800/50 sm:pr-10">
                <h2 
                  data-text="coolSearch"
                  onMouseMove={handleTitleMouseMove}
                  className="chrome-title text-3xl sm:text-4xl font-bold tracking-tighter select-none cursor-default"
                  style={{ 
                    '--mouse-x': `${mousePos.x}%`, 
                    '--mouse-y': `${mousePos.y}%` 
                  } as any}
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
    </div>
  );
}

export default App;
