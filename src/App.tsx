import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { UIMode, AppSettings, loadSettings, saveSettings } from "./types";
import { ModernUI } from "./components/ModernUI";
import { ClassicUI } from "./components/ClassicUI";
import { SettingsModal } from "./components/SettingsModal";
import "./App.css";

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
    <>
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
    </>
  );
}

export default App;
