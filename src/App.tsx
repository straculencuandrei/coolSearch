import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { UIMode, AppSettings, loadSettings, saveSettings } from "./types";
import { ModernUI } from "./components/ModernUI";
import { ClassicUI } from "./components/ClassicUI";
import { SettingsModal } from "./components/SettingsModal";
import "./App.css";

const fontMap: Record<string, string> = {
  ubuntu: "'Ubuntu', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  sfpro: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
  jetbrains: "'JetBrains Mono', Consolas, monospace",
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

function App() {
  const appWindow = getCurrentWindow();
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [availableDrives, setAvailableDrives] = useState<string[]>([]);

  // Reveal window once mounted to eliminate any white flash
  useEffect(() => {
    appWindow.show().catch(() => {});
  }, []);

  // Fetch available drives
  useEffect(() => {
    invoke<string[]>("get_available_drives")
      .then((drives) => {
        if (drives && Array.isArray(drives)) {
          setAvailableDrives(drives);
        }
      })
      .catch(() => {});
  }, []);

  // Dynamically apply Theme, Font, and Zoom Level across document
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    // Apply Theme
    const allThemes = [
      'theme-matte-dark',
      'theme-light',
      'theme-neon-blue',
      'theme-neon-red',
      'theme-neon-green'
    ];
    allThemes.forEach((t) => {
      root.classList.remove(t);
      body.classList.remove(t);
    });
    root.classList.add(`theme-${settings.theme}`);
    body.classList.add(`theme-${settings.theme}`);

    // Apply Font
    const allFonts = ['font-ubuntu', 'font-sfpro', 'font-jetbrains', 'font-system'];
    allFonts.forEach((f) => {
      root.classList.remove(f);
      body.classList.remove(f);
    });
    root.classList.add(`font-${settings.fontFamily}`);
    body.classList.add(`font-${settings.fontFamily}`);

    const resolvedFont = fontMap[settings.fontFamily] || fontMap.ubuntu;
    root.style.setProperty('--app-font', resolvedFont);
    body.style.setProperty('--app-font', resolvedFont);

    // Clear full-document canvas zoom to prevent top-left corner clipping
    (root.style as any).zoom = '';
    (body.style as any).zoom = '';
    const zoomVal = settings.zoomLevel || 1.0;
    root.style.setProperty('--content-zoom', String(zoomVal));
    body.style.setProperty('--content-zoom', String(zoomVal));
  }, [settings.theme, settings.fontFamily, settings.zoomLevel]);

  // VS Code-style Zoom Hotkeys: Ctrl+=, Ctrl+-, Ctrl+0, and Ctrl+MouseWheel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setSettings((prev) => {
            const current = prev.zoomLevel || 1.0;
            const next = Math.min(2.0, Math.round((current + 0.1) * 10) / 10);
            const updated = { ...prev, zoomLevel: next };
            saveSettings(updated);
            return updated;
          });
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setSettings((prev) => {
            const current = prev.zoomLevel || 1.0;
            const next = Math.max(0.7, Math.round((current - 0.1) * 10) / 10);
            const updated = { ...prev, zoomLevel: next };
            saveSettings(updated);
            return updated;
          });
        } else if (e.key === '0') {
          e.preventDefault();
          setSettings((prev) => {
            const updated = { ...prev, zoomLevel: 1.0 };
            saveSettings(updated);
            return updated;
          });
        }
      }

      // Block browser dev tools & reload shortcuts so app behaves 100% standalone
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
        (e.ctrlKey && (e.key === 'r' || e.key === 'R' || e.key === 'u' || e.key === 'U'))
      ) {
        e.preventDefault();
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.05 : -0.05;
        setSettings((prev) => {
          const current = prev.zoomLevel || 1.0;
          const next = Math.min(2.0, Math.max(0.7, Math.round((current + delta) * 100) / 100));
          const updated = { ...prev, zoomLevel: next };
          saveSettings(updated);
          return updated;
        });
      }
    };

    // Block default Chromium browser context menu (Inspect, Reload) globally across window & top bar
    const handleGlobalContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('contextmenu', handleGlobalContextMenu);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('contextmenu', handleGlobalContextMenu);
    };
  }, []);

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const handleSwitchUI = (target: UIMode) => {
    const updated = { ...settings, uiMode: target };
    setSettings(updated);
    saveSettings(updated);
  };

  const handleOpenSettingsModal = () => {
    setShowSettingsModal(true);
  };

  return (
    <div className={`w-full h-full theme-${settings.theme} font-${settings.fontFamily}`}>
      {settings.uiMode === "classic" ? (
        <ClassicUI
          settings={settings}
          onSwitchUI={handleSwitchUI}
          onOpenSettingsModal={handleOpenSettingsModal}
          availableDrives={availableDrives}
        />
      ) : (
        <ModernUI
          settings={settings}
          onSwitchUI={handleSwitchUI}
          onOpenSettingsModal={handleOpenSettingsModal}
          availableDrives={availableDrives}
        />
      )}

      {/* coolSearch Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        availableDrives={availableDrives}
      />
    </div>
  );
}

export default App;
