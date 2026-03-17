import { z } from "zod";
import { prisma } from "../services/prismaClient.js";
import { calculatePayouts } from "../services/payoutService.js";

const positiveDecimal = z.number().positive();

function logEvent(level, msg, fields) {
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  fn(
    JSON.stringify({
      level,
      msg,
      ...fields,
    })
  );
}

function sanitizeTitle(rawTitle) {
  const withoutControl = rawTitle.replace(/[\u0000-\u001F\u007F]/g, "");
  const withoutTags = withoutControl.replace(/<[^>]*>/g, "");
  return withoutTags.trim().replace(/\s+/g, " ");
}

export const createBetSchema = z.object({
  body: z.object({
    title: z.string().min(3).max(200),
    minStake: positiveDecimal,
    invitedEmails: z.array(z.string().email()).min(1),
  }),
});

export const placeWagerSchema = z.object({
  params: z.object({
    betId: z.string().uuid(),
  }),
  body: z.object({
    amount: positiveDecimal,
  }),
});

export const closeBetSchema = z.object({
  params: z.object({
    betId: z.string().uuid(),
  }),
  body: z.object({
    winnerUserIds: z.array(z.string().uuid()).min(1),
  }),
});

async function logAudit({ action, userId, betId, transactionId, metadata }) {
  await prisma.auditLog.create({
    data: {
      action,
      userId: userId ?? null,
      betId: betId ?? null,
      transactionId: transactionId ?? null,
      metadata,
    },
  });
}

export async function createBet(req, res) {
  const {
    body: { title, minStake, invitedEmails },
  } = req.validated;
  const currentUser = req.user;

  try {
    const bet = await prisma.bet.create({
      data: {
        title: sanitizeTitle(title),
        minStake,
        bookieId: currentUser.id,
      },
    });

    const normalizedEmails = Array.from(
      new Set(invitedEmails.map((e) => e.trim().toLowerCase()))
    );

    await prisma.betInvitation.createMany({
      data: normalizedEmails.map((email) => ({
        betId: bet.id,
        email,
      })),
    });

    await logAudit({
      action: "BET_CREATED",
      userId: currentUser.id,
      betId: bet.id,
      transactionId: null,
      metadata: {
        title,
        minStake,
        invitedEmails: normalizedEmails,
      },
    });

    res.status(201).json(bet);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to create bet" });
  }
}

export async function placeWager(req, res) {
  const {
    params: { betId },
    body: { amount },
  } = req.validated;
  const currentUser = req.user;
  const requestId = req.requestId;

  try {
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: {
        invitations: true,
      },
    });

    if (!bet) {
      logEvent("warn", "place_wager_bet_not_found", { requestId, betId, userId: currentUser?.id });
      return res.status(404).json({ error: "Bet not found" });
    }

    if (bet.status !== "OPEN") {
      logEvent("info", "place_wager_bet_not_open", {
        requestId,
        betId,
        userId: currentUser?.id,
        status: bet.status,
      });
      return res.status(400).json({ error: "Bet is not open for wagers" });
    }

    const invitedEmails = bet.invitations.map((i) => i.email.toLowerCase());
    if (!invitedEmails.includes(currentUser.email.toLowerCase())) {
      logEvent("info", "place_wager_not_invited", { requestId, betId, userId: currentUser?.id });
      return res.status(403).json({
        error: "You are not invited to this bet",
      });
    }

    if (amount <= 0) {
      logEvent("info", "place_wager_invalid_amount", {
        requestId,
        betId,
        userId: currentUser?.id,
        amount,
      });
      return res.status(400).json({
        error: "Le montant de la mise doit être strictement positif.",
      });
    }

    if (amount < Number(bet.minStake)) {
      logEvent("info", "place_wager_below_min_stake", {
        requestId,
        betId,
        userId: currentUser?.id,
        amount,
        minStake: bet.minStake,
      });
      return res.status(400).json({
        error: "Le montant de la mise est inférieur à la mise minimale requise.",
        minStake: bet.minStake,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const freshUser = await tx.user.findUnique({
        where: { id: currentUser.id },
      });
      if (!freshUser) {
        throw new Error("User not found");
      }

      const currentBalance = Number(freshUser.balance);
      if (currentBalance < amount) {
        return { insufficient: true, currentBalance };
      }

      const newBalance = currentBalance - amount;

      const updatedUser = await tx.user.update({
        where: { id: currentUser.id },
        data: { balance: newBalance },
      });

      const txRecord = await tx.transaction.create({
        data: {
          userId: currentUser.id,
          betId: betId,
          type: "STAKE",
          amount,
          balanceAfter: newBalance,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "WAGER_PLACED",
          userId: currentUser.id,
          betId: betId,
          transactionId: txRecord.id,
          metadata: {
            amount,
            balanceBefore: currentBalance,
            balanceAfter: newBalance,
          },
        },
      });

      return { updatedUser, txRecord, currentBalance };
    });

    if (result.insufficient) {
      logEvent("info", "place_wager_insufficient_balance", {
        requestId,
        betId,
        userId: currentUser?.id,
      });
      return res.status(400).json({
        error: "Solde insuffisant pour placer cette mise.",
      });
    }

    logEvent("info", "place_wager_success", {
      requestId,
      betId,
      userId: currentUser?.id,
      transactionId: result.txRecord?.id,
      amount,
    });
    res.status(201).json({
      user: {
        id: result.updatedUser.id,
        balance: result.updatedUser.balance,
      },
      transaction: result.txRecord,
    });
  } catch (err) {
    logEvent("error", "place_wager_error", {
      requestId,
      betId,
      userId: currentUser?.id,
      error: err?.message || String(err),
      stack: err?.stack,
    });
    res.status(500).json({ error: "Unable to place wager" });
  }
}

export async function closeBet(req, res) {
  const {
    params: { betId },
    body: { winnerUserIds },
  } = req.validated;
  const currentUser = req.user;
  const requestId = req.requestId;

  try {
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
    });

    if (!bet) {
      logEvent("warn", "close_bet_not_found", { requestId, betId, userId: currentUser?.id });
      return res.status(404).json({ error: "Bet not found" });
    }

    if (bet.bookieId !== currentUser.id) {
      logEvent("info", "close_bet_forbidden_not_bookie", {
        requestId,
        betId,
        userId: currentUser?.id,
      });
      return res.status(403).json({ error: "Only the bookie can close this bet" });
    }

    if (bet.status !== "OPEN") {
      logEvent("info", "close_bet_already_closed", {
        requestId,
        betId,
        userId: currentUser?.id,
        status: bet.status,
      });
      return res.status(400).json({ error: "Bet is already closed" });
    }

    const allStakes = await prisma.transaction.findMany({
      where: {
        betId: betId,
        type: "STAKE",
      },
    });

    if (allStakes.length === 0) {
      const updatedBet = await prisma.bet.update({
        where: { id: betId },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
        },
      });

      await logAudit({
        action: "BET_CLOSED_NO_STAKES",
        userId: currentUser.id,
        betId: betId,
        transactionId: null,
        metadata: {},
      });

      logEvent("info", "close_bet_no_stakes", { requestId, betId, userId: currentUser?.id });
      return res.json(updatedBet);
    }

    const { totalPot, commission, distributable, payoutsByUserId } =
      calculatePayouts(allStakes, winnerUserIds, 0.05);

    if (payoutsByUserId.size === 0) {
      logEvent("info", "close_bet_no_valid_winner_stakes", {
        requestId,
        betId,
        userId: currentUser?.id,
      });
      return res.status(400).json({
        error: "Aucune mise valide trouvée pour les gagnants fournis.",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedBet = await tx.bet.update({
        where: { id: betId },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
        },
      });

      const commissionTx = await tx.transaction.create({
        data: {
          type: "COMMISSION",
          amount: commission,
          betId: betId,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "COMMISSION_TAKEN",
          betId: betId,
          transactionId: commissionTx.id,
          metadata: {
            commission,
            totalPot,
          },
        },
      });

      const payoutResults = [];

      for (const [userId, payoutAmount] of payoutsByUserId.entries()) {
        const user = await tx.user.findUnique({
          where: { id: userId },
        });
        if (!user) continue;

        const currentBalance = Number(user.balance);
        const newBalance = currentBalance + payoutAmount;

        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: { balance: newBalance },
        });

        const payoutTx = await tx.transaction.create({
          data: {
            userId: user.id,
            betId: betId,
            type: "PAYOUT",
            amount: payoutAmount,
            balanceAfter: newBalance,
          },
        });

        await tx.auditLog.create({
          data: {
            action: "PAYOUT_ISSUED",
            userId: user.id,
            betId: betId,
            transactionId: payoutTx.id,
            metadata: {
              payoutAmount,
              balanceBefore: currentBalance,
              balanceAfter: newBalance,
            },
          },
        });

        payoutResults.push({
          userId: user.id,
          payoutAmount,
        });
      }

      await tx.auditLog.create({
        data: {
          action: "BET_CLOSED",
          userId: currentUser.id,
          betId: betId,
          metadata: {
            totalPot,
            commission,
            distributable,
            winnerUserIds,
          },
        },
      });

      return { updatedBet, payoutResults, totalPot, commission, distributable };
    });

    logEvent("info", "close_bet_success", {
      requestId,
      betId,
      userId: currentUser?.id,
      totalPot: result.totalPot,
      commission: result.commission,
      distributable: result.distributable,
      payoutCount: result.payoutResults?.length,
    });
    res.json(result);
  } catch (err) {
    logEvent("error", "close_bet_error", {
      requestId,
      betId,
      userId: currentUser?.id,
      error: err?.message || String(err),
      stack: err?.stack,
    });
    res.status(500).json({ error: "Unable to close bet" });
  }
}

