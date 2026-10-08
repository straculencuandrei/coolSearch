import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Sparkles, X, AlertCircle, ExternalLink, CheckCircle2, ArrowRight } from 'lucide-react';
import { AppUpdateInfo, DownloadProgress, startDownloadAndInstall } from '../services/updateService';
import { invoke } from '@tauri-apps/api/core';

interface UpdateDialogProps {
  update: AppUpdateInfo | null;
  currentVersion: string;
  currentTheme: string;
  isOpen: boolean;
  onClose: () => void;
}

export const UpdateDialog: React.FC<UpdateDialogProps> = ({
  update,
  currentVersion,
  currentTheme,
  isOpen,
  onClose,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen || !update) return null;

  const handleDownload = async () => {
    setIsDownloading(true);
    setError(null);
    setProgress({ percent: 0, downloaded_bytes: 0, total_bytes: 0 });

    try {
      await startDownloadAndInstall(update, (p) => {
        setProgress(p);
      });
      setIsSuccess(true);
    } catch (err: any) {
      console.error('[UpdateDialog] Download error:', err);
      setError(err?.message || 'Failed to download update. Please check internet connection.');
      setIsDownloading(false);
    }
  };

  const handleOpenBrowser = () => {
    const targetUrl = update.windows_url || update.portable_url || 'https://github.com/straculencuandrei/coolSearch/releases/latest';
    invoke('open_url', { url: targetUrl }).catch(() => {
      window.open(targetUrl, '_blank');
    });
  };

  // Parse release notes into items matching wznotes
  const rawNotes = (update.release_notes || '').trim();
  let noteItems: string[] = [];
  if (rawNotes.includes('\n') || rawNotes.includes('•') || rawNotes.includes('- ')) {
    noteItems = rawNotes
      .split(/\r?\n|•\s*/)
      .map((s) => s.trim().replace(/^[-*•]\s*/, ''))
      .filter((s) => s.length > 0);
  } else {
    noteItems = [rawNotes];
  }

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 MB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const isLight = currentTheme === 'light';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={!isDownloading ? onClose : undefined}
          className="fixed inset-0 bg-black/60 backdrop-blur-md"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className={`relative w-full max-w-lg rounded-2xl border shadow-2xl p-6 overflow-hidden flex flex-col gap-5 ${
            isLight
              ? 'bg-white border-gray-200 text-gray-900 shadow-xl'
              : 'bg-[#18181c] border-gray-800 text-gray-100'
          } ${currentTheme.startsWith('neon') ? 'neon-border' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          {!isDownloading && !update.is_mandatory && (
            <button
              onClick={onClose}
              className={`absolute top-4 right-4 p-1.5 rounded-lg transition-colors ${
                isLight ? 'text-gray-400 hover:text-gray-700 hover:bg-gray-100' : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <X size={18} />
            </button>
          )}

          {/* Header */}
          <div className="flex items-center gap-3.5 pr-8">
            <div className={`p-3 rounded-2xl flex-shrink-0 ${
              isLight ? 'bg-blue-50 text-blue-600' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
            }`}>
              <Sparkles size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-lg leading-tight">
                  {update.title || `coolSearch v${update.version} Update`}
                </h3>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs">
                <span className={isLight ? 'text-gray-500' : 'text-gray-400'}>
                  Current: <span className="font-mono font-medium">v{currentVersion}</span>
                </span>
                <ArrowRight size={12} className={isLight ? 'text-gray-400' : 'text-gray-500'} />
                <span className="font-mono font-bold text-blue-500">
                  v{update.version}
                </span>
              </div>
            </div>
          </div>

          {/* What's New Section */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${
                isLight ? 'text-gray-500' : 'text-gray-400'
              }`}>
                WHAT'S NEW
              </span>
              {noteItems.length > 1 && (
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  isLight ? 'bg-gray-100 text-gray-600' : 'bg-white/5 text-gray-400'
                }`}>
                  {noteItems.length} improvements
                </span>
              )}
            </div>

            <div className={`max-h-52 overflow-y-auto rounded-xl p-3.5 custom-scrollbar border ${
              isLight ? 'bg-gray-50/80 border-gray-200' : 'bg-dark-bg/60 border-gray-800/80'
            }`}>
              <div className="flex flex-col gap-2.5">
                {noteItems.map((item, idx) => {
                  const colonIdx = item.indexOf(': ');
                  const hasTitle = colonIdx > 0 && colonIdx < 40;
                  const title = hasTitle ? item.substring(0, colonIdx) : '';
                  const body = hasTitle ? item.substring(colonIdx + 2) : item;

                  return (
                    <div key={idx} className="flex items-start gap-2.5 text-xs leading-relaxed">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <div className="flex-1">
                        {hasTitle ? (
                          <>
                            <strong className={isLight ? 'text-gray-900' : 'text-gray-100'}>
                              {title}:{' '}
                            </strong>
                            <span className={isLight ? 'text-gray-600' : 'text-gray-300'}>
                              {body}
                            </span>
                          </>
                        ) : (
                          <span className={isLight ? 'text-gray-700' : 'text-gray-200'}>
                            {item}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Progress / Error Status */}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isDownloading && progress && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className={isLight ? 'text-gray-600' : 'text-gray-300'}>
                  {isSuccess ? 'Launching installer...' : 'Downloading update installer...'}
                </span>
                <span className="font-mono font-bold text-blue-500">
                  {progress.percent}%
                </span>
              </div>
              <div className={`w-full h-2 rounded-full overflow-hidden ${
                isLight ? 'bg-gray-200' : 'bg-gray-800'
              }`}>
                <div
                  className="h-full bg-blue-600 transition-all duration-150 rounded-full"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-gray-500 font-mono mt-0.5">
                <span>{formatBytes(progress.downloaded_bytes)}</span>
                {progress.total_bytes > 0 && (
                  <span>of {formatBytes(progress.total_bytes)}</span>
                )}
              </div>
            </div>
          )}

          {isSuccess && (
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-500 text-xs flex items-center gap-2">
              <CheckCircle2 size={16} className="flex-shrink-0" />
              <span>Download complete! Launching installer and closing coolSearch...</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2.5 pt-1">
            {!update.is_mandatory && !isDownloading && !isSuccess && (
              <button
                onClick={onClose}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all border ${
                  isLight
                    ? 'bg-white hover:bg-gray-50 border-gray-300 text-gray-700'
                    : 'bg-dark-surface/60 hover:bg-dark-surface border-gray-800 text-gray-300 hover:border-gray-700'
                }`}
              >
                Later
              </button>
            )}

            {!isDownloading && !isSuccess && (
              <button
                onClick={handleOpenBrowser}
                className={`p-2.5 rounded-xl border transition-all ${
                  isLight
                    ? 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    : 'border-gray-800 text-gray-400 hover:bg-white/5'
                }`}
                title="Open download page in browser"
              >
                <ExternalLink size={16} />
              </button>
            )}

            <button
              onClick={handleDownload}
              disabled={isDownloading || isSuccess}
              className={`flex-[2] py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md ${
                isDownloading || isSuccess
                  ? 'bg-blue-600/50 text-white/70 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white active:scale-98'
              }`}
            >
              {isDownloading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Downloading...</span>
                </>
              ) : isSuccess ? (
                <>
                  <CheckCircle2 size={15} />
                  <span>Installing...</span>
                </>
              ) : (
                <>
                  <Download size={15} />
                  <span>Download & Install Update</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
