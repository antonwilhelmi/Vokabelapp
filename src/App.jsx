import { useMemo, useState } from "react";
import "./App.css";
import { translations } from "./i18n";
import {
  clearProgress,
  loadProgress,
  loadSettings,
  saveProgress,
  saveSettings
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

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [progress, setProgress] = useState(loadProgress);

  const [selectedDeckId, setSelectedDeckId] = useState(
    decks.length > 0 ? decks[0].id : ""
  );

  const [selectedLecture, setSelectedLecture] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);

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

  const setMastery = useMemo(() => {
    if (activeCards.length === 0) {
      return 0;
    }

    const totalScore = activeCards.reduce((sum, card) => {
      return sum + getCardMastery(card.id, progress);
    }, 0);

    return Math.round(totalScore / activeCards.length);
  }, [activeCards, progress]);

  const filteredCards = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return activeCards.filter((card) => {
      const matchesLecture =
        selectedLecture === "all" || card.lecture === selectedLecture;

      const matchesCategory =
        selectedCategory === "all" || card.category === selectedCategory;

      const matchesDueSetting =
        !settings.onlyDue || isCardDue(card.id, progress);

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

      return (
        matchesLecture &&
        matchesCategory &&
        matchesDueSetting &&
        matchesSearch
      );
    });
  }, [
    activeCards,
    selectedLecture,
    selectedCategory,
    search,
    settings.onlyDue,
    progress
  ]);

  const safeCurrentIndex =
    filteredCards.length === 0
      ? 0
      : Math.min(currentIndex, filteredCards.length - 1);

  const currentCard = filteredCards[safeCurrentIndex] || null;

  const dueCount = activeCards.filter((card) =>
    isCardDue(card.id, progress)
  ).length;

  const reviewedCount = activeCards.filter(
    (card) => progress[card.id]?.reviewedCount > 0
  ).length;

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

  function resetCardView() {
    setCurrentIndex(0);
    setIsAnswerVisible(false);
  }

  function handleDeckChange(event) {
    setSelectedDeckId(event.target.value);
    setSelectedLecture("all");
    setSelectedCategory("all");
    setSearch("");
    resetCardView();
  }

  function updateSetting(key, value) {
    const updatedSettings = {
      ...settings,
      [key]: value
    };

    setSettings(updatedSettings);
    saveSettings(updatedSettings);
    resetCardView();
  }

  function goNext() {
    if (filteredCards.length === 0) return;

    setCurrentIndex((previousIndex) =>
      (previousIndex + 1) % filteredCards.length
    );

    setIsAnswerVisible(false);
  }

  function goPrevious() {
    if (filteredCards.length === 0) return;

    setCurrentIndex((previousIndex) =>
      (previousIndex - 1 + filteredCards.length) % filteredCards.length
    );

    setIsAnswerVisible(false);
  }

  function handleRating(rating) {
    if (!currentCard) return;

    const updatedProgress = rateCard(
      currentCard.id,
      rating,
      progress,
      settings
    );

    setProgress(updatedProgress);
    saveProgress(updatedProgress);
    goNext();
  }

  function handleIgnoreCard() {
    if (!currentCard) return;

    const updatedProgress = {
      ...progress,
      [currentCard.id]: {
        ...progress[currentCard.id],
        ignored: true,
        ignoredAt: Date.now()
      }
    };

    setProgress(updatedProgress);
    saveProgress(updatedProgress);
    goNext();
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
    resetCardView();
  }

  function handleResetProgress() {
    const confirmed = window.confirm(
      "Do you really want to reset all progress?"
    );

    if (!confirmed) return;

    clearProgress();
    setProgress({});
    resetCardView();
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
          <select
            value={selectedLecture}
            onChange={(event) => {
              setSelectedLecture(event.target.value);
              resetCardView();
            }}
          >
            {lectures.map((lecture) => (
              <option key={lecture} value={lecture}>
                {lecture === "all" ? t.all : lecture}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t.category}
          <select
            value={selectedCategory}
            onChange={(event) => {
              setSelectedCategory(event.target.value);
              resetCardView();
            }}
          >
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
            onChange={(event) => {
              setSearch(event.target.value);
              resetCardView();
            }}
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
              {filteredCards.length === 0 ? 0 : safeCurrentIndex + 1}/
              {filteredCards.length}
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
          <button onClick={goPrevious}>{t.previous}</button>

          <button
            className="primary"
            onClick={() => setIsAnswerVisible((visible) => !visible)}
            disabled={!currentCard}
          >
            {isAnswerVisible ? t.hideAnswer : t.showAnswer}
          </button>

          <button onClick={goNext}>{t.next}</button>
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