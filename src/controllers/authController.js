import { z } from "zod";
import argon2 from "argon2";
import { prisma } from "../services/prismaClient.js";
import { generateToken } from "../middleware/auth.js";
import { appLogger, requestMeta, securityLogger } from "../services/logger.js";

const passwordSchema = z
  .string()
  .min(8)
  .regex(/\d/, "Le mot de passe doit contenir au moins un chiffre.");

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    name: z.string().min(1),
    password: passwordSchema,
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
});

export async function register(req, res) {
  const {
    body: { email, name, password },
  } = req.validated;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res
        .status(400)
        .json({ error: "Un compte existe déjà avec cette adresse email." });
    }

    const passwordHash = await argon2.hash(password);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        balance: 0,
      },
    });

    const token = generateToken(user);

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        balance: user.balance,
      },
    });
  } catch (err) {
    appLogger.error(
      requestMeta(req, {
        method: req.method,
        path: req.originalUrl,
        error: err?.message || String(err),
        stack: err?.stack,
      }),
      "register_failed"
    );
    return res.status(500).json({
      error:
        "Une erreur est survenue lors de la création du compte. Veuillez réessayer.",
    });
  }
}

export async function login(req, res) {
  const {
    body: { email, password },
  } = req.validated;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      securityLogger.warn(
        requestMeta(req, {
          method: req.method,
          path: req.originalUrl,
          status: 401,
          attemptedEmail: email,
        }),
        "login_failed_invalid_credentials"
      );
      return res
        .status(401)
        .json({ error: "Identifiants invalides. Veuillez réessayer." });
    }

    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      securityLogger.warn(
        requestMeta(req, {
          method: req.method,
          path: req.originalUrl,
          status: 401,
          userId: user.id,
          attemptedEmail: email,
        }),
        "login_failed_invalid_credentials"
      );
      return res
        .status(401)
        .json({ error: "Identifiants invalides. Veuillez réessayer." });
    }

    const token = generateToken(user);

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        balance: user.balance,
      },
    });
  } catch (err) {
    appLogger.error(
      requestMeta(req, {
        method: req.method,
        path: req.originalUrl,
        error: err?.message || String(err),
        stack: err?.stack,
      }),
      "login_failed_internal_error"
    );
    return res.status(500).json({
      error:
        "Une erreur est survenue lors de la connexion. Veuillez réessayer.",
    });
  }
}

export async function me(req, res) {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "Utilisateur non authentifié." });
  }

  return res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    balance: user.balance,
  });
}

