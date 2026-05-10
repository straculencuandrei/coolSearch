import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { List } from "react-window";
import { Search, File as FileIcon, Folder, HardDrive, Terminal, Info, ExternalLink, Music, Image as ImageIcon, ArrowLeft, Copy, FolderOpen, Check } from "lucide-react";
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
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  const [details, setDetails] = useState<{ size: number, created: string } | null>(null);
  const [copied, setCopied] = useState(false);

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
      return "text-neon-blue drop-shadow-[0_0_5px_rgba(0,243,255,0.5)]";
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
        <div className={`mr-3 transition-transform group-hover:scale-110 ${getIconColor()}`}>
          {getIcon()}
        </div>
        <div className="flex-1 truncate py-1">
          <div className="text-gray-100 font-medium text-[13px] truncate">{file.name}</div>
          <div className="text-[10px] text-gray-500 truncate mt-0.5">{file.path}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-dark-bg text-gray-100 flex flex-col font-sans relative overflow-hidden">
      {/* Decorative neon glow */}
      <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon-blue/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Header & Status */}
      <div className="flex items-center justify-between p-6 px-10 z-10">
        <div className="flex items-center gap-3 text-neon-blue font-bold text-sm tracking-wider translate-x-4">
          <HardDrive size={18} />
          <span>coolSearch</span>
        </div>
        <div className="text-xs font-mono text-gray-400 bg-dark-surface px-4 py-1.5 rounded-full border border-gray-800 flex items-center gap-2 -translate-x-4">
          {status.includes("Indexing") ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-blue opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-blue"></span>
            </span>
          ) : (
            <span className="h-2 w-2 rounded-full bg-green-500"></span>
          )}
          {status}
        </div>
      </div>

      {/* Search Container */}
      <div className="flex flex-col items-center justify-start flex-1 w-full max-w-2xl mx-auto mt-4 px-4 z-10">
        <motion.div
          animate={{
            y: query || isFocused ? 0 : 150,
            scale: query || isFocused ? 1 : 1.05
          }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="w-full relative"
        >
          <div className={`
            relative group flex items-center bg-dark-surface/80 backdrop-blur-md rounded-xl border 
            ${isFocused ? 'border-neon-blue shadow-[0_0_15px_rgba(0,243,255,0.15)]' : 'border-gray-800'} 
            transition-all duration-300 overflow-hidden
          `}>
            <div className="pl-3 text-gray-400 group-hover:text-neon-blue transition-colors">
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

        {/* Results / Details Container */}
        <AnimatePresence mode="wait">
          {selectedFile ? (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full mt-6 bg-dark-surface/50 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 shadow-2xl flex min-h-[400px]"
            >
              <div className="flex-1 flex flex-col items-center justify-center border-r border-gray-800/50 pr-8">
                <button 
                  onClick={() => setSelectedFile(null)}
                  className="absolute top-6 left-6 text-gray-500 hover:text-white flex items-center gap-1 text-xs transition-colors"
                >
                  <ArrowLeft size={14} />
                  Back to results
                </button>
                
                <div className={`mb-6 p-6 rounded-3xl bg-dark-bg/50 border border-gray-800/50 ${
                   selectedFile.is_dir ? "text-yellow-400" : 
                   ['mp3', 'wav', 'flac'].includes(selectedFile.name.split('.').pop()?.toLowerCase() || '') ? "text-red-500" :
                   ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'].includes(selectedFile.name.split('.').pop()?.toLowerCase() || '') ? "text-green-500" :
                   "text-neon-blue"
                }`}>
                   {selectedFile.is_dir ? <Folder size={64} /> : 
                    ['mp3', 'wav', 'flac'].includes(selectedFile.name.split('.').pop()?.toLowerCase() || '') ? <Music size={64} /> :
                    ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'].includes(selectedFile.name.split('.').pop()?.toLowerCase() || '') ? <ImageIcon size={64} /> :
                    <FileIcon size={64} />
                   }
                </div>
                <h2 className="text-2xl font-bold text-center break-all">{selectedFile.name}</h2>
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
                      className="flex items-center gap-2 px-3 py-1.5 bg-dark-bg border border-gray-800 rounded-md text-xs hover:border-neon-blue transition-colors"
                    >
                      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                      {copied ? 'Copied!' : 'Copy Path'}
                    </button>
                    <button 
                      onClick={openExplorer}
                      className="flex items-center gap-2 px-3 py-1.5 bg-dark-bg border border-gray-800 rounded-md text-xs hover:border-neon-blue transition-colors"
                    >
                      <FolderOpen size={14} />
                      Open in Explorer
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Size</span>
                    <p className="text-lg font-medium text-neon-blue">
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
              className="w-full mt-6 bg-dark-surface/50 backdrop-blur-xl border border-gray-800 rounded-2xl overflow-hidden flex-1 mb-8 shadow-2xl flex flex-col"
              style={{ maxHeight: 'calc(100vh - 200px)' }}
            >
              {results.length > 0 ? (
                <div className="flex-1 overflow-hidden" style={{ position: 'relative' }}>
                  <List
                    className="custom-scrollbar w-full"
                    style={{ height: window.innerHeight - 200 }}
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

      {/* Info Button */}
      <button 
        onClick={() => setShowInfo(true)}
        className="absolute bottom-4 right-4 p-2 text-gray-500 hover:text-neon-blue transition-colors z-20"
      >
        <Info size={18} />
      </button>

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
              className="bg-dark-surface border border-gray-800 p-10 rounded-3xl shadow-2xl max-w-xl w-full flex items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-1 text-center border-r border-gray-800/50 pr-10">
                <h2 className="text-4xl font-bold text-neon-blue tracking-tighter">coolSearch</h2>
              </div>
              <div className="flex-1 pl-10 flex flex-col gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block mb-0.5 text-[11px] uppercase tracking-widest">Credits</span>
                  <span className="text-gray-200 font-medium text-base">straculencuandrei</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-0.5 text-[11px] uppercase tracking-widest">Version</span>
                  <span className="text-gray-200 font-medium text-base">0.1.0</span>
                </div>
                <a 
                  href="https://github.com/straculencuandrei/coolSearch" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-neon-blue hover:text-white transition-colors mt-2 font-medium"
                >
                  <ExternalLink size={18} />
                  GitHub Repository
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
