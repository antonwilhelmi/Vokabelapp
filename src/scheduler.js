export function isCardDue(cardId, progress) {
  const cardProgress = progress[cardId];

  if (!cardProgress) {
    return true;
  }

  return cardProgress.dueAt <= Date.now();
}

export function calculateNextDueAt(rating, settings) {
  const now = Date.now();

  if (rating === "bad") {
    return now + settings.badMinutes * 60 * 1000;
  }

  if (rating === "medium") {
    return now + settings.mediumHours * 60 * 60 * 1000;
  }

  return now + settings.goodHours * 60 * 60 * 1000;
}

export function rateCard(cardId, rating, progress, settings) {
  const previousProgress = progress[cardId] || {
    reviewedCount: 0,
    lastRating: null,
    lastReviewedAt: null,
    dueAt: 0
  };

  return {
    ...progress,
    [cardId]: {
      reviewedCount: previousProgress.reviewedCount + 1,
      lastRating: rating,
      lastReviewedAt: Date.now(),
      dueAt: calculateNextDueAt(rating, settings)
    }
  };
}