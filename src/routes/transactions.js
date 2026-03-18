import express from "express";
import { authenticateJWT } from "../middleware/auth.js";
import { listUserTransactions } from "../controllers/transactionController.js";

export const transactionsRouter = express.Router();

transactionsRouter.get(
  "/",
  authenticateJWT,
  listUserTransactions
);

