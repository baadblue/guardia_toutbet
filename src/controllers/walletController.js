import { z } from "zod";
import { prisma } from "../services/prismaClient.js";
import { requestMeta, securityLogger } from "../services/logger.js";

const positiveAmount = z.coerce.number().positive();

export const walletAmountSchema = z.object({
  body: z.object({
    amount: positiveAmount,
  }),
});

function toNumber(value) {
  return Number(value);
}

export async function deposit(req, res) {
  const {
    body: { amount },
  } = req.validated;
  const currentUser = req.user;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const freshUser = await tx.user.findUnique({
        where: { id: currentUser.id },
      });
      if (!freshUser) {
        throw new Error("User not found");
      }

      const balanceBefore = toNumber(freshUser.balance);
      const balanceAfter = balanceBefore + amount;

      const updatedUser = await tx.user.update({
        where: { id: freshUser.id },
        data: { balance: balanceAfter },
      });

      const txRecord = await tx.transaction.create({
        data: {
          userId: freshUser.id,
          type: "DEPOSIT",
          amount,
          balanceAfter,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "WALLET_DEPOSIT",
          userId: freshUser.id,
          transactionId: txRecord.id,
          metadata: {
            amount,
            balanceBefore,
            balanceAfter,
          },
        },
      });

      return { updatedUser, txRecord, balanceBefore, balanceAfter };
    });

    securityLogger.info(
      requestMeta(req, {
        method: req.method,
        path: req.originalUrl,
        userId: currentUser.id,
        amount,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        transactionId: result.txRecord.id,
      }),
      "wallet_deposit_success"
    );

    return res.status(201).json({
      user: {
        id: result.updatedUser.id,
        balance: result.updatedUser.balance,
      },
      transaction: result.txRecord,
    });
  } catch (err) {
    securityLogger.error(
      requestMeta(req, {
        method: req.method,
        path: req.originalUrl,
        userId: currentUser?.id,
        amount,
        error: err?.message || String(err),
        stack: err?.stack,
      }),
      "wallet_deposit_failed"
    );

    return res.status(500).json({
      error: "La transaction n'a pas pu être finalisée. Veuillez réessayer.",
    });
  }
}

export async function withdraw(req, res) {
  const {
    body: { amount },
  } = req.validated;
  const currentUser = req.user;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const freshUser = await tx.user.findUnique({
        where: { id: currentUser.id },
      });
      if (!freshUser) {
        throw new Error("User not found");
      }

      const balanceBefore = toNumber(freshUser.balance);
      if (balanceBefore < amount) {
        return { insufficientBalance: true, balanceBefore };
      }

      const balanceAfter = balanceBefore - amount;
      const updatedUser = await tx.user.update({
        where: { id: freshUser.id },
        data: { balance: balanceAfter },
      });

      const txRecord = await tx.transaction.create({
        data: {
          userId: freshUser.id,
          type: "WITHDRAW",
          amount,
          balanceAfter,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "WALLET_WITHDRAW",
          userId: freshUser.id,
          transactionId: txRecord.id,
          metadata: {
            amount,
            balanceBefore,
            balanceAfter,
          },
        },
      });

      return { updatedUser, txRecord, balanceBefore, balanceAfter };
    });

    if (result.insufficientBalance) {
      securityLogger.warn(
        requestMeta(req, {
          method: req.method,
          path: req.originalUrl,
          userId: currentUser.id,
          amount,
          balanceBefore: result.balanceBefore,
        }),
        "wallet_withdraw_insufficient_balance"
      );
      return res.status(400).json({
        error: "Votre solde est insuffisant pour effectuer ce retrait.",
      });
    }

    securityLogger.info(
      requestMeta(req, {
        method: req.method,
        path: req.originalUrl,
        userId: currentUser.id,
        amount,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        transactionId: result.txRecord.id,
      }),
      "wallet_withdraw_success"
    );

    return res.status(201).json({
      user: {
        id: result.updatedUser.id,
        balance: result.updatedUser.balance,
      },
      transaction: result.txRecord,
    });
  } catch (err) {
    securityLogger.error(
      requestMeta(req, {
        method: req.method,
        path: req.originalUrl,
        userId: currentUser?.id,
        amount,
        error: err?.message || String(err),
        stack: err?.stack,
      }),
      "wallet_withdraw_failed"
    );

    return res.status(500).json({
      error: "La transaction n'a pas pu être finalisée. Veuillez réessayer.",
    });
  }
}
