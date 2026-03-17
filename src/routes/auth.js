import express from "express";
import {
  login,
  loginSchema,
  me,
  register,
  registerSchema,
} from "../controllers/authController.js";
import { validate } from "../middleware/validate.js";
import { createRateLimiter } from "../services/rateLimiter.js";
import { authenticateJWT } from "../middleware/auth.js";

export const authRouter = express.Router();

const loginRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 5,
  keyGenerator: (req) => {
    const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const email = req.body?.email || "unknown";
    return `${ip}:${email}`;
  },
});

authRouter.post("/register", validate(registerSchema), register);
authRouter.post("/login", loginRateLimiter, validate(loginSchema), login);

authRouter.get("/me", authenticateJWT, me);

