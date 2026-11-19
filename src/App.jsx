import { useCallback, useEffect, useState } from "react";
import MatchView from "./ui/MatchView.jsx";
import SettingsScreen from "./ui/SettingsScreen.jsx";
import { Menu, OpponentSelect, PracticeSetup } from "./ui/Screens.jsx";
import { loadSettings, saveSettings } from "./settings.js";
import { setAudioSettings } from "./audio.js";
import { theme } from "./ui/theme.js";

// Screen flow: menu -> (select -> battle) | (practiceSetup -> practice) | sprint | settings.
// Future campaign / hero-select screens slot in here as more `screen` values.
export default function App() {
  const [screen, setScreen] = useState("menu");
  const [settingsReturn, setSettingsReturn] = useState("menu");
  const [settings, setSettings] = useState(loadSettings);
  const [opponent, setOpponent] = useState(null);
  const [practice, setPractice] = useState({ gravity: 0.02, trainer: null });

  useEffect(() => {
    saveSettings(settings);
    setAudioSettings(settings.audio);
  }, [settings]);

  const toMenu = useCallback(() => setScreen("menu"), []);
  const openSettings = (from) => {
    setSettingsReturn(from);
    setScreen("settings");
  };

  let content;
  if (screen === "menu") {
    content = <Menu onSelect={(id) => (id === "settings" ? openSettings("menu") : setScreen(id === "battle" ? "select" : id === "practice" ? "practiceSetup" : id))} />;
  } else if (screen === "select") {
    content = <OpponentSelect onBack={toMenu} onPick={(p) => { setOpponent(p); setScreen("battle"); }} />;
  } else if (screen === "battle") {
    content = <MatchView key={opponent.id} mode="battle" profile={opponent} settings={settings} onExit={toMenu} onChangeOpponent={() => setScreen("select")} />;
  } else if (screen === "practiceSetup") {
    content = <PracticeSetup value={practice} onChange={setPractice} onStart={() => setScreen("practice")} onBack={toMenu} onSettings={() => openSettings("practiceSetup")} />;
  } else if (screen === "practice") {
    content = <MatchView mode="practice" practice={practice} settings={settings} onExit={toMenu} />;
  } else if (screen === "sprint") {
    content = <MatchView mode="sprint" settings={settings} onExit={toMenu} />;
  } else {
    content = <SettingsScreen settings={settings} onChange={setSettings} onBack={() => setScreen(settingsReturn)} />;
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: theme.appBg,
        color: "#fff",
        padding: 10,
        boxSizing: "border-box",
      }}
    >
      {content}
    </main>
  );
}
