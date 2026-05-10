import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { List } from "react-window";
import { Search, File as FileIcon, Folder, HardDrive, Terminal, Info, Github } from "lucide-react";
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

  const Row = ({ index, style }: any) => {
    const file = results[index];
    if (!file) return null;
    return (
      <div
        style={style}
        className="flex items-center px-4 border-b border-gray-800/50 hover:bg-dark-surface transition-colors cursor-pointer"
      >
        <div className="mr-3 text-neon-blue">
          {file.is_dir ? <Folder size={16} /> : <FileIcon size={16} />}
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
      <div className="flex items-center justify-between p-2 z-10">
        <div className="flex items-center gap-2 text-neon-blue font-bold text-sm tracking-wider">
          <HardDrive size={18} />
          <span>coolSearch</span>
        </div>
        <div className="text-xs font-mono text-gray-400 bg-dark-surface px-3 py-1 rounded-full border border-gray-800 flex items-center gap-2">
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
      <div className="flex flex-col items-center justify-start flex-1 w-full max-w-4xl mx-auto mt-8 px-4 z-10">
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

        {/* Results */}
        <AnimatePresence>
          {query && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="w-full mt-6 bg-dark-surface/50 backdrop-blur-xl border border-gray-800 rounded-2xl overflow-hidden flex-1 mb-8 shadow-2xl flex flex-col"
              style={{ maxHeight: 'calc(100vh - 250px)' }}
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
                  <Github size={18} />
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
