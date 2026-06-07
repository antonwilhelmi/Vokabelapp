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

function getCardMastery(cardId, progress) {
  const cardProgress = progress[cardId];

  if (!cardProgress || cardProgress.ignored) {
    return 0;
  }

  const ratingScore = {
    bad: 20,
    medium: 60,
    good: 90
  };

  const baseScore = ratingScore[cardProgress.lastRating] || 0;
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

function getCardDueAt(cardId, progress) {
  const cardProgress = progress[cardId];

  if (!cardProgress) {
    return 0;
  }

  return cardProgress.dueAt || 0;
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

function buildReviewQueue(cards, progress, onlyDue) {
  // Priority 1: Cards never reviewed (not seen before)
  const unviewedCards = cards.filter((card) => {
    const cardProgress = progress[card.id];
    return !cardProgress || (cardProgress.reviewedCount || 0) === 0;
  });

  if (unviewedCards.length > 0) {
    return unviewedCards;
  }

  // Priority 2: Cards that are currently due
  const dueCards = sortCardsByNextDue(
    cards.filter((card) => isCardDue(card.id, progress)),
    progress
  );

  if (dueCards.length > 0) {
    return dueCards;
  }

  // Priority 3: Cards with worst rating, sorted by due date
  const ratingPriority = {
    bad: 0,
    medium: 1,
    good: 2
  };

  const cardsWithRating = cards.map((card) => {
    const cardProgress = progress[card.id];
    const rating = cardProgress?.lastRating || "bad";
    return {
      card,
      ratingLevel: ratingPriority[rating],
      dueAt: getCardDueAt(card.id, progress)
    };
  });

  return cardsWithRating
    .sort((a, b) => {
      // First sort by rating (worst first)
      if (a.ratingLevel !== b.ratingLevel) {
        return a.ratingLevel - b.ratingLevel;
      }
      // Then sort by due date
      return a.dueAt - b.dueAt;
    })
    .map((item) => item.card);
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

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [progress, setProgress] = useState(loadProgress);
  const [timeTick, setTimeTick] = useState(Date.now());
  const [timeTracking, setTimeTracking] = useState(loadTimeTracking);
  const [sessionActive, setSessionActive] = useState(true);

  const [selectedDeckId, setSelectedDeckId] = useState(
    decks.length > 0 ? decks[0].id : ""
  );

  const [selectedLecture, setSelectedLecture] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [currentCardId, setCurrentCardId] = useState(null);
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);
  const [showStatsDashboard, setShowStatsDashboard] = useState(true);

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
    return buildReviewQueue(candidateCards, progress, settings.onlyDue);
  }, [candidateCards, progress, settings.onlyDue, timeTick]);

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
      return sum + getCardMastery(card.id, progress);
    }, 0);

    return Math.round(totalScore / activeCards.length);
  }, [activeCards, progress]);

  const currentQuestion = currentCard
    ? getText(currentCard.question, settings.language)
    : "";

  const currentAnswer = currentCard
    ? getText(currentCard.answer, settings.language)
    : "";

  const currentProgress = currentCard ? progress[currentCard.id] : null;

  const currentCardMastery = currentCard
    ? getCardMastery(currentCard.id, progress)
    : 0;

  const currentIntervalText = formatInterval(currentProgress?.intervalMinutes);

  // Statistics Calculations
  const stats = useMemo(() => {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Tomorrow and future dates
    const tomorrow = now + oneDayMs;
    const sevenDaysAhead = now + 7 * oneDayMs;
    const thirtyDaysAhead = now + 30 * oneDayMs;

    // Card categorization
    const unviewedCards = activeCards.filter(
      (card) => !progress[card.id]?.reviewedCount
    );
    const masteredCards = activeCards.filter(
      (card) =>
        progress[card.id]?.lastRating === "good" &&
        getCardMastery(card.id, progress) >= 80
    );
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

    // Rating distribution
    const ratingCounts = {
      good: 0,
      medium: 0,
      bad: 0
    };
    activeCards.forEach((card) => {
      const rating = progress[card.id]?.lastRating;
      if (rating) {
        ratingCounts[rating]++;
      }
    });

    // Category breakdown
    const categoryStats = {};
    activeCards.forEach((card) => {
      const cat = card.category || "Uncategorized";
      if (!categoryStats[cat]) {
        categoryStats[cat] = {
          total: 0,
          mastery: 0,
          reviewed: 0
        };
      }
      categoryStats[cat].total++;
      categoryStats[cat].mastery += getCardMastery(card.id, progress);
      if (progress[card.id]?.reviewedCount) {
        categoryStats[cat].reviewed++;
      }
    });

    Object.keys(categoryStats).forEach((cat) => {
      categoryStats[cat].mastery = Math.round(
        categoryStats[cat].mastery / categoryStats[cat].total
      );
    });

    // Learning activity: today
    const reviewedToday = activeCards.filter((card) => {
      const lastReviewed = progress[card.id]?.lastReviewedAt;
      return (
        lastReviewed &&
        lastReviewed > now - oneDayMs
      );
    });

    // Weakest categories (lowest mastery)
    const weakestCategories = Object.entries(categoryStats)
      .sort((a, b) => a[1].mastery - b[1].mastery)
      .slice(0, 3);

    // Average reviews per day (based on reviewedCount as proxy)
    const totalReviews = activeCards.reduce(
      (sum, card) => sum + (progress[card.id]?.reviewedCount || 0),
      0
    );
    const avgReviewsPerDay = Math.round(totalReviews / Math.max(1, reviewedCount));

    // Time tracking calculations
    const INACTIVITY_THRESHOLD = 2 * 60 * 1000; // 2 minutes
    const now_ms = Date.now();
    const timeSinceLastActivity = now_ms - timeTracking.lastActivityAt;
    const isCurrentlyActive = timeSinceLastActivity < INACTIVITY_THRESHOLD;

    let effectiveSessionTime = timeTracking.sessionTimeMs;
    if (isCurrentlyActive && sessionActive) {
      effectiveSessionTime += timeSinceLastActivity;
    }

    const totalTimeMs = timeTracking.totalTimeMs + (isCurrentlyActive ? timeSinceLastActivity : 0);

    // Average time per card
    const avgTimePerCardMs = reviewedCount > 0 ? Math.round(totalTimeMs / reviewedCount) : 0;

    return {
      totalCards: activeCards.length,
      unviewedCards: unviewedCards.length,
      masteredCards: masteredCards.length,
      dueToday: dueToday.length,
      dueTomorrow: dueTomorrow.length,
      dueIn7Days: dueIn7Days.length,
      ratingCounts,
      categoryStats,
      reviewedToday: reviewedToday.length,
      weakestCategories,
      avgReviewsPerDay,
      totalReviews,
      timeToday: formatTime(effectiveSessionTime),
      avgTimePerCard: formatTime(avgTimePerCardMs),
      totalTime: formatTime(totalTimeMs)
    };
  }, [activeCards, progress, timeTick, timeTracking, sessionActive]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTimeTick(Date.now());
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  // Time tracking effect
  useEffect(() => {
    const INACTIVITY_THRESHOLD = 2 * 60 * 1000; // 2 minutes
    const now = Date.now();
    const timeSinceLastActivity = now - timeTracking.lastActivityAt;

    if (timeSinceLastActivity > INACTIVITY_THRESHOLD && sessionActive) {
      setSessionActive(false);
      const updatedTracking = {
        totalTimeMs: timeTracking.totalTimeMs + timeTracking.sessionTimeMs,
        sessionTimeMs: 0,
        lastActivityAt: now
      };
      setTimeTracking(updatedTracking);
      saveTimeTracking(updatedTracking);
    } else if (timeSinceLastActivity <= INACTIVITY_THRESHOLD && !sessionActive) {
      setSessionActive(true);
      const updatedTracking = {
        ...timeTracking,
        lastActivityAt: now
      };
      setTimeTracking(updatedTracking);
    }
  }, [timeTick, timeTracking, sessionActive]);

  // Update activity on user interaction
  const updateActivity = () => {
    if (sessionActive) {
      const updatedTracking = {
        ...timeTracking,
        lastActivityAt: Date.now()
      };
      setTimeTracking(updatedTracking);
    }
  };

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

  function moveToNext(cards = getBestNavigationList()) {
    if (cards.length === 0 || !currentCard) {
      return;
    }

    updateActivity();

    const currentPosition = cards.findIndex((card) => card.id === currentCard.id);

    const nextIndex =
      currentPosition === -1 ? 0 : (currentPosition + 1) % cards.length;

    setCurrentCardId(cards[nextIndex].id);
    setIsAnswerVisible(false);
  }

  function moveToPrevious(cards = getBestNavigationList()) {
    if (cards.length === 0 || !currentCard) {
      return;
    }

    updateActivity();

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

      if (isTyping) {
        return;
      }

      if (event.repeat) {
        return;
      }

      updateActivity();

      if (event.code === "Space" || event.key === " ") {
        event.preventDefault();

        if (currentCard) {
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
  }, [currentCard, candidateCards, reviewQueue]);

  function handleRating(rating) {
    if (!currentCard) {
      return;
    }

    updateActivity();

    const updatedProgress = rateCard(
      currentCard.id,
      rating,
      progress,
      settings
    );

    setProgress(updatedProgress);
    saveProgress(updatedProgress);

    if (settings.onlyDue) {
      const updatedQueue = buildReviewQueue(
        candidateCards,
        updatedProgress,
        true
      );

      setCurrentCardId(updatedQueue[0]?.id || null);
      setIsAnswerVisible(false);
      return;
    }

    moveToNext(candidateCards);
  }

  function handleIgnoreCard() {
    if (!currentCard) {
      return;
    }

    updateActivity();

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
      settings.onlyDue
    );

    setProgress(updatedProgress);
    saveProgress(updatedProgress);

    if (updatedQueue.length > 0) {
      setCurrentCardId(updatedQueue[0].id);
    } else {
      setCurrentCardId(null);
    }

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
                updateActivity();
                setIsAnswerVisible((visible) => !visible);
              }}
              disabled={!currentCard}
            >
              {isAnswerVisible ? t.hideAnswer : t.showAnswer}
            </button>

            <button onClick={() => moveToNext()}>{t.next}</button>
          </div>

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
        </section>

        <div className={`stats-dashboard-wrapper ${showStatsDashboard ? "open" : "closed"}`}>
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
                    <div className="stat-value highlight-due">{stats.dueToday}</div>
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
                <div className="stats-list">
                  <div className="stats-list-item">
                    <span className="rating-badge good">Good</span>
                    <strong>{stats.ratingCounts.good}</strong>
                  </div>
                  <div className="stats-list-item">
                    <span className="rating-badge medium">Medium</span>
                    <strong>{stats.ratingCounts.medium}</strong>
                  </div>
                  <div className="stats-list-item">
                    <span className="rating-badge bad">Bad</span>
                    <strong>{stats.ratingCounts.bad}</strong>
                  </div>
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
                    <span>Avg/Day (All Time)</span>
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
                    <span>Avg/Card</span>
                    <strong>{stats.avgTimePerCard}</strong>
                  </div>
                  <div className="stats-list-item">
                    <span>Total Time</span>
                    <strong>{stats.totalTime}</strong>
                  </div>
                </div>
              </div>

              {stats.weakestCategories.length > 0 && (
                <div className="stats-section">
                  <h3>Weakest Areas</h3>
                  <div className="stats-list">
                    {stats.weakestCategories.map(([category, data]) => (
                      <div key={category} className="stats-list-item">
                        <span>{category}</span>
                        <div className="mastery-mini-bar">
                          <div
                            className="mastery-mini-fill"
                            style={{
                              width: `${data.mastery}%`,
                              backgroundColor: getMasteryColor(data.mastery)
                            }}
                          />
                          <span className="mastery-mini-text">{data.mastery}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(stats.categoryStats).length > 0 && (
                <details className="stats-section stats-details">
                  <summary>Category Breakdown</summary>
                  <div className="stats-list">
                    {Object.entries(stats.categoryStats).map(([category, data]) => (
                      <div key={category} className="stats-list-item">
                        <div className="category-info">
                          <span className="category-name">{category}</span>
                          <span className="category-count">
                            {data.reviewed}/{data.total}
                          </span>
                        </div>
                        <div className="mastery-mini-bar">
                          <div
                            className="mastery-mini-fill"
                            style={{
                              width: `${data.mastery}%`,
                              backgroundColor: getMasteryColor(data.mastery)
                            }}
                          />
                          <span className="mastery-mini-text">{data.mastery}%</span>
                        </div>
                      </div>
                    ))}
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
            {t.badInterval}
            <input
              type="number"
              min="1"
              value={settings.badMinutes}
              onChange={(event) =>
                updateSetting("badMinutes", Number(event.target.value))
              }
            />
          </label>

          <label>
            {t.mediumInterval}
            <input
              type="number"
              min="1"
              value={settings.mediumHours}
              onChange={(event) =>
                updateSetting("mediumHours", Number(event.target.value))
              }
            />
          </label>

          <label>
            {t.goodInterval}
            <input
              type="number"
              min="1"
              value={settings.goodHours}
              onChange={(event) =>
                updateSetting("goodHours", Number(event.target.value))
              }
            />
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