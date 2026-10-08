import React, { useState } from 'react';
import {
  SlidersHorizontal,
  TableProperties,
  Search,
  Palette,
  HardDrive,
  FolderX,
  Keyboard,
  Info,
  RefreshCw,
  X,
  Plus,
  MousePointer,
  RotateCcw,
} from 'lucide-react';
import { AppSettings, DEFAULT_SETTINGS } from '../types';
import { invoke } from '@tauri-apps/api/core';
import iconNeco from '../icon-neco.png';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  availableDrives: string[];
}

type SettingCategory =
  | 'interface'
  | 'search'
  | 'indexing'
  | 'actions'
  | 'shortcuts'
  | 'about';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  availableDrives,
}) => {
  const [activeCategory, setActiveCategory] = useState<SettingCategory>('interface');
  const [searchQuery, setSearchQuery] = useState('');
  const [newExcludePath, setNewExcludePath] = useState('');
  const [reindexStatus, setReindexStatus] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<boolean>(false);

  if (!isOpen) return null;

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onUpdateSettings({
      ...settings,
      [key]: value,
    });
  };

  const handleResetDefaults = () => {
    onUpdateSettings({ ...DEFAULT_SETTINGS });
    setConfirmReset(false);
  };

  const handleTriggerReindex = async () => {
    try {
      setReindexStatus('Re-indexing drives...');
      await invoke('refresh_index');
      setTimeout(() => setReindexStatus('Re-indexing complete!'), 2000);
      setTimeout(() => setReindexStatus(null), 4500);
    } catch (e) {
      setReindexStatus('Failed to trigger re-index');
      setTimeout(() => setReindexStatus(null), 3000);
    }
  };

  const handleAddExcludePath = () => {
    const trimmed = newExcludePath.trim();
    if (!trimmed) return;
    if (settings.excludedPaths.includes(trimmed)) {
      setNewExcludePath('');
      return;
    }
    updateSetting('excludedPaths', [...settings.excludedPaths, trimmed]);
    setNewExcludePath('');
  };

  const handleRemoveExcludePath = (pathToRemove: string) => {
    updateSetting(
      'excludedPaths',
      settings.excludedPaths.filter((p) => p !== pathToRemove)
    );
  };

  const toggleDrive = (drive: string) => {
    if (drive === 'All') {
      updateSetting('monitoredDrives', ['All']);
      return;
    }

    let current = settings.monitoredDrives.filter((d) => d !== 'All');
    if (current.includes(drive)) {
      current = current.filter((d) => d !== drive);
      if (current.length === 0) current = ['All'];
    } else {
      current.push(drive);
    }
    updateSetting('monitoredDrives', current);
  };

  const navCategories = [
    { id: 'interface' as SettingCategory, label: 'Interface & Display', icon: Palette },
    { id: 'search' as SettingCategory, label: 'Search Engine', icon: Search },
    { id: 'indexing' as SettingCategory, label: 'Drive Indexing', icon: HardDrive },
    { id: 'actions' as SettingCategory, label: 'Launch & Explorer', icon: MousePointer },
    { id: 'shortcuts' as SettingCategory, label: 'Keyboard Shortcuts', icon: Keyboard },
    { id: 'about' as SettingCategory, label: 'About coolSearch', icon: Info },
  ];

  return (
    <div
      className={`fixed inset-x-0 bottom-0 ${settings.uiMode === 'classic' ? 'top-7' : 'top-10'} z-[120] bg-black/25 flex items-center justify-center p-3 sm:p-5 select-none font-ubuntu`}
      onClick={onClose}
    >
      <div
        className="bg-[#151518] border border-[#2b2b33] shadow-2xl rounded-2xl w-full max-w-4xl h-[calc(100%-0.75rem)] max-h-[740px] flex flex-col text-[#e0e0e0] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title & Search Bar */}
        <div 
          data-tauri-drag-region
          className="h-12 bg-[#1a1a1f] border-b border-[#26262e] px-4 flex items-center justify-between gap-4 flex-shrink-0 select-none cursor-default"
        >
          {/* Logo & Title */}
          <div data-tauri-drag-region className="flex items-center gap-2.5 flex-shrink-0">
            <img src={iconNeco} alt="Logo" className="w-5 h-5 object-contain pointer-events-none" />
            <span data-tauri-drag-region className="text-white font-bold text-sm tracking-wide">
              coolSearch Settings
            </span>
          </div>

          {/* Quick Search settings input */}
          <div className="relative flex-1 max-w-md">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search settings (theme, font, drive, debounce)..."
              className="w-full bg-[#202026] hover:bg-[#23232b] focus:bg-[#202026] border border-[#32323d] focus:border-blue-500 text-xs text-white placeholder-gray-500 pl-8 pr-7 py-1.5 rounded-lg outline-none transition-colors font-ubuntu"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            title="Close Settings (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Two-Column Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Navigation Sidebar */}
          {!searchQuery && (
            <div className="w-52 bg-[#17171b] border-r border-[#26262e] p-2.5 flex flex-col justify-between text-xs select-none flex-shrink-0">
              <div className="flex flex-col gap-1">
                {navCategories.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors font-medium ${
                        isActive
                          ? 'bg-blue-600/15 text-blue-400 border-l-2 border-blue-500 font-bold'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/5 border-l-2 border-transparent'
                      }`}
                    >
                      <Icon size={14} className={isActive ? 'text-blue-400' : 'text-gray-500'} />
                      <span className="truncate">{cat.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* In-App Reset Defaults with Confirmation Prompt (Zero browser popups) */}
              <div className="pt-2 border-t border-[#26262e]">
                {confirmReset ? (
                  <div className="bg-[#241c1c] border border-red-500/30 p-2 rounded-lg space-y-1.5 text-center">
                    <span className="text-[11px] text-red-300 block font-medium">Reset all settings?</span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={handleResetDefaults}
                        className="flex-1 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold rounded"
                      >
                        Reset
                      </button>
                      <button
                        onClick={() => setConfirmReset(false)}
                        className="flex-1 py-1 bg-[#333] hover:bg-[#444] text-gray-300 text-[10px] rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmReset(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                  >
                    <RotateCcw size={11} />
                    <span>Reset to Defaults</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Right Settings Content Area */}
          <div className="flex-1 bg-[#151518] overflow-y-auto custom-scrollbar p-5 sm:p-6 space-y-5">
            {/* Header category name */}
            <div className="border-b border-[#24242c] pb-2.5">
              <h2 className="text-base font-bold text-white tracking-wide">
                {searchQuery
                  ? `Search Results for "${searchQuery}"`
                  : navCategories.find((n) => n.id === activeCategory)?.label || 'Settings'}
              </h2>
            </div>

            {/* 1. INTERFACE & DISPLAY */}
            {(searchQuery || activeCategory === 'interface') && (
              <div className="space-y-3">
                {/* Interface Mode */}
                <div className="bg-[#19191d] border border-[#272730] rounded-xl p-3.5 space-y-2.5 hover:border-[#383844] transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <h4 className="text-xs font-bold text-white">Interface Mode</h4>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Choose between rich interactive styling with media drawer or ultra-slim low-RAM table.
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 bg-[#202026] p-1 rounded-lg border border-[#30303a] shrink-0">
                      <button
                        onClick={() => updateSetting('uiMode', 'modern')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                          settings.uiMode === 'modern'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        <SlidersHorizontal size={12} />
                        <span>Modern UI</span>
                      </button>
                      <button
                        onClick={() => updateSetting('uiMode', 'classic')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                          settings.uiMode === 'classic'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        <TableProperties size={12} />
                        <span>Slim UI</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Theme Palette */}
                <div className="bg-[#19191d] border border-[#272730] rounded-xl p-3.5 space-y-2.5 hover:border-[#383844] transition-colors">
                  <div>
                    <h4 className="text-xs font-bold text-white">Theme Palette (Modern UI)</h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Select color scheme and surface atmosphere for the Modern search experience.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                      { id: 'matte-dark', label: 'Dark', color: '#242424' },
                      { id: 'light', label: 'Light', color: '#f5f5f7' },
                      { id: 'neon-blue', label: 'Neon Blue', color: '#00f2ff' },
                      { id: 'neon-red', label: 'Neon Red', color: '#ff003c' },
                      { id: 'neon-green', label: 'Neon Green', color: '#39ff14' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => updateSetting('theme', t.id as any)}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium transition-all ${
                          settings.theme === t.id
                            ? 'bg-blue-600/20 border-blue-500 text-white font-bold'
                            : 'bg-[#202026] border-[#2e2e38] text-gray-400 hover:border-gray-500'
                        }`}
                      >
                        <div
                          className="w-3.5 h-3.5 rounded-full border border-black/40 shrink-0"
                          style={{ backgroundColor: t.color }}
                        />
                        <span className="truncate">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Family & Density */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-[#19191d] border border-[#272730] rounded-xl p-3.5 flex flex-col justify-between gap-2.5 hover:border-[#383844] transition-colors">
                    <div>
                      <h4 className="text-xs font-bold text-white">Typography Family</h4>
                      <p className="text-[11px] text-gray-400 mt-0.5">Application font face</p>
                    </div>
                    <select
                      value={settings.fontFamily}
                      onChange={(e) => updateSetting('fontFamily', e.target.value as any)}
                      className="bg-[#202026] border border-[#30303a] text-xs text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 font-ubuntu cursor-pointer"
                    >
                      <option value="ubuntu">Ubuntu (Classic Desktop)</option>
                      <option value="sfpro">SF Pro Display (Clean Apple)</option>
                      <option value="jetbrains">JetBrains Mono (Developer)</option>
                      <option value="system">System Default</option>
                    </select>
                  </div>

                  <div className="bg-[#19191d] border border-[#272730] rounded-xl p-3.5 flex flex-col justify-between gap-2.5 hover:border-[#383844] transition-colors">
                    <div>
                      <h4 className="text-xs font-bold text-white">Results Row Density</h4>
                      <p className="text-[11px] text-gray-400 mt-0.5">Vertical row spacing</p>
                    </div>
                    <select
                      value={settings.rowDensity}
                      onChange={(e) => updateSetting('rowDensity', e.target.value as any)}
                      className="bg-[#202026] border border-[#30303a] text-xs text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 font-ubuntu cursor-pointer"
                    >
                      <option value="compact">Compact (Dense 20px)</option>
                      <option value="standard">Standard (Balanced 24px)</option>
                      <option value="spacious">Spacious (Relaxed 30px)</option>
                    </select>
                  </div>
                </div>

                {/* Highlight matches & Extension badges */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-[#19191d] border border-[#272730] rounded-xl p-3 flex items-center justify-between hover:border-[#383844] transition-colors">
                    <div>
                      <h4 className="text-xs font-bold text-white">Highlight Query Matches</h4>
                      <p className="text-[10px] text-gray-400">Accentuate matching letters</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.highlightMatches}
                      onChange={(e) => updateSetting('highlightMatches', e.target.checked)}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                  </div>

                  <div className="bg-[#19191d] border border-[#272730] rounded-xl p-3 flex items-center justify-between hover:border-[#383844] transition-colors">
                    <div>
                      <h4 className="text-xs font-bold text-white">Show File Extensions</h4>
                      <p className="text-[10px] text-gray-400">Display file type tags</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.showFileExtensions}
                      onChange={(e) => updateSetting('showFileExtensions', e.target.checked)}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 2. SEARCH ENGINE */}
            {(searchQuery || activeCategory === 'search') && (
              <div className="space-y-3">
                {/* Search In Full Path */}
                <div className="bg-[#19191d] border border-[#272730] rounded-xl p-3.5 flex items-center justify-between hover:border-[#383844] transition-colors">
                  <div>
                    <h4 className="text-xs font-bold text-white">Search in Full Path</h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Match queries against parent directories in addition to filenames.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.searchInPath}
                    onChange={(e) => updateSetting('searchInPath', e.target.checked)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </div>

                {/* Max Results & Debounce */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-[#19191d] border border-[#272730] rounded-xl p-3.5 flex flex-col justify-between gap-2 hover:border-[#383844] transition-colors">
                    <div>
                      <h4 className="text-xs font-bold text-white">Maximum Results Limit</h4>
                      <p className="text-[11px] text-gray-400 mt-0.5">Cap on records returned</p>
                    </div>
                    <select
                      value={settings.maxResults}
                      onChange={(e) => updateSetting('maxResults', Number(e.target.value))}
                      className="bg-[#202026] border border-[#30303a] text-xs text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 font-ubuntu cursor-pointer"
                    >
                      <option value={150}>150 Results (Fastest)</option>
                      <option value={300}>300 Results</option>
                      <option value={500}>500 Results (Default)</option>
                      <option value={1000}>1,000 Results</option>
                      <option value={2000}>2,000 Results</option>
                    </select>
                  </div>

                  <div className="bg-[#19191d] border border-[#272730] rounded-xl p-3.5 flex flex-col justify-between gap-2 hover:border-[#383844] transition-colors">
                    <div>
                      <h4 className="text-xs font-bold text-white">Search Input Debounce</h4>
                      <p className="text-[11px] text-gray-400 mt-0.5">Typing delay before query</p>
                    </div>
                    <select
                      value={settings.debounceMs}
                      onChange={(e) => updateSetting('debounceMs', Number(e.target.value))}
                      className="bg-[#202026] border border-[#30303a] text-xs text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 font-ubuntu cursor-pointer"
                    >
                      <option value={0}>0ms (Instantaneous)</option>
                      <option value={25}>25ms (Default)</option>
                      <option value={50}>50ms</option>
                      <option value={100}>100ms</option>
                    </select>
                  </div>
                </div>

                {/* Case sensitivity & Regex */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-[#19191d] border border-[#272730] rounded-xl p-3 flex items-center justify-between hover:border-[#383844] transition-colors">
                    <div>
                      <h4 className="text-xs font-bold text-white">Case Sensitive by Default</h4>
                      <p className="text-[10px] text-gray-400">Match case strictly</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.caseSensitiveDefault}
                      onChange={(e) => updateSetting('caseSensitiveDefault', e.target.checked)}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                  </div>

                  <div className="bg-[#19191d] border border-[#272730] rounded-xl p-3 flex items-center justify-between hover:border-[#383844] transition-colors">
                    <div>
                      <h4 className="text-xs font-bold text-white">Regular Expressions</h4>
                      <p className="text-[10px] text-gray-400">Regex pattern syntax</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.enableRegex}
                      onChange={(e) => updateSetting('enableRegex', e.target.checked)}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 3. DRIVE INDEXING */}
            {(searchQuery || activeCategory === 'indexing') && (
              <div className="space-y-3">
                {/* Monitored Drives */}
                <div className="bg-[#19191d] border border-[#272730] rounded-xl p-3.5 space-y-2.5 hover:border-[#383844] transition-colors">
                  <div>
                    <h4 className="text-xs font-bold text-white">Monitored Drives</h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Select which local NTFS and storage drives coolSearch reads into memory.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => toggleDrive('All')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                        settings.monitoredDrives.includes('All')
                          ? 'bg-blue-600 text-white border-blue-500 font-bold'
                          : 'bg-[#202026] border-[#2e2e38] text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      All Drives
                    </button>
                    {availableDrives.map((d) => {
                      const isSelected = settings.monitoredDrives.includes(d);
                      return (
                        <button
                          key={d}
                          onClick={() => toggleDrive(d)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-500 font-bold'
                              : 'bg-[#202026] border-[#2e2e38] text-gray-400 hover:border-gray-500'
                          }`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Excluded Folders */}
                <div className="bg-[#19191d] border border-[#272730] rounded-xl p-3.5 space-y-2.5 hover:border-[#383844] transition-colors">
                  <div>
                    <h4 className="text-xs font-bold text-white">Excluded Directories (Blacklist)</h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Folders matching these segments are ignored from search results.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newExcludePath}
                      onChange={(e) => setNewExcludePath(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddExcludePath()}
                      placeholder="Add folder pattern to ignore (e.g. node_modules, .git)..."
                      className="flex-1 bg-[#202026] border border-[#30303a] rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-ubuntu"
                    />
                    <button
                      onClick={handleAddExcludePath}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <Plus size={13} />
                      <span>Add</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {settings.excludedPaths.map((p) => (
                      <span
                        key={p}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#22222a] border border-[#30303c] text-[11px] text-gray-300 font-ubuntu-mono"
                      >
                        <FolderX size={11} className="text-red-400" />
                        <span>{p}</span>
                        <button
                          onClick={() => handleRemoveExcludePath(p)}
                          className="hover:text-red-400 ml-0.5"
                          title="Remove from blacklist"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Force MFT Rescan */}
                <div className="bg-[#19191d] border border-[#272730] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[#383844] transition-colors">
                  <div>
                    <h4 className="text-xs font-bold text-white">MFT Index Synchronization</h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Force immediate full rescan of all drive Master File Tables.
                    </p>
                    {reindexStatus && (
                      <span className="text-xs text-emerald-400 font-medium block mt-1">
                        {reindexStatus}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleTriggerReindex}
                    className="px-3.5 py-2 bg-[#25252e] hover:bg-[#30303c] text-white border border-[#363644] rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all shrink-0"
                  >
                    <RefreshCw size={12} />
                    <span>Re-Index Drives Now</span>
                  </button>
                </div>
              </div>
            )}

            {/* 4. LAUNCH & ACTIONS */}
            {(searchQuery || activeCategory === 'actions') && (
              <div className="space-y-3">
                {/* Primary Action on Open */}
                <div className="bg-[#19191d] border border-[#272730] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-[#383844] transition-colors">
                  <div>
                    <h4 className="text-xs font-bold text-white">Default Open Action</h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Executed on Enter or double-clicking a result.
                    </p>
                  </div>
                  <select
                    value={settings.primaryAction}
                    onChange={(e) => updateSetting('primaryAction', e.target.value as any)}
                    className="bg-[#202026] border border-[#30303a] text-xs text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 font-ubuntu cursor-pointer"
                  >
                    <option value="open">Open / Execute File</option>
                    <option value="explorer">Open in Windows Explorer</option>
                  </select>
                </div>

                {/* Copy Path Format */}
                <div className="bg-[#19191d] border border-[#272730] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-[#383844] transition-colors">
                  <div>
                    <h4 className="text-xs font-bold text-white">Clipboard Copy Format</h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Formatting when copying file paths to clipboard.
                    </p>
                  </div>
                  <select
                    value={settings.copyPathFormat}
                    onChange={(e) => updateSetting('copyPathFormat', e.target.value as any)}
                    className="bg-[#202026] border border-[#30303a] text-xs text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 font-ubuntu cursor-pointer"
                  >
                    <option value="windows">Standard Windows (C:\Path\file)</option>
                    <option value="quoted">Quoted ("C:\Path\file")</option>
                    <option value="unix">Forward Slash (C:/Path/file)</option>
                  </select>
                </div>

                {/* Minimize on Open */}
                <div className="bg-[#19191d] border border-[#272730] rounded-xl p-3.5 flex items-center justify-between hover:border-[#383844] transition-colors">
                  <div>
                    <h4 className="text-xs font-bold text-white">Minimize Window on Open</h4>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Automatically minimize coolSearch when launching a file.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.closeOnLaunch}
                    onChange={(e) => updateSetting('closeOnLaunch', e.target.checked)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* 5. KEYBOARD SHORTCUTS */}
            {(searchQuery || activeCategory === 'shortcuts') && (
              <div className="space-y-3">
                <div className="border border-[#272730] rounded-xl overflow-hidden bg-[#19191d]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#202026] text-gray-400 font-semibold border-b border-[#2d2d38]">
                      <tr>
                        <th className="py-2.5 px-3.5">Action</th>
                        <th className="py-2.5 px-3.5 text-right">Keybinding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#262630] text-gray-300">
                      <tr>
                        <td className="py-2 px-3.5">Open / Execute selected file</td>
                        <td className="py-2 px-3.5 text-right font-mono"><kbd className="px-1.5 py-0.5 rounded bg-[#25252e] border border-[#363644] text-[11px] text-white">Enter</kbd></td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3.5">Open containing folder in Explorer</td>
                        <td className="py-2 px-3.5 text-right font-mono"><kbd className="px-1.5 py-0.5 rounded bg-[#25252e] border border-[#363644] text-[11px] text-white">Ctrl + Enter</kbd></td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3.5">Copy full file path</td>
                        <td className="py-2 px-3.5 text-right font-mono"><kbd className="px-1.5 py-0.5 rounded bg-[#25252e] border border-[#363644] text-[11px] text-white">Ctrl + C</kbd></td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3.5">Copy file name</td>
                        <td className="py-2 px-3.5 text-right font-mono"><kbd className="px-1.5 py-0.5 rounded bg-[#25252e] border border-[#363644] text-[11px] text-white">Ctrl + Shift + C</kbd></td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3.5">Toggle UI Mode (Modern ↔ Slim)</td>
                        <td className="py-2 px-3.5 text-right font-mono"><kbd className="px-1.5 py-0.5 rounded bg-[#25252e] border border-[#363644] text-[11px] text-white">Ctrl + M</kbd></td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3.5">Toggle Recent Files Drawer</td>
                        <td className="py-2 px-3.5 text-right font-mono"><kbd className="px-1.5 py-0.5 rounded bg-[#25252e] border border-[#363644] text-[11px] text-white">Ctrl + H</kbd></td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3.5">Open Settings</td>
                        <td className="py-2 px-3.5 text-right font-mono"><kbd className="px-1.5 py-0.5 rounded bg-[#25252e] border border-[#363644] text-[11px] text-white">Ctrl + ,</kbd></td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3.5">View file properties</td>
                        <td className="py-2 px-3.5 text-right font-mono"><kbd className="px-1.5 py-0.5 rounded bg-[#25252e] border border-[#363644] text-[11px] text-white">Alt + Enter</kbd></td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3.5">Clear query / close dialogs</td>
                        <td className="py-2 px-3.5 text-right font-mono"><kbd className="px-1.5 py-0.5 rounded bg-[#25252e] border border-[#363644] text-[11px] text-white">Esc</kbd></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 6. ABOUT */}
            {(searchQuery || activeCategory === 'about') && (
              <div className="bg-[#19191d] border border-[#272730] rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img src={iconNeco} alt="Logo" className="w-5 h-5 pointer-events-none" />
                    <span className="text-white font-bold text-sm">coolSearch</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-blue-600/20 text-blue-400 border border-blue-500/30 text-[11px] font-mono font-bold">
                    v0.4.1
                  </span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  High-performance Windows Master File Table (MFT) desktop search engine built in Rust and Tauri. Fully self-contained local desktop application with zero external web dependencies.
                </p>
                <div className="pt-1 text-[11px] text-gray-500 font-mono">
                  Engine: Native Rust MFT Parser • Dual UI Modes: Modern & Slim
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
