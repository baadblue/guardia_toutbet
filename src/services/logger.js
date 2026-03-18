import fs from "fs";
import path from "path";
import pino from "pino";

const logDir = path.resolve(process.cwd(), "logs");
fs.mkdirSync(logDir, { recursive: true });

const commonOptions = {
  level: process.env.LOG_LEVEL || "info",
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  formatters: {
    level: (label) => ({ level: label }),
  },
};

const appDestination = pino.destination({
  dest: path.join(logDir, "app.log"),
  sync: false,
});

const securityDestination = pino.destination({
  dest: path.join(logDir, "security.log"),
  sync: false,
});

export const appLogger = pino(commonOptions, appDestination);
export const securityLogger = pino(commonOptions, securityDestination);

export function resolveClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0];
  }
  return req.ip || "0.0.0.0";
}

export function requestMeta(req, extras = {}) {
  return {
    requestId: req.requestId,
    userId: req.user?.id || null,
    ip: req.clientIp || resolveClientIp(req),
    ...extras,
  };
}
