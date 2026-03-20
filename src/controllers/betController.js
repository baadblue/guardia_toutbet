import { z } from "zod";
import { prisma } from "../services/prismaClient.js";
import { calculatePayouts } from "../services/payoutService.js";
import { appLogger, requestMeta, securityLogger } from "../services/logger.js";

const positiveDecimal = z.number().positive();
const betVisibilityEnum = z.enum(["PRIVATE", "PUBLIC"]);

function logEvent(loggerType, level, req, msg, fields = {}) {
  const logger = loggerType === "security" ? securityLogger : appLogger;
  logger[level](requestMeta(req, fields), msg);
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
    visibility: betVisibilityEnum,
    invitedEmails: z.array(z.string().email()).optional().default([]),
  }),
}).superRefine((data, ctx) => {
  const visibility = data.body.visibility;
  const invitedEmails = data.body.invitedEmails || [];
  if (visibility === "PRIVATE" && invitedEmails.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["body", "invitedEmails"],
      message: "invitedEmails is required for PRIVATE bets",
    });
  }
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
    winnerUserIds: z.array(z.string().uuid()).min(0),
  }),
});

export const betParticipantsSchema = z.object({
  params: z.object({
    betId: z.string().uuid(),
  }),
});

async function getParticipantsCount(betId) {
  const stakes = await prisma.transaction.findMany({
    where: {
      betId,
      type: "STAKE",
      userId: { not: null },
    },
    select: { userId: true },
  });

  return new Set(stakes.map((s) => s.userId)).size;
}

export async function listBets(req, res) {
  const currentUser = req.user;
  const email = currentUser.email.toLowerCase();

  try {
    const bets = await prisma.bet.findMany({
      where: {
        status: "OPEN",
        OR: [
          { visibility: "PUBLIC" },
          {
            visibility: "PRIVATE",
            invitations: { some: { email } },
          },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    const betsWithCounts = await Promise.all(
      bets.map(async (b) => ({
        id: b.id,
        title: b.title,
        minStake: b.minStake,
        status: b.status,
        visibility: b.visibility,
        participantsCount: await getParticipantsCount(b.id),
        createdAt: b.createdAt,
      }))
    );

    res.json(betsWithCounts);
  } catch (err) {
    logEvent("app", "error", req, "list_bets_error", {
      userId: currentUser?.id,
      method: req.method,
      path: req.originalUrl,
      error: err?.message || String(err),
      stack: err?.stack,
    });
    res.status(500).json({
      error: "Impossible de récupérer la liste des paris pour le moment. Veuillez réessayer.",
    });
  }
}

export async function listMyBets(req, res) {
  const currentUser = req.user;

  try {
    const bets = await prisma.bet.findMany({
      where: {
        bookieId: currentUser.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        invitations: true,
      },
    });

    res.json(
      bets.map((b) => ({
        id: b.id,
        title: b.title,
        minStake: b.minStake,
        status: b.status,
        createdAt: b.createdAt,
        invitedEmails: b.invitations.map((i) => i.email),
        bookieId: b.bookieId,
      }))
    );
  } catch (err) {
    logEvent("app", "error", req, "list_my_bets_error", {
      userId: currentUser?.id,
      method: req.method,
      path: req.originalUrl,
      error: err?.message || String(err),
      stack: err?.stack,
    });
    res.status(500).json({
      error: "Impossible de récupérer la liste de vos paris pour le moment. Veuillez réessayer.",
    });
  }
}

export async function listInvitedBets(req, res) {
  const currentUser = req.user;
  const email = currentUser.email.toLowerCase();

  try {
    const bets = await prisma.bet.findMany({
      where: {
        invitations: {
          some: {
            email: email,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        invitations: true,
      },
    });

    res.json(
      bets.map((b) => ({
        id: b.id,
        title: b.title,
        minStake: b.minStake,
        status: b.status,
        createdAt: b.createdAt,
        invitedEmails: b.invitations.map((i) => i.email),
        bookieId: b.bookieId,
      }))
    );
  } catch (err) {
    logEvent("app", "error", req, "list_invited_bets_error", {
      userId: currentUser?.id,
      method: req.method,
      path: req.originalUrl,
      error: err?.message || String(err),
      stack: err?.stack,
    });
    res.status(500).json({
      error: "Impossible de récupérer la liste des paris auxquels vous êtes invité. Veuillez réessayer.",
    });
  }
}

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
    body: { title, minStake, invitedEmails, visibility },
  } = req.validated;
  const currentUser = req.user;

  try {
    const bet = await prisma.bet.create({
      data: {
        title: sanitizeTitle(title),
        minStake,
        bookieId: currentUser.id,
        visibility,
      },
    });

    if (visibility === "PRIVATE" && invitedEmails.length > 0) {
      const normalizedEmails = Array.from(
        new Set(invitedEmails.map((e) => e.trim().toLowerCase()))
      );

      await prisma.betInvitation.createMany({
        data: normalizedEmails.map((email) => ({
          betId: bet.id,
          email,
        })),
      });
    }

    await logAudit({
      action: "BET_CREATED",
      userId: currentUser.id,
      betId: bet.id,
      transactionId: null,
      metadata: {
        title,
        minStake,
        visibility,
        invitedEmails,
      },
    });

    res.status(201).json(bet);
  } catch (err) {
    logEvent("app", "error", req, "create_bet_failed", {
      method: req.method,
      path: req.originalUrl,
      error: err?.message || String(err),
      stack: err?.stack,
      userId: currentUser?.id,
    });
    res.status(500).json({
      error: "Impossible de créer le pari pour le moment. Veuillez réessayer.",
    });
  }
}

export async function placeWager(req, res) {
  const {
    params: { betId },
    body: { amount },
  } = req.validated;
  const currentUser = req.user;

  try {
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: {
        invitations: true,
      },
    });

    if (!bet) {
      logEvent("app", "warn", req, "place_wager_bet_not_found", { betId, userId: currentUser?.id });
      return res.status(404).json({
        error: "Ce pari est introuvable. Vérifiez l’identifiant ou réessayez plus tard.",
      });
    }

    if (bet.status !== "OPEN") {
      logEvent("security", "warn", req, "place_wager_bet_not_open", {
        betId,
        userId: currentUser?.id,
        status: bet.status,
      });
      return res.status(400).json({
        error: "Ce pari n’est plus ouvert aux mises.",
      });
    }

    if (bet.visibility === "PUBLIC") {
      if (!currentUser.isVerified) {
        logEvent("security", "warn", req, "place_wager_public_account_not_verified", {
          betId,
          userId: currentUser?.id,
        });
        return res.status(403).json({ error: "Compte non vérifié" });
      }
    } else {
      const invitedEmails = bet.invitations.map((i) => i.email.toLowerCase());
      if (!invitedEmails.includes(currentUser.email.toLowerCase())) {
        logEvent("security", "warn", req, "place_wager_not_invited", {
          betId,
          userId: currentUser?.id,
        });
        return res.status(403).json({
          error: "Vous n’êtes pas autorisé à miser sur ce pari.",
        });
      }
    }

    if (amount <= 0) {
      logEvent("security", "warn", req, "place_wager_invalid_amount", {
        betId,
        userId: currentUser?.id,
        amount,
      });
      return res.status(400).json({
        error: "Le montant de la mise doit être strictement positif.",
      });
    }

    if (amount < Number(bet.minStake)) {
      logEvent("security", "warn", req, "place_wager_below_min_stake", {
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
      logEvent("security", "warn", req, "place_wager_insufficient_balance", {
        betId,
        userId: currentUser?.id,
      });
      return res.status(400).json({
        error: "Solde insuffisant pour placer cette mise.",
      });
    }

    logEvent("security", "info", req, "place_wager_success", {
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
    logEvent("security", "error", req, "place_wager_error", {
      betId,
      userId: currentUser?.id,
      method: req.method,
      path: req.originalUrl,
      error: err?.message || String(err),
      stack: err?.stack,
    });
    res.status(500).json({
      error: "Votre mise n’a pas pu être enregistrée. Veuillez réessayer.",
    });
  }
}

export async function closeBet(req, res) {
  const {
    params: { betId },
    body: { winnerUserIds },
  } = req.validated;
  const currentUser = req.user;

  try {
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
    });

    if (!bet) {
      logEvent("app", "warn", req, "close_bet_not_found", { betId, userId: currentUser?.id });
      return res.status(404).json({
        error: "Ce pari est introuvable. Vérifiez l’identifiant ou réessayez plus tard.",
      });
    }

    if (bet.bookieId !== currentUser.id) {
      logEvent("security", "warn", req, "close_bet_forbidden_not_bookie", {
        betId,
        userId: currentUser?.id,
      });
      return res.status(403).json({
        error: "Seul le créateur du pari peut le clôturer.",
      });
    }

    if (bet.status !== "OPEN") {
      logEvent("security", "warn", req, "close_bet_already_closed", {
        betId,
        userId: currentUser?.id,
        status: bet.status,
      });
      return res.status(400).json({
        error: "Ce pari est déjà clôturé.",
      });
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

      logEvent("security", "info", req, "close_bet_no_stakes", {
        betId,
        userId: currentUser?.id,
      });
      return res.json(updatedBet);
    }

    const { totalPot, commission, distributable, payoutsByUserId } =
      calculatePayouts(allStakes, winnerUserIds, 0.05);

    if (payoutsByUserId.size === 0) {
      logEvent("security", "warn", req, "close_bet_no_valid_winner_stakes", {
        betId,
        userId: currentUser?.id,
      });
      return res.status(400).json({
        error: "Aucune mise valide n’a été trouvée pour les gagnants sélectionnés.",
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

    logEvent("security", "info", req, "close_bet_success", {
      betId,
      userId: currentUser?.id,
      totalPot: result.totalPot,
      commission: result.commission,
      distributable: result.distributable,
      payoutCount: result.payoutResults?.length,
    });
    res.json(result);
  } catch (err) {
    logEvent("security", "error", req, "close_bet_error", {
      betId,
      userId: currentUser?.id,
      method: req.method,
      path: req.originalUrl,
      error: err?.message || String(err),
      stack: err?.stack,
    });
    res.status(500).json({
      error: "Impossible de clôturer ce pari pour le moment. Veuillez réessayer.",
    });
  }
}

export async function getBetParticipants(req, res) {
  const {
    params: { betId },
  } = req.validated;
  const currentUser = req.user;

  try {
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
    });

    if (!bet) {
      logEvent("app", "warn", req, "participants_bet_not_found", { betId, userId: currentUser?.id });
      return res.status(404).json({
        error: "Ce pari est introuvable. Vérifiez l’identifiant ou réessayez plus tard.",
      });
    }

    if (bet.bookieId !== currentUser.id) {
      logEvent("security", "warn", req, "participants_forbidden_not_bookie", {
        betId,
        userId: currentUser?.id,
      });
      return res.status(403).json({
        error: "Seul le créateur du pari peut voir les participants.",
      });
    }

    const stakes = await prisma.transaction.findMany({
      where: {
        betId,
        type: "STAKE",
      },
      include: {
        user: true,
      },
    });

    const byUser = new Map();

    for (const s of stakes) {
      if (!s.user) continue;
      const existing = byUser.get(s.userId) || {
        userId: s.userId,
        email: s.user.email,
        totalStake: 0,
      };
      const amount = Number(s.amount);
      existing.totalStake += isNaN(amount) ? 0 : amount;
      byUser.set(s.userId, existing);
    }

    const participants = Array.from(byUser.values()).sort((a, b) =>
      a.email.localeCompare(b.email)
    );

    logEvent("security", "info", req, "participants_list_success", {
      betId,
      userId: currentUser?.id,
      count: participants.length,
    });

    res.json({ betId, participants });
  } catch (err) {
    logEvent("security", "error", req, "participants_list_error", {
      betId,
      userId: currentUser?.id,
      method: req.method,
      path: req.originalUrl,
      error: err?.message || String(err),
      stack: err?.stack,
    });
    res.status(500).json({
      error: "Impossible de charger la liste des participants pour le moment. Veuillez réessayer.",
    });
  }
}


