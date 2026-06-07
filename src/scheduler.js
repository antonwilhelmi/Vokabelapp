const MAX_INTERVAL_MINUTES = 60 * 24 * 180; // 180 days

function clampInterval(minutes) {
  return Math.max(1, Math.min(minutes, MAX_INTERVAL_MINUTES));
}

function getBaseIntervalMinutes(rating, settings) {
  if (rating === "bad") {
    return settings.badMinutes;
  }

  if (rating === "medium") {
    return settings.mediumHours * 60;
  }

  return settings.goodHours * 60;
}

function getPreviousIntervalMinutes(cardProgress, settings) {
  if (!cardProgress?.intervalMinutes) {
    return settings.goodHours * 60;
  }

  return cardProgress.intervalMinutes;
}

export function isCardDue(cardId, progress) {
  const cardProgress = progress[cardId];

  if (!cardProgress) {
    return true;
  }

  if (cardProgress.ignored) {
    return false;
  }

  return cardProgress.dueAt <= Date.now();
}

export function calculateNextReviewState(rating, previousProgress, settings) {
  const now = Date.now();
  const previousInterval = getPreviousIntervalMinutes(previousProgress, settings);
  const baseInterval = getBaseIntervalMinutes(rating, settings);

  const previousGoodStreak = previousProgress?.goodStreak || 0;
  const previousMediumStreak = previousProgress?.mediumStreak || 0;

  let nextIntervalMinutes;
  let goodStreak;
  let mediumStreak;

  if (rating === "bad") {
    nextIntervalMinutes = baseInterval;
    goodStreak = 0;
    mediumStreak = 0;
  } else if (rating === "medium") {
    mediumStreak = previousMediumStreak + 1;
    goodStreak = 0;

    const growthFactor = 1.55 + Math.min(mediumStreak * 0.08, 0.45);
    nextIntervalMinutes = Math.max(baseInterval, previousInterval * growthFactor);
  } else {
    goodStreak = previousGoodStreak + 1;
    mediumStreak = 0;

    const growthFactor = 2.25 + Math.min(goodStreak * 0.15, 0.75);
    nextIntervalMinutes = Math.max(baseInterval, previousInterval * growthFactor);
  }

  const roundedIntervalMinutes = Math.round(clampInterval(nextIntervalMinutes));

  return {
    intervalMinutes: roundedIntervalMinutes,
    dueAt: now + roundedIntervalMinutes * 60 * 1000,
    goodStreak,
    mediumStreak
  };
}

export function rateCard(cardId, rating, progress, settings) {
  const previousProgress = progress[cardId] || {
    reviewedCount: 0,
    lastRating: null,
    lastReviewedAt: null,
    dueAt: 0,
    intervalMinutes: null,
    goodStreak: 0,
    mediumStreak: 0,
    ignored: false
  };

  const nextReviewState = calculateNextReviewState(
    rating,
    previousProgress,
    settings
  );

  return {
    ...progress,
    [cardId]: {
      ...previousProgress,
      reviewedCount: previousProgress.reviewedCount + 1,
      lastRating: rating,
      lastReviewedAt: Date.now(),
      ignored: false,
      ...nextReviewState
    }
  };
}