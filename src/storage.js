const PROGRESS_KEY = "vokabelapp_progress_v1";
const SETTINGS_KEY = "vokabelapp_settings_v1";
const TIME_TRACKING_KEY = "vokabelapp_time_tracking_v1";

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
    ratingMode: "3-tier",
    badMinutes: 5,
    mediumHours: 6,
    goodHours: 24,
    rating1Minutes: 5,
    rating2Minutes: 15,
    rating3Hours: 1,
    rating4Hours: 4,
    rating5Hours: 12,
    rating6Hours: 24,
    rating7Days: 3,
    rating8Days: 5,
    rating9Days: 7,
    rating10Days: 14,
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

function getLocalDateKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function loadTimeTracking() {
  const todayKey = getLocalDateKey();

  try {
    const raw = localStorage.getItem(TIME_TRACKING_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const storedDayKey = parsed.dayKey || todayKey;

    return {
      totalTimeMs: Number(parsed.totalTimeMs) || 0,
      todayTimeMs:
        storedDayKey === todayKey ? Number(parsed.todayTimeMs) || 0 : 0,
      dayKey: todayKey,
      lastActivityAt: Number(parsed.lastActivityAt) || null
    };
  } catch {
    return {
      totalTimeMs: 0,
      todayTimeMs: 0,
      dayKey: todayKey,
      lastActivityAt: null
    };
  }
}

export function saveTimeTracking(timeTracking) {
  localStorage.setItem(TIME_TRACKING_KEY, JSON.stringify(timeTracking));
}