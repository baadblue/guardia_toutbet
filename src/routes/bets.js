import express from "express";
import {
  createBet,
  createBetSchema,
  placeWager,
  placeWagerSchema,
  closeBet,
  closeBetSchema,
} from "../controllers/betController.js";
import { authenticateJWT } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

export const betsRouter = express.Router();

betsRouter.post(
  "/",
  authenticateJWT,
  validate(createBetSchema),
  createBet
);

betsRouter.post(
  "/:betId/wagers",
  authenticateJWT,
  validate(placeWagerSchema),
  placeWager
);

betsRouter.post(
  "/:betId/close",
  authenticateJWT,
  validate(closeBetSchema),
  closeBet
);

