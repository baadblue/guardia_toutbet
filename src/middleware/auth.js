import jwt from "jsonwebtoken";
import { prisma } from "../services/prismaClient.js";
import { requestMeta, securityLogger } from "../services/logger.js";

const rawSecret = process.env.JWT_SECRET;
const isProd = process.env.NODE_ENV === "production";

if (!rawSecret && isProd) {
  throw new Error(
    "JWT_SECRET must be defined in production environment for token signing."
  );
}

const JWT_SECRET = rawSecret || "dev-insecure-secret-change-me";

export function generateToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

export async function authenticateJWT(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    securityLogger.warn(
      requestMeta(req, {
        method: req.method,
        path: req.originalUrl,
        status: 401,
      }),
      "auth_missing_or_invalid_header"
    );
    return res.status(401).json({
      error: "En-tête d’authentification manquant ou invalide.",
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      securityLogger.warn(
        requestMeta(req, {
          method: req.method,
          path: req.originalUrl,
          status: 401,
          userId: payload?.sub || null,
        }),
        "auth_user_no_longer_exists"
      );
      return res.status(401).json({
        error: "Ce compte n’existe plus.",
      });
    }
    req.user = user;
    next();
  } catch (err) {
    securityLogger.warn(
      requestMeta(req, {
        method: req.method,
        path: req.originalUrl,
        status: 401,
      }),
      "auth_invalid_or_expired_token"
    );
    return res.status(401).json({
      error: "Votre session a expiré ou le jeton est invalide.",
    });
  }
}

