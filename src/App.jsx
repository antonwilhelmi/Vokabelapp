import { useMemo, useState } from "react";
import imlDeck from "./data/imlDeck.json";
import { translations } from "./i18n";
import {
  clearProgress,
  loadProgress,
  loadSettings,
  saveProgress,
  saveSettings
} from "./storage";
import { isCardDue, rateCard } from "./scheduler";

const decks = [imlDeck];

function getText(value, language) {
  if (typeof value === "string") {
    return value;
  }

  return value?.[language] || value?.en || value?.de || "";
}

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [progress, setProgress] = useState(loadProgress);
  const [selectedDeckId, setSelectedDeckId] = useState(decks[0].id);
  const [selectedLecture, setSelectedLecture] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);

  const t = translations[settings.language];
  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) || decks[0];

  const lectures = useMemo(() => {
    return ["all", ...new Set(selectedDeck.cards.map((card) => card.lecture))];
  }, [selectedDeck]);

  const categories = useMemo(() => {
    return ["all", ...new Set(selectedDeck.cards.map((card) => card.category))];
  }, [selectedDeck]);

  const filteredCards = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return selectedDeck.cards.filter((card) => {
      const matchesLecture =
        selectedLecture === "all" || card.lecture === selectedLecture;

      const matchesCategory =
        selectedCategory === "all" || card.category === selectedCategory;

      const matchesDueSetting =
        !settings.onlyDue || isCardDue(card.id, progress);

      const questionText =
        getText(card.question, "en") + " " + getText(card.question, "de");

      const answerText =
        getText(card.answer, "en") + " " + getText(card.answer, "de");

      const searchableText = [
        questionText,
        answerText,
        card.lecture,
        card.category,
        card.id
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
    selectedDeck,
    selectedLecture,
    selectedCategory,
    search,
    settings.onlyDue,
    progress
  ]);

  const currentCard = filteredCards[currentIndex] || null;

  const dueCount = selectedDeck.cards.filter((card) =>
    isCardDue(card.id, progress)
  ).length;

  const reviewedCount = selectedDeck.cards.filter(
    (card) => progress[card.id]?.reviewedCount > 0
  ).length;

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

  function handleLectureChange(event) {
    setSelectedLecture(event.target.value);
    resetCardView();
  }

  function handleCategoryChange(event) {
    setSelectedCategory(event.target.value);
    resetCardView();
  }

  function handleSearchChange(event) {
    setSearch(event.target.value);
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

  function updateSetting(key, value) {
    const updatedSettings = {
      ...settings,
      [key]: value
    };

    setSettings(updatedSettings);
    saveSettings(updatedSettings);
    resetCardView();
  }

  function handleResetProgress() {
    const confirmed = window.confirm(
      settings.language === "de"
        ? "Do you really want to reset all progress?"
        : "Do you really want to reset all progress?"
    );

    if (!confirmed) return;

    clearProgress();
    setProgress({});
    resetCardView();
  }

  const currentQuestion = currentCard
    ? getText(currentCard.question, settings.language)
    : "";

  const currentAnswer = currentCard
    ? getText(currentCard.answer, settings.language)
    : "";

  const currentProgress = currentCard ? progress[currentCard.id] : null;

  return (
    <main className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">IML Study Tool</p>
          <h1>{t.appTitle}</h1>
          <p>{t.appSubtitle}</p>
        </div>

        <div className="header-actions">
          <label>
            {t.language}
            <select
              value={settings.language}
              onChange={(event) =>
                updateSetting("language", event.target.value)
              }
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </label>

          <button className="ghost-button" onClick={handleResetProgress}>
            {t.resetProgress}
          </button>
        </div>
      </header>

      <section className="panel filters">
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

      <section className="stats">
        <Stat
          label={t.currentCard}
          value={`${filteredCards.length === 0 ? 0 : currentIndex + 1} / ${
            filteredCards.length
          }`}
        />
        <Stat label={t.dueCards} value={dueCount} />
        <Stat label={t.reviewedCards} value={reviewedCount} />
      </section>

      <section className="panel card-panel">
        {currentCard ? (
          <>
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
                <p>{currentAnswer}</p>
              </div>
            )}
          </>
        ) : (
          <h2>{t.noCards}</h2>
        )}

        <div className="navigation">
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

        <div className="ratings">
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

      <section className="panel settings">
        <div className="settings-title">
          <h2>{t.settings}</h2>
          <p>{t.intervals}</p>
        </div>

        <div className="settings-grid">
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
      </section>
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <article className="stat-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}