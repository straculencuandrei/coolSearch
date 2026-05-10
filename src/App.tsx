import { useState, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { List } from "react-window";
import { Search, File as FileIcon, Folder, Terminal, Info, ExternalLink, Music, Image as ImageIcon, ArrowLeft, Copy, FolderOpen, Check, Type, Code, Wrench, Sparkles, Download, X } from "lucide-react";
import { check } from "@tauri-apps/plugin-updater";
import "./App.css";

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
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });

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
          setUpdateAvailable(update);
        }
      } catch (e) {
        console.error("Update check failed", e);
      }
    };
    checkForUpdates();
  }, []);

  const fetchReleaseNotes = async () => {
    // Hardcoded release notes for offline access
    const releaseNotesText = `🎉 coolSearch v0.1.91 - Major UI Overhaul & Theming

🎨 UI/UX Enhancements
• Multi-Theme Support: Added 5 beautiful themes (Matte Dark, Light, Neon Blue, Red, Green) with full CSS variable theming system
• Settings Panel: New settings modal accessible via wrench icon for theme and font selection
• Improved Animations: Smoother transitions and better positioning for the search interface
• Enhanced Styling: Neon glow effects for neon themes, improved color consistency across all themes

🖼️ Icon Updates
• Completely refreshed all app icons (32x32, 128x128, Store logos, etc.) with modern, high-quality designs
• Significantly larger file sizes indicating premium graphics quality

🔧 Backend Improvements
• Cache Reliability: Fixed potential crash in cache loading by using temp directory fallback
• Code Cleanup: Minor formatting and import organization improvements in Rust code
• Security Update: Updated public key for app auto-updates

📦 Distribution
• Standalone executable (portable)
• MSI installer for Windows
• NSIS setup installer

🐛 Bug Fixes
• Improved error handling for cache operations

Installation Options:
• Download the portable coolSearch_0.1.91.exe for instant use
• Use the MSI installer for system integration
• NSIS setup for guided installation

Enjoy the new themes and enhanced experience! 🚀`;

    setReleaseNotes(releaseNotesText);
    setShowNotes(true);
  };
  useEffect(() => {
    const handleResize = () => setWindowHeight(window.innerHeight);
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

  const Row = ({ index, style }: any) => {
    const file = results[index];
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
    <div className={`min-h-screen bg-dark-bg text-gray-100 flex flex-col relative overflow-hidden theme-${currentTheme} ${currentFont === 'sfpro' ? 'font-sfpro' : 'font-jetbrains'}`}>
      {/* Background with subtle matte finish */}
      <div className="absolute inset-0 bg-dark-bg pointer-events-none" />

      {/* Header & Status */}
      <div className="flex flex-col items-end p-6 px-10 z-10 gap-2">
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
          What's New in 0.1.9?
        </button>
      </div>

      {/* Search Container */}
      <div className="flex flex-col items-center justify-start flex-1 w-full max-w-2xl mx-auto mt-4 px-4 z-10">
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
            className="flex items-center gap-3 mb-8 relative"
          >
            <Wrench size={24} className={`text-gray-400 absolute -left-10 ${currentTheme.startsWith('neon') ? 'neon-text' : ''}`} />
            <h1 
              data-text="coolSearch"
              className={`chrome-title font-bold text-2xl tracking-[0.1em] uppercase select-none cursor-default ${currentTheme.startsWith('neon') ? 'neon-text' : ''}`}
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
              className="w-full relative"
            >
              <div className={`
                relative group flex items-center bg-dark-surface/80 backdrop-blur-md rounded-xl matte-border
                ${isFocused ? 'matte-border-focus' : 'border-gray-800'} 
                ${currentTheme.startsWith('neon') ? 'neon-border' : ''}
                transition-all duration-300 overflow-hidden
              `}>
                <div className="pl-3 text-gray-400 group-hover:text-white transition-colors">
                  <Search size={18} />
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  placeholder="Search for files or folders..."
                  className="w-full bg-transparent border-none text-sm text-gray-100 placeholder-gray-600 px-3 py-2.5 focus:outline-none focus:ring-0"
                  spellCheck={false}
                  autoFocus
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="pr-6 text-gray-500 hover:text-white transition-colors"
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
              className="w-full"
            >
              <button
                onClick={() => setSelectedFile(null)}
                className={`flex items-center gap-2 text-gray-400 hover:text-white transition-all bg-dark-surface/50 hover:bg-dark-surface px-5 py-2.5 rounded-xl border border-gray-800 hover:border-white/20 group shadow-lg ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
              >
                <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
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
              className={`w-full mt-4 bg-dark-surface/50 backdrop-blur-xl border border-gray-800 rounded-2xl p-6 shadow-2xl flex flex-col md:flex-row min-h-0 flex-1 mb-6 overflow-hidden ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
            >
              <div className="flex-[0.8] flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-gray-800/50 pb-6 md:pb-0 md:pr-8">
                <div className={`mb-6 p-6 rounded-3xl bg-dark-bg/50 border border-gray-800/50 ${selectedFile.is_dir ? "text-yellow-400" :
                  ['mp3', 'wav', 'flac'].includes(selectedFile.name.split('.').pop()?.toLowerCase() || '') ? "text-red-500" :
                    ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'].includes(selectedFile.name.split('.').pop()?.toLowerCase() || '') ? "text-green-500 p-0 overflow-hidden" :
                      "text-gray-400"
                  } ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}>
                  {selectedFile.is_dir ? <Folder size={64} /> :
                    ['mp3', 'wav', 'flac'].includes(selectedFile.name.split('.').pop()?.toLowerCase() || '') ? <Music size={64} /> :
                      ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'].includes(selectedFile.name.split('.').pop()?.toLowerCase() || '') ? (
                        <img
                          src={convertFileSrc(selectedFile.path)}
                          alt={selectedFile.name}
                          className="w-48 h-48 object-contain rounded-xl shadow-2xl bg-black/20"
                        />
                      ) :
                        <FileIcon size={64} />
                  }
                </div>
                <h2 className="text-xl font-bold text-center break-all">{selectedFile.name}</h2>
                <p className="text-gray-500 text-xs mt-2 uppercase tracking-widest">{selectedFile.is_dir ? 'Directory' : 'File'}</p>
              </div>

              <div className="flex-1 pl-8 flex flex-col justify-center gap-6">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Absolute Path</span>
                  <p className="text-sm text-gray-300 break-all font-mono bg-dark-bg/30 p-3 rounded-lg border border-gray-800/30">
                    {selectedFile.path}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={copyPath}
                      className="flex items-center gap-2 px-3 py-1.5 bg-dark-bg border border-gray-800 rounded-md text-xs hover:border-white/30 transition-colors"
                    >
                      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                      {copied ? 'Copied!' : 'Copy Path'}
                    </button>
                    <button
                      onClick={openExplorer}
                      className="flex items-center gap-2 px-3 py-1.5 bg-dark-bg border border-gray-800 rounded-md text-xs hover:border-white/30 transition-colors"
                    >
                      <FolderOpen size={14} />
                      Open in Explorer
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Size</span>
                    <p className="text-lg font-medium text-gray-200">
                      {details ? formatSize(details.size) : 'Loading...'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Created</span>
                    <p className="text-sm font-medium text-gray-300">
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
              className={`w-full mt-4 bg-dark-surface/50 backdrop-blur-xl border border-gray-800 rounded-2xl overflow-hidden flex-1 mb-6 shadow-2xl flex flex-col ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
              style={{ maxHeight: 'calc(100vh - 120px)' }}
            >
              {results.length > 0 ? (
                <div className="flex-1 overflow-hidden" style={{ position: 'relative' }}>
                  <List
                    className="custom-scrollbar w-full"
                    style={{ height: windowHeight - 120 }}
                    rowCount={results.length}
                    rowHeight={38}
                    rowComponent={Row}
                    rowProps={{}}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                  <Terminal size={32} className="mb-2 opacity-50" />
                  <p>No results found for "{query}"</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Controls */}
      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center z-20">
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 text-gray-500 hover:text-white transition-colors"
        >
          <Wrench size={18} />
        </button>
        <button
          onClick={() => setShowInfo(true)}
          className="p-2 text-gray-500 hover:text-white transition-colors"
        >
          <Info size={18} />
        </button>
      </div>

      {/* Update Button */}
      <AnimatePresence>
        {updateAvailable && (
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
              className={`flex items-center gap-2 bg-gray-200 text-dark-bg font-bold px-6 py-2.5 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all text-sm uppercase tracking-wider ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
            >
              <Download size={18} />
              Update to {updateAvailable.version}
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
              className={`bg-dark-surface border border-gray-800 p-8 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <Sparkles className="text-gray-400" size={24} />
                  <h2 className="text-xl font-bold tracking-tight">Latest Release Changes</h2>
                </div>
                <button onClick={() => setShowNotes(false)} className="text-gray-500 hover:text-white transition-colors">
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
              className={`bg-dark-surface border border-gray-800 p-8 rounded-3xl shadow-2xl max-w-md w-full flex flex-col gap-6 ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Wrench className="text-gray-400" size={20} />
                  <h2 className="text-lg font-bold">App Settings</h2>
                </div>
                <button onClick={() => setShowSettings(false)} className="text-gray-500 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
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
                    <Terminal size={18} />
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
              className={`bg-dark-surface border border-gray-800 p-10 rounded-3xl shadow-2xl max-w-xl w-full flex items-center ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-1 text-center border-r border-gray-800/50 pr-10">
                <h2 
                  data-text="coolSearch"
                  onMouseMove={handleTitleMouseMove}
                  className="chrome-title text-4xl font-bold tracking-tighter select-none cursor-default"
                  style={{ 
                    '--mouse-x': `${mousePos.x}%`, 
                    '--mouse-y': `${mousePos.y}%` 
                  } as any}
                >
                  coolSearch
                </h2>
              </div>
              <div className="flex-1 pl-10 flex flex-col gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block mb-0.5 text-[11px] uppercase tracking-widest">Credits</span>
                  <span className="text-gray-200 font-medium text-base">straculencuandrei</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5 text-[11px] uppercase tracking-widest">Version</span>
                  <span className="text-gray-200 font-medium text-base">0.1.9</span>
                </div>
                <button
                  onClick={() => {
                    invoke("open_url", { url: "https://github.com/straculencuandrei/coolSearch" });
                  }}
                  className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mt-2 font-medium bg-transparent border-none p-0"
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
