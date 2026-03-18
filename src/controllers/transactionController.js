import { prisma } from "../services/prismaClient.js";
import { appLogger, requestMeta } from "../services/logger.js";

export async function listUserTransactions(req, res) {
  const currentUser = req.user;

  const rawLimit = Number(req.query.limit ?? 10);
  const rawOffset = Number(req.query.offset ?? 0);

  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 10;
  const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

  try {
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          userId: currentUser.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
        skip: offset,
      }),
      prisma.transaction.count({
        where: { userId: currentUser.id },
      }),
    ]);

    res.json({
      total,
      limit,
      offset,
      transactions,
    });
  } catch (err) {
    appLogger.error(
      requestMeta(req, {
        method: req.method,
        path: req.originalUrl,
        userId: currentUser?.id,
        error: err?.message || String(err),
        stack: err?.stack,
      }),
      "list_user_transactions_error"
    );
    res.status(500).json({
      error: "Impossible de récupérer l’historique de vos transactions pour le moment. Veuillez réessayer.",
    });
  }
}

