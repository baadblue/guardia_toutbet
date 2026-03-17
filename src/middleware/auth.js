import jwt from "jsonwebtoken";
import { prisma } from "../services/prismaClient.js";

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
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      return res.status(401).json({ error: "User no longer exists" });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

