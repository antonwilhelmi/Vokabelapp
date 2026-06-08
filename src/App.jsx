import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { translations } from "./i18n";
import {
  clearProgress,
  loadProgress,
  loadSettings,
  saveProgress,
  saveSettings,
  loadTimeTracking,
  saveTimeTracking
} from "./storage";
import { isCardDue, rateCard } from "./scheduler";

const deckModules = import.meta.glob("./data/*.json", {
  eager: true,
  import: "default"
});

function getText(value, language) {
  if (typeof value === "string") {
    return value;
  }

  return value?.[language] || value?.en || value?.de || "";
}

function getFileNameFromPath(path) {
  return path.split("/").pop().replace(".json", "");
}

function normalizeDeck(deck, path) {
  const fallbackId = getFileNameFromPath(path);

  return {
    id: deck.id || fallbackId,
    title: deck.title || {
      de: fallbackId,
      en: fallbackId
    },
    cards: Array.isArray(deck.cards) ? deck.cards : []
  };
}

const decks = Object.entries(deckModules)
  .map(([path, deck]) => normalizeDeck(deck, path))
  .filter((deck) => deck.cards.length > 0)
  .sort((a, b) =>
    getText(a.title, "en").localeCompare(getText(b.title, "en"))
  );

function AnswerContent({ text }) {
  const rawText = String(text || "");

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const looksLikeBulletList =
    lines.length > 1 &&
    lines.every(
      (line) =>
        line.startsWith("•") ||
        line.startsWith("-") ||
        line.startsWith("*")
    );

  if (looksLikeBulletList) {
    return (
      <ul className="answer-list">
        {lines.map((line, index) => (
          <li key={index}>{line.replace(/^[•\-*]\s*/, "")}</li>
        ))}
      </ul>
    );
  }

  return <p>{rawText}</p>;
}

function getRatingScoreFromValue(rating, ratingMode = "3-tier") {
  if (rating === undefined || rating === null) {
    return null;
  }

  if (ratingMode === "1-10") {
    const ratingNumber = Number(rating);

    if (!Number.isFinite(ratingNumber)) {
      return null;
    }

    return Math.max(0, Math.min(100, ratingNumber * 10));
  }

  const ratingScore = {
    bad: 20,
    medium: 60,
    good: 90
  };

  return ratingScore[rating] ?? null;
}

function getCardMastery(cardId, progress, ratingMode = "3-tier") {
  const cardProgress = progress[cardId];

  if (!cardProgress || cardProgress.ignored) {
    return 0;
  }

  const baseScore =
    getRatingScoreFromValue(cardProgress.lastRating, ratingMode) || 0;

  const reviewBonus = Math.min((cardProgress.reviewedCount || 0) * 3, 10);

  return Math.min(100, Math.round(baseScore + reviewBonus));
}

function getMasteryColor(score) {
  const safeScore = Math.max(0, Math.min(100, score));
  const hue = Math.round((safeScore / 100) * 120);

  return `hsl(${hue}, 78%, 42%)`;
}

function isIgnored(cardId, progress) {
  return Boolean(progress[cardId]?.ignored);
}

function isUnreviewed(cardId, progress) {
  return !progress[cardId] || (progress[cardId]?.reviewedCount || 0) === 0;
}

function getCardDueAt(cardId, progress) {
  const cardProgress = progress[cardId];

  if (!cardProgress) {
    return 0;
  }

  return cardProgress.dueAt || 0;
}

function getWeaknessScore(card, progress, ratingMode = "3-tier") {
  const cardProgress = progress[card.id];

  if (!cardProgress || !cardProgress.reviewedCount) {
    return -1;
  }

  const ratingScore = getRatingScoreFromValue(
    cardProgress.lastRating,
    ratingMode
  );

  const masteryScore = getCardMastery(card.id, progress, ratingMode);

  if (ratingScore === null) {
    return masteryScore;
  }

  return Math.min(ratingScore, masteryScore);
}

function sortCardsByNextDue(cards, progress) {
  return [...cards].sort((cardA, cardB) => {
    const dueA = getCardDueAt(cardA.id, progress);
    const dueB = getCardDueAt(cardB.id, progress);

    if (dueA !== dueB) {
      return dueA - dueB;
    }

    return cardA.id.localeCompare(cardB.id);
  });
}

function sortCardsByWeakness(cards, progress, ratingMode = "3-tier") {
  return [...cards].sort((cardA, cardB) => {
    const weaknessA = getWeaknessScore(cardA, progress, ratingMode);
    const weaknessB = getWeaknessScore(cardB, progress, ratingMode);

    if (weaknessA !== weaknessB) {
      return weaknessA - weaknessB;
    }

    const dueA = getCardDueAt(cardA.id, progress);
    const dueB = getCardDueAt(cardB.id, progress);

    if (dueA !== dueB) {
      return dueA - dueB;
    }

    const reviewedA = progress[cardA.id]?.reviewedCount || 0;
    const reviewedB = progress[cardB.id]?.reviewedCount || 0;

    if (reviewedA !== reviewedB) {
      return reviewedA - reviewedB;
    }

    return cardA.id.localeCompare(cardB.id);
  });
}

function buildReviewQueue(cards, progress, onlyDue, ratingMode = "3-tier") {
  const unviewedCards = cards.filter((card) => isUnreviewed(card.id, progress));

  if (unviewedCards.length > 0) {
    return unviewedCards;
  }

  const reviewedCards = cards.filter((card) => !isUnreviewed(card.id, progress));

  if (reviewedCards.length === 0) {
    return cards;
  }

  if (onlyDue) {
    const dueCards = reviewedCards.filter((card) =>
      isCardDue(card.id, progress)
    );

    if (dueCards.length > 0) {
      return sortCardsByWeakness(dueCards, progress, ratingMode);
    }
  }

  return sortCardsByWeakness(reviewedCards, progress, ratingMode);
}

function getNextCardIdFromQueue(queue, currentCardId) {
  if (queue.length === 0) {
    return null;
  }

  if (queue.length === 1) {
    return queue[0].id;
  }

  const nextDifferentCard = queue.find((card) => card.id !== currentCardId);

  return nextDifferentCard?.id || queue[0].id;
}

function formatInterval(minutes) {
  if (!minutes) {
    return null;
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  if (minutes < 60 * 24) {
    return `${Math.round(minutes / 60)} h`;
  }

  return `${Math.round(minutes / (60 * 24))} d`;
}

function formatTime(milliseconds) {
  if (!milliseconds || milliseconds < 0) {
    return "0m 0s";
  }

  const totalSeconds = Math.round(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function getLocalDateKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeTimeTracking(timeTracking) {
  const todayKey = getLocalDateKey();
  const storedDayKey = timeTracking?.dayKey || todayKey;

  return {
    totalTimeMs: Number(timeTracking?.totalTimeMs) || 0,
    todayTimeMs:
      storedDayKey === todayKey ? Number(timeTracking?.todayTimeMs) || 0 : 0,
    dayKey: todayKey,
    lastActivityAt: Number(timeTracking?.lastActivityAt) || null
  };
}

function copyTextFallback(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();

  try {
    document.execCommand("copy");
    return true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
}

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [progress, setProgress] = useState(loadProgress);
  const [timeTick, setTimeTick] = useState(Date.now());
  const [timeTracking, setTimeTracking] = useState(() =>
    normalizeTimeTracking(loadTimeTracking())
  );

  const [selectedDeckId, setSelectedDeckId] = useState(
    decks.length > 0 ? decks[0].id : ""
  );

  const [selectedLecture, setSelectedLecture] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [currentCardId, setCurrentCardId] = useState(null);
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);
  const [showStatsDashboard, setShowStatsDashboard] = useState(true);
  const [copyStatus, setCopyStatus] = useState("idle");

  const t = translations[settings.language] || translations.en;

  const selectedDeck =
    decks.find((deck) => deck.id === selectedDeckId) || decks[0] || null;

  const allCards = selectedDeck?.cards || [];

  const activeCards = useMemo(() => {
    return allCards.filter((card) => !isIgnored(card.id, progress));
  }, [allCards, progress]);

  const ignoredCount = allCards.length - activeCards.length;

  const lectures = useMemo(() => {
    return [
      "all",
      ...new Set(activeCards.map((card) => card.lecture).filter(Boolean))
    ];
  }, [activeCards]);

  const categories = useMemo(() => {
    return [
      "all",
      ...new Set(activeCards.map((card) => card.category).filter(Boolean))
    ];
  }, [activeCards]);

  const candidateCards = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return activeCards.filter((card) => {
      const matchesLecture =
        selectedLecture === "all" || card.lecture === selectedLecture;

      const matchesCategory =
        selectedCategory === "all" || card.category === selectedCategory;

      const searchableText = [
        card.id,
        card.lecture,
        card.category,
        getText(card.question, "en"),
        getText(card.question, "de"),
        getText(card.answer, "en"),
        getText(card.answer, "de")
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        normalizedSearch.length === 0 ||
        searchableText.includes(normalizedSearch);

      return matchesLecture && matchesCategory && matchesSearch;
    });
  }, [activeCards, selectedLecture, selectedCategory, search]);

  const reviewQueue = useMemo(() => {
    return buildReviewQueue(
      candidateCards,
      progress,
      settings.onlyDue,
      settings.ratingMode
    );
  }, [
    candidateCards,
    progress,
    settings.onlyDue,
    settings.ratingMode,
    timeTick
  ]);

  const currentCard =
    candidateCards.find((card) => card.id === currentCardId) ||
    reviewQueue[0] ||
    candidateCards[0] ||
    null;

  const displayCards =
    currentCard && reviewQueue.some((card) => card.id === currentCard.id)
      ? reviewQueue
      : candidateCards;

  const safeCurrentIndex = currentCard
    ? displayCards.findIndex((card) => card.id === currentCard.id)
    : -1;

  const dueCount = useMemo(() => {
    return activeCards.filter((card) => isCardDue(card.id, progress)).length;
  }, [activeCards, progress, timeTick]);

  const reviewedCount = activeCards.filter(
    (card) => progress[card.id]?.reviewedCount > 0
  ).length;

  const setMastery = useMemo(() => {
    if (activeCards.length === 0) {
      return 0;
    }

    const totalScore = activeCards.reduce((sum, card) => {
      return sum + getCardMastery(card.id, progress, settings.ratingMode);
    }, 0);

    return Math.round(totalScore / activeCards.length);
  }, [activeCards, progress, settings.ratingMode]);

  const currentQuestion = currentCard
    ? getText(currentCard.question, settings.language)
    : "";

  const currentAnswer = currentCard
    ? getText(currentCard.answer, settings.language)
    : "";

  const currentProgress = currentCard ? progress[currentCard.id] : null;

  const currentCardMastery = currentCard
    ? getCardMastery(currentCard.id, progress, settings.ratingMode)
    : 0;

  const currentIntervalText = formatInterval(currentProgress?.intervalMinutes);

  const stats = useMemo(() => {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const tomorrow = now + oneDayMs;
    const sevenDaysAhead = now + 7 * oneDayMs;

    const unviewedCards = activeCards.filter((card) =>
      isUnreviewed(card.id, progress)
    );

    const masteredCards = activeCards.filter((card) => {
      const rating = progress[card.id]?.lastRating;
      const mastery = getCardMastery(card.id, progress, settings.ratingMode);

      if (settings.ratingMode === "1-10") {
        return Number(rating) >= 8 && mastery >= 80;
      }

      return rating === "good" && mastery >= 80;
    });

    const dueToday = activeCards.filter((card) => {
      const due = getCardDueAt(card.id, progress);
      return due <= now && due > now - oneDayMs;
    });

    const dueTomorrow = activeCards.filter((card) => {
      const due = getCardDueAt(card.id, progress);
      return due > now && due <= tomorrow;
    });

    const dueIn7Days = activeCards.filter((card) => {
      const due = getCardDueAt(card.id, progress);
      return due > tomorrow && due <= sevenDaysAhead;
    });

    const ratingOrder =
      settings.ratingMode === "1-10"
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        : ["bad", "medium", "good"];

    const ratingCounts = Object.fromEntries(
      ratingOrder.map((rating) => [rating, 0])
    );

    activeCards.forEach((card) => {
      const rating = progress[card.id]?.lastRating;

      if (
        rating !== undefined &&
        rating !== null &&
        ratingCounts[rating] !== undefined
      ) {
        ratingCounts[rating] += 1;
      }
    });

    const ratingDistribution = ratingOrder.map((rating) => {
      const value = ratingCounts[rating] || 0;
      const score = getRatingScoreFromValue(rating, settings.ratingMode) || 0;

      return {
        label:
          settings.ratingMode === "1-10"
            ? String(rating)
            : String(rating).charAt(0).toUpperCase() + String(rating).slice(1),
        value,
        color: getMasteryColor(score)
      };
    });

    const maxRatingCount = Math.max(
      1,
      ...ratingDistribution.map((item) => item.value)
    );

    const categoryStats = {};

    activeCards.forEach((card) => {
      const category = card.category || "Uncategorized";
      const cardProgress = progress[card.id];
      const ratingScore = getRatingScoreFromValue(
        cardProgress?.lastRating,
        settings.ratingMode
      );

      if (!categoryStats[category]) {
        categoryStats[category] = {
          total: 0,
          reviewed: 0,
          ratingScoreSum: 0,
          ratingAverage: null,
          mastery: 0,
          reviewedShare: 0
        };
      }

      categoryStats[category].total += 1;

      if (cardProgress?.reviewedCount && ratingScore !== null) {
        categoryStats[category].reviewed += 1;
        categoryStats[category].ratingScoreSum += ratingScore;
      }
    });

    Object.keys(categoryStats).forEach((category) => {
      const data = categoryStats[category];

      data.ratingAverage =
        data.reviewed > 0
          ? Math.round(data.ratingScoreSum / data.reviewed)
          : null;

      data.mastery = data.ratingAverage ?? 0;
      data.reviewedShare = Math.round(
        (data.reviewed / Math.max(1, data.total)) * 100
      );
    });

    const weakestCategories = Object.entries(categoryStats)
      .filter(([, data]) => data.reviewed > 0)
      .sort((a, b) => {
        if (a[1].ratingAverage !== b[1].ratingAverage) {
          return a[1].ratingAverage - b[1].ratingAverage;
        }

        return b[1].reviewed - a[1].reviewed;
      })
      .slice(0, 3);

    const reviewedToday = activeCards.filter((card) => {
      const lastReviewed = progress[card.id]?.lastReviewedAt;
      return lastReviewed && lastReviewed > now - oneDayMs;
    });

    const reviewedTimestamps = activeCards
      .map((card) => progress[card.id]?.lastReviewedAt)
      .filter(Boolean);

    const totalReviews = activeCards.reduce(
      (sum, card) => sum + (progress[card.id]?.reviewedCount || 0),
      0
    );

    const firstReviewAt = reviewedTimestamps.length
      ? Math.min(...reviewedTimestamps)
      : now;

    const activeDays = Math.max(1, Math.ceil((now - firstReviewAt) / oneDayMs));
    const avgReviewsPerDay = Math.round(totalReviews / activeDays);

    const normalizedTracking = normalizeTimeTracking(timeTracking);
    const totalTimeMs = normalizedTracking.totalTimeMs;
    const todayTimeMs = normalizedTracking.todayTimeMs;

    const avgTimePerCardMs =
      totalReviews > 0 ? Math.round(totalTimeMs / totalReviews) : 0;

    return {
      totalCards: activeCards.length,
      unviewedCards: unviewedCards.length,
      masteredCards: masteredCards.length,
      dueToday: dueToday.length,
      dueTomorrow: dueTomorrow.length,
      dueIn7Days: dueIn7Days.length,
      ratingCounts,
      ratingDistribution,
      maxRatingCount,
      categoryStats,
      reviewedToday: reviewedToday.length,
      weakestCategories,
      avgReviewsPerDay,
      totalReviews,
      timeToday: formatTime(todayTimeMs),
      avgTimePerCard: formatTime(avgTimePerCardMs),
      totalTime: formatTime(totalTimeMs)
    };
  }, [activeCards, progress, timeTick, timeTracking, settings.ratingMode]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTimeTick(Date.now());
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const normalizedTracking = normalizeTimeTracking(timeTracking);

    if (normalizedTracking.dayKey !== timeTracking.dayKey) {
      setTimeTracking(normalizedTracking);
      saveTimeTracking(normalizedTracking);
    }
  }, [timeTick, timeTracking]);

  function registerLearningActivity() {
    const now = Date.now();
    const normalizedTracking = normalizeTimeTracking(timeTracking);
    const previousActivityAt = normalizedTracking.lastActivityAt;

    const maxCountedGapMs = 90 * 1000;
    const elapsedMs = previousActivityAt ? now - previousActivityAt : 0;

    const countedMs =
      elapsedMs > 0 && elapsedMs <= maxCountedGapMs ? elapsedMs : 0;

    const updatedTracking = {
      totalTimeMs: normalizedTracking.totalTimeMs + countedMs,
      todayTimeMs: normalizedTracking.todayTimeMs + countedMs,
      dayKey: getLocalDateKey(now),
      lastActivityAt: now
    };

    setTimeTracking(updatedTracking);
    saveTimeTracking(updatedTracking);
  }

  useEffect(() => {
    if (candidateCards.length === 0) {
      if (currentCardId !== null) {
        setCurrentCardId(null);
      }

      return;
    }

    const currentCardStillExists = candidateCards.some(
      (card) => card.id === currentCardId
    );

    if (!currentCardId || !currentCardStillExists) {
      setCurrentCardId(reviewQueue[0]?.id || candidateCards[0].id);
      setIsAnswerVisible(false);
    }
  }, [candidateCards, reviewQueue, currentCardId]);

  function updateSetting(key, value) {
    const updatedSettings = {
      ...settings,
      [key]: value
    };

    setSettings(updatedSettings);
    saveSettings(updatedSettings);
  }

  function handleDeckChange(event) {
    setSelectedDeckId(event.target.value);
    setSelectedLecture("all");
    setSelectedCategory("all");
    setSearch("");
    setCurrentCardId(null);
    setIsAnswerVisible(false);
  }

  function handleLectureChange(event) {
    setSelectedLecture(event.target.value);
    setCurrentCardId(null);
    setIsAnswerVisible(false);
  }

  function handleCategoryChange(event) {
    setSelectedCategory(event.target.value);
    setCurrentCardId(null);
    setIsAnswerVisible(false);
  }

  function handleSearchChange(event) {
    setSearch(event.target.value);
    setCurrentCardId(null);
    setIsAnswerVisible(false);
  }

  function getBestNavigationList() {
    if (reviewQueue.length > 0) {
      return reviewQueue;
    }

    return candidateCards;
  }

  function moveToNext(cards = getBestNavigationList(), shouldRegister = true) {
    if (cards.length === 0 || !currentCard) {
      return;
    }

    if (shouldRegister) {
      registerLearningActivity();
    }

    const currentPosition = cards.findIndex((card) => card.id === currentCard.id);

    const nextIndex =
      currentPosition === -1 ? 0 : (currentPosition + 1) % cards.length;

    setCurrentCardId(cards[nextIndex].id);
    setIsAnswerVisible(false);
  }

  function moveToPrevious(cards = getBestNavigationList(), shouldRegister = true) {
    if (cards.length === 0 || !currentCard) {
      return;
    }

    if (shouldRegister) {
      registerLearningActivity();
    }

    const currentPosition = cards.findIndex((card) => card.id === currentCard.id);

    const previousIndex =
      currentPosition === -1
        ? 0
        : (currentPosition - 1 + cards.length) % cards.length;

    setCurrentCardId(cards[previousIndex].id);
    setIsAnswerVisible(false);
  }

  useEffect(() => {
    function handleKeyDown(event) {
      const activeElement = document.activeElement;

      const isTyping =
        activeElement?.tagName === "INPUT" ||
        activeElement?.tagName === "TEXTAREA" ||
        activeElement?.tagName === "SELECT" ||
        activeElement?.isContentEditable;

      if (isTyping || event.repeat) {
        return;
      }

      if (event.code === "Space" || event.key === " ") {
        event.preventDefault();

        if (currentCard) {
          registerLearningActivity();
          setIsAnswerVisible((visible) => !visible);
        }

        return;
      }

      if (event.code === "ArrowRight") {
        event.preventDefault();
        moveToNext();
        return;
      }

      if (event.code === "ArrowLeft") {
        event.preventDefault();
        moveToPrevious();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentCard, candidateCards, reviewQueue, timeTracking]);

  function handleRating(rating) {
    if (!currentCard) {
      return;
    }

    registerLearningActivity();

    const updatedProgress = rateCard(
      currentCard.id,
      rating,
      progress,
      settings
    );

    setProgress(updatedProgress);
    saveProgress(updatedProgress);

    const updatedQueue = buildReviewQueue(
      candidateCards,
      updatedProgress,
      settings.onlyDue,
      settings.ratingMode
    );

    const nextCardId = getNextCardIdFromQueue(updatedQueue, currentCard.id);

    setCurrentCardId(nextCardId);
    setIsAnswerVisible(false);
  }

  async function handleCopyForChatty() {
    if (!currentCard) {
      return;
    }

    registerLearningActivity();

    const textToCopy = [
      "Erkläre mir diese Frage ausführlich.",
      "",
      "Frage:",
      currentQuestion,
      "",
      "Antwort:",
      currentAnswer
    ].join("\n");

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const copied = copyTextFallback(textToCopy);

        if (!copied) {
          throw new Error("Fallback copy failed");
        }
      }

      setCopyStatus("success");
      window.setTimeout(() => setCopyStatus("idle"), 1200);
    } catch {
      setCopyStatus("error");
      window.setTimeout(() => setCopyStatus("idle"), 1600);
    }
  }

  function handleIgnoreCard() {
    if (!currentCard) {
      return;
    }

    registerLearningActivity();

    const updatedProgress = {
      ...progress,
      [currentCard.id]: {
        ...progress[currentCard.id],
        ignored: true,
        ignoredAt: Date.now()
      }
    };

    const remainingCards = candidateCards.filter(
      (card) => card.id !== currentCard.id
    );

    const updatedQueue = buildReviewQueue(
      remainingCards,
      updatedProgress,
      settings.onlyDue,
      settings.ratingMode
    );

    setProgress(updatedProgress);
    saveProgress(updatedProgress);

    setCurrentCardId(updatedQueue[0]?.id || null);
    setIsAnswerVisible(false);
  }

  function handleRestoreIgnoredCards() {
    const updatedProgress = { ...progress };

    allCards.forEach((card) => {
      if (updatedProgress[card.id]?.ignored) {
        updatedProgress[card.id] = {
          ...updatedProgress[card.id],
          ignored: false,
          restoredAt: Date.now()
        };
      }
    });

    setProgress(updatedProgress);
    saveProgress(updatedProgress);
    setIsAnswerVisible(false);
  }

  function handleResetProgress() {
    const confirmed = window.confirm(
      "Do you really want to reset all progress?"
    );

    if (!confirmed) {
      return;
    }

    clearProgress();
    setProgress({});
    setIsAnswerVisible(false);
  }

  if (decks.length === 0) {
    return (
      <main className="app compact-app">
        <section className="panel card-panel">
          <h1>No decks found</h1>
          <p>
            Add at least one valid JSON deck file to <strong>src/data/</strong>.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="app compact-app">
      <header className="compact-header">
        <div>
          <p className="eyebrow">Study Tool</p>
          <h1>{t.appTitle}</h1>
        </div>

        <label className="language-select">
          {t.language}
          <select
            value={settings.language}
            onChange={(event) => updateSetting("language", event.target.value)}
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </label>
      </header>

      <section className="panel compact-controls">
        <label>
          {t.deck}
          <select value={selectedDeckId} onChange={handleDeckChange}>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {getText(deck.title, settings.language)}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t.lecture}
          <select value={selectedLecture} onChange={handleLectureChange}>
            {lectures.map((lecture) => (
              <option key={lecture} value={lecture}>
                {lecture === "all" ? t.all : lecture}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t.category}
          <select value={selectedCategory} onChange={handleCategoryChange}>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category === "all" ? t.all : category}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t.search}
          <input
            type="search"
            value={search}
            placeholder={t.searchPlaceholder}
            onChange={handleSearchChange}
          />
        </label>
      </section>

      <section className="panel set-progress-panel">
        <div className="set-progress-text">
          <strong>{t.mastery}</strong>
          <span>{setMastery}%</span>
        </div>

        <div className="progress-track">
          <div
            className="progress-fill"
            style={{
              width: `${setMastery}%`,
              backgroundColor: getMasteryColor(setMastery)
            }}
          />
        </div>

        <div className="compact-stats">
          <span>
            {t.currentCard}:{" "}
            <strong>
              {safeCurrentIndex === -1 ? 0 : safeCurrentIndex + 1}/
              {displayCards.length}
            </strong>
          </span>

          <span>
            {t.dueCards}: <strong>{dueCount}</strong>
          </span>

          <span>
            {t.reviewedCards}: <strong>{reviewedCount}</strong>
          </span>

          <span>
            {t.ignoredCards}: <strong>{ignoredCount}</strong>
          </span>
        </div>
      </section>

      <div className="main-content-wrapper">
        <section className="panel card-panel compact-card-panel">
          {currentCard ? (
            <>
              <div className="card-top-actions">
                <div className="card-strength">
                  <div
                    className="card-strength-dot"
                    style={{
                      backgroundColor: getMasteryColor(currentCardMastery)
                    }}
                  />
                  <span>{currentCardMastery}%</span>
                </div>

                <button
                  className="chatty-copy-button"
                  disabled={!currentCard}
                  onClick={handleCopyForChatty}
                  title={t.copyForChatty || "Für Chatty kopieren"}
                  aria-label={t.copyForChatty || "Für Chatty kopieren"}
                >
                  {copyStatus === "success"
                    ? "✓"
                    : copyStatus === "error"
                      ? "!"
                      : "⧉"}
                </button>

                <button
                  className="ignore-icon-button"
                  disabled={!currentCard}
                  onClick={handleIgnoreCard}
                  title={t.ignoreCard}
                  aria-label={t.ignoreCard}
                >
                  ⊘
                </button>
              </div>

              <div className="card-meta">
                <span>{currentCard.id}</span>
                <span>{currentCard.lecture}</span>
                <span>{currentCard.category}</span>
                <span>
                  {currentProgress?.lastRating
                    ? currentProgress.lastRating
                    : t.newCard}
                </span>

                {currentIntervalText && <span>{currentIntervalText}</span>}
              </div>

              <h2>{currentQuestion}</h2>

              {isAnswerVisible && (
                <div className="answer">
                  <h3>{t.answer}</h3>
                  <AnswerContent text={currentAnswer} />
                </div>
              )}
            </>
          ) : (
            <h2>{t.noCards}</h2>
          )}

          <div className="navigation compact-navigation">
            <button onClick={() => moveToPrevious()}>{t.previous}</button>

            <button
              className="primary"
              onClick={() => {
                registerLearningActivity();
                setIsAnswerVisible((visible) => !visible);
              }}
              disabled={!currentCard}
            >
              {isAnswerVisible ? t.hideAnswer : t.showAnswer}
            </button>

            <button onClick={() => moveToNext()}>{t.next}</button>
          </div>

          {settings.ratingMode === "1-10" ? (
            <div className="rating-scale-10">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
                <button
                  key={rating}
                  disabled={!isAnswerVisible || !currentCard}
                  onClick={() => handleRating(rating)}
                  style={{ backgroundColor: getMasteryColor(rating * 10) }}
                >
                  {rating}
                </button>
              ))}
            </div>
          ) : (
            <div className="ratings compact-ratings">
              <button
                className="bad"
                disabled={!isAnswerVisible || !currentCard}
                onClick={() => handleRating("bad")}
              >
                {t.bad}
              </button>

              <button
                className="medium"
                disabled={!isAnswerVisible || !currentCard}
                onClick={() => handleRating("medium")}
              >
                {t.medium}
              </button>

              <button
                className="good"
                disabled={!isAnswerVisible || !currentCard}
                onClick={() => handleRating("good")}
              >
                {t.good}
              </button>
            </div>
          )}
        </section>

        <div
          className={`stats-dashboard-wrapper ${
            showStatsDashboard ? "open" : "closed"
          }`}
        >
          <button
            className="stats-toggle-button"
            onClick={() => setShowStatsDashboard(!showStatsDashboard)}
            title={showStatsDashboard ? "Close stats" : "Open stats"}
          >
            {showStatsDashboard ? "▼ Stats" : "▲ Stats"}
          </button>

          {showStatsDashboard && (
            <section className="stats-dashboard">
              <div className="stats-section">
                <h3>Overview</h3>
                <div className="stats-grid">
                  <div className="stat-item">
                    <div className="stat-label">Total Cards</div>
                    <div className="stat-value">{stats.totalCards}</div>
                  </div>

                  <div className="stat-item">
                    <div className="stat-label">Unviewed</div>
                    <div className="stat-value">{stats.unviewedCards}</div>
                  </div>

                  <div className="stat-item">
                    <div className="stat-label">Mastered</div>
                    <div className="stat-value">{stats.masteredCards}</div>
                  </div>

                  <div className="stat-item">
                    <div className="stat-label">Due Today</div>
                    <div className="stat-value highlight-due">
                      {stats.dueToday}
                    </div>
                  </div>
                </div>
              </div>

              <div className="stats-section">
                <h3>Review Schedule</h3>
                <div className="stats-list">
                  <div className="stats-list-item">
                    <span>Tomorrow</span>
                    <strong>{stats.dueTomorrow}</strong>
                  </div>

                  <div className="stats-list-item">
                    <span>Next 7 Days</span>
                    <strong>{stats.dueIn7Days}</strong>
                  </div>
                </div>
              </div>

              <div className="stats-section">
                <h3>Rating Distribution</h3>
                <div className="rating-bar-chart">
                  {stats.ratingDistribution.map((item) => (
                    <div key={item.label} className="rating-bar-row">
                      <span className="rating-bar-label">{item.label}</span>

                      <div className="rating-bar-track">
                        <div
                          className="rating-bar-fill"
                          style={{
                            width:
                              item.value === 0
                                ? "0%"
                                : `${Math.max(
                                    4,
                                    (item.value / stats.maxRatingCount) * 100
                                  )}%`,
                            backgroundColor: item.color
                          }}
                        />
                      </div>

                      <strong className="rating-bar-value">{item.value}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="stats-section">
                <h3>Activity</h3>
                <div className="stats-list">
                  <div className="stats-list-item">
                    <span>Reviewed Today</span>
                    <strong>{stats.reviewedToday}</strong>
                  </div>

                  <div className="stats-list-item">
                    <span>Avg/Day</span>
                    <strong>{stats.avgReviewsPerDay}</strong>
                  </div>

                  <div className="stats-list-item">
                    <span>Total Reviews</span>
                    <strong>{stats.totalReviews}</strong>
                  </div>
                </div>
              </div>

              <div className="stats-section">
                <h3>Learning Time</h3>
                <div className="stats-list">
                  <div className="stats-list-item">
                    <span>Time Today</span>
                    <strong>{stats.timeToday}</strong>
                  </div>

                  <div className="stats-list-item">
                    <span>Avg/Review</span>
                    <strong>{stats.avgTimePerCard}</strong>
                  </div>

                  <div className="stats-list-item">
                    <span>Total Time</span>
                    <strong>{stats.totalTime}</strong>
                  </div>
                </div>
              </div>

              <div className="stats-section">
                <h3>Weakest Areas</h3>

                {stats.weakestCategories.length > 0 ? (
                  <div className="weakest-area-list">
                    {stats.weakestCategories.map(([category, data]) => (
                      <div key={category} className="weakest-area-card">
                        <div className="weakest-area-header">
                          <span className="weakest-area-title weakest-area-name">
                            {category}
                          </span>
                          <strong>{data.ratingAverage}%</strong>
                        </div>

                        <div className="weakest-area-track">
                          <div
                            className="weakest-area-fill"
                            style={{
                              width: `${data.ratingAverage}%`,
                              backgroundColor: getMasteryColor(
                                data.ratingAverage
                              )
                            }}
                          />
                        </div>

                        <div className="weakest-area-meta">
                          <span>
                            {data.reviewed}/{data.total} reviewed
                          </span>
                          <span>{data.reviewedShare}% coverage</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="stats-empty-text">
                    No reviewed categories yet.
                  </p>
                )}
              </div>

              {Object.keys(stats.categoryStats).length > 0 && (
                <details className="stats-section stats-details">
                  <summary>Category Breakdown</summary>

                  <div className="stats-list">
                    {Object.entries(stats.categoryStats).map(
                      ([category, data]) => (
                        <div key={category} className="stats-list-item">
                          <div className="category-info">
                            <span className="category-name">{category}</span>
                            <span className="category-count">
                              {data.reviewed}/{data.total}
                            </span>
                          </div>

                          <div className="category-mastery">
                            <div className="category-mastery-track">
                              <div
                                className="category-mastery-fill"
                                style={{
                                  width: `${data.mastery}%`,
                                  backgroundColor: getMasteryColor(data.mastery)
                                }}
                              />
                            </div>

                            <span className="category-mastery-text">
                              {data.reviewed > 0
                                ? `${data.mastery}%`
                                : "new"}
                            </span>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </details>
              )}
            </section>
          )}
        </div>
      </div>

      <details className="panel settings-menu">
        <summary>{t.settings}</summary>

        <div className="settings-grid compact-settings-grid">
          <label>
            {t.ratingMode}
            <select
              value={settings.ratingMode || "3-tier"}
              onChange={(event) =>
                updateSetting("ratingMode", event.target.value)
              }
            >
              <option value="3-tier">{t.ratingMode3Tier}</option>
              <option value="1-10">{t.ratingMode1To10}</option>
            </select>
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.onlyDue}
              onChange={(event) =>
                updateSetting("onlyDue", event.target.checked)
              }
            />
            {t.onlyDue}
          </label>

          <p className="automatic-intervals-note">
            {t.automaticIntervalsNote ||
              "Review intervals are calculated automatically."}
          </p>
        </div>

        <div className="settings-actions">
          <button onClick={handleRestoreIgnoredCards}>
            {t.restoreIgnored}
          </button>

          <button className="ghost-button" onClick={handleResetProgress}>
            {t.resetProgress}
          </button>
        </div>
      </details>
    </main>
  );
}