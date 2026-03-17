export function calculatePayouts(stakes, winnerUserIds, commissionRate = 0.05) {
  const winnerSet = new Set(winnerUserIds);
  const validStakes = stakes.filter((t) => t.userId && winnerSet.has(t.userId));

  const totalPot = stakes.reduce((sum, t) => sum + Number(t.amount), 0);
  const commission = Number((totalPot * commissionRate).toFixed(2));
  const distributable = totalPot - commission;

  if (distributable <= 0 || validStakes.length === 0) {
    return {
      totalPot,
      commission,
      distributable,
      payoutsByUserId: new Map(),
    };
  }

  const totalWinnerStake = validStakes.reduce(
    (sum, t) => sum + Number(t.amount),
    0
  );

  const payoutsByUserId = new Map();

  for (const stake of validStakes) {
    const proportion = Number(stake.amount) / totalWinnerStake;
    const payoutAmount = Number((distributable * proportion).toFixed(2));
    const key = stake.userId;
    payoutsByUserId.set(key, (payoutsByUserId.get(key) || 0) + payoutAmount);
  }

  return {
    totalPot,
    commission,
    distributable,
    payoutsByUserId,
  };
}

