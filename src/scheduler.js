const MAX_INTERVAL_MINUTES = 60 * 24 * 180; // 180 days

function clampInterval(minutes) {
  return Math.max(1, Math.min(minutes, MAX_INTERVAL_MINUTES));
}

function getBaseIntervalMinutes(rating, settings) {
  const mode = settings.ratingMode || "3-tier";

  if (mode === "1-10") {
    const ratingNum = Number(rating);
    if (ratingNum === 1 || ratingNum === 2) {
      return Number(settings.rating1Minutes) || 5;
    }
    if (ratingNum === 3 || ratingNum === 4) {
      return Number(settings.rating2Minutes) || 15;
    }
    if (ratingNum === 5) {
      return (Number(settings.rating3Hours) || 1) * 60;
    }
    if (ratingNum === 6) {
      return (Number(settings.rating4Hours) || 4) * 60;
    }
    if (ratingNum === 7) {
      return (Number(settings.rating5Hours) || 12) * 60;
    }
    if (ratingNum === 8) {
      return (Number(settings.rating6Hours) || 24) * 60;
    }
    if (ratingNum === 9) {
      return (Number(settings.rating7Days) || 3) * 24 * 60;
    }
    if (ratingNum === 10) {
      return (Number(settings.rating8Days) || 7) * 24 * 60;
    }
  }

  // Default 3-tier mode
  if (rating === "bad") {
    return Number(settings.badMinutes) || 5;
  }

  if (rating === "medium") {
    return (Number(settings.mediumHours) || 6) * 60;
  }

  return (Number(settings.goodHours) || 24) * 60;
}

function getPreviousIntervalMinutes(cardProgress, settings) {
  if (!cardProgress?.intervalMinutes) {
    return (Number(settings.goodHours) || 24) * 60;
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

  const mode = settings.ratingMode || "3-tier";

  if (mode === "1-10") {
    const ratingNum = Number(rating);
    
    if (ratingNum <= 2) {
      // Very bad - reset
      nextIntervalMinutes = baseInterval;
      goodStreak = 0;
      mediumStreak = 0;
    } else if (ratingNum <= 4) {
      // Bad to okay - small growth
      mediumStreak = previousMediumStreak + 1;
      goodStreak = 0;
      const growthFactor = 1.3 + Math.min(mediumStreak * 0.05, 0.2);
      nextIntervalMinutes = Math.max(baseInterval, previousInterval * growthFactor);
    } else if (ratingNum <= 6) {
      // Medium - moderate growth
      mediumStreak = previousMediumStreak + 1;
      goodStreak = 0;
      const growthFactor = 1.6 + Math.min(mediumStreak * 0.08, 0.35);
      nextIntervalMinutes = Math.max(baseInterval, previousInterval * growthFactor);
    } else {
      // Good to excellent - strong growth
      goodStreak = previousGoodStreak + 1;
      mediumStreak = 0;
      const growthFactor = 2.0 + Math.min(goodStreak * 0.15, 0.8);
      nextIntervalMinutes = Math.max(baseInterval, previousInterval * growthFactor);
    }
  } else {
    // 3-tier mode
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