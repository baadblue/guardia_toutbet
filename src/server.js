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
  console.warn(
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
  res.setHeader("X-Request-Id", requestId);

  const startNs = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number((process.hrtime.bigint() - startNs) / 1000000n);
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    console.info(
      JSON.stringify({
        level: "info",
        msg: "http_request",
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms,
        ...(userId ? { userId } : {}),
        ...(userEmail ? { userEmail } : {}),
      })
    );
  });

  next();
});

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  } catch (e) {
    res.status(500).json({ status: "error", error: "DB not reachable" });
  }
});

app.use("/auth", authRouter);
app.use("/bets", betsRouter);

const PORT = Number(process.env.PORT || 4000);
const HTTPS_KEY_PATH = process.env.HTTPS_KEY_PATH;
const HTTPS_CERT_PATH = process.env.HTTPS_CERT_PATH;

// Middleware global de gestion des erreurs
// Doit être enregistré après les routes
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.message?.startsWith("CORS ")) {
    return res.status(403).json({
      error: "Origin not allowed by CORS policy",
    });
  }

  console.error(
    JSON.stringify({
      level: "error",
      msg: "unhandled_error",
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      userId: req.user?.id,
      error: err?.message || String(err),
      stack: err?.stack,
    })
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
        console.log(`ToutBet API listening securely on https://localhost:${PORT}`);
      });
      return;
    } catch (err) {
      console.error("Failed to start HTTPS server, falling back to HTTP:", err);
    }
  }

  http.createServer(app).listen(PORT, () => {
    console.log(`ToutBet API listening on http://localhost:${PORT}`);
  });
}

startServer();

