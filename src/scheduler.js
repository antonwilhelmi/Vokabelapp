const MAX_INTERVAL_MINUTES = 60 * 24 * 180; // 180 days

const FIXED_INTERVALS = {
  threeTier: {
    badMinutes: 5,
    mediumMinutes: 6 * 60,
    goodMinutes: 24 * 60
  },
  tenPoint: {
    1: 5,
    2: 5,
    3: 15,
    4: 15,
    5: 60,
    6: 4 * 60,
    7: 12 * 60,
    8: 24 * 60,
    9: 3 * 24 * 60,
    10: 7 * 24 * 60
  }
};

function clampInterval(minutes) {
  return Math.max(1, Math.min(minutes, MAX_INTERVAL_MINUTES));
}

function getBaseIntervalMinutes(rating, settings = {}) {
  const mode = settings.ratingMode || "3-tier";

  if (mode === "1-10") {
    const ratingNumber = Math.max(1, Math.min(10, Number(rating) || 1));
    return FIXED_INTERVALS.tenPoint[ratingNumber] || FIXED_INTERVALS.tenPoint[1];
  }

  if (rating === "bad") {
    return FIXED_INTERVALS.threeTier.badMinutes;
  }

  if (rating === "medium") {
    return FIXED_INTERVALS.threeTier.mediumMinutes;
  }

  return FIXED_INTERVALS.threeTier.goodMinutes;
}

function getPreviousIntervalMinutes(cardProgress) {
  if (!cardProgress?.intervalMinutes) {
    return FIXED_INTERVALS.threeTier.goodMinutes;
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

export function calculateNextReviewState(rating, previousProgress, settings = {}) {
  const now = Date.now();
  const previousInterval = getPreviousIntervalMinutes(previousProgress);
  const baseInterval = getBaseIntervalMinutes(rating, settings);

  const previousGoodStreak = previousProgress?.goodStreak || 0;
  const previousMediumStreak = previousProgress?.mediumStreak || 0;

  let nextIntervalMinutes;
  let goodStreak;
  let mediumStreak;

  const mode = settings.ratingMode || "3-tier";

  if (mode === "1-10") {
    const ratingNumber = Number(rating) || 1;

    if (ratingNumber <= 2) {
      nextIntervalMinutes = baseInterval;
      goodStreak = 0;
      mediumStreak = 0;
    } else if (ratingNumber <= 4) {
      mediumStreak = previousMediumStreak + 1;
      goodStreak = 0;

      const growthFactor = 1.3 + Math.min(mediumStreak * 0.05, 0.2);
      nextIntervalMinutes = Math.max(baseInterval, previousInterval * growthFactor);
    } else if (ratingNumber <= 6) {
      mediumStreak = previousMediumStreak + 1;
      goodStreak = 0;

      const growthFactor = 1.6 + Math.min(mediumStreak * 0.08, 0.35);
      nextIntervalMinutes = Math.max(baseInterval, previousInterval * growthFactor);
    } else {
      goodStreak = previousGoodStreak + 1;
      mediumStreak = 0;

      const growthFactor = 2.0 + Math.min(goodStreak * 0.15, 0.8);
      nextIntervalMinutes = Math.max(baseInterval, previousInterval * growthFactor);
    }
  } else if (rating === "bad") {
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