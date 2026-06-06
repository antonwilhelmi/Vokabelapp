const PROGRESS_KEY = "vokabelapp_progress_v1";
const SETTINGS_KEY = "vokabelapp_settings_v1";

export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveProgress(progress) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function clearProgress() {
  localStorage.removeItem(PROGRESS_KEY);
}

export function loadSettings() {
  const defaults = {
    language: "de",
    badMinutes: 5,
    mediumHours: 6,
    goodHours: 24,
    onlyDue: false
  };

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}