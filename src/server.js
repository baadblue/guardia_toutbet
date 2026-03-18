import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import http from "http";
import https from "https";
import express from "express";
import cors from "cors";
import crypto from "crypto";

import { prisma } from "./services/prismaClient.js";
import { authRouter } from "./routes/auth.js";
import { betsRouter } from "./routes/bets.js";
import { walletRouter } from "./routes/wallet.js";
import { transactionsRouter } from "./routes/transactions.js";
import {
  appLogger,
  requestMeta,
  resolveClientIp,
  securityLogger,
} from "./services/logger.js";

const app = express();

const configuredAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (configuredAllowedOrigins.includes("*")) {
  throw new Error("CORS_ALLOWED_ORIGINS cannot contain '*'");
}

const allowedOrigins = new Set(configuredAllowedOrigins);
if (allowedOrigins.size === 0) {
  appLogger.warn(
    {
      userId: null,
      ip: "0.0.0.0",
    },
    "CORS_ALLOWED_ORIGINS is empty: browser origins will be blocked except requests without Origin header"
  );
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Autorise les appels serveur-à-serveur (curl, Postman) sans header Origin.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS origin not allowed"));
    },
  })
);
app.use(express.json({ limit: "100kb" }));

app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  req.clientIp = resolveClientIp(req);
  res.setHeader("X-Request-Id", requestId);

  const startNs = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number((process.hrtime.bigint() - startNs) / 1000000n);
    appLogger.info(
      requestMeta(req, {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms,
      }),
      "http_request"
    );

    if (res.statusCode === 401 || res.statusCode === 403) {
      securityLogger.warn(
        requestMeta(req, {
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
        }),
        "unauthorized_access"
      );
    }
  });

  next();
});

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  } catch (e) {
    res.status(500).json({
      status: "error",
      error: "La base de données est momentanément indisponible. Veuillez réessayer.",
    });
  }
});

app.use("/auth", authRouter);
app.use("/bets", betsRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/transactions", transactionsRouter);

const PORT = Number(process.env.PORT || 4000);
const HTTPS_KEY_PATH = process.env.HTTPS_KEY_PATH;
const HTTPS_CERT_PATH = process.env.HTTPS_CERT_PATH;

// Middleware global de gestion des erreurs
// Doit être enregistré après les routes
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.message?.startsWith("CORS ")) {
    securityLogger.warn(
      requestMeta(req, {
        method: req.method,
        path: req.originalUrl,
        status: 403,
      }),
      "cors_origin_blocked"
    );
    return res.status(403).json({
      error: "Cette origine n’est pas autorisée à appeler cette API.",
    });
  }

  appLogger.error(
    requestMeta(req, {
      method: req.method,
      path: req.originalUrl,
      error: err?.message || String(err),
      stack: err?.stack,
    }),
    "unhandled_error"
  );
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({
    error:
      "Une erreur interne est survenue. Veuillez réessayer ou contacter le support si le problème persiste.",
  });
});

function startServer() {
  if (HTTPS_KEY_PATH && HTTPS_CERT_PATH) {
    try {
      const key = fs.readFileSync(HTTPS_KEY_PATH);
      const cert = fs.readFileSync(HTTPS_CERT_PATH);

      https.createServer({ key, cert }, app).listen(PORT, () => {
        appLogger.info(
          { userId: null, ip: "0.0.0.0", port: PORT },
          `ToutBet API listening securely on https://localhost:${PORT}`
        );
      });
      return;
    } catch (err) {
      appLogger.error(
        {
          userId: null,
          ip: "0.0.0.0",
          error: err?.message || String(err),
          stack: err?.stack,
        },
        "Failed to start HTTPS server, falling back to HTTP"
      );
    }
  }

  http.createServer(app).listen(PORT, () => {
    appLogger.info(
      { userId: null, ip: "0.0.0.0", port: PORT },
      `ToutBet API listening on http://localhost:${PORT}`
    );
  });
}

startServer();

